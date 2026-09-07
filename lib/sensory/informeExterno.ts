/**
 * Registrar el informe de cata de alguien que no tiene cuenta.
 *
 * **El caso, dicho por el dueño (2026-09-07):** «cuando un Q-grader o roaster me
 * trabaja las muestras que le pago el análisis, entran bajo estos estándares y
 * terminologías y puntajes». Ese informe llega bajo la firma de esa persona, y
 * esa persona no es usuaria de la plataforma. Hasta hoy
 * `assessment.evaluator_user_account_id` era NOT NULL con FK a `user_account`,
 * así que **el trabajo que se paga era justo el que no se podía registrar**.
 *
 * **Por qué crea sesión, vuelo y muestra ciega en vez de una tabla nueva.** Un
 * informe externo es una valoración de una muestra bajo un protocolo — lo mismo
 * que una cata interna, con otra procedencia. Reusar la cadena que ya existe
 * significa que los resultados de panel, el historial y los reportes lo ven sin
 * cambiar una línea. Una tabla paralela habría duplicado atributos, descriptores
 * y agregados, y el día que divergieran nadie sabría cuál manda.
 *
 * **El «ciego» aquí es degenerado a propósito, y se dice.** No hubo cata a
 * ciegas: la persona sabía qué café era. El mapeo se crea igual porque es lo que
 * ata el puntaje a la muestra real, y sin él el número no se puede atribuir a
 * ningún café.
 *
 * **Los atributos llegan por NOMBRE, no por id.** El informe dice «Flavor 7»,
 * no un UUID. Buscarlos por nombre en el protocolo convierte «este informe trae
 * un atributo que el protocolo no tiene» en un error con nombre, en vez de en un
 * puntaje calculado sobre lo que sí casó.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { permissionKey } from "../rbac/types";
import { resolvedPermissionKeys } from "../rbac/service";
import { SensoryAccessError, resolverPuntajeTotal } from "./service";

export interface RespuestaDeInforme {
  /** Tal como lo nombra el protocolo: «Flavor», «Aroma positivo». */
  attributeName: string;
  value: number;
  comment?: string | null;
}

export interface InformeExterno {
  /** La muestra real que se cató. */
  sampleId: string;
  protocolVersionId: string;
  /** Quién firmó el informe. Una `Person` sin cuenta es lo normal aquí. */
  evaluadorPersonId: string;
  /** Dónde vive el original: el PDF, el correo, la hoja escaneada. Obligatorio. */
  sourceReference: string;
  /** Cuándo se cató, si el informe lo dice. */
  evaluadoEl?: Date | null;
  respuestas: ReadonlyArray<RespuestaDeInforme>;
  /** Sólo se usa si el protocolo NO calcula el total. */
  overallScore?: number | null;
  comentario?: string | null;
}

export class InformeExternoError extends Error {}

/**
 * Registra el informe y devuelve la valoración creada.
 *
 * Autoriza con `sensory:manage_session` a nivel plataforma: quien mete el
 * resultado de un tercero está montando una cata, no puntuando en una.
 */
export async function registrarInformeExterno(userAccountId: string, informe: InformeExterno) {
  const claves = await resolvedPermissionKeys(userAccountId, { scopeType: "platform", scopeRefId: null });
  if (!claves.has(permissionKey("sensory", "manage_session"))) {
    throw new InformeExternoError("no_manage_access");
  }

  if (informe.sourceReference.trim().length === 0) {
    // El CHECK de la base lo impide igual; aquí sale con una frase legible en
    // vez de con una violación de restricción.
    throw new InformeExternoError("source_reference_required");
  }
  if (informe.respuestas.length === 0) {
    throw new InformeExternoError("responses_required");
  }

  const muestra = await prisma.sample.findUnique({ where: { id: informe.sampleId } });
  if (!muestra) throw new InformeExternoError("sample_not_found");

  const persona = await prisma.person.findUnique({ where: { id: informe.evaluadorPersonId } });
  if (!persona) throw new InformeExternoError("person_not_found");

  const version = await prisma.sensoryProtocolVersion.findUnique({
    where: { id: informe.protocolVersionId },
    include: { protocol: true, attributes: { orderBy: { displayOrder: "asc" } } },
  });
  if (!version) throw new InformeExternoError("protocol_version_not_found");
  if (version.protocol.status === "archived") throw new InformeExternoError("protocol_archived");
  if (version.attributes.length === 0) throw new InformeExternoError("protocol_has_no_attributes");

  // Nombre → id, con el nombre del protocolo como autoridad. Un atributo del
  // informe que el protocolo no tiene es un error, no algo que se ignora: si se
  // ignorara, un informe de otro estándar entraría a medias y su total saldría
  // calculado sobre los que casaron.
  const porNombre = new Map(version.attributes.map((a) => [a.name, a.id]));
  const attributeResponses: { attributeId: string; value: number; comment?: string | null }[] = [];
  const vistos = new Set<string>();
  for (const r of informe.respuestas) {
    const attributeId = porNombre.get(r.attributeName);
    if (attributeId === undefined) {
      throw new InformeExternoError(`unknown_attribute:${r.attributeName}`);
    }
    if (vistos.has(attributeId)) {
      throw new InformeExternoError(`duplicate_attribute:${r.attributeName}`);
    }
    vistos.add(attributeId);
    attributeResponses.push({ attributeId, value: r.value, comment: r.comment ?? null });
  }

  // Por el mismo camino que una valoración interna: una sola idea de «cómo se
  // obtiene el total», no dos.
  const total = resolverPuntajeTotal(version, { overallScore: informe.overallScore, attributeResponses });

  const etiqueta = `Informe externo · ${persona.displayName} · ${muestra.sampleCode}`;

  return prisma.$transaction(async (tx) => {
    const sesion = await tx.sensorySession.create({
      data: {
        name: etiqueta,
        protocolVersionId: version.id,
        status: "completed",
        // El informe ya ocurrió; la fecha es la del informe cuando se sabe.
        scheduledAt: informe.evaluadoEl ?? null,
        // `verify_conformance` sería afirmar contra qué especificación se
        // verificó, y el informe no lo dice. `characterize` es lo que un
        // análisis pagado hace: describir el café.
        purpose: "characterize",
        subject: "intermediate_product",
        classification: muestra.classification,
        createdBy: userAccountId,
      },
    });

    const vuelo = await tx.sensoryFlight.create({
      data: { sessionId: sesion.id, name: "Informe", sequenceOrder: 0 },
    });

    const ciega = await tx.sensoryBlindSample.create({
      data: { flightId: vuelo.id, blindCode: "A" },
    });

    // No hubo ciego: quien cató sabía qué café era. El mapeo se crea igual
    // porque es lo único que ata el puntaje a la muestra real.
    await tx.sensoryBlindMapping.create({
      data: { blindSampleId: ciega.id, sampleId: muestra.id },
    });

    const valoracion = await tx.assessment.create({
      data: {
        blindSampleId: ciega.id,
        evaluatorUserAccountId: null,
        externalEvaluatorPersonId: persona.id,
        sourceReference: informe.sourceReference.trim(),
        overallScore: total.overallScore,
        nonUniformCups: total.nonUniformCups,
        defectiveCups: total.defectiveCups,
        comment: informe.comentario ?? null,
        attributeResponses: { create: attributeResponses },
      },
      include: { attributeResponses: true },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "assessment.record_external",
        entityType: "assessment",
        entityId: valoracion.id,
        after: {
          sessionId: sesion.id,
          sampleId: muestra.id,
          externalEvaluatorPersonId: persona.id,
          sourceReference: valoracion.sourceReference,
          overallScore: valoracion.overallScore,
        },
        sourceInterface: "sensory.informeExterno",
      },
      tx,
    );

    return valoracion;
  });
}
