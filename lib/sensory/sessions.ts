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
import type { ClassificationLevel, SensoryPurpose, SensorySubject } from "../../generated/prisma/client";

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
  const candidatas = await prisma.sample.findMany({
    select: {
      id: true,
      sampleCode: true,
      sampleType: true,
      description: true,
      projectId: true,
      locationId: true,
      classification: true,
    },
    orderBy: { sampleCode: "asc" },
    take: 500,
  });

  const visibles = [];
  for (const m of candidatas) {
    if (await puedeVerMuestra(userAccountId, m)) visibles.push(m);
    if (visibles.length >= 200) break;
  }
  return visibles.map(({ id, sampleCode, sampleType, description }) => ({
    id,
    sampleCode,
    sampleType,
    description,
  }));
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
 * Códigos ciegos: A, B, C… en el orden dado, y **no barajados**.
 *
 * Deliberado y con su límite dicho: el juez sólo ve el código, así que el orden
 * no le filtra nada. Quien SÍ podría deducir el mapeo es quien vea la lista de
 * muestras con la que se creó la sesión — y ése es el head judge, que puede ver
 * el mapeo de todos modos (`blind_mapping:view`). Barajar sería mejor práctica y
 * es una línea, pero cambia lo que significa el código para quien prepara la
 * mesa; no se decide desde aquí.
 */
function codigoCiego(indice: number): string {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (indice < letras.length) return letras[indice]!;
  return `${letras[Math.floor(indice / letras.length) - 1]}${letras[indice % letras.length]}`;
}

export async function crearSesionDeCata(userAccountId: string, input: CrearSesionInput) {
  await requireManageSession(userAccountId);

  const nombre = input.name.trim();
  if (!nombre) throw new SesionDeCataError("name_required");
  if (input.muestras.length === 0) throw new SesionDeCataError("samples_required");

  const repetidas = input.muestras.length !== new Set(input.muestras).size;
  if (repetidas) throw new SesionDeCataError("duplicate_samples");

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

  // Las muestras deben ser de las que esta cuenta alcanza. Comprobarlo contra la
  // misma lista que se le ofreció, y no confiar en lo que llegue del formulario:
  // el `select` de una pantalla no es un control de acceso.
  const alcanzables = new Set((await listarMuestrasParaCata(userAccountId)).map((m) => m.id));
  const ajenas = input.muestras.filter((id) => !alcanzables.has(id));
  if (ajenas.length > 0) throw new SesionDeCataError("sample_not_accessible");

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
      await tx.sensoryBlindMapping.create({ data: { blindSampleId: ciega.id, sampleId } });
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
