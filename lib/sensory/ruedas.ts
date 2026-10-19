/**
 * **`permissionKeysAnywhere` aquí es deliberado, y no es la infracción de los otros dos sitios.**
 *
 * El 2026-09-29 se acotaron los usos que autorizaban ESCRITURAS contra un ámbito concreto. Éste se
 * intentó acotar también —a plataforma— y se revirtió: el spec
 * `docs/superpowers/specs/2026-09-21-herramientas-sensoriales-rueda-design.md` §3 define la
 * audiencia sin ámbito, «una rueda apagada sólo la ve quien tenga permiso de ver Sensorial», y
 * exigir plataforma habría dejado fuera a quien lo tiene en un proyecto o una sesión. Lo destapó la
 * revisión de Codex leyendo el spec, que el diff no incluía.
 *
 * La pregunta que se hace aquí es literalmente la que `permissionKeysAnywhere` responde —«¿hay algún
 * sitio donde esta persona podría usar esto?»—: una rueda no cuelga de ningún ámbito contra el que
 * juzgar. Si algún día la audiencia se quiere más estrecha, es una decisión de producto sobre el
 * spec, no un arreglo de mecanismo.
 */
import { prisma } from "../db";
import { SensoryWheelDomain } from "../../generated/prisma/client";
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
  // El dominio llega de la URL de `ruedas/[wheel]` y va al filtro de un enum: con un valor que no está
  // en `SensoryWheelDomain`, Prisma lanzaba un error de validación y la página daba 500
  // (PENDING_IMPLEMENTATIONS/026). Un dominio que no existe es una rueda que no existe.
  if (!(Object.values(SensoryWheelDomain) as string[]).includes(domain)) throw new RuedaSensorialNoEncontrada();
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
