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
import { resolveLotVisibility, sampleWhereFromVisibility } from "../traceability/lots";
import type { ClassificationLevel } from "../../generated/prisma/client";

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

  const visibility = await resolveLotVisibility(userAccountId, "view");
  const where = sampleWhereFromVisibility(visibility);
  // `null` significa «no alcanza a ninguna», no «todas». Devolver [] es la
  // respuesta correcta; omitir el `where` las devolvería todas.
  if (where === null) return [];

  return prisma.sample.findMany({
    where,
    select: { id: true, sampleCode: true, sampleType: true, description: true },
    orderBy: { sampleCode: "asc" },
    take: 200,
  });
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
