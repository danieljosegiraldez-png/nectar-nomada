/**
 * Las ruedas sensoriales son un catálogo **de plataforma**: no cuelgan de un proyecto ni de un sitio,
 * se identifican por `domain`. Por eso el derecho a ver sus BORRADORES se juzga en ámbito de
 * plataforma y no «en cualquier ámbito» (cambio del 2026-09-29).
 *
 * Antes usaba `permissionKeysAnywhere`, cuyo propio comentario dice **«Display only, and never an
 * authorization decision»**: bastaba con tener un permiso sensorial en CUALQUIER proyecto o sesión
 * para ver los borradores del catálogo entero. Decidir qué filas se ven es una decisión de
 * autorización, por muy poco sensible que sea el contenido.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { CLASSIFICATION_NOT_APPLICABLE } from "../rbac/resolve";

const PERMISOS_SENSORIALES = [
  ["submit_assessment", "sensory"],
  ["manage_session", "sensory"],
  ["manage", "competition"],
] as const;

const PLATAFORMA = { scopeType: "platform", scopeRefId: null } as const;

export class RuedaSensorialNoEncontrada extends Error {}

async function puedeVerBorradores(userAccountId?: string | null) {
  if (!userAccountId) return false;
  for (const [action, resourceType] of PERMISOS_SENSORIALES) {
    if (await can(userAccountId, action, resourceType, PLATAFORMA, CLASSIFICATION_NOT_APPLICABLE)) return true;
  }
  return false;
}
const versionConContenido = {
  include: {
    nodes: {
      orderBy: [{ displayOrder: "asc" as const }, { termOriginal: "asc" as const }],
      include: {
        detail: true,
        references: { orderBy: [{ displayOrder: "asc" as const }, { reference: "asc" as const }] },
      },
    },
  },
};

export async function listarRuedasSensoriales(userAccountId?: string | null) {
  const internas = await puedeVerBorradores(userAccountId);
  const ruedas = await prisma.sensoryWheel.findMany({
    where: internas ? undefined : { isPublic: true, versions: { some: { status: "published" } } },
    orderBy: { title: "asc" },
    include: {
      versions: {
        where: internas ? undefined : { status: "published" },
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true, status: true, sourceAuthor: true, sourceReference: true, license: true },
      },
    },
  });
  return ruedas.map((rueda) => ({ ...rueda, version: rueda.versions[0] ?? null, versions: undefined }));
}

export async function obtenerRuedaSensorial(domain: string, userAccountId?: string | null) {
  const internas = await puedeVerBorradores(userAccountId);
  const rueda = await prisma.sensoryWheel.findFirst({
    where: { domain: domain as never, ...(internas ? {} : { isPublic: true }) },
    include: {
      versions: {
        where: internas ? undefined : { status: "published" },
        orderBy: { version: "desc" },
        take: 1,
        ...versionConContenido,
      },
    },
  });
  const version = rueda?.versions[0];
  if (!rueda || !version || (!internas && version.status !== "published")) throw new RuedaSensorialNoEncontrada();
  return { ...rueda, version, versions: undefined };
}
