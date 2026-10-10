/**
 * El catálogo de modelos de equipo (spec de catálogos §3.1-3.2). Primer consumidor
 * del contrato común de `lib/catalogos/`.
 *
 * Definir qué es un «ATAGO PAL-1» es GESTIÓN, no faena: `equipment:manage`, como
 * `crearMaterial`. Las especificaciones son del FABRICANTE y no se mezclan con los
 * contrastes contra patrón, que dicen lo que el aparato hace de verdad.
 */
import { Prisma, type EquipmentContactMaterial, type EquipmentKind, type ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import {
  filtroVisible,
  organizacionesVisibles,
  requireCatalogoAccess,
  requireEntradaDeCatalogoAccess,
  type Dueno,
} from "../catalogos/propiedad";
import { prisma } from "../db";
import { UUID } from "../validation/uuid";
import { can } from "../rbac/service";
import { puedeSobreEquipo } from "./equipos";

export class ModeloError extends Error {}

const GESTIONAR = { resourceType: "equipment", action: "manage" } as const;
const VER = { resourceType: "equipment", action: "view" } as const;

export interface DatosDeModelo {
  manufacturer: string;
  modelName: string;
  recommendedMaintenanceDays?: number | null;
  capacityValue?: string | null;
  capacityUnit?: string | null;
  contactMaterial?: EquipmentContactMaterial | null;
  contactMaterialNote?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  notes?: string | null;
}

export interface CrearModeloInput extends DatosDeModelo {
  dueno: Dueno;
  kind: EquipmentKind;
  /** Filas del mismo formulario. Entran con el modelo o no entra nada. */
  especificaciones?: EspecificacionInput[];
}

export interface EspecificacionInput {
  quantity: string;
  unit: string;
  rangeMin?: string | null;
  rangeMax?: string | null;
  resolution?: string | null;
  accuracyAbs?: string | null;
}

export interface ModeloEnLista {
  id: string;
  manufacturer: string;
  modelName: string;
  kind: EquipmentKind;
  organizationId: string | null;
  recommendedMaintenanceDays: number | null;
  retiredAt: Date | null;
  equipos: number;
}

const texto = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

/** Normaliza y valida lo que la base también rechazaría, para devolver una frase legible. */
function datosLimpios(kind: EquipmentKind, d: DatosDeModelo) {
  const manufacturer = d.manufacturer.trim();
  const modelName = d.modelName.trim();
  if (!manufacturer) throw new ModeloError("fabricante_obligatorio");
  if (!modelName) throw new ModeloError("modelo_obligatorio");
  const dias = d.recommendedMaintenanceDays ?? null;
  if (dias !== null && (!Number.isInteger(dias) || dias <= 0)) throw new ModeloError("mantenimiento_positivo");
  const capacityValue = texto(d.capacityValue);
  const capacityUnit = texto(d.capacityUnit);
  if ((capacityValue === null) !== (capacityUnit === null)) throw new ModeloError("capacidad_con_unidad");
  const material = d.contactMaterial ?? null;
  const conCapacidad = kind === "vessel" || kind === "machine";
  if (!conCapacidad && (capacityValue !== null || material !== null)) throw new ModeloError("capacidad_solo_en_vaso_o_maquina");
  const nota = texto(d.contactMaterialNote);
  if (material === "otro" && nota === null) throw new ModeloError("material_otro_con_nota");
  return {
    manufacturer,
    modelName,
    recommendedMaintenanceDays: dias,
    capacityValue: capacityValue === null ? null : new Prisma.Decimal(capacityValue),
    capacityUnit,
    contactMaterial: material,
    contactMaterialNote: nota,
    provenanceClass: d.provenanceClass,
    sourceReference: texto(d.sourceReference),
    notes: texto(d.notes),
  };
}

/**
 * Una especificación limpia, o `ModeloError` con frase legible. La base rechaza
 * lo mismo con sus CHECK; esto va antes para que el error se pueda leer, y para
 * que una fila mala se sepa ANTES de escribir nada.
 */
function especificacionLimpia(kind: EquipmentKind, e: EspecificacionInput) {
  if (kind !== "instrument") throw new ModeloError("especificacion_solo_en_instrumentos");
  const quantity = e.quantity.trim();
  const unit = e.unit.trim();
  if (!quantity || !unit) throw new ModeloError("magnitud_y_unidad_obligatorias");
  const dec = (v: string | null | undefined) => {
    const t = texto(v);
    if (t === null) return null;
    if (!Number.isFinite(Number(t))) throw new ModeloError("numero_invalido");
    return new Prisma.Decimal(t);
  };
  const data = { quantity, unit, rangeMin: dec(e.rangeMin), rangeMax: dec(e.rangeMax), resolution: dec(e.resolution), accuracyAbs: dec(e.accuracyAbs) };
  if (data.rangeMin !== null && data.rangeMax !== null && data.rangeMin.greaterThan(data.rangeMax)) throw new ModeloError("rango_invertido");
  if (data.resolution !== null && !data.resolution.greaterThan(0)) throw new ModeloError("resolucion_positiva");
  if (data.accuracyAbs !== null && data.accuracyAbs.isNegative()) throw new ModeloError("precision_no_negativa");
  return data;
}

type EspecificacionLimpia = ReturnType<typeof especificacionLimpia>;

/** Lo que la auditoría guarda de una especificación nueva. */
function especificacionAuditada(modelId: string, data: EspecificacionLimpia) {
  return {
    modelId,
    quantity: data.quantity,
    unit: data.unit,
    rangeMin: data.rangeMin?.toString() ?? null,
    rangeMax: data.rangeMax?.toString() ?? null,
    resolution: data.resolution?.toString() ?? null,
    accuracyAbs: data.accuracyAbs?.toString() ?? null,
  };
}

function esDuplicado(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function crearModelo(userAccountId: string, input: CrearModeloInput): Promise<{ id: string }> {
  const organizationId = await requireCatalogoAccess(userAccountId, input.dueno, GESTIONAR);
  const datos = datosLimpios(input.kind, input);
  // Todas las filas se validan ANTES de tocar la base: el modelo y sus
  // especificaciones entran juntos o no entra nada.
  const especificaciones = (input.especificaciones ?? []).map((e) => especificacionLimpia(input.kind, e));
  try {
    return await prisma.$transaction(async (tx) => {
      const m = await tx.equipmentModel.create({
        data: { ...datos, kind: input.kind, organizationId, createdBy: userAccountId },
        select: { id: true },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          entityType: "equipment_model",
          entityId: m.id,
          operation: "create",
          sourceInterface: "lib/equipos/modelos.ts",
          after: { ...datos, kind: input.kind, organizationId },
        },
        tx,
      );
      for (const e of especificaciones) {
        const spec = await tx.equipmentModelSpec.create({ data: { ...e, modelId: m.id, createdBy: userAccountId }, select: { id: true } });
        await recordAuditEvent(
          {
            actorUserAccountId: userAccountId,
            entityType: "equipment_model_spec",
            entityId: spec.id,
            operation: "create",
            sourceInterface: "lib/equipos/modelos.ts",
            after: especificacionAuditada(m.id, e),
          },
          tx,
        );
      }
      return m;
    });
  } catch (e) {
    if (esDuplicado(e)) throw new ModeloError("modelo_duplicado");
    throw e;
  }
}

export async function editarModelo(userAccountId: string, modelId: string, d: DatosDeModelo): Promise<void> {
  const antes = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!antes) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, antes, GESTIONAR);
  const datos = datosLimpios(antes.kind, d);
  try {
    await prisma.$transaction(async (tx) => {
      // **La fila se bloquea y se RELEE aquí dentro** (decisión de Daniel, 2026-09-27). La lectura
      // de arriba vale para autorizar y para saber el `kind`, pero no para auditar: dos ediciones
      // simultáneas la hacían las dos antes de que ninguna escribiera, y las dos anotaban el MISMO
      // `before` — cuando la segunda escribió, ese estado ya no existía. Medido: los dos eventos
      // decían [90, 90].
      //
      // `FOR UPDATE` y no `Serializable`, siguiendo `bloquearCosechaEn` (lib/apiary/cierreDeCosecha.ts)
      // y la lección que su comentario deja escrita: serializable abortaba transacciones ajenas que
      // sólo compartían la tabla; el bloqueo de fila serializa lo que debe y nada más.
      //
      // Esto NO impide que la última edición gane, y no pretende hacerlo: para una edición eso es
      // razonable. Lo que garantiza es que cada `before` describa un estado que existió de verdad.
      await tx.$queryRaw`SELECT id FROM core.equipment_model WHERE id = ${modelId}::uuid FOR UPDATE`;
      const vigente = await tx.equipmentModel.findUniqueOrThrow({ where: { id: modelId } });
      await tx.equipmentModel.update({ where: { id: modelId }, data: datos });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          entityType: "equipment_model",
          entityId: modelId,
          operation: "update",
          sourceInterface: "lib/equipos/modelos.ts",
          before: {
            manufacturer: vigente.manufacturer,
            modelName: vigente.modelName,
            recommendedMaintenanceDays: vigente.recommendedMaintenanceDays,
            capacityValue: vigente.capacityValue?.toString() ?? null,
            capacityUnit: vigente.capacityUnit,
            contactMaterial: vigente.contactMaterial,
            contactMaterialNote: vigente.contactMaterialNote,
            provenanceClass: vigente.provenanceClass,
            sourceReference: vigente.sourceReference,
            notes: vigente.notes,
          },
          after: { ...datos, capacityValue: datos.capacityValue?.toString() ?? null },
        },
        tx,
      );
    });
  } catch (e) {
    if (esDuplicado(e)) throw new ModeloError("modelo_duplicado");
    throw e;
  }
}

export async function retirarModelo(userAccountId: string, modelId: string, cuando: Date): Promise<void> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
  if (m.retiredAt) return;
  await prisma.$transaction(async (tx) => {
    // **Condicionado al estado observado**, como su inversa (ADR-187, revisión de Codex del
    // 2026-09-27). Con un `update` por id a secas, dos retiros simultáneos escribían DOS eventos
    // `retire` y, peor, el segundo pisaba `retiredAt` con su propia fecha: la fila y su auditoría
    // acababan contando instantes distintos. Medido con las dos llamadas a la vez: daba 2, ahora 1.
    const { count } = await tx.equipmentModel.updateMany({
      where: { id: modelId, retiredAt: null },
      data: { retiredAt: cuando },
    });
    if (count === 0) return;
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "equipment_model", entityId: modelId, operation: "retire", sourceInterface: "lib/equipos/modelos.ts", after: { retiredAt: cuando.toISOString() } },
      tx,
    );
  });
}

/**
 * Deshace un retiro (ADR-187).
 *
 * **Por qué existe.** `retirarModelo` no tenía inversa, y el nombre queda reservado: el índice
 * `equipment_model_dueno_nombre_normalizado_key` es único sobre (dueño, fabricante, nombre) y **no
 * excluye los retirados**. Un retiro por equivocación no se arreglaba desde la aplicación, y ese
 * fabricante y nombre no volvían a poder usarse nunca.
 *
 * **Y por eso esto no puede chocar** — pero la razón es más estrecha de lo que parece, y Codex la
 * afinó el 2026-09-27: des-retirar **no cambia el nombre**, sólo `retiredAt`, así que la fila
 * conserva la clave que ya tenía y no compite con nadie. Lo que NO es cierto es que la reserva sea
 * perpetua: `editarModelo` deja renombrar una fila retirada, y entonces el nombre viejo queda
 * libre. Por eso aquí no hace falta atrapar el `P2002` — no porque nada pueda ocupar ese nombre,
 * sino porque esta operación no lo reclama.
 *
 * **La escritura va condicionada al estado observado**, y la auditoría sólo si la transición
 * ocurrió de verdad. Leer fuera de la transacción y actualizar por `id` a secas dejaba que dos
 * llamadas simultáneas escribieran dos `unretire`, y la segunda auditaba un no-cambio con un
 * `before` falso. Medido con una prueba que lanza las dos a la vez: daba 2 eventos, ahora 1.
 *
 * **Las tres del archivo se cerraron el 2026-09-27 con esta misma forma**: `retirarModelo`,
 * `desRetirarModelo` y `retirarEspecificacion`. Si se añade otra transición de estado aquí, va
 * condicionada al estado observado y sin auditar cuando no hubo transición.
 */
export async function desRetirarModelo(userAccountId: string, modelId: string): Promise<void> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
  // No retirado: no hay nada que deshacer, y escribir auditoría de un no-cambio la envilece.
  if (!m.retiredAt) return;
  // Capturado fuera: el estrechamiento de `m.retiredAt` no cruza el cierre del `$transaction`.
  const retiradoEn = m.retiredAt;
  await prisma.$transaction(async (tx) => {
    // `updateMany` con la condición dentro: si otra llamada se adelantó, toca 0 filas y no se
    // audita nada. Un `update` por id habría escrito igual y contado una transición que no hubo.
    const { count } = await tx.equipmentModel.updateMany({
      where: { id: modelId, retiredAt: { not: null } },
      data: { retiredAt: null },
    });
    if (count === 0) return;
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "equipment_model", entityId: modelId, operation: "unretire", sourceInterface: "lib/equipos/modelos.ts", before: { retiredAt: retiradoEn.toISOString() }, after: { retiredAt: null } },
      tx,
    );
  });
}

export async function declararEspecificacion(userAccountId: string, modelId: string, e: EspecificacionInput): Promise<{ id: string }> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
  const data = especificacionLimpia(m.kind, e);
  return prisma.$transaction(async (tx) => {
    const spec = await tx.equipmentModelSpec.create({ data: { ...data, modelId, createdBy: userAccountId }, select: { id: true } });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "equipment_model_spec",
        entityId: spec.id,
        operation: "create",
        sourceInterface: "lib/equipos/modelos.ts",
        after: especificacionAuditada(modelId, data),
      },
      tx,
    );
    return spec;
  });
}

export async function retirarEspecificacion(userAccountId: string, specId: string, cuando: Date): Promise<void> {
  const s = await prisma.equipmentModelSpec.findUnique({ where: { id: specId }, include: { model: true } });
  if (!s) throw new ModeloError("especificacion_no_encontrada");
  await requireEntradaDeCatalogoAccess(userAccountId, s.model, GESTIONAR);
  if (s.retiredAt) return;
  await prisma.$transaction(async (tx) => {
    // La tercera del mismo patrón, cerrada el 2026-09-27 como sus dos hermanas: la condición va
    // DENTRO, y sin transición no se audita. Ver el comentario de `desRetirarModelo`.
    const { count } = await tx.equipmentModelSpec.updateMany({
      where: { id: specId, retiredAt: null },
      data: { retiredAt: cuando },
    });
    if (count === 0) return;
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "equipment_model_spec", entityId: specId, operation: "retire", sourceInterface: "lib/equipos/modelos.ts", after: { retiredAt: cuando.toISOString() } },
      tx,
    );
  });
}

/**
 * «¿Puede esta persona ver ESTE equipo?», con memoria por id. La cuenta y la
 * lista de equipos de un modelo siguen el permiso real de cada unidad —dónde
 * está, su proyecto, su clasificación— y no la organización: «de mi
 * organización» no es «puedo verlo», y un modelo compartido tiene unidades de
 * todas.
 */
function verEquipo(userAccountId: string) {
  const memo = new Map<string, Promise<boolean>>();
  return (equipmentId: string) => {
    let p = memo.get(equipmentId);
    if (!p) {
      p = puedeSobreEquipo(userAccountId, equipmentId, "view");
      memo.set(equipmentId, p);
    }
    return p;
  };
}

async function soloVisibles<T extends { id: string }>(equipos: readonly T[], veo: (id: string) => Promise<boolean>): Promise<T[]> {
  const si = await Promise.all(equipos.map((e) => veo(e.id)));
  return equipos.filter((_, i) => si[i]);
}

async function enLista(where: Prisma.EquipmentModelWhereInput, veo: (id: string) => Promise<boolean>): Promise<ModeloEnLista[]> {
  const filas = await prisma.equipmentModel.findMany({
    where,
    select: { id: true, manufacturer: true, modelName: true, kind: true, organizationId: true, recommendedMaintenanceDays: true, retiredAt: true, equipment: { select: { id: true } } },
    orderBy: [{ manufacturer: "asc" }, { modelName: "asc" }],
  });
  return Promise.all(filas.map(async ({ equipment, ...f }) => ({ ...f, equipos: (await soloVisibles(equipment, veo)).length })));
}

export async function listarModelos(
  userAccountId: string,
  filtro: { kind?: EquipmentKind; incluirRetirados?: boolean } = {},
): Promise<{ compartidos: ModeloEnLista[]; propios: ModeloEnLista[] }> {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const veo = verEquipo(userAccountId);
  const base: Prisma.EquipmentModelWhereInput = {
    ...(filtro.kind ? { kind: filtro.kind } : {}),
    ...(filtro.incluirRetirados ? {} : { retiredAt: null }),
  };
  const [compartidos, propios] = await Promise.all([
    enLista({ ...base, organizationId: null }, veo),
    orgs.length > 0 ? enLista({ ...base, organizationId: { in: orgs } }, veo) : Promise.resolve([]),
  ]);
  return { compartidos, propios };
}

/** Para el desplegable del alta: sólo vigentes, del tipo dado, compartidos + los de ESA organización. */
export async function modelosParaElegir(userAccountId: string, organizationId: string, kind: EquipmentKind) {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const veo = verEquipo(userAccountId);
  const propios = orgs.includes(organizationId)
    ? await enLista({ kind, retiredAt: null, organizationId }, veo)
    : [];
  const compartidos = await enLista({ kind, retiredAt: null, organizationId: null }, veo);
  return { compartidos, propios };
}

export async function modeloParaFicha(userAccountId: string, modelId: string) {
  // El id llega de la URL de `equipos/modelos/[id]`. Sin forma de UUID, Prisma lanzaba `P2007` y la
  // página daba 500 (PENDING_IMPLEMENTATIONS/026); es un modelo que no existe.
  if (!UUID.test(modelId)) throw new ModeloError("modelo_no_encontrado");
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const m = await prisma.equipmentModel.findFirst({
    where: { id: modelId, ...filtroVisible(orgs) },
    include: {
      organization: { select: { name: true } },
      specs: { where: { retiredAt: null }, orderBy: [{ displayOrder: "asc" }, { quantity: "asc" }] },
      equipment: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  return { ...m, equipment: await soloVisibles(m.equipment, verEquipo(userAccountId)) };
}
export type FichaDeModelo = Awaited<ReturnType<typeof modeloParaFicha>>;

export async function puedeEditarModelo(userAccountId: string, modelId: string): Promise<boolean> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId }, select: { organizationId: true } });
  if (!m) return false;
  try {
    await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
    return true;
  } catch {
    return false;
  }
}

/**
 * Los sitios que el alta de un modelo puede ofrecer como dueño: los que pasan
 * `requireCatalogoAccess` —`equipment:manage` en ESE sitio—, con el nombre de
 * su organización. No es `sitiosParaRegistrar`: ése acepta también
 * `location:edit_beneficio`, que abre el registro de equipo pero no el
 * catálogo, y ofrecería sitios donde el guardado siempre falla.
 */
export async function sitiosParaCatalogo(userAccountId: string) {
  const sitios = await prisma.location.findMany({
    where: { organizationId: { not: null } },
    select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const permitidos = [];
  for (const s of sitios) {
    if (!(await can(userAccountId, GESTIONAR.action, GESTIONAR.resourceType, { scopeType: "location", scopeRefId: s.id }, "internal"))) continue;
    permitidos.push({ id: s.id, name: s.name, organizationId: s.organizationId!, organizationName: s.organization?.name ?? null });
  }
  return permitidos;
}

export async function puedeCrearCompartido(userAccountId: string): Promise<boolean> {
  try {
    await requireCatalogoAccess(userAccountId, { tipo: "compartido" }, GESTIONAR);
    return true;
  } catch {
    return false;
  }
}
