import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { LocationAccessError, exigeEditarBeneficioSiLoEs, puedeEditarBeneficioEn, puedeGestionarAtributosDeUbicacion, requireLocationAttributeAccess } from "./locations";

export class BeneficioError extends Error {}

/**
 * Crear un lugar nuevo no es editar uno existente, así que exige los DOS
 * permisos sobre el sitio padre: `manage_attributes` —que ya gobierna el árbol
 * de ubicaciones— y `location:create_site`, que es el que el capataz no tiene.
 *
 * Se comprueba sobre el PADRE a propósito, pero cada línea rechaza algo
 * distinto — medido con flip-test el 2026-09-17, no supuesto: `create_site`,
 * resuelto contra el ámbito del `Assignment` del actor, es lo que rechaza al
 * capataz y al Farm Manager de OTRA finca; `requireLocationAttributeAccess`
 * es lo que rechaza un `parentLocationId` que no existe (en vez de dejar que
 * `findUniqueOrThrow` lo convierta en un error de Prisma sin traducir) y lo
 * que aplica la compuerta de clasificación del padre.
 */
async function exigePoderCrearBajo(userAccountId: string, parentLocationId: string) {
  await requireLocationAttributeAccess(userAccountId, parentLocationId);
  const padre = await prisma.location.findUniqueOrThrow({
    where: { id: parentLocationId },
    select: { id: true, name: true, locationType: true, organizationId: true, classification: true, timezone: true },
  });
  const target = { scopeType: "location" as const, scopeRefId: padre.id };
  if (!(await can(userAccountId, "create_site", "location", target, padre.classification))) {
    throw new LocationAccessError("no_location_create_access");
  }
  return padre;
}

const PLATAFORMA = { scopeType: "platform", scopeRefId: null } as const;

/**
 * ¿Puede esta cuenta crear un beneficio SIN finca para esta organización? (ADR-198, PR 2.)
 *
 * **No existe un ámbito de organización en el RBAC** —`ScopeType` es plataforma, programa,
 * proyecto, ubicación…— así que «quien administra la organización» no se puede preguntar tal cual.
 * Decisión de Daniel, 2026-10-08: se deriva de lo que ya existe. Puede quien tenga, sobre alguna
 * ubicación de esa organización, los MISMOS dos permisos que exige colgar un beneficio de una finca
 * (`manage_attributes` y `create_site`), o quien los tenga en ámbito de plataforma. Un Farm Manager
 * de una finca de Kiva crea el beneficio de Kiva; el de otra organización no; un capataz tampoco.
 */
export async function puedeCrearBeneficioEnOrganizacion(userAccountId: string, organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { classification: true } });
  if (!org) return false;
  if (await can(userAccountId, "manage_attributes", "location", PLATAFORMA, org.classification)
    && await can(userAccountId, "create_site", "location", PLATAFORMA, org.classification)) return true;
  const lugares = await prisma.location.findMany({ where: { organizationId }, select: { id: true, classification: true } });
  for (const l of lugares) {
    const target = { scopeType: "location" as const, scopeRefId: l.id };
    if (await can(userAccountId, "manage_attributes", "location", target, l.classification)
      && await can(userAccountId, "create_site", "location", target, l.classification)) return true;
  }
  return false;
}

/** Las organizaciones donde quien mira puede crear un beneficio sin finca. Lista vacía = ninguna. */
export async function organizacionesParaBeneficio(userAccountId: string) {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const permitidas: { id: string; name: string }[] = [];
  for (const o of orgs) if (await puedeCrearBeneficioEnOrganizacion(userAccountId, o.id)) permitidas.push(o);
  return permitidas;
}

// El límite de 120 caracteres y la no-vacuidad viven sólo aquí, en TypeScript:
// `Location.name` es una columna sin longitud máxima ni restricción de unicidad
// en la base de datos, así que dos beneficios bajo el mismo sitio pueden
// compartir nombre. No se añade una constraint — el nombre sólo se escribe
// aquí. La autorización para editar cualquier beneficio, en cambio, es la
// guardia compartida `exigeEditarBeneficioSiLoEs` en locations.ts.
function exigeNombre(name: string) {
  const limpio = name.trim();
  if (!limpio || limpio.length > 120) throw new BeneficioError("datos_invalidos");
  return limpio;
}

/**
 * Los sitios donde quien mira puede crear un beneficio. La negativa es un
 * fallo explícito, no una lista vacía.
 *
 * Un mundo sin ningún sitio y una cuenta sin permiso se veían idénticos desde
 * fuera: los dos daban `no_location_attribute_access` y la pantalla los
 * confundía en el mismo 404 sin razón. Se distinguen aquí, antes de mirar
 * permisos, para que la ausencia de datos no se lea como una negativa.
 */
export async function sitiosParaBeneficio(userAccountId: string) {
  const sitios = await prisma.location.findMany({ where: { locationType: "site" }, orderBy: { name: "asc" } });
  if (!sitios.length) throw new LocationAccessError("no_sites_exist");
  const permitidos: { id: string; name: string }[] = [];
  for (const s of sitios) {
    const target = { scopeType: "location" as const, scopeRefId: s.id };
    if (await can(userAccountId, "manage_attributes", "location", target, s.classification)
      && await can(userAccountId, "create_site", "location", target, s.classification)) {
      permitidos.push({ id: s.id, name: s.name });
    }
  }
  if (!permitidos.length) throw new LocationAccessError("no_location_attribute_access");
  return permitidos;
}

export async function listarBeneficios(userAccountId: string) {
  const rows = await prisma.location.findMany({
    where: { locationType: "beneficio" }, orderBy: { name: "asc" },
    include: { organization: { select: { name: true } } },
  });
  const salida: {
    id: string; name: string; sitio: { id: string; name: string } | null; puedeEditar: boolean;
    /** Nace sin finca: lo ancla su organización. Distinto de `sitio: null` por falta de permiso sobre el padre. */
    sinFinca: boolean; organizacion: string | null;
  }[] = [];
  for (const row of rows) {
    const target = { scopeType: "location" as const, scopeRefId: row.id };
    if (!(await can(userAccountId, "manage_attributes", "location", target, row.classification))) continue;
    // El permiso sobre el hijo no concede el nombre del padre — misma regla y el
    // mismo ayudante que `detalleInstalacion`, que resuelve la clasificación DEL
    // PADRE en vez de reusar la del hijo (reusarla juzgaría con la etiqueta
    // equivocada en cuanto las dos difieran).
    const padre = row.parentLocationId
      && await puedeGestionarAtributosDeUbicacion(userAccountId, row.parentLocationId)
      ? await prisma.location.findUnique({ where: { id: row.parentLocationId }, select: { id: true, name: true } })
      : null;
    // `edit_beneficio`, no `manage_attributes` de arriba: la pantalla de
    // ajustes sólo ofrece renombrar y conceder donde este permiso alcanza —
    // de serie para Farm Manager, por concesión para un capataz.
    salida.push({
      id: row.id, name: row.name, sitio: padre, puedeEditar: await puedeEditarBeneficioEn(userAccountId, row.id),
      sinFinca: row.parentLocationId === null, organizacion: row.organization?.name ?? null,
    });
  }
  return salida;
}

/**
 * Con `parentLocationId` el beneficio cuelga de ese sitio y toma SU organización. Sin él (ADR-198, PR 2)
 * nace sin finca y hay que decir la organización: `organizationId` manda en ese caso y se ignora si
 * hay padre, porque el padre ya decide. Quien lo crea sin padre necesita permiso sobre la organización
 * (`puedeCrearBeneficioEnOrganizacion`).
 *
 * **Un beneficio sin padre no tiene ancestros por los que subir**, así que quien lo crea no lo verá
 * después sin una asignación sobre él mismo. Es el alcance del PR 3; la pantalla lo avisa.
 */
export async function crearBeneficio(userAccountId: string, input: { name: string; parentLocationId?: string | null; organizationId?: string | null }) {
  const sinPadre = !input.parentLocationId;
  const padre = sinPadre ? null : await exigePoderCrearBajo(userAccountId, input.parentLocationId!);
  if (padre && padre.locationType !== "site") throw new BeneficioError("padre_invalido");
  const name = exigeNombre(input.name);
  // **El beneficio lleva SU organización, y sin ella no nace** (ADR-198, PR 1). Antes se copiaba
  // `padre.organizationId` sin mirar si era nulo, y un sitio sin organización daba un beneficio sin
  // dueño: lo dejan fuera los filtros `organizationId: { not: null }` de equipos, catálogos,
  // inventario y bandejas, sin ningún error. Se toma la del sitio y, si no tiene, se rechaza.
  let organizationId: string | null | undefined;
  if (padre) {
    organizationId = padre.organizationId;
  } else {
    organizationId = input.organizationId;
    if (!organizationId) throw new BeneficioError("organizacion_requerida");
    const existe = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!existe) throw new BeneficioError("organizacion_invalida");
    // Después de comprobar que existe: la negativa de permiso no debe confirmar ni negar ids al azar.
    if (!(await puedeCrearBeneficioEnOrganizacion(userAccountId, organizationId))) {
      throw new LocationAccessError("no_location_create_access");
    }
  }
  if (!organizationId) throw new BeneficioError("organizacion_requerida");
  return prisma.$transaction(async (tx) => {
    const after = await tx.location.create({ data: {
      name, locationType: "beneficio", parentLocationId: padre?.id ?? null,
      organizationId, classification: padre?.classification ?? "internal",
      timezone: padre?.timezone ?? null, createdBy: userAccountId,
    } });
    await recordAuditEvent({
      actorUserAccountId: userAccountId, operation: "location.create_beneficio",
      entityType: "location", entityId: after.id, after, sourceInterface: "traceability.service",
    }, tx);
    return after;
  });
}

export async function actualizarBeneficio(userAccountId: string, input: { locationId: string; name: string }) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);
  const before = await prisma.location.findUniqueOrThrow({ where: { id: input.locationId } });
  if (before.locationType !== "beneficio") throw new BeneficioError("tipo_invalido");
  // `manage_attributes` sola no basta: Farm Operator la tiene, y `can()` sube
  // por los ancestros. Editar un beneficio exige `edit_beneficio` (spec #370
  // §4.3): de serie para Farm Manager, a un capataz sólo por concesión. Hasta
  // el 2026-09-18 exigía `create_site`, que no se puede conceder a un capataz
  // sin darle también crear beneficios. Se comprueba sobre el beneficio mismo:
  // su padre puede ser null (`parent_location_id` es ON DELETE SET NULL).
  await exigeEditarBeneficioSiLoEs(userAccountId, before.id);
  const name = exigeNombre(input.name);
  return prisma.$transaction(async (tx) => {
    const after = await tx.location.update({ where: { id: before.id }, data: { name } });
    await recordAuditEvent({
      actorUserAccountId: userAccountId, operation: "location.update_beneficio",
      entityType: "location", entityId: after.id, before, after, sourceInterface: "traceability.service",
    }, tx);
    return after;
  });
}
