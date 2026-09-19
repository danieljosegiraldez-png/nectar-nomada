/**
 * Registrar equipos, moverlos, informar de su condición, y verificar un
 * instrumento contra sus patrones.
 *
 * **La regla que gobierna este archivo es de Daniel (2026-09-14):** un
 * instrumento se verifica **contrastándolo contra un patrón declarado** —agua a
 * 0 °Bx, tampones de 4.01 / 7.00 / 10.01— y no por calendario. El tiempo sólo
 * produce un aviso, y un aviso **no descalifica**: el instrumento se sigue
 * usando y lo que cambia es que la lectura queda marcada y la pantalla lo dice.
 *
 * Quién declara esos patrones es un dato y no una tabla fija en el código —«lo
 * que decida el jefe del beneficio con el especialista en procesos»—, y por eso
 * `decidedByPersonId` existe: un criterio de aceptación sin autor no se puede
 * discutir después.
 *
 * ## Lo que este archivo NO hace, a propósito
 *
 * - **No bloquea nada.** Ninguna función se niega a registrar una medición
 *   porque el instrumento esté vencido o haya fallado. Bloquear se esquiva en el
 *   patio —el operario apunta el número en papel y lo mete luego— y entonces la
 *   plataforma acaba con una lectura de PEOR procedencia y ningún rastro de que
 *   la revisión estuviera en duda.
 * - **No calcula la asignación.** Que un fermentador esté «en uso» se deriva de
 *   la corrida que lo referencia, no se guarda: dos fuentes derivan la primera
 *   vez que alguien olvida limpiar una bandera.
 * - **No decide el veredicto de una verificación.** Lo deriva la base con un
 *   trigger, y aquí sólo se escriben los contrastes. Si esta capa lo calculara
 *   además, habría dos cálculos que pueden discrepar.
 */

import { recordAuditEvent } from "../audit";
import { organizacionesVisibles } from "../catalogos/propiedad";
import { prisma } from "../db";
import { can } from "../rbac/service";
import { clasificar, resumir } from "./disponibilidad";
import { dentroDeTolerancia, estadoDeVerificacion, type EstadoDeVerificacion } from "./verificacion";
import { Prisma, type ClassificationLevel, type EquipmentCondition, type EquipmentKind, type ProvenanceClass } from "../../generated/prisma/client";

export class EquipoError extends Error {}

/**
 * El objetivo de permisos de un equipo: **dónde está**, y si no, de quién es.
 *
 * `ScopeType` no tiene `organization` —los ámbitos son platform, program,
 * project, location, competition, session y experience—, así que la pertenencia
 * a una organización no es por sí sola un ámbito que el RBAC sepa leer. Es la
 * misma razón por la que `Device` no lleva `organizationId`, y está escrita en su
 * propio comentario del esquema.
 *
 * El orden, y el porqué de cada escalón:
 *
 * 1. **La ubicación actual**, derivada del último traslado. Es el caso normal: el
 *    refractómetro del beneficio lo usa quien trabaja en ese beneficio, y el
 *    Farm Operator está asignado justo ahí. Sin este escalón, el operario del
 *    sitio no podría ni ver el instrumento que tiene en la mano.
 * 2. **El proyecto**, cuando lo hay. §9: cada relación con un cliente es su
 *    propio `Project`, y `resolve.ts` da a los ámbitos hoja identidad exacta, así
 *    que una asignación de proyecto nunca alcanza a un proyecto hermano.
 * 3. **La plataforma**, cuando el equipo no está en ningún sitio todavía. Es
 *    deliberadamente estrecho: un equipo recién registrado y sin ubicar sólo lo
 *    toca quien manda en toda la plataforma, hasta que alguien diga dónde está.
 *
 * **Se lee del último traslado y no de una columna** porque una `location_id`
 * mutable no podría contestar «¿dónde estaba en marzo?», que es justo lo que §3
 * existe para preservar.
 */
async function objetivoDeEquipo(equipo: { id: string; projectId: string | null }) {
  const ultimo = await prisma.equipmentTransfer.findFirst({
    where: { equipmentId: equipo.id },
    orderBy: { occurredAt: "desc" },
    select: { toLocationId: true },
  });
  if (ultimo) return { scopeType: "location", scopeRefId: ultimo.toLocationId } as const;
  if (equipo.projectId) return { scopeType: "project", scopeRefId: equipo.projectId } as const;
  return { scopeType: "platform", scopeRefId: null } as const;
}

/**
 * Configurar un equipo: `equipment:manage`, o —si el equipo está en un lugar—
 * `location:edit_beneficio` ahí (spec #370 §4.3: la concesión abre todo el
 * beneficio, equipos incluidos). Sin lugar, sólo `equipment:manage`.
 */
async function puedeConfigurar(
  userAccountId: string,
  objetivo: Awaited<ReturnType<typeof objetivoDeEquipo>>,
  clasificacion: ClassificationLevel,
) {
  if (await can(userAccountId, "manage", "equipment", objetivo, clasificacion)) return true;
  return objetivo.scopeType === "location"
    && (await can(userAccountId, "edit_beneficio", "location", objetivo, clasificacion));
}

async function exigePermiso(
  userAccountId: string,
  accion: "view" | "manage" | "report_condition",
  equipo: { id: string; projectId: string | null; classification: ClassificationLevel },
) {
  const objetivo = await objetivoDeEquipo(equipo);
  const ok =
    accion === "manage"
      ? await puedeConfigurar(userAccountId, objetivo, equipo.classification)
      : await can(userAccountId, accion, "equipment", objetivo, equipo.classification);
  if (!ok) throw new EquipoError("forbidden");
}

async function equipoOFalla(id: string) {
  const equipo = await prisma.equipment.findUnique({ where: { id } });
  if (!equipo) throw new EquipoError("equipment_not_found");
  return equipo;
}

export interface DatosDeEquipo {
  modelId?: string | null;
  serialNumber?: string | null;
  internalCode?: string | null;
  supplierOrganizationId?: string | null;
  /** Campo de día: ya convertido con `fechaDeDia` por quien llama. */
  warrantyUntil?: Date | null;
}

export interface RegistrarEquipoInput extends DatosDeEquipo {
  name: string;
  kind: EquipmentKind;
  organizationId: string;
  projectId?: string | null;
  format?: "barrel" | "cube" | "chip" | "stave" | "spiral" | "other" | null;
  isFixedInPlace?: boolean;
  classification?: ClassificationLevel;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  acquiredAt?: Date | null;
  acquisitionNote?: string | null;
  /** Nulo = no vence por tiempo. **Sólo AVISA**, nunca descalifica. */
  checkAdvisoryHours?: number | null;
  /**
   * Dónde queda el equipo al registrarlo. Opcional, y vale la pena ofrecerlo:
   * sin él, la primera colocación exige `manage` resuelto contra la PLATAFORMA
   * —porque un equipo sin traslados no está en ningún ámbito hoja— y el jefe de
   * un beneficio no podría colocar su propio refractómetro.
   *
   * Se escribe como un traslado de verdad, con `fromLocationId` nulo, que es lo
   * que §3 llama «primer despliegue»: antes no estaba en ningún sitio nuestro.
   */
  initialLocationId?: string | null;
}

/**
 * El modelo elegido tiene que ser compartido o de la MISMA organización, del
 * mismo tipo, y vigente. La base lo impide también (FK compuesta + disparador);
 * esto sólo lo dice con una frase legible.
 */
async function comprobarModelo(modelId: string | null | undefined, organizationId: string, kind: EquipmentKind) {
  if (!modelId) return;
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId }, select: { organizationId: true, kind: true, retiredAt: true } });
  if (!m) throw new EquipoError("modelo_no_encontrado");
  if (m.organizationId !== null && m.organizationId !== organizationId) throw new EquipoError("modelo_no_elegible");
  if (m.kind !== kind) throw new EquipoError("modelo_de_otro_tipo");
  if (m.retiredAt) throw new EquipoError("modelo_retirado");
}

function datosDeEquipoLimpios(d: DatosDeEquipo) {
  const t = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  return {
    modelId: d.modelId || null,
    serialNumber: t(d.serialNumber),
    internalCode: t(d.internalCode),
    supplierOrganizationId: d.supplierOrganizationId || null,
    warrantyUntil: d.warrantyUntil ?? null,
  };
}

function esCodigoDuplicado(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Sólo las claves PRESENTES en `datos`, limpias de la misma manera que
 * `datosDeEquipoLimpios`. Editar sólo lleva al `update` lo que quien llama
 * quiso tocar: `undefined` es "no toques esto", `null` es "borra esto". Un
 * `create` legítimamente escribe las cinco claves siempre —por eso
 * `datosDeEquipoLimpios` no cambia—, pero un `update` con las cinco completas
 * borraría en silencio lo que nadie pidió tocar.
 */
function datosDeEquipoParaEditar(d: DatosDeEquipo) {
  const t = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  const data: {
    modelId?: string | null;
    serialNumber?: string | null;
    internalCode?: string | null;
    supplierOrganizationId?: string | null;
    warrantyUntil?: Date | null;
  } = {};
  if (d.modelId !== undefined) data.modelId = d.modelId || null;
  if (d.serialNumber !== undefined) data.serialNumber = t(d.serialNumber);
  if (d.internalCode !== undefined) data.internalCode = t(d.internalCode);
  if (d.supplierOrganizationId !== undefined) data.supplierOrganizationId = d.supplierOrganizationId || null;
  if (d.warrantyUntil !== undefined) data.warrantyUntil = d.warrantyUntil ?? null;
  return data;
}

export async function registrarEquipo(userAccountId: string, input: RegistrarEquipoInput) {
  // Mismo orden que `objetivoDeEquipo`, y por la misma razón: si se dice dónde
  // queda el equipo, el permiso se juzga AHÍ. Sin esto, registrar un
  // refractómetro en tu propio beneficio exigiría mandar en toda la plataforma.
  const objetivo = input.initialLocationId
    ? ({ scopeType: "location", scopeRefId: input.initialLocationId } as const)
    : input.projectId
      ? ({ scopeType: "project", scopeRefId: input.projectId } as const)
      : ({ scopeType: "platform", scopeRefId: null } as const);
  const clasificacion = input.classification ?? "internal";
  if (!(await puedeConfigurar(userAccountId, objetivo, clasificacion))) {
    throw new EquipoError("forbidden");
  }
  if (input.name.trim().length === 0) throw new EquipoError("name_required");
  // El CHECK de la base la rechaza igual; aquí sale con una frase legible en vez
  // de un error de restricción que nadie puede leer.
  if (input.format && input.kind !== "vessel") throw new EquipoError("format_solo_en_recipientes");
  if (input.checkAdvisoryHours != null && input.checkAdvisoryHours <= 0) {
    throw new EquipoError("advisory_hours_positivo");
  }
  await comprobarModelo(input.modelId, input.organizationId, input.kind);
  const datosNuevos = datosDeEquipoLimpios(input);

  try {
    return await prisma.$transaction(async (tx) => {
      const equipo = await tx.equipment.create({
        data: {
          name: input.name.trim(),
          kind: input.kind,
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          format: input.format ?? null,
          isFixedInPlace: input.isFixedInPlace ?? false,
          classification: clasificacion,
          provenanceClass: input.provenanceClass,
          sourceReference: input.sourceReference?.trim() || null,
          acquiredAt: input.acquiredAt ?? null,
          acquisitionNote: input.acquisitionNote?.trim() || null,
          checkAdvisoryHours: input.checkAdvisoryHours ?? null,
          createdBy: userAccountId,
          ...datosNuevos,
        },
      });
      if (input.initialLocationId) {
        await tx.equipmentTransfer.create({
          data: {
            equipmentId: equipo.id,
            fromLocationId: null,
            toLocationId: input.initialLocationId,
            occurredAt: input.acquiredAt ?? new Date(),
            createdBy: userAccountId,
          },
        });
      }
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          entityType: "equipment",
          entityId: equipo.id,
          operation: "create",
          sourceInterface: "lib/equipos/equipos.ts",
          after: {
            name: equipo.name,
            kind: equipo.kind,
            locationId: input.initialLocationId ?? null,
            modelId: equipo.modelId,
            serialNumber: equipo.serialNumber,
            internalCode: equipo.internalCode,
            supplierOrganizationId: equipo.supplierOrganizationId,
            warrantyUntil: equipo.warrantyUntil?.toISOString() ?? null,
          },
        },
        tx,
      );
      return equipo;
    });
  } catch (e) {
    if (esCodigoDuplicado(e)) throw new EquipoError("codigo_interno_duplicado");
    throw e;
  }
}

export async function editarDatosDeEquipo(userAccountId: string, equipmentId: string, datos: DatosDeEquipo): Promise<void> {
  const antes = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!antes) throw new EquipoError("equipment_not_found");
  await exigePermiso(userAccountId, "manage", antes);
  // El modelo que el equipo YA tiene no se vuelve a juzgar: si se retiró después,
  // el formulario lo reenvía tal cual y rechazarlo obligaría a perderlo para
  // poder corregir un número de serie. Juzgar es para CAMBIAR de modelo.
  if (datos.modelId !== undefined && (datos.modelId || null) !== antes.modelId) {
    await comprobarModelo(datos.modelId, antes.organizationId, antes.kind);
  }
  const cambios = datosDeEquipoParaEditar(datos);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.equipment.update({ where: { id: equipmentId }, data: cambios });
      const after: Record<string, unknown> = { ...cambios };
      if ("warrantyUntil" in cambios) after.warrantyUntil = cambios.warrantyUntil?.toISOString() ?? null;
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          entityType: "equipment",
          entityId: equipmentId,
          operation: "update_datos",
          sourceInterface: "lib/equipos/equipos.ts",
          before: {
            modelId: antes.modelId,
            serialNumber: antes.serialNumber,
            internalCode: antes.internalCode,
            supplierOrganizationId: antes.supplierOrganizationId,
            warrantyUntil: antes.warrantyUntil?.toISOString() ?? null,
          },
          after,
        },
        tx,
      );
    });
  } catch (e) {
    if (esCodigoDuplicado(e)) throw new EquipoError("codigo_interno_duplicado");
    throw e;
  }
}

/** Un permiso sobre un equipo, para otros módulos (rutinas, documentos). */
export async function puedeSobreEquipo(
  userAccountId: string,
  equipmentId: string,
  accion: "view" | "manage" | "report_condition",
): Promise<boolean> {
  const equipo = await prisma.equipment.findUnique({ where: { id: equipmentId }, select: { id: true, projectId: true, classification: true } });
  if (!equipo) return false;
  const objetivo = await objetivoDeEquipo(equipo);
  if (accion === "manage") return puedeConfigurar(userAccountId, objetivo, equipo.classification);
  return can(userAccountId, accion, "equipment", objetivo, equipo.classification);
}

/**
 * Proveedores para el desplegable: organizaciones de tipo `supplier` aprobadas.
 * Un proveedor es una entidad canónica (CLAUDE.md §9), no texto. Si no existe,
 * se da de alta por la vía de organizaciones de siempre: aquí no se crea.
 */
export async function proveedoresPosibles(userAccountId: string) {
  const orgs = await organizacionesVisibles(userAccountId, { resourceType: "equipment", action: "view" });
  if (orgs.length === 0) return [];
  return prisma.organization.findMany({
    where: { organizationType: "supplier", status: "approved" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface TrasladarInput {
  equipmentId: string;
  toLocationId: string;
  occurredAt: Date;
  fromLocationId?: string | null;
  movedByPersonId?: string | null;
  conditionAtHandover?: EquipmentCondition | null;
  note?: string | null;
}

/**
 * Un traslado. **Se añade, nunca se pisa**: la ubicación actual es el
 * `occurredAt` mayor, y por eso «¿dónde estaba en marzo?» tiene respuesta.
 */
export async function trasladarEquipo(userAccountId: string, input: TrasladarInput) {
  const equipo = await equipoOFalla(input.equipmentId);
  await exigePermiso(userAccountId, "manage", equipo);
  if (equipo.isFixedInPlace) throw new EquipoError("equipo_fijo_no_se_traslada");

  return prisma.$transaction(async (tx) => {
    const t = await tx.equipmentTransfer.create({
      data: {
        equipmentId: input.equipmentId,
        fromLocationId: input.fromLocationId ?? null,
        toLocationId: input.toLocationId,
        movedByPersonId: input.movedByPersonId ?? null,
        occurredAt: input.occurredAt,
        conditionAtHandover: input.conditionAtHandover ?? null,
        note: input.note?.trim() || null,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "equipment_transfer",
        entityId: t.id,
        operation: "create",
        sourceInterface: "lib/equipos/equipos.ts",
        after: { equipmentId: input.equipmentId, toLocationId: input.toLocationId },
      },
      tx,
    );
    return t;
  });
}

/**
 * Informar de la condición. **Exige `report_condition`, no `manage`**, y ésa es
 * la parte que importa: quien trabaja con la máquina tiene que poder decir que
 * está rota sin poder retirarla del inventario. Si informar exigiera `manage`,
 * el operario que ve el sello partido no informa.
 */
export async function informarCondicion(
  userAccountId: string,
  input: {
    equipmentId: string;
    condition: EquipmentCondition;
    occurredAt: Date;
    reportedByPersonId?: string | null;
    responsiblePersonId?: string | null;
    evidenceAssetId?: string | null;
    note?: string | null;
  },
) {
  const equipo = await equipoOFalla(input.equipmentId);
  await exigePermiso(userAccountId, "report_condition", equipo);

  return prisma.$transaction(async (tx) => {
    const r = await tx.equipmentConditionReport.create({
      data: {
        equipmentId: input.equipmentId,
        condition: input.condition,
        occurredAt: input.occurredAt,
        reportedByPersonId: input.reportedByPersonId ?? null,
        responsiblePersonId: input.responsiblePersonId ?? null,
        evidenceAssetId: input.evidenceAssetId ?? null,
        note: input.note?.trim() || null,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "equipment_condition_report",
        entityId: r.id,
        operation: "create",
        sourceInterface: "lib/equipos/equipos.ts",
        after: { equipmentId: input.equipmentId, condition: input.condition },
      },
      tx,
    );
    return r;
  });
}

/**
 * Declarar contra qué patrón se contrasta un instrumento.
 *
 * **Sólo para `kind = 'instrument'`.** Un tanque no se verifica contra un
 * tampón, y dejar colgar requisitos de cualquier equipo llenaría la lista de
 * vocabulario ajeno con FK perfectamente válidas — la misma forma que
 * `registrarIntervencion` ya rechaza en el beneficio.
 */
export async function declararPatron(
  userAccountId: string,
  input: {
    equipmentId: string;
    label: string;
    referenceValue: number;
    unit: string;
    toleranceAbs: number;
    decidedByPersonId?: string | null;
    displayOrder?: number;
  },
) {
  const equipo = await equipoOFalla(input.equipmentId);
  await exigePermiso(userAccountId, "manage", equipo);
  if (equipo.kind !== "instrument") throw new EquipoError("solo_los_instrumentos_se_verifican");
  if (input.label.trim().length === 0) throw new EquipoError("label_required");
  if (!Number.isFinite(input.toleranceAbs) || input.toleranceAbs < 0) throw new EquipoError("tolerancia_no_negativa");

  // **Quién lo decidió es la persona que actúa**, salvo que quien llama nombre a
  // otra. Se resuelve AQUÍ y no en la acción de formulario porque el acceso a
  // datos vive en este módulo por diseño —`CurrentUser` no lleva `personId`— y
  // un criterio de aceptación sin autor no se puede discutir después.
  const decidio =
    input.decidedByPersonId ??
    (await prisma.userAccount.findUnique({ where: { id: userAccountId }, select: { personId: true } }))?.personId ??
    null;

  return prisma.$transaction(async (tx) => {
    const req = await tx.instrumentCheckRequirement.create({
      data: {
        equipmentId: input.equipmentId,
        label: input.label.trim(),
        referenceValue: input.referenceValue,
        unit: input.unit.trim(),
        toleranceAbs: input.toleranceAbs,
        decidedByPersonId: decidio,
        displayOrder: input.displayOrder ?? 0,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "instrument_check_requirement",
        entityId: req.id,
        operation: "create",
        sourceInterface: "lib/equipos/equipos.ts",
        after: { equipmentId: input.equipmentId, label: req.label, referenceValue: input.referenceValue },
      },
      tx,
    );
    return req;
  });
}

/**
 * Retirar un patrón. **No se edita en su sitio**: un criterio de aceptación que
 * cambia bajo los pies vuelve imposible juzgar una verificación pasada, porque
 * «pasó» dejaría de significar algo concreto.
 */
export async function retirarPatron(userAccountId: string, requirementId: string, cuando: Date) {
  const req = await prisma.instrumentCheckRequirement.findUnique({
    where: { id: requirementId },
    include: { equipment: true },
  });
  if (!req) throw new EquipoError("requirement_not_found");
  await exigePermiso(userAccountId, "manage", req.equipment);
  if (req.retiredAt) throw new EquipoError("requirement_ya_retirado");

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.instrumentCheckRequirement.update({
      where: { id: requirementId },
      data: { retiredAt: cuando },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "instrument_check_requirement",
        entityId: requirementId,
        operation: "update",
        sourceInterface: "lib/equipos/equipos.ts",
        after: { retiredAt: cuando.toISOString() },
      },
      tx,
    );
    return actualizado;
  });
}

export interface ContrasteObservado {
  requirementId: string;
  observedValue: number;
}

/**
 * Verificar un instrumento: ponerlo contra sus patrones y anotar qué leyó.
 *
 * **El veredicto NO se pasa ni se calcula aquí.** `outcome` nace en `fail` y el
 * trigger de la base lo sube a `pass` sólo si hay al menos un contraste y
 * ninguno fuera de tolerancia. Que esta capa lo calculara además sería un
 * segundo cálculo de lo mismo, y dos cálculos discrepan.
 *
 * **Exige al menos un contraste**, que es la mitad que evita el cero peligroso:
 * un acto de verificación sin nada contrastado no es un aprobado, y una fila
 * vacía se leería como «el refractómetro está verificado» sin haberlo mirado.
 */
export async function verificarInstrumento(
  userAccountId: string,
  input: {
    equipmentId: string;
    occurredAt: Date;
    contrastes: readonly ContrasteObservado[];
    performedByPersonId?: string | null;
    ambientTempC?: number | null;
    note?: string | null;
  },
) {
  const equipo = await equipoOFalla(input.equipmentId);
  await exigePermiso(userAccountId, "report_condition", equipo);
  if (equipo.kind !== "instrument") throw new EquipoError("solo_los_instrumentos_se_verifican");
  if (input.contrastes.length === 0) throw new EquipoError("hace_falta_al_menos_un_contraste");

  const requisitos = await prisma.instrumentCheckRequirement.findMany({
    where: { id: { in: input.contrastes.map((c) => c.requirementId) } },
  });
  if (requisitos.length !== input.contrastes.length) throw new EquipoError("requirement_not_found");
  for (const r of requisitos) {
    if (r.equipmentId !== input.equipmentId) throw new EquipoError("requirement_de_otro_instrumento");
    // Un patrón retirado describe un criterio que ya no rige. Contrastar contra
    // él produciría un aprobado que nadie sabría interpretar después.
    if (r.retiredAt) throw new EquipoError("requirement_retirado");
  }

  return prisma.$transaction(async (tx) => {
    const verificacion = await tx.instrumentCheck.create({
      data: {
        equipmentId: input.equipmentId,
        occurredAt: input.occurredAt,
        performedByPersonId: input.performedByPersonId ?? null,
        ambientTempC: input.ambientTempC ?? null,
        note: input.note?.trim() || null,
        createdBy: userAccountId,
      },
    });

    for (const c of input.contrastes) {
      const r = requisitos.find((x) => x.id === c.requirementId)!;
      await tx.instrumentCheckResult.create({
        data: {
          checkId: verificacion.id,
          requirementId: c.requirementId,
          observedValue: c.observedValue,
          withinTolerance: dentroDeTolerancia(c.observedValue, Number(r.referenceValue), Number(r.toleranceAbs)),
        },
      });
    }

    // Releído DESPUÉS de escribir los contrastes, porque el veredicto lo pone el
    // trigger: devolver la fila creada arriba entregaría el `fail` inicial, que
    // sería falso para quien llama.
    const conVeredicto = await tx.instrumentCheck.findUniqueOrThrow({ where: { id: verificacion.id } });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "instrument_check",
        entityId: verificacion.id,
        operation: "create",
        sourceInterface: "lib/equipos/equipos.ts",
        after: { equipmentId: input.equipmentId, outcome: conVeredicto.outcome },
      },
      tx,
    );
    return conVeredicto;
  });
}

/**
 * El estado de verificación de un instrumento **en un instante dado**.
 *
 * Por defecto, ahora. Pasando el momento de una lectura contesta la pregunta que
 * de verdad importa: *«¿estaba este instrumento bien cuando produjo ESTO?»*.
 */
export async function estadoDelInstrumento(
  userAccountId: string,
  equipmentId: string | null,
  momento: Date = new Date(),
): Promise<EstadoDeVerificacion> {
  if (!equipmentId) return "SIN_INSTRUMENTO";
  const equipo = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: { id: true, projectId: true, classification: true, checkAdvisoryHours: true },
  });
  if (!equipo) return "SIN_INSTRUMENTO";
  // Pide principal a propósito, en vez de fiarse de que el llamador ya autorizó
  // otra cosa. Ver un lote no es ver el inventario de instrumentos de un sitio,
  // y `equipment:view` existe exactamente para esta lectura (§9). Lo cazó
  // `tests/arquitectura/acceso-a-datos.test.ts` — la primera versión de esta
  // función no recibía a nadie.
  await exigePermiso(userAccountId, "view", equipo);
  const verificaciones = await prisma.instrumentCheck.findMany({
    where: { equipmentId, occurredAt: { lte: momento } },
    select: { occurredAt: true, outcome: true },
    orderBy: { occurredAt: "asc" },
  });
  return estadoDeVerificacion({
    instrumentoDeclarado: true,
    verificaciones,
    horasDeAviso: equipo.checkAdvisoryHours,
    momento,
  });
}

/**
 * El estado de verificación **de cada medición**, en el instante de cada una.
 *
 * Existe por lotes y no llamando `estadoDelInstrumento` en un bucle porque la
 * pantalla de un lote trae decenas de lecturas y unos pocos instrumentos: se
 * resuelve el permiso **una vez por instrumento** y sus verificaciones se leen
 * una sola vez, y el reparto por lectura lo hace la función pura.
 *
 * **Un instrumento que quien mira no puede ver se trata como `SIN_INSTRUMENTO`**,
 * o sea que no impone confianza ninguna. La alternativa —degradar la lectura
 * porque el lector carece de permiso— haría que el mismo lote se juzgara distinto
 * según quién lo abre, que es exactamente lo que un veredicto no puede hacer.
 */
export async function estadosDeInstrumentoPorMedicion(
  userAccountId: string,
  mediciones: readonly { id: string; instrumentId: string | null; occurredAt: Date }[],
): Promise<Map<string, EstadoDeVerificacion>> {
  const salida = new Map<string, EstadoDeVerificacion>();
  const ids = [...new Set(mediciones.map((m) => m.instrumentId).filter((x): x is string => x !== null))];
  if (ids.length === 0) return salida;

  const equipos = await prisma.equipment.findMany({
    where: { id: { in: ids } },
    select: { id: true, projectId: true, classification: true, checkAdvisoryHours: true },
  });
  const verificaciones = await prisma.instrumentCheck.findMany({
    where: { equipmentId: { in: ids } },
    select: { equipmentId: true, occurredAt: true, outcome: true },
    orderBy: { occurredAt: "asc" },
  });

  const visibles = new Map<string, (typeof equipos)[number]>();
  for (const e of equipos) {
    const objetivo = await objetivoDeEquipo(e);
    if (await can(userAccountId, "view", "equipment", objetivo, e.classification)) visibles.set(e.id, e);
  }

  for (const m of mediciones) {
    const e = m.instrumentId ? visibles.get(m.instrumentId) : undefined;
    if (!e) {
      salida.set(m.id, "SIN_INSTRUMENTO");
      continue;
    }
    salida.set(
      m.id,
      estadoDeVerificacion({
        instrumentoDeclarado: true,
        verificaciones: verificaciones.filter((v) => v.equipmentId === e.id),
        horasDeAviso: e.checkAdvisoryHours,
        momento: m.occurredAt,
      }),
    );
  }
  return salida;
}

export interface EquipoEnLista {
  id: string;
  name: string;
  kind: EquipmentKind;
  lifecycleStatus: "active" | "retired" | "disposed";
  /** Del último traslado. `null` = registrado y todavía sin ubicar. */
  ubicacion: { id: string; name: string } | null;
  /** El informe más reciente **sin resolver**. `null` = nadie ha informado de nada. */
  condicion: { condition: EquipmentCondition; occurredAt: Date } | null;
  /** Sólo para instrumentos. `SIN_INSTRUMENTO` para lo que no lo es. */
  verificacion: EstadoDeVerificacion;
  ultimaVerificacion: Date | null;
  checkAdvisoryHours: number | null;
  /** Del catálogo (Tarea 9). `null` = sin modelo declarado. */
  model: { manufacturer: string; modelName: string } | null;
}

/**
 * Los equipos que esta persona puede ver, con su estado de hoy.
 *
 * **Las tres columnas se derivan, ninguna se guarda** (§4): la ubicación sale del
 * último traslado, la condición del último informe sin resolver, y la
 * verificación de los contrastes. Guardar cualquiera de las tres crearía una
 * segunda fuente que deriva la primera vez que alguien olvida limpiarla.
 *
 * **La condición vigente es el último informe SIN RESOLVER**, no el último a
 * secas: un «airlock roto» que alguien arregló y cerró no debe seguir pintando
 * el fermentador en rojo, y un «roto» posterior a un «arreglado» sí.
 */
export async function listarEquipos(userAccountId: string): Promise<EquipoEnLista[]> {
  const equipos = await prisma.equipment.findMany({
    where: { lifecycleStatus: { not: "disposed" } },
    include: {
      transfers: { orderBy: { occurredAt: "desc" }, take: 1, include: { toLocation: { select: { id: true, name: true } } } },
      conditionReports: { where: { resolvedAt: null }, orderBy: { occurredAt: "desc" }, take: 1 },
      checks: { orderBy: { occurredAt: "asc" }, select: { occurredAt: true, outcome: true } },
      model: { select: { manufacturer: true, modelName: true } },
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  const ahora = new Date();
  const salida: EquipoEnLista[] = [];
  for (const e of equipos) {
    const objetivo = await objetivoDeEquipo(e);
    if (!(await can(userAccountId, "view", "equipment", objetivo, e.classification))) continue;
    const ultimo = e.transfers[0];
    const informe = e.conditionReports[0];
    const aprobadas = e.checks.filter((c) => c.outcome === "pass");
    salida.push({
      id: e.id,
      name: e.name,
      kind: e.kind,
      lifecycleStatus: e.lifecycleStatus,
      ubicacion: ultimo ? { id: ultimo.toLocation.id, name: ultimo.toLocation.name } : null,
      condicion: informe ? { condition: informe.condition, occurredAt: informe.occurredAt } : null,
      verificacion:
        e.kind === "instrument"
          ? estadoDeVerificacion({
              instrumentoDeclarado: true,
              verificaciones: e.checks,
              horasDeAviso: e.checkAdvisoryHours,
              momento: ahora,
            })
          : "SIN_INSTRUMENTO",
      ultimaVerificacion: aprobadas.length > 0 ? aprobadas[aprobadas.length - 1]!.occurredAt : null,
      checkAdvisoryHours: e.checkAdvisoryHours,
      model: e.model ? { manufacturer: e.model.manufacturer, modelName: e.model.modelName } : null,
    });
  }
  return salida;
}

/** Un instrumento con sus patrones vigentes, para pintar el formulario de verificación. */
export async function instrumentoParaVerificar(userAccountId: string, equipmentId: string) {
  const equipo = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    include: {
      checkRequirements: { where: { retiredAt: null }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] },
      modes: { where: { retiredAt: null }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] },
      checks: {
        orderBy: { occurredAt: "desc" },
        take: 10,
        include: { results: { include: { requirement: { select: { label: true, unit: true } } } } },
      },
      // Identificación (Tarea 9, spec §3.3): el modelo y el proveedor sólo se
      // pintan, y el último traslado dice dónde está hoy y en qué zona — de ahí
      // sale el «hoy» que gobierna el aviso de garantía y el de las rutinas.
      model: { select: { id: true, manufacturer: true, modelName: true, retiredAt: true } },
      supplier: { select: { id: true, name: true } },
      transfers: {
        orderBy: { occurredAt: "desc" },
        take: 1,
        include: { toLocation: { select: { id: true, name: true, timezone: true } } },
      },
    },
  });
  if (!equipo) throw new EquipoError("equipment_not_found");
  await exigePermiso(userAccountId, "view", equipo);
  return {
    ...equipo,
    // **Nunca `pass` por defecto**: sin patrones vigentes no hay nada que
    // contrastar, y el formulario tiene que decirlo en vez de ofrecer un botón
    // que produciría una verificación vacía.
    verificacion: estadoDeVerificacion({
      instrumentoDeclarado: true,
      verificaciones: equipo.checks,
      horasDeAviso: equipo.checkAdvisoryHours,
      momento: new Date(),
    }),
  };
}

/**
 * La disponibilidad de los recipientes: cuántos hay libres **y** sanos.
 *
 * **«En uso» se DERIVA de la corrida, no se guarda.** Un fermentador está ocupado
 * porque una `FermentationRun` lo referencia y no ha terminado — el mismo hecho
 * que la corrida ya registra. Guardarlo aparte crearía dos fuentes que derivan la
 * primera vez que alguien olvida limpiar una bandera, y entonces la pantalla
 * diría que hay tanques libres que no lo están: el error caro, no el barato.
 *
 * Sólo recipientes: un refractómetro no se «ocupa». Su disponibilidad es otra
 * cosa y la contesta `listarEquipos` con su estado de revisión.
 */
export async function disponibilidadDeRecipientes(userAccountId: string) {
  const equipos = await prisma.equipment.findMany({
    where: { kind: "vessel", lifecycleStatus: { not: "disposed" } },
    include: {
      transfers: { orderBy: { occurredAt: "desc" }, take: 1, include: { toLocation: { select: { id: true, name: true } } } },
      conditionReports: { where: { resolvedAt: null }, orderBy: { occurredAt: "desc" }, take: 1 },
      // Sin `lotId`: `FermentationRun` no lo tiene. Se ata al lote por
      // `lotProcess`, y es anulable —todo lo anterior a `LotProcess` no cuelga de
      // ninguno—, así que el código del lote puede faltar legítimamente.
      fermentationRuns: {
        where: { endedAt: null },
        select: { id: true, startedAt: true, lotProcess: { select: { lotId: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  const filas = [];
  for (const e of equipos) {
    const objetivo = await objetivoDeEquipo(e);
    if (!(await can(userAccountId, "view", "equipment", objetivo, e.classification))) continue;
    const corrida = e.fermentationRuns[0] ?? null;
    filas.push({
      id: e.id,
      name: e.name,
      ubicacion: e.transfers[0]?.toLocation.name ?? null,
      clasificacion: clasificar({
        id: e.id,
        lifecycleStatus: e.lifecycleStatus,
        condicion: e.conditionReports[0]?.condition ?? null,
        enUso: corrida !== null,
      }),
      condicion: e.conditionReports[0]?.condition ?? null,
      ocupadoDesde: corrida?.startedAt ?? null,
      lotId: corrida?.lotProcess?.lotId ?? null,
    });
  }
  return { filas, resumen: resumir(filas.map((f) => f.clasificacion)) };
}

/**
 * Los sitios donde esta persona puede registrar equipo.
 *
 * **Se filtra por el permiso real, no por una visibilidad paralela.** Preguntar
 * `can(..., "manage", "equipment", {location})` sitio por sitio es más lento que
 * una consulta con un `where` astuto, y es lo correcto: una segunda regla de
 * visibilidad escrita a mano deriva de la que de verdad gobierna, y el día que
 * derive ofrecerá un sitio donde el guardado va a fallar — o, peor, esconderá
 * uno donde sí se podía.
 */
export async function sitiosParaRegistrar(userAccountId: string) {
  const sitios = await prisma.location.findMany({
    where: { organizationId: { not: null } },
    select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const permitidos = [];
  for (const s of sitios) {
    if (!s.organizationId) continue;
    const ok = await puedeConfigurar(userAccountId, { scopeType: "location", scopeRefId: s.id }, "internal");
    if (ok) {
      permitidos.push({
        id: s.id,
        name: s.name,
        organizationId: s.organizationId,
        organizationName: s.organization?.name ?? null,
      });
    }
  }
  return permitidos;
}

/** ¿Puede esta persona gestionar este equipo? Para decidir qué formularios ofrecer. */
export async function puedeGestionarEquipo(userAccountId: string, equipmentId: string): Promise<boolean> {
  const equipo = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: { id: true, projectId: true, classification: true },
  });
  if (!equipo) return false;
  const objetivo = await objetivoDeEquipo(equipo);
  return puedeConfigurar(userAccountId, objetivo, equipo.classification);
}

/** Instrumentos visibles y modos vigentes; las escalas conservan el label del aparato. */
export async function instrumentosParaMedicion(userAccountId: string) {
  const equipos = await prisma.equipment.findMany({
    where: { kind: "instrument", lifecycleStatus: "active" },
    include: { modes: { where: { retiredAt: null }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] } },
    orderBy: { name: "asc" },
  });
  const visibles = [];
  for (const equipo of equipos) {
    if (!await can(userAccountId, "view", "equipment", await objetivoDeEquipo(equipo), equipo.classification)) continue;
    visibles.push({ id: equipo.id, name: equipo.name, modos: equipo.modes.map((m) => ({
      id: m.id, label: m.label, materialState: m.materialState, variable: m.variable,
      rangeMin: m.rangeMin == null ? null : Number(m.rangeMin),
      rangeMax: m.rangeMax == null ? null : Number(m.rangeMax),
    })) });
  }
  return visibles;
}
