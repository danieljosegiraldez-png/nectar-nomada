import { prisma } from "../db";
import { permissionKeysAnywhere } from "../rbac/service";

const PERMISOS_SENSORIALES = new Set(["sensory:submit_assessment", "sensory:manage_session", "competition:manage"]);

export class RuedaSensorialNoEncontrada extends Error {}

async function puedeVerBorradores(userAccountId?: string | null) {
  if (!userAccountId) return false;
  const permisos = await permissionKeysAnywhere(userAccountId);
  return [...PERMISOS_SENSORIALES].some((permiso) => permisos.has(permiso));
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
