/**
 * Ticket A2 — REVISED (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md
 * §1a, §3). Inspection stays formal and structurally protected — no
 * `feeding`/`treatment` value exists anywhere on this table, so the DB
 * schema itself makes the original collapse-bug impossible.
 *
 * RBAC resolves via the parent Colony's own Hive (project/location),
 * reusing requireApiaryAccess from ./hives rather than a second helper —
 * the same "resolve via the parent" pattern lib/traceability/storage.ts
 * already uses against its parent Lot.
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import { ligarAVisitaAbierta } from "../traceability/visitaAbierta";
import { abrirIntervaloEn, ArtefactoInvalido, cerrarAbiertosEn, exigeTipoDeArtefacto, validarArtefacto } from "./artefactos";
import { CATALOGO_DE_IRREGULARIDAD } from "./irregularidades";
import { exigeCeldasReales, exigeEnteroContado, exigeEtapasDeCria, exigeNivelDeReserva, exigePoblacion } from "./estadoDeColonia";
import type {
  BroodStage,
  ColonyPopulation,
  InspectionOutcome,
  ProvenanceClass,
  QueenCellKind,
  StoresLevel,
} from "../../generated/prisma/client";

/**
 * Una entrada que el servicio rechaza. Se distingue de `ApiaryAccessError` a
 * propósito: el camino de sincronización informa los dos como `rejected`, pero
 * «no tienes permiso» y «esa bandera no existe» piden cosas distintas a quien
 * lo lee. Mismo reparto que `ColonyEventValidationError`.
 */
export class InspectionValidationError extends Error {}

async function resolveColonyScope(colonyId: string) {
  const colony = await prisma.colony.findUnique({ where: { id: colonyId }, include: { hive: true } });
  if (!colony) throw new ApiaryAccessError("colony_not_found");
  return { projectId: colony.hive.projectId, locationId: colony.hive.locationId, hiveId: colony.hive.id };
}

/**
 * Un cambio en la caja declarado en la inspección — artefactos de colmena, Tarea 2. **Sólo la
 * diferencia**, como pidió Daniel: una inspección sin cambios no manda ninguno y no toca nada.
 * `kind` llega como cadena (formulario, cola de campo) y se valida en `validarArtefacto`.
 */
export interface CambioDeConfiguracion {
  kind: string;
  accion: "instalado" | "retirado" | string;
  /** Sólo alzas, al instalar. */
  count?: number | null;
  notes?: string | null;
}

export interface RecordInspectionInput {
  colonyId: string;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  outcome: InspectionOutcome;
  broodPatternNote?: string | null;
  queenSighted?: boolean | null;
  /** @deprecated Anexo B §2.2 — lo reemplazan `honeyStoresLevel` y `honeyNextToBrood`. */
  storesLevel?: string | null;
  temperamentNote?: string | null;

  // --- Anexo B §2.2, estado de la colonia. Los siete campos llegan como los
  // escribe el protocolo del dueño, y los valida `./estadoDeColonia` en la
  // frontera: el formulario y la cola offline mandan CADENAS.
  population?: ColonyPopulation | string | null;
  beeCoveredFrames?: number | string | null;
  /** Marcos con la cera vieja o negra (spec 2026-09-18 §5.3). Vacío = no se contó, no cero. */
  darkFrames?: number | string | null;
  broodStages?: readonly (BroodStage | string)[] | null;
  queenCellKind?: QueenCellKind | string | null;
  queenCellCount?: number | string | null;
  honeyStoresLevel?: StoresLevel | string | null;
  honeyNextToBrood?: boolean | null;
  pollenStoresLevel?: StoresLevel | string | null;
  pollenNextToBrood?: boolean | null;
  droneBroodPresent?: boolean | null;
  /**
   * El «Otro» del Anexo B §2.3: lo que el catálogo no cubre. Ya no es el único
   * sitio donde vive el dato — ver `irregularidades`.
   */
  pestDiseaseFlags?: string | null;
  /**
   * Las banderas del catálogo `irregularidad_de_inspeccion`, por id. Varias.
   *
   * Vacío es legítimo y frecuente: una inspección «sin novedad» no tiene
   * ninguna, y **no se rellena sola**.
   */
  irregularidades?: readonly string[];
  note?: string | null;
  // A5/A0 (25_OFFLINE_OPTIONS_ANALYSIS.md §0) — a client-generated id from
  // the offline draft queue. When present, a retried "Sync now" pass (the
  // same draft POSTed twice after a dropped response) is a no-op, not a
  // duplicate row: checked server-side before insert, per §0's own
  // idempotent-sync finding.
  clientDraftId?: string | null;
  /** Lo que cambió en la caja en esta visita. Ausente o vacío = nada cambió. */
  cambiosDeConfiguracion?: readonly CambioDeConfiguracion[] | null;
}

/**
 * `provenanceClass` is not a caller-supplied field — fixed to
 * `direct_observation` here, at the action layer, for every call site
 * (§1a: "a trained person opened the hive and assessed it"), the same
 * non-operator-selectable discipline T12.6 already established for its
 * own fixed-per-call-site provenanceClass values.
 */
export async function recordInspection(userAccountId: string, input: RecordInspectionInput) {
  const scope = await resolveColonyScope(input.colonyId);
  await requireApiaryAccess(userAccountId, "manage", [scope]);

  if (input.clientDraftId) {
    const existing = await prisma.inspection.findUnique({ where: { clientDraftId: input.clientDraftId } });
    if (existing) return existing;
  }

  const provenanceClass: ProvenanceClass = "direct_observation";

  const irregularidades = [...new Set(input.irregularidades ?? [])];

  // **La FK no basta.** Apunta a `variable_catalog_value` entera, no a este
  // catálogo, así que sin esta comprobación se podría colgar una levadura de una
  // inspección y la base lo aceptaría encantada. Mismo guardia que
  // `registrarFinDeColonia` con las causas, y por la misma razón.
  if (irregularidades.length > 0) {
    const validas = await prisma.variableCatalogValue.count({
      where: {
        id: { in: irregularidades },
        catalog: { key: CATALOGO_DE_IRREGULARIDAD },
        aliasOfId: null,
      },
    });
    if (validas !== irregularidades.length) throw new InspectionValidationError("irregularidad_desconocida");
  }

  // Anexo B §2.2. **Se valida aquí, en el servicio, y no sólo en quien llama**:
  // es la lección de ADR-112 —el servicio escribía `input.status` sin mirarlo, y
  // un formulario manipulado producía una fila contradictoria—. Un tipo de
  // TypeScript no sobrevive a un cuerpo JSON.
  const population = input.population == null || input.population === "" ? null : exigePoblacion(input.population);
  const beeCoveredFrames = exigeEnteroContado(input.beeCoveredFrames, "cuadros_cubiertos");
  const darkFrames = exigeEnteroContado(input.darkFrames, "marcos_negros");
  const broodStages = exigeEtapasDeCria(input.broodStages);
  const celdas = exigeCeldasReales(input.queenCellKind, input.queenCellCount);
  const honeyStoresLevel =
    input.honeyStoresLevel == null || input.honeyStoresLevel === "" ? null : exigeNivelDeReserva(input.honeyStoresLevel);
  const pollenStoresLevel =
    input.pollenStoresLevel == null || input.pollenStoresLevel === "" ? null : exigeNivelDeReserva(input.pollenStoresLevel);

  // Los cambios de la caja se validan ANTES de la transacción: un cambio inválido rechaza la
  // inspección entera en vez de guardarla a medias.
  const cambios = (input.cambiosDeConfiguracion ?? []).map((c) => {
    if (c.accion !== "instalado" && c.accion !== "retirado") throw new ArtefactoInvalido("accion_desconocida");
    // El nodo tiene identidad y permiso propio (spec §7.1): se instala por su pantalla, donde se
    // dice CUÁL aparato, no con un toque en la inspección.
    if (c.kind === "nodo_de_sensores") throw new ArtefactoInvalido("nodo_por_su_pantalla");
    // «Se quitó el otro» no dice CUÁL: puede haber varios puestos. Se retira donde se ve cuál.
    if (c.kind === "otro" && c.accion === "retirado") throw new ArtefactoInvalido("otro_se_retira_por_su_pantalla");
    // Retirar sólo necesita saber QUÉ se quitó; la cuenta y la nota son de la instalación.
    return c.accion === "instalado"
      ? { accion: "instalado" as const, ...validarArtefacto(c) }
      : { accion: "retirado" as const, kind: exigeTipoDeArtefacto(c.kind), count: null, notes: null };
  });

  const inspection = await prisma.$transaction(async (tx) => {
    const inspection = await tx.inspection.create({
      data: {
        colonyId: input.colonyId,
        occurredAt: input.occurredAt ?? new Date(),
        operatorPersonId: input.operatorPersonId ?? null,
        outcome: input.outcome,
        broodPatternNote: input.broodPatternNote ?? null,
        queenSighted: input.queenSighted ?? null,
        storesLevel: input.storesLevel ?? null,
        temperamentNote: input.temperamentNote ?? null,
        population,
        beeCoveredFrames,
        darkFrames,
        broodStages,
        queenCellKind: celdas.kind,
        queenCellCount: celdas.count,
        honeyStoresLevel,
        honeyNextToBrood: input.honeyNextToBrood ?? null,
        pollenStoresLevel,
        pollenNextToBrood: input.pollenNextToBrood ?? null,
        droneBroodPresent: input.droneBroodPresent ?? null,
        pestDiseaseFlags: input.pestDiseaseFlags ?? null,
        note: input.note ?? null,
        provenanceClass,
        clientDraftId: input.clientDraftId ?? null,
        createdBy: userAccountId,
        // Dentro de la MISMA transacción y del mismo `create`: una inspección
        // con hallazgo cuyas banderas se escribieran aparte podría quedarse a
        // medias —el hecho sin lo que se vio— y nada lo diría.
        irregularities: { create: irregularidades.map((valueId) => ({ valueId })) },
      },
      include: { irregularities: { include: { value: { select: { value: true } } } } },
    });

    // C1 §3: evidentiary write. Not reached on the clientDraftId idempotent
    // no-op path above, so a retried sync never double-audits the same fact.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "inspection.create",
        entityType: "inspection",
        entityId: inspection.id,
        after: inspection,
        sourceInterface: "apiary.service",
      },
      tx,
    );

    // Artefactos, Tarea 2 — la diferencia declarada abre o cierra intervalos EN LA FECHA DE LA
    // INSPECCIÓN y atados a ella. Dentro de la MISMA transacción: una inspección guardada con un
    // intervalo perdido sería una configuración fantasma.
    for (const c of cambios) {
      if (c.accion === "instalado") {
        await abrirIntervaloEn(userAccountId, {
          hiveId: scope.hiveId,
          kind: c.kind,
          count: c.count,
          notes: c.notes,
          installedAt: inspection.occurredAt,
          provenanceClass,
          installedInspectionId: inspection.id,
        })(tx);
      } else {
        await cerrarAbiertosEn(userAccountId, scope.hiveId, c.kind, inspection.occurredAt, inspection.id)(tx);
      }
    }

    // A9.2 — si hay una visita abierta en este sitio por esta persona, la
    // inspección entra en ella. Dentro de la MISMA transacción: un vínculo que
    // se confirma aparte puede perderse y dejar la visita incompleta sin que
    // nada lo diga.
    await ligarAVisitaAbierta(tx, {
      userAccountId,
      locationId: scope.locationId,
      occurredAt: inspection.occurredAt,
      provenanceClass,
      sujeto: { inspectionId: inspection.id },
    });

    return inspection;
  });

  return inspection;
}

export async function listInspectionsForColony(userAccountId: string, colonyId: string) {
  const scope = await resolveColonyScope(colonyId);
  await requireApiaryAccess(userAccountId, "view", [scope]);

  return prisma.inspection.findMany({ where: { colonyId }, include: { assets: true }, orderBy: { occurredAt: "desc" } });
}
