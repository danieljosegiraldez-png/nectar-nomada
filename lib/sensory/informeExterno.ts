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
import { esTuesteDeLaMuestra, tienePreparacionTostada } from "./sessions";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { permissionKey } from "../rbac/types";
import { resolvedPermissionKeys } from "../rbac/service";
import { SensoryAccessError, resolverPuntajeTotal } from "./service";
import { leerCertificaciones } from "../people/certificacionSensorial";
import { FORMULA_CVA_AFECTIVO } from "./puntajeCva";

export interface RespuestaDeInforme {
  /** Tal como lo nombra el protocolo: «Flavor», «Aroma positivo». */
  attributeName: string;
  value: number;
  comment?: string | null;
}

export interface InformeExterno {
  /** La muestra real que se cató. */
  sampleId: string;
  /**
   * El tueste servido, cuando se sabe. Decisión de Daniel, 2026-09-25: en un informe externo se
   * **exige sólo si la muestra tiene tuestes registrados**; si no tiene ninguno —lo tostó el
   * laboratorio de fuera y nadie lo anotó aquí— el informe se acepta y queda marcado «tueste no
   * registrado», que se lee y se compara con su aviso. Fingir un tueste sería inventar un hecho.
   */
  roastSessionId?: string | null;
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
  /**
   * Tazas no uniformes y defectuosas, tal como las marca el informe.
   *
   * **Faltaban, y no era inocuo (medido el 2026-09-08).** El formulario CVA de
   * la SCA las cuenta y cada una resta —2 la no uniforme, 4 la defectuosa—, así
   * que un informe que declara dos tazas no uniformes se guardaba **4 puntos
   * por encima** de lo que dice el papel, en silencio, porque el resolver las
   * daba por 0. La cata interna sí las pasaba desde siempre; era este camino,
   * justo el del trabajo que se paga, el que las perdía.
   */
  tazasNoUniformes?: number | null;
  tazasDefectuosas?: number | null;
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

  // La MISMA regla que `crearSesionDeCata`, no una copia: `esTuesteDeLaMuestra` vive en sessions.ts.
  if (informe.roastSessionId) {
    if (!(await esTuesteDeLaMuestra(informe.roastSessionId, muestra.id))) {
      throw new InformeExternoError("roast_preparation_not_available");
    }
  } else if (await tienePreparacionTostada(muestra.id)) {
    throw new InformeExternoError("roast_preparation_required");
  }

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
  const total = resolverPuntajeTotal(version, {
    overallScore: informe.overallScore,
    nonUniformCups: informe.tazasNoUniformes,
    defectiveCups: informe.tazasDefectuosas,
    attributeResponses,
  });

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
      data: { blindSampleId: ciega.id, sampleId: muestra.id, roastSessionId: informe.roastSessionId ?? null },
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

/**
 * Lo que la pantalla necesita para ofrecer listas en vez de campos en blanco.
 *
 * **Por qué en dos pasos.** Los atributos que hay que puntuar dependen del
 * protocolo, y sus NOMBRES son la autoridad —el servicio casa por nombre—. Así
 * que primero se elige protocolo y el servidor devuelve sus atributos; no se
 * teclea ninguno. Un nombre tecleado sería la forma exacta de que un informe
 * entrara a medias.
 *
 * **`calculaTotal` decide si se pregunta el total.** Bajo un protocolo con
 * fórmula el total es una consecuencia, no una opinión: pedirlo invitaría a
 * teclear uno distinto del que sale de los ocho atributos, que es justo lo que
 * `puntajeAfectivoCva` vino a arreglar.
 */
export async function opcionesParaInforme(userAccountId: string, protocolVersionId?: string | null) {
  const claves = await resolvedPermissionKeys(userAccountId, { scopeType: "platform", scopeRefId: null });
  if (!claves.has(permissionKey("sensory", "manage_session"))) {
    throw new InformeExternoError("no_manage_access");
  }

  const [versiones, personas] = await Promise.all([
    prisma.sensoryProtocolVersion.findMany({
      where: { status: "active", protocol: { status: "active" } },
      include: {
        protocol: true,
        attributes: { orderBy: { displayOrder: "asc" } },
      },
      orderBy: [{ protocol: { name: "asc" } }, { version: "desc" }],
    }),
    // Quien firma un informe pagado es una `Person`, normalmente sin cuenta.
    prisma.person.findMany({
      where: { status: "active" },
      select: { id: true, displayName: true, sensoryCertifications: true },
      orderBy: { displayName: "asc" },
    }),
  ]);

  const conAtributos = versiones.filter((v) => v.attributes.length > 0);
  const elegida = protocolVersionId ? conAtributos.find((v) => v.id === protocolVersionId) : undefined;

  return {
    protocolos: conAtributos.map((v) => ({
      id: v.id,
      label: `${v.protocol.name} · v${v.version} · ${v.attributes.length} atributos`,
    })),
    // La certificación va en la etiqueta porque es lo que distingue a un
    // Q-grader del resto de la agenda, y es lo que el informe invoca.
    evaluadores: personas.map((p) => ({
      id: p.id,
      label: [p.displayName, resumenDeCertificaciones(p.sensoryCertifications)].filter(Boolean).join(" · "),
    })),
    /** Sólo cuando ya se eligió protocolo. `null` es «aún no hay segundo paso». */
    atributos:
      elegida?.attributes.map((a) => ({
        id: a.id,
        name: a.name,
        min: a.scaleMin.toNumber(),
        max: a.scaleMax.toNumber(),
        section: a.section,
      })) ?? null,
    /** Con fórmula el total se calcula; sin ella, el informe lo trae escrito. */
    calculaTotal: elegida ? elegida.scoreFormula !== null : null,
    /**
     * Sólo el CVA cuenta tazas. Bajo `attribute_sum_v1` el resolver las ignora,
     * así que pintar los campos dejaría rellenar algo que se descarta en
     * silencio — un formulario que ofrece lo que el servicio no usa.
     */
    usaTazas: elegida ? elegida.scoreFormula === FORMULA_CVA_AFECTIVO : null,
    protocoloElegido: elegida ? { id: elegida.id, label: `${elegida.protocol.name} · v${elegida.version}` } : null,
  };
}

/**
 * «Q Arabica Grader (CQI)» a partir de lo que §7.3 guarda en
 * `sensoryCertifications`.
 *
 * **Una fila ilegible degrada a esa persona, no a la lista.** `leerCertificaciones`
 * es estricto a propósito —valida lo que ya estaba guardado— y en la base hay
 * filas que no pasan: medido el 2026-09-08, una persona con `date_earned: null`.
 * Sin este `catch`, esa sola fila dejaba la pantalla entera sin poder abrirse y
 * nadie podía registrar ningún informe. Es lo mismo que ya hace
 * `scripts/add-evaluator.ts`, que se encontró el caso antes.
 *
 * Y se devuelve **vacío**, no «certificación ilegible»: la etiqueta afirma
 * credenciales, y afirmar una que no se puede leer es peor que no afirmar nada.
 * El que la nombra es el CLI, que es donde se va a arreglar.
 */
function resumenDeCertificaciones(valor: unknown): string {
  let cs;
  try {
    cs = leerCertificaciones(valor);
  } catch {
    return "";
  }
  if (cs.length === 0) return "";
  return cs.map((c) => `${c.certification_name} (${c.certifying_body})`).join(", ");
}
