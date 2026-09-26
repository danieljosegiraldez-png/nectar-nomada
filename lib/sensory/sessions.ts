/**
 * Crear una sesión de cata.
 *
 * **Por qué no existía (medido el 2026-09-06).** `sensorySession.create`
 * aparecía **sólo** en `prisma/seed.ts` y en pruebas, nunca en `lib/` ni en
 * `app/`. El módulo sensorial estaba entero por dentro —jueces, muestras ciegas,
 * calibración, cálculo de panel— y **sin puerta de entrada**: se podía juzgar una
 * sesión, pero nadie podía crear una. Ésa es la razón de las cero valoraciones en
 * producción, no la falta de protocolo. Es la misma forma que tenía el tueste
 * esa misma mañana: servicio completo, ninguna pantalla que lo llamara.
 *
 * **Una sesión no es una fila.** Es sesión → vuelo → muestras ciegas → mapeo
 * ciego. Las cuatro se crean en una sola transacción: una sesión sin muestras
 * ciegas es una sesión que un juez abre y no puede catar, y una muestra ciega
 * sin su mapeo es un puntaje que después no se puede atribuir a ningún café —
 * peor que no tenerlo.
 */
import { prisma } from "../db";
import { can, CLASSIFICATION_NOT_APPLICABLE } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { scopeTargetsFor } from "../traceability/lots";
import { codigoCiego } from "./muestraEnCata";
import type { ClassificationLevel, Prisma, SensoryPurpose, SensorySubject } from "../../generated/prisma/client";

export class SesionDeCataError extends Error {}

/** Mismo guardia que usa la calibración: `sensory:manage_session` a nivel plataforma. */
async function requireManageSession(userAccountId: string) {
  const allowed = await can(
    userAccountId,
    "manage_session",
    "sensory",
    { scopeType: "platform", scopeRefId: null },
    CLASSIFICATION_NOT_APPLICABLE,
  );
  if (!allowed) throw new SesionDeCataError("no_manage_access");
}

/**
 * Las muestras que esta cuenta puede poner en una cata.
 *
 * Se acotan con la MISMA visibilidad que los lotes —`sampleWhereFromVisibility`,
 * que ya existía— y no con una regla nueva: una muestra lleva proyecto,
 * ubicación y clasificación, exactamente lo que ese resolutor consume. Inventar
 * aquí una segunda forma de decidir qué se ve es cómo se abren los huecos.
 */
export async function listarMuestrasParaCata(userAccountId: string) {
  await requireManageSession(userAccountId);

  // Se acota por el eje de MUESTRAS, no por el de lotes. El primer intento usó
  // visibilidad de lotes y dejaba al anfitrión de cata sin ninguna muestra: no
  // tiene `lot:view` ni tiene por qué tenerlo. Elegir qué se cata es una
  // pregunta sobre muestras.
  //
  // Se acepta `view` O `manage` porque `can()` exige la clave exacta —`manage`
  // no implica `view`— y quien ya tenía `sample:manage` (Farm Operator, admin)
  // debe seguir pudiendo elegir sin tocarle el perfil.
  // **De qué café es cada muestra, no sólo su código.** Daniel, 2026-09-11,
  // probando la pantalla: «samples in session just give me one bulk option for
  // all, says 111 - green coffee» y «i think there is a mistake trying to select
  // which coffee». No era un fallo del selector —en la base hay UNA muestra— y
  // tampoco de los códigos ciegos: era que «111 · green_coffee» no dice de qué
  // café se trata. `Sample.sourceLotId` lo sabe desde que existe
  // `createSampleFromLot`; la lista sencillamente no lo leía.
  //
  // Se traen el código del batch, la finca y el grado del proceso, porque son
  // los tres que un catador usa para reconocer un café. El grado viene del
  // proceso ABIERTO más reciente de ese batch: un batch puede llevar varios
  // procesos en secuencia, y el que describe la muestra es el último, no el
  // primero.
  return (await muestrasVisibles(userAccountId, {}, 200)).muestras;
}

/** Cuántas devuelve como mucho una búsqueda: las que caben leyendo, no todas. */
export const LIMITE_BUSQUEDA_MUESTRAS = 50;

/**
 * Buscar muestras para una cata, por código de muestra, código de batch o nombre
 * de finca, sin distinguir mayúsculas.
 *
 * **Por qué existe (Daniel, 2026-09-18):** «un cupping se debe poder seleccionar o
 * hacer búsquedas y seleccionar varias muestras y a veces no vienen mismo lugar,
 * lote, finca, parcela». La lista de arriba corta en 200; con esto la pantalla
 * encuentra cualquier muestra, y combina búsquedas en el navegador.
 *
 * `hayMas` dice que la búsqueda tenía más resultados de los que se devuelven:
 * sin él, 50 resultados se leen como «son todas».
 */
export async function buscarMuestrasParaCata(userAccountId: string, texto: string) {
  await requireManageSession(userAccountId);
  const t = texto.trim();
  const where: Prisma.SampleWhereInput = t
    ? {
        OR: [
          { sampleCode: { contains: t, mode: "insensitive" } },
          { sourceLot: { lotCode: { contains: t, mode: "insensitive" } } },
          { sourceLot: { organization: { name: { contains: t, mode: "insensitive" } } } },
          { organization: { name: { contains: t, mode: "insensitive" } } },
        ],
      }
    : {};
  return muestrasVisibles(userAccountId, where, LIMITE_BUSQUEDA_MUESTRAS);
}

export type MuestraParaCata = Awaited<ReturnType<typeof listarMuestrasParaCata>>[number];

/**
 * Las primeras `limite` muestras visibles que cumplen `where`, por código.
 *
 * La visibilidad se decide muestra a muestra (`puedeVerMuestra`), así que se lee
 * por tandas hasta tener `limite + 1` visibles o acabar la tabla. Antes se leían
 * 500 filas y se filtraba: con más de 500 invisibles delante, una visible no
 * salía nunca.
 */
async function muestrasVisibles(userAccountId: string, where: Prisma.SampleWhereInput, limite: number) {
  const TANDA = 200;
  const visibles = [];
  for (let saltar = 0; visibles.length <= limite; saltar += TANDA) {
    const tanda = await prisma.sample.findMany({
      where: { ...where, retiredAt: null },
      select: {
        id: true,
        sampleCode: true,
        sampleType: true,
        description: true,
        projectId: true,
        locationId: true,
        classification: true,
        roastSessions: {
          where: { purpose: "sample" },
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            equipment: { select: { name: true } },
            recipeVersion: { select: { version: true, recipe: { select: { name: true } } } },
          },
          orderBy: { startedAt: "desc" },
        },
        sourceLot: {
          select: {
            lotCode: true,
            organization: { select: { name: true } },
            lotProcesses: {
              select: { processGradeValue: { select: { value: true } } },
              orderBy: { sequenceOrder: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ sampleCode: "asc" }, { id: "asc" }],
      skip: saltar,
      take: TANDA,
    });
    for (const m of tanda) {
      if (await puedeVerMuestra(userAccountId, m)) visibles.push(m);
      if (visibles.length > limite) break;
    }
    if (tanda.length < TANDA) break;
  }
  const hayMas = visibles.length > limite;
  return {
    hayMas,
    muestras: visibles.slice(0, limite).map(({ id, sampleCode, sampleType, description, sourceLot, roastSessions }) => ({
      id,
      sampleCode,
      sampleType,
      description,
      // Null, no cadena vacía: una muestra externa no tiene batch de origen
      // (`recordExternalCoffeeSample` deja `sourceLotId` sin poner a propósito), y
      // eso es un hecho distinto de «no lo sé».
      lotCode: sourceLot?.lotCode ?? null,
      organizationName: sourceLot?.organization?.name ?? null,
      processGrade: sourceLot?.lotProcesses[0]?.processGradeValue?.value ?? null,
      roastSessions,
    })),
  };
}

/** `view` o `manage`, sobre cualquiera de los ámbitos concretos de la muestra. */
async function puedeVerMuestra(
  userAccountId: string,
  muestra: { projectId: string | null; locationId: string | null; classification: ClassificationLevel },
): Promise<boolean> {
  for (const target of scopeTargetsFor(muestra)) {
    for (const accion of ["view", "manage"] as const) {
      if (await can(userAccountId, accion, "sample", target, muestra.classification)) return true;
    }
  }
  return false;
}

/**
 * Los protocolos que se pueden usar para una cata nueva: activos, con versión
 * activa y **con atributos**. Los tres filtros son la misma frase dicha tres
 * veces — «que el juez tenga algo que puntuar»— y ninguno sobra: en producción
 * hay cinco protocolos activos con cero atributos.
 */
export async function listarProtocolosParaCata(userAccountId: string) {
  await requireManageSession(userAccountId);

  const versiones = await prisma.sensoryProtocolVersion.findMany({
    where: { status: "active", protocol: { status: "active" } },
    include: { protocol: true, attributes: { select: { id: true } } },
    orderBy: [{ protocol: { name: "asc" } }, { version: "desc" }],
  });
  return versiones
    .filter((v) => v.attributes.length > 0)
    .map((v) => ({
      id: v.id,
      label: `${v.protocol.name} · v${v.version} · ${v.attributes.length} atributos`,
    }));
}

export interface CrearSesionInput {
  name: string;
  protocolVersionId: string;
  /** Los ids de las muestras, en el orden en que se van a servir. */
  muestras: string[];
  /** Tueste de muestra concreto servido por posición. La forma sigue aceptando
   *  clientes antiguos, pero el servicio rechaza ausencia/null en toda sesión
   *  nueva; los null que ya existen sólo se conservan para lectura. */
  roastSessions?: Array<string | null>;
  /** Para qué se cata. Ya estaba modelado y el primer formulario no lo pedía:
   *  sin él, una cata de competencia y una de control de calidad se guardan
   *  iguales y después no se pueden distinguir para reportar. */
  purpose?: SensoryPurpose | null;
  /** Qué se cata: materia prima en proceso, producto intermedio, bebida. */
  subject?: SensorySubject | null;
  classification?: ClassificationLevel;
  scheduledAt?: Date | null;
  preparationMethod?: string | null;
}

/**
 * ¿Ese tueste es una preparación de ESA muestra?
 *
 * Vive aquí y se exporta porque hay DOS escritores de sesiones de cata —ésta y el informe externo
 * (`lib/sensory/informeExterno.ts`)— y la revisión adversarial del 2026-09-25 encontró que el
 * segundo no preguntaba nada. Una copia de la regla es cómo los dos vuelven a divergir.
 */
export async function esTuesteDeLaMuestra(roastSessionId: string, sampleId: string): Promise<boolean> {
  const tueste = await prisma.roastSession.findUnique({
    where: { id: roastSessionId },
    select: { sourceSampleId: true, purpose: true },
  });
  return tueste != null && tueste.purpose === "sample" && tueste.sourceSampleId === sampleId;
}

/**
 * ¿Puede esta cuenta usar esta muestra en una valoración? La MISMA pregunta que hace
 * `crearSesionDeCata`: visible por su ámbito y clasificación, y **no retirada**. Se exporta porque
 * el informe externo sólo comprobaba que la muestra existiera (Codex, 2026-09-25), y una cuenta con
 * `sensory:manage_session` podía puntuar una muestra ajena si le pasaban su id.
 */
export async function exigirMuestraUsable(userAccountId: string, sampleId: string): Promise<void> {
  const muestra = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: { projectId: true, locationId: true, classification: true, retiredAt: true },
  });
  if (!muestra) throw new SesionDeCataError("sample_not_accessible");
  if (muestra.retiredAt !== null) throw new SesionDeCataError("sample_retired");
  if (!(await puedeVerMuestra(userAccountId, muestra))) throw new SesionDeCataError("sample_not_accessible");
}

/** ¿La muestra tiene alguna preparación tostada registrada? */
export async function tienePreparacionTostada(sampleId: string): Promise<boolean> {
  return (await prisma.roastSession.count({ where: { sourceSampleId: sampleId, purpose: "sample" } })) > 0;
}

export async function crearSesionDeCata(userAccountId: string, input: CrearSesionInput) {
  await requireManageSession(userAccountId);

  const nombre = input.name.trim();
  if (!nombre) throw new SesionDeCataError("name_required");
  if (input.muestras.length === 0) throw new SesionDeCataError("samples_required");

  const repetidas = input.muestras.length !== new Set(input.muestras).size;
  // La misma muestra sí puede aparecer dos veces cuando se sirven dos tuestes
  // distintos. Sin preparación sigue siendo un duplicado accidental.
  const preparaciones = input.roastSessions ?? input.muestras.map(() => null);
  if (preparaciones.length !== input.muestras.length) throw new SesionDeCataError("roast_preparations_mismatch");
  const claves = input.muestras.map((sampleId, i) => `${sampleId}:${preparaciones[i] ?? ""}`);
  if (claves.length !== new Set(claves).size || (repetidas && preparaciones.some((id) => !id))) {
    throw new SesionDeCataError("duplicate_samples");
  }

  const version = await prisma.sensoryProtocolVersion.findUnique({
    where: { id: input.protocolVersionId },
    include: { protocol: true, attributes: true },
  });
  if (!version) throw new SesionDeCataError("protocol_version_not_found");
  // Un protocolo retirado no se ofrece para catas nuevas. Los puntajes ya dados
  // bajo él siguen valiendo — por eso archivar no borra— pero empezar una cata
  // con uno retirado es empezarla mal.
  if (version.protocol.status === "archived") throw new SesionDeCataError("protocol_archived");
  // Un protocolo sin atributos acepta la sesión y deja al juez sin nada que
  // puntuar. Hay cinco así en producción, todos `TEST`.
  if (version.attributes.length === 0) throw new SesionDeCataError("protocol_has_no_attributes");

  // Las muestras deben ser de las que esta cuenta alcanza, y no se confía en lo
  // que llegue del formulario: las casillas de una pantalla no son un control de
  // acceso. **Se comprueba cada muestra por su id, no contra la lista que se
  // ofreció**: esa lista corta en 200, y hasta el 2026-09-18 una muestra propia
  // que quedaba fuera se rechazaba aquí como ajena.
  const pedidas = await prisma.sample.findMany({
    where: { id: { in: input.muestras } },
    select: { id: true, projectId: true, locationId: true, classification: true, retiredAt: true },
  });
  const retiradas = pedidas.filter((m) => m.retiredAt !== null);
  if (retiradas.length > 0) throw new SesionDeCataError("sample_retired");

  const alcanzables = new Set<string>();
  for (const m of pedidas) if (await puedeVerMuestra(userAccountId, m)) alcanzables.add(m.id);
  const ajenas = input.muestras.filter((id) => !alcanzables.has(id));
  if (ajenas.length > 0) throw new SesionDeCataError("sample_not_accessible");

  // Una muestra verde es materia prima para el tueste, no para la taza. Los
  // mapeos históricos sin tueste siguen siendo legibles, pero una sesión nueva
  // nunca puede romper el eslabón muestra verde → tueste → cata.
  if (preparaciones.some((id) => !id)) throw new SesionDeCataError("roast_preparation_required");

  for (const [i, roastSessionId] of preparaciones.entries()) {
    if (!roastSessionId) continue;
    if (!(await esTuesteDeLaMuestra(roastSessionId, input.muestras[i]!))) {
      throw new SesionDeCataError("roast_preparation_not_available");
    }
  }

  const creada = await prisma.$transaction(async (tx) => {
    const session = await tx.sensorySession.create({
      data: {
        name: nombre,
        protocolVersionId: input.protocolVersionId,
        status: "draft",
        purpose: input.purpose ?? null,
        subject: input.subject ?? null,
        classification: input.classification ?? "internal",
        scheduledAt: input.scheduledAt ?? null,
        preparationMethod: input.preparationMethod ?? null,
        createdBy: userAccountId,
      },
    });

    const flight = await tx.sensoryFlight.create({
      data: { sessionId: session.id, name: "Flight 1", sequenceOrder: 1 },
    });

    for (const [i, sampleId] of input.muestras.entries()) {
      const ciega = await tx.sensoryBlindSample.create({
        data: { flightId: flight.id, blindCode: codigoCiego(i) },
      });
      await tx.sensoryBlindMapping.create({
        data: { blindSampleId: ciega.id, sampleId, roastSessionId: preparaciones[i] },
      });
    }

    // El audit va DENTRO, con su `tx`. Fuera, un fallo al escribirlo dejaría la
    // sesión creada sin rastro de quién la creó — y el guardia
    // `tests/arquitectura/audit-atomico.test.ts` existe justo porque cuatro
    // pruebas que decían comprobar esto pasaban igual sin el `tx`.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "sensory_session.create",
        entityType: "sensory_session",
        entityId: session.id,
        after: { ...session, muestras: input.muestras.length },
        sourceInterface: "sensory.service",
      },
      tx,
    );

    return session;
  });

  return creada;
}

/**
 * Los participantes de una cata.
 *
 * **Cómo se ata un catador a una sesión, y por qué así.** Con una `Assignment`
 * de ámbito `session` — el mismo mecanismo que ya usa `getJudgeSessions` para
 * decidir qué sesiones ve alguien. No se inventa una tabla de participantes:
 * duplicaría la autorización en dos sitios, y el día que discreparan ganaría la
 * equivocada.
 *
 * **Por qué faltaba.** Hasta hoy sólo se podían crear esas asignaciones a mano
 * en la base, así que una cata la puntuaba quien alguien hubiera metido — o
 * nadie. Sin esto no hay cata de grupo, y sin cata de grupo no hay panel que
 * calcular ni nada que reportar.
 */
export async function listarParticipantes(userAccountId: string, sessionId: string) {
  await requireManageSession(userAccountId);

  const asignaciones = await prisma.assignment.findMany({
    where: { status: "active", scope: { scopeType: "session", scopeRefId: sessionId } },
    include: { userAccount: { include: { person: true } }, roleProfile: true },
    orderBy: { createdAt: "asc" },
  });
  return asignaciones.map((a) => ({
    assignmentId: a.id,
    userAccountId: a.userAccountId,
    displayName: a.userAccount.person.displayName,
    perfil: a.roleProfile.name,
  }));
}

/**
 * A quién se puede invitar: cuentas activas que aún no están en esta sesión.
 *
 * No se filtra por «sabe catar»: quién es competente para una mesa lo decide
 * quien la monta, no el sistema. Lo que sí se hace es no ofrecer a quien ya
 * está — invitar dos veces al mismo no es un error que deba llegar a la base.
 */
export async function listarInvitables(userAccountId: string, sessionId: string) {
  await requireManageSession(userAccountId);

  const yaEstan = new Set(
    (
      await prisma.assignment.findMany({
        where: { status: "active", scope: { scopeType: "session", scopeRefId: sessionId } },
        select: { userAccountId: true },
      })
    ).map((a) => a.userAccountId),
  );

  const cuentas = await prisma.userAccount.findMany({
    where: { status: { in: ["active", "invited"] } },
    include: { person: true },
    orderBy: { person: { displayName: "asc" } },
    take: 200,
  });
  return cuentas
    .filter((c) => !yaEstan.has(c.id))
    .map((c) => ({ id: c.id, displayName: c.person.displayName, estado: c.status }));
}

/**
 * Invitar a alguien a puntuar en esta cata.
 *
 * Recibe el perfil `Sensory Judge`, acotado a ESTA sesión: puede puntuar aquí y
 * en ningún otro sitio, y no alcanza el mapeo ciego —eso es del anfitrión—.
 */
export async function invitarParticipante(
  userAccountId: string,
  input: { sessionId: string; invitadoUserAccountId: string },
) {
  await requireManageSession(userAccountId);

  const sesion = await prisma.sensorySession.findUnique({ where: { id: input.sessionId } });
  if (!sesion) throw new SesionDeCataError("session_not_found");

  const invitado = await prisma.userAccount.findUnique({ where: { id: input.invitadoUserAccountId } });
  if (!invitado) throw new SesionDeCataError("account_not_found");

  const perfil = await prisma.roleProfile.findUnique({ where: { name: "Sensory Judge" } });
  if (!perfil) throw new SesionDeCataError("judge_profile_missing");

  // El ámbito es único por (tipo, referencia): se comparte entre todos los
  // participantes de la sesión, y lo que los distingue es su asignación.
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "session", scopeRefId: input.sessionId } })) ??
    (await prisma.scope.create({ data: { scopeType: "session", scopeRefId: input.sessionId } }));

  const yaEsta = await prisma.assignment.findFirst({
    where: { userAccountId: input.invitadoUserAccountId, scopeId: scope.id, status: "active" },
  });
  if (yaEsta) return yaEsta;

  return prisma.$transaction(async (tx) => {
    const asignacion = await tx.assignment.create({
      data: { userAccountId: input.invitadoUserAccountId, roleProfileId: perfil.id, scopeId: scope.id },
    });
    // Dentro de la transacción: una asignación sin su audit es alguien que
    // puede puntuar y de quien no consta quién lo dejó entrar.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "sensory_session.invite",
        entityType: "assignment",
        entityId: asignacion.id,
        after: { sessionId: input.sessionId, invitado: input.invitadoUserAccountId, perfil: perfil.name },
        sourceInterface: "sensory.service",
      },
      tx,
    );
    return asignacion;
  });
}
