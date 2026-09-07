import { prisma } from "../db";
import { LocationAccessError } from "./locations";
import { requireLocationAttributeAccess } from "./locations";
import { requireColonyEventWriteAccess, ApiaryAccessError } from "../apiary/hives";

/**
 * A9.0 — quién puede abrir una jornada de campo, según DÓNDE la abre.
 *
 * **El problema, medido** (`48_A9_CAPTURA_DE_CAMPO_REPORTE.md` §1.3). Una
 * `FieldSession` se abre hoy con `requireLocationAttributeAccess`, que exige
 * `location:manage_attributes` y prueba **sólo** el ámbito `location`. El
 * apiario autoriza distinto: `requireApiaryAccess` prueba `project` y después
 * `location`, y el perfil **Apiary Colony Event Recorder** —el residente
 * entrenado que motiva todo este alcance— tiene `apiary:view` y
 * `colony_event:manage` pero **ni `apiary:manage` ni
 * `location:manage_attributes`** (`lib/rbac/catalog.ts`). Con la compuerta de
 * café tal cual, esa persona **no puede abrir una visita a su propio apiario**.
 *
 * **Por qué no se arregla concediéndole el permiso.**
 * `location:manage_attributes` es la autoridad para reescribir los atributos de
 * terruño del sitio —sol, sombra, altitud, pendiente, suelo—. Dárselo para que
 * abra una visita **ensancha** un permiso, y `CLAUDE.md` §10 dice que una
 * asignación contextual normalmente estrecha. ADR-069 se cuidó explícitamente
 * de no hacerlo.
 *
 * **La forma de la compuerta, y por qué ésta.** Resuelve por
 * `Location.locationType`, que es un hecho de la fila, y **nunca** por un
 * parámetro que el llamador elija. Si el dominio lo eligiera quien llama, se
 * podría pedir la compuerta laxa desde el sitio equivocado, y entonces no sería
 * una compuerta sino una sugerencia.
 */
export async function requireFieldSessionAccess(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { locationType: true },
  });
  // Una ubicación que no existe se rechaza, no se trata como pública: dar el
  // nivel más permisivo a un id malo es cómo se rodea una compuerta.
  if (!location) throw new LocationAccessError("location_not_found");

  if (location.locationType !== "apiary_site") {
    await requireLocationAttributeAccess(userAccountId, locationId);
    return;
  }

  // Las asignaciones de A7 pueden tener ámbito de PROYECTO, no de ubicación, y
  // `FieldSession` no lleva proyecto. Los proyectos candidatos son los de las
  // colmenas que están en ese apiario: sin esto, quien tiene el permiso por
  // proyecto queda fuera aunque el apiario sí lo autorice.
  const proyectos = await prisma.hive.findMany({
    where: { locationId, projectId: { not: null } },
    select: { projectId: true },
    distinct: ["projectId"],
  });

  const candidatos = [
    { locationId },
    ...proyectos.map((h) => ({ projectId: h.projectId, locationId })),
  ];

  try {
    await requireColonyEventWriteAccess(userAccountId, candidatos);
  } catch (error) {
    // Se traduce a propósito. `app/actions/traceability.ts:92` distingue el
    // fallo de acceso de una jornada por `LocationAccessError`; dejar salir un
    // `ApiaryAccessError` convertiría un «no tienes acceso» en un error
    // genérico para el operario, que es peor mensaje y no es más cierto.
    if (error instanceof ApiaryAccessError) throw new LocationAccessError("no_field_session_access");
    throw error;
  }
}
