/**
 * El conteo de varroa: registrarlo, y la serie que hace posible.
 *
 * **Lo que cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.5 pide cuatro
 * campos y ninguno existía; el Anexo C §2.1 nombra la serie —*«Infestación de
 * varroa | por conteo | umbral de tratamiento y si el tratamiento sirvió»*— que
 * sin ellos no se podía dibujar.
 *
 * **El porcentaje no se guarda en ninguna fila.** Es `ácaros / abejas`, el Anexo
 * lo marca «derivado», y guardarlo sería un segundo sitio que puede discrepar
 * del primero. Se calcula al leer, aquí, en un solo lugar.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import { ligarAVisitaAbierta } from "../traceability/visitaAbierta";
import type { ProvenanceClass, VarroaMethod } from "../../generated/prisma/client";

/**
 * La aritmética y el vocabulario viven en `./infestacion`, sin `prisma` detrás,
 * porque el formulario de captura es `"use client"` y enseña el porcentaje
 * mientras se teclea. Se re-exportan para que nadie más tenga que saberlo.
 */
export {
  VarroaValidationError,
  METODOS_DE_VARROA,
  esMetodoDeVarroa,
  exigeMetodoDeVarroa,
  infestacionPorCiento,
} from "./infestacion";
import { exigeMetodoDeVarroa, infestacionPorCiento, VarroaValidationError } from "./infestacion";

export interface RegistrarConteoDeVarroaInput {
  colonyId: string;
  occurredAt?: Date;
  method: VarroaMethod;
  /** El denominador. Un conteo sin muestra no tiene porcentaje. */
  sampleBees: number;
  /** El numerador. Cero es legítimo y es el mejor resultado posible. */
  mitesCounted: number;
  /**
   * El tratamiento que este conteo evalúa, si evalúa alguno. Ausente es el caso
   * normal: se cuenta para decidir si hay que tratar.
   */
  evaluatesColonyEventId?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  clientDraftId?: string | null;
}

/**
 * Registra un conteo de varroa.
 *
 * `provenanceClass` se fija a `measured_fact` y **no es seleccionable**: alguien
 * contó ácaros en una muestra de abejas. Misma disciplina que el resto del
 * módulo — un valor de procedencia que el operador elige deja de significar
 * nada.
 */
export async function registrarConteoDeVarroa(userAccountId: string, input: RegistrarConteoDeVarroaInput) {
  const colony = await prisma.colony.findUnique({
    where: { id: input.colonyId },
    include: { hive: true },
  });
  if (!colony) throw new ApiaryAccessError("colony_not_found");
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: colony.hive.projectId, locationId: colony.hive.locationId },
  ]);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: colony.hive.projectId, locationId: colony.hive.locationId }]);

  if (input.clientDraftId) {
    const yaEstaba = await prisma.varroaCount.findUnique({ where: { clientDraftId: input.clientDraftId } });
    if (yaEstaba) return yaEstaba;
  }

  // El método se valida AQUÍ, no sólo en quien llama. Es la lección de
  // ADR-112: el servicio escribía `input.status` sin mirarlo, así que un
  // formulario manipulado producía una fila contradictoria. Un tipo de
  // TypeScript no sobrevive a un `as never` ni a un cuerpo JSON.
  const method = exigeMetodoDeVarroa(input.method);

  // Enteros y no negativos. Y la muestra, además, distinta de cero: sin
  // denominador no hay conteo, sólo dos números sueltos.
  if (!Number.isInteger(input.sampleBees) || input.sampleBees <= 0) {
    throw new VarroaValidationError("sample_bees_invalid");
  }
  if (!Number.isInteger(input.mitesCounted) || input.mitesCounted < 0) {
    throw new VarroaValidationError("mites_counted_invalid");
  }
  // Más ácaros que abejas no es un conteo: es un dedo de más al teclear. Se
  // rechaza en vez de guardar un 400 % que después nadie sabe leer.
  if (input.mitesCounted > input.sampleBees) {
    throw new VarroaValidationError("mas_acaros_que_abejas");
  }

  // El tratamiento que se dice evaluar tiene que existir, ser un TRATAMIENTO, y
  // ser **de esta misma colonia**: sin lo último se podría atribuir la eficacia
  // de una caja a la de otra, que es peor que no medirla.
  if (input.evaluatesColonyEventId) {
    const tratamiento = await prisma.colonyEvent.findUnique({
      where: { id: input.evaluatesColonyEventId },
      select: { colonyId: true, eventType: true },
    });
    if (!tratamiento) throw new VarroaValidationError("tratamiento_no_encontrado");
    if (tratamiento.eventType !== "treatment") throw new VarroaValidationError("no_es_un_tratamiento");
    if (tratamiento.colonyId !== input.colonyId) throw new VarroaValidationError("tratamiento_de_otra_colonia");
  }

  const provenanceClass: ProvenanceClass = "measured_fact";
  const occurredAt = input.occurredAt ?? new Date();

  return prisma.$transaction(async (tx) => {
    const conteo = await tx.varroaCount.create({
      data: {
        colonyId: input.colonyId,
        occurredAt,
        method,
        sampleBees: input.sampleBees,
        mitesCounted: input.mitesCounted,
        evaluatesColonyEventId: input.evaluatesColonyEventId ?? null,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        provenanceClass,
        clientDraftId: input.clientDraftId ?? null,
        createdBy: userAccountId,
      },
    });

    // C1 §3: escritura con valor probatorio. Un conteo decide si se trata, y un
    // tratamiento tiene carencia y afecta a la miel — así que quién contó y
    // cuándo tiene que quedar.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "varroa_count.create",
        entityType: "varroa_count",
        entityId: conteo.id,
        after: conteo,
        sourceInterface: "apiary.service",
      },
      tx,
    );

    // A9.2 — si hay visita abierta en este sitio por esta persona, el conteo
    // entra en ella. En la MISMA transacción, como sus hermanos.
    await ligarAVisitaAbierta(tx, {
      userAccountId,
      locationId: colony.hive.locationId,
      occurredAt,
      provenanceClass,
      sujeto: { varroaCountId: conteo.id },
    });

    return conteo;
  });
}

export interface PuntoDeLaSerie {
  id: string;
  occurredAt: Date;
  method: VarroaMethod;
  sampleBees: number;
  mitesCounted: number;
  /** Derivado al leer, nunca guardado. */
  infestacion: number;
  /** El id del tratamiento que evalúa, si evalúa alguno. */
  evaluatesColonyEventId: string | null;
}

/**
 * La serie de infestación de una colonia, de la más vieja a la más nueva.
 *
 * **No autoriza y no pide principal**, misma disciplina que `vitalesDeSitios`,
 * `coloniasPorIrregularidad` y `carenciasVigentes`: quien llama ya obtuvo el
 * `colonyId` de una lectura que sí autoriza.
 *
 * **Ascendente a propósito.** Es una serie temporal: leerla al revés obligaría a
 * cada pantalla a invertirla, y la primera que se olvidara dibujaría la curva
 * hacia atrás sin que nada fallara.
 */
export async function serieDeInfestacion(colonyId: string): Promise<PuntoDeLaSerie[]> {
  const conteos = await prisma.varroaCount.findMany({
    where: { colonyId },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      occurredAt: true,
      method: true,
      sampleBees: true,
      mitesCounted: true,
      evaluatesColonyEventId: true,
    },
  });
  return conteos.map((c) => ({ ...c, infestacion: infestacionPorCiento(c.sampleBees, c.mitesCounted) }));
}
