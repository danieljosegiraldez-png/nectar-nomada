import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireFieldSessionAccess } from "./jornadaDeCampo";
import { FieldSessionValidationError } from "./fieldSessions";

/**
 * A9.6 (D7) — emitir el reporte de una visita, congelado.
 *
 * **Lo único de este alcance que no se puede añadir después.** Un reporte
 * emitido sin `renderedSnapshot` no se reconstruye: si el PDF se renderiza
 * desde los datos vivos, el documento que el cliente descargue en marzo y el
 * que descargue en septiembre son distintos con el mismo número. Es la misma
 * regla que `CLAUDE.md` §3 aplica a los protocolos, aplicada a un documento de
 * cliente — y la razón por la que esto va antes que el renderizador, que sí es
 * recuperable.
 *
 * **`generationQuery` no lo pidió nadie y vale la pena.** Sin él un reporte
 * congelado es un documento suelto; con él se puede regenerar y comparar con lo
 * que dicen los datos hoy, que es la pregunta que un cliente hace de verdad:
 * «¿esto sigue siendo así?».
 *
 * **Los costos no se filtran al renderizar: no entran al snapshot.** El Anexo C
 * §3.1 dice que van «sólo si el contrato lo pide», y eso deja de ser una regla
 * de pantalla. Lo que no se congela no se puede filtrar mal después.
 */
export class ReporteError extends Error {}

export interface EmitirReporteInput {
  fieldSessionId: string;
  /** Congelar los costos. Por defecto NO: sólo si el contrato lo pide. */
  incluirCostos?: boolean;
}

/** Lo que se congela. Deliberadamente plano y sin ids internos donde se puede. */
export interface SnapshotDeVisita {
  sitio: { nombre: string; tipo: string };
  visita: {
    inicio: string;
    fin: string | null;
    estado: string;
    operador: string;
    notas: string | null;
  };
  registros: Array<{
    cuando: string;
    clase: string;
    operador: string | null;
    notas: string | null;
    sujeto: string | null;
  }>;
  emitidoEn: string;
}

export async function emitirReporteDeVisita(userAccountId: string, input: EmitirReporteInput) {
  const visita = await prisma.fieldSession.findUnique({
    where: { id: input.fieldSessionId },
    include: {
      location: { select: { name: true, locationType: true } },
      operator: { select: { displayName: true } },
    },
  });
  if (!visita) throw new FieldSessionValidationError("session_not_found");
  await requireFieldSessionAccess(userAccountId, visita.locationId);

  // Un reporte de una visita que sigue en borrador diría cosas que aún pueden
  // cambiar, y quedaría congelado igual. Se exige el cierre de A9.3.
  if (visita.status === "draft") throw new ReporteError("visita_sin_completar");

  const eventos = await prisma.fieldEvent.findMany({
    where: { fieldSessionId: visita.id },
    orderBy: { occurredAt: "asc" },
    include: {
      eventKindValue: { select: { value: true } },
      operator: { select: { displayName: true } },
    },
  });

  const snapshot: SnapshotDeVisita = {
    sitio: { nombre: visita.location.name, tipo: visita.location.locationType },
    visita: {
      inicio: visita.startedAt.toISOString(),
      fin: visita.endedAt?.toISOString() ?? null,
      estado: visita.status,
      operador: visita.operator.displayName,
      notas: visita.notes,
    },
    registros: eventos.map((e) => ({
      cuando: e.occurredAt.toISOString(),
      clase: e.eventKindValue.value,
      operador: e.operator?.displayName ?? null,
      notas: e.notes,
      // Qué hecho concreto cuelga de este registro, sin exponer el id interno.
      sujeto:
        e.inspectionId ? "inspeccion"
        : e.colonyEventId ? "evento_de_colonia"
        : e.apiaryHarvestEventId ? "cosecha"
        : e.measurementId ? "medicion"
        : e.harvestEventId ? "cosecha"
        : null,
    })),
    emitidoEn: new Date().toISOString(),
  };

  const generationQuery = {
    fuente: "lib/traceability/reporteDeVisita.ts",
    fieldSessionId: visita.id,
    incluyeCostos: input.incluirCostos === true,
    registrosCongelados: snapshot.registros.length,
  };

  return prisma.$transaction(async (tx) => {
    const reporte =
      (await tx.report.findFirst({
        where: { subjectEntityType: "field_session", subjectEntityId: visita.id },
      })) ??
      (await tx.report.create({
        data: {
          reportType: "consulting",
          subjectEntityType: "field_session",
          subjectEntityId: visita.id,
          status: "issued",
          createdBy: userAccountId,
        },
      }));

    // La versión NO se sobreescribe: se emite una nueva. Un reporte ya
    // entregado no cambia porque los datos se corrijan después — es la misma
    // propiedad que el versionado de protocolos garantiza.
    const ultima = await tx.reportVersion.findFirst({
      where: { reportId: reporte.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const version = await tx.reportVersion.create({
      data: {
        reportId: reporte.id,
        version: (ultima?.version ?? 0) + 1,
        generationQuery,
        renderedSnapshot: snapshot as unknown as object,
        generatedBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "report_version.create",
        entityType: "report_version",
        entityId: version.id,
        after: { reportId: reporte.id, version: version.version, registros: snapshot.registros.length },
        reason: "reporte de visita emitido",
        sourceInterface: "traceability.close",
      },
      tx,
    );

    return { reporte, version, snapshot };
  });
}

/**
 * Lee el reporte emitido de una visita, **desde el snapshot**.
 *
 * Ésta es la mitad que hace que D7 signifique algo. Renderizar desde los datos
 * vivos daría un documento distinto cada vez que alguien corrige una fila, con
 * el mismo número de reporte. Esta función no consulta la visita: consulta lo
 * que se congeló.
 *
 * Devuelve `null` cuando la visita no tiene reporte emitido, que es distinto de
 * «tiene uno vacío» — la página lo dice en vez de enseñar un documento en
 * blanco que parecería un reporte real.
 */
export async function leerReporteDeVisita(userAccountId: string, fieldSessionId: string) {
  const visita = await prisma.fieldSession.findUnique({
    where: { id: fieldSessionId },
    select: { locationId: true },
  });
  if (!visita) throw new FieldSessionValidationError("session_not_found");
  await requireFieldSessionAccess(userAccountId, visita.locationId);

  const reporte = await prisma.report.findFirst({
    where: { subjectEntityType: "field_session", subjectEntityId: fieldSessionId },
    select: { id: true, status: true },
  });
  if (!reporte) return null;

  const version = await prisma.reportVersion.findFirst({
    where: { reportId: reporte.id },
    orderBy: { version: "desc" },
    select: { id: true, version: true, generatedAt: true, renderedSnapshot: true },
  });
  if (!version) return null;

  return {
    reporteId: reporte.id,
    version: version.version,
    generatedAt: version.generatedAt,
    // El contenido tal como se congeló. No se mezcla con nada vivo a
    // propósito: en cuanto se mezclara, dejaría de ser el documento que se
    // entregó.
    snapshot: version.renderedSnapshot as unknown as SnapshotDeVisita,
  };
}
