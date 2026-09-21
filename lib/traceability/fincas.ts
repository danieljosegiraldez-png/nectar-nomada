/**
 * Las fincas: cuáles ve quien mira, cuál tiene elegida, y qué cuelga de ella.
 *
 * Spec: docs/superpowers/specs/2026-09-18-fincas-y-parcelas-design.md. Daniel, 2026-09-18:
 * «debería preguntarme qué finca —trabajo con varias— o mostrarme todas; elijo una y entro a
 * sus parcelas y microparcelas».
 *
 * **Una finca no es una tabla nueva.** Es una `Organization` de tipo `farm` o `estate` con su
 * `Location` de tipo `site` —el terreno—, y todo lo demás cuelga de ese sitio por
 * `parentLocationId`: la parcela es un `plot`, y la microparcela, un `plot` hijo de otro.
 *
 * **La elección es un filtro, nunca un permiso.** `listarFincas` parte de lo que
 * `getManageableContext` ya autorizó, y `resolverFinca` sólo acepta una finca de esa lista: una
 * cookie con el sitio de otra finca se ignora y se vuelve a preguntar.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { CLASSIFICATION_NOT_APPLICABLE } from "../rbac/resolve";
import { sortByName } from "../naturalOrder";
import { getManageableContext } from "./lots";
import { LocationAccessError, nombreLibreBajo, requireLocationAttributeAccess } from "./locations";

export const COOKIE_FINCA = "finca";
/** El valor de la cookie cuando se eligió «ver todas». Borrarla haría que cada página volviera a preguntar. */
export const TODAS = "todas";

const TIPOS_DE_FINCA = ["farm", "estate"] as const;
type TipoDeFinca = (typeof TIPOS_DE_FINCA)[number];
const esTipoDeFinca = (t: string): t is TipoDeFinca => (TIPOS_DE_FINCA as readonly string[]).includes(t);

export interface Finca {
  readonly siteId: string;
  readonly nombre: string;
  readonly organizationId: string;
  readonly tipo: TipoDeFinca;
}

/**
 * Las fincas de quien mira: cada `site` de una organización `farm`/`estate` que le es visible,
 * y además el sitio antepasado de cada parcela visible —quien sólo tiene ámbito sobre una
 * parcela también tiene que poder elegir su finca—.
 */
export async function listarFincas(userAccountId: string): Promise<Finca[]> {
  const { locations } = await getManageableContext(userAccountId);
  if (!locations.length) return [];

  // Una sola lectura del árbol para subir de una parcela a su sitio.
  const arbol = await prisma.location.findMany({
    select: { id: true, parentLocationId: true, locationType: true, name: true, organization: { select: { id: true, organizationType: true } } },
  });
  const porId = new Map(arbol.map((l) => [l.id, l]));
  const sitioDe = (id: string) => {
    const vistos = new Set<string>();
    let actual = porId.get(id);
    while (actual && !vistos.has(actual.id)) {
      if (actual.locationType === "site") return actual;
      vistos.add(actual.id);
      actual = actual.parentLocationId ? porId.get(actual.parentLocationId) : undefined;
    }
    return undefined;
  };

  const fincas = new Map<string, Finca>();
  for (const l of locations) {
    if (l.locationType !== "site" && l.locationType !== "plot") continue;
    const sitio = sitioDe(l.id);
    if (!sitio?.organization || !esTipoDeFinca(sitio.organization.organizationType)) continue;
    fincas.set(sitio.id, { siteId: sitio.id, nombre: sitio.name, organizationId: sitio.organization.id, tipo: sitio.organization.organizationType });
  }
  return sortByName([...fincas.values()], (f) => f.nombre);
}

/**
 * Qué finca queda elegida, a partir de lo que dice la cookie. Una sola finca se elige sola; con
 * varias y sin una elección válida, `debeElegir`.
 */
export function resolverFinca(
  fincas: readonly Finca[],
  cookie: string | undefined,
): { elegida: Finca | null; todas: boolean; debeElegir: boolean } {
  if (fincas.length === 1) return { elegida: fincas[0]!, todas: false, debeElegir: false };
  if (cookie === TODAS) return { elegida: null, todas: true, debeElegir: false };
  const elegida = fincas.find((f) => f.siteId === cookie) ?? null;
  if (elegida) return { elegida, todas: false, debeElegir: false };
  return { elegida: null, todas: false, debeElegir: fincas.length > 1 };
}

/** Lo que necesita una página: las fincas de quien mira y cuál queda elegida según su cookie. */
export async function fincaDeLaPagina(userAccountId: string, cookie: string | undefined) {
  const fincas = await listarFincas(userAccountId);
  return { fincas, ...resolverFinca(fincas, cookie) };
}

/** El sitio de la finca y todo lo que cuelga de él, a cualquier profundidad. */
export function idsBajoLaFinca(ubicaciones: readonly { id: string; parentLocationId: string | null }[], siteId: string): Set<string> {
  const hijos = new Map<string, string[]>();
  for (const u of ubicaciones) {
    if (!u.parentLocationId) continue;
    hijos.set(u.parentLocationId, [...(hijos.get(u.parentLocationId) ?? []), u.id]);
  }
  const dentro = new Set<string>([siteId]);
  const pendientes = [siteId];
  while (pendientes.length) {
    for (const h of hijos.get(pendientes.pop()!) ?? []) {
      if (dentro.has(h)) continue;
      dentro.add(h);
      pendientes.push(h);
    }
  }
  return dentro;
}

/**
 * No tiene sitio (`site`) por antepasado. Camino recorrido entero sin
 * encontrar uno — ruling del controlador, 2026-09-19: nunca se adivina la
 * finca con el padre inmediato, se declara el error.
 */
export class SitioNoEncontradoError extends Error {}

/**
 * La finca (Location `site`) de cualquier ubicación, subiendo por
 * `parentLocationId` hasta encontrarla — a CUALQUIER profundidad, nunca sólo
 * el padre inmediato.
 *
 * **El error medido que esto reemplaza.** `createTrap` (`traps.ts`) y la regla
 * de trampas de una parcela (`getPlotDetail` en `plantingCohorts.ts`, y el
 * `farmLocationId` que su pantalla pasaba al formulario) tomaban
 * `location.parentLocationId ?? location.id` como si el padre inmediato
 * fuera siempre la finca. Cierto para una parcela de primer nivel — su padre
 * ES el sitio —, falso para una microparcela (spec fincas y parcelas §3.3):
 * es un `plot` hijo de OTRO `plot` (`createMicrolot`), así que su padre
 * inmediato es la parcela, no la finca. Medido en la base compartida de
 * pruebas: una trampa dada de alta en una microparcela se numeraba «Trampa 1»
 * — reiniciando la numeración, que es correlativa POR FINCA — y su
 * `farmLocationId` quedaba apuntando a la parcela, así que `TrapRule.findUnique`
 * (que busca por `farmLocationId`) nunca encontraba la regla de la finca: sin
 * plazos ni avisos.
 *
 * Ninguna `plot` de este dominio cuelga fuera de un sitio —`crearParcela`
 * exige que el padre sea `site`, y `createMicrolot` copia el tipo del padre—,
 * así que llegar al final de la cadena sin encontrar uno es un error
 * explícito (`SitioNoEncontradoError`), nunca un valor por defecto que se lea
 * como la finca.
 *
 * Mismo camino que el `sitioDe` interno de `listarFincas`, que aquí arriba
 * camina un árbol ya cargado en bloque para muchas ubicaciones a la vez; éste
 * es el que sirve a un solo `locationId` sin cargar el árbol entero.
 */
export async function resolveFarmSiteId(locationId: string): Promise<string> {
  const vistos = new Set<string>();
  let actualId: string | null = locationId;
  while (actualId) {
    if (vistos.has(actualId)) throw new SitioNoEncontradoError("cycle_detected");
    vistos.add(actualId);
    const actual: { id: string; locationType: string; parentLocationId: string | null } | null =
      await prisma.location.findUnique({
        where: { id: actualId },
        select: { id: true, locationType: true, parentLocationId: true },
      });
    if (!actual) throw new SitioNoEncontradoError("location_not_found");
    if (actual.locationType === "site") return actual.id;
    actualId = actual.parentLocationId;
  }
  throw new SitioNoEncontradoError("no_site_ancestor");
}

export class FincaError extends Error {}

const PLATAFORMA = { scopeType: "platform", scopeRefId: null } as const;

export async function puedeCrearFincas(userAccountId: string) {
  return can(userAccountId, "create_farm", "organization", PLATAFORMA, CLASSIFICATION_NOT_APPLICABLE);
}

function exigeNombre(nombre: string) {
  const limpio = nombre.trim();
  if (!limpio || limpio.length > 120) throw new FincaError("nombre_invalido");
  return limpio;
}

export type CrearFincaInput =
  | { readonly nombre: string; readonly tipo: "farm" | "estate"; readonly descripcion?: string | null }
  | { readonly organizationId: string };

/**
 * Dar de alta una finca: la organización y su terreno (`site`), en una transacción con su
 * AuditEvent. Con `organizationId`, sólo el terreno de una organización de finca que no lo tiene
 * — el caso de Kiva Estate, que el seed creó sin sitio. **Sólo el administrador de plataforma**
 * (Daniel, 2026-09-18): crear una organización no es trabajo de una finca.
 */
export async function crearFinca(userAccountId: string, input: CrearFincaInput) {
  if (!(await puedeCrearFincas(userAccountId))) throw new FincaError("sin_permiso");

  let existente: { id: string; name: string } | null = null;
  if ("organizationId" in input) {
    const org = await prisma.organization.findUnique({ where: { id: input.organizationId } });
    if (!org || !esTipoDeFinca(org.organizationType)) throw new FincaError("organizacion_no_es_finca");
    if (await prisma.location.count({ where: { organizationId: org.id, locationType: "site" } })) throw new FincaError("ya_tiene_terreno");
    existente = { id: org.id, name: org.name };
  }
  const nombre = exigeNombre(existente ? existente.name : (input as { nombre: string }).nombre);

  return prisma.$transaction(async (tx) => {
    const organization = existente
      ? await tx.organization.findUniqueOrThrow({ where: { id: existente.id } })
      : await tx.organization.create({
          data: {
            organizationType: (input as { tipo: "farm" | "estate" }).tipo,
            name: nombre,
            description: (input as { descripcion?: string | null }).descripcion?.trim() || null,
            status: "approved",
            classification: "internal",
            createdBy: userAccountId,
          },
        });
    const site = await tx.location.create({
      data: { name: nombre, locationType: "site", organizationId: organization.id, status: "approved", classification: "internal", createdBy: userAccountId },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.create_farm",
        entityType: "location",
        entityId: site.id,
        after: { organization, site, organizacionNueva: !existente },
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return { organization, site };
  });
}

/** Las organizaciones de finca sin terreno. Sólo para quien puede crear fincas; para los demás, vacío. */
export async function organizacionesSinTerreno(userAccountId: string) {
  if (!(await puedeCrearFincas(userAccountId))) return [];
  const orgs = await prisma.organization.findMany({
    where: { organizationType: { in: [...TIPOS_DE_FINCA] }, locations: { none: { locationType: "site" } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return orgs;
}

/** ¿Puede crear parcelas en esta finca? La misma pregunta que hace `crearParcela`, sin escribir. */
export async function puedeCrearParcelaEn(userAccountId: string, siteId: string) {
  const sitio = await prisma.location.findUnique({ where: { id: siteId }, select: { id: true, classification: true } });
  if (!sitio) return false;
  const target = { scopeType: "location" as const, scopeRefId: sitio.id };
  return (
    (await can(userAccountId, "manage_attributes", "location", target, sitio.classification)) &&
    (await can(userAccountId, "create_site", "location", target, sitio.classification))
  );
}

/**
 * Una parcela nueva en una finca. Exige, sobre el SITIO de la finca, `manage_attributes` y
 * `create_site`: los mismos dos permisos que crear un beneficio, así que el Farm Manager de esa
 * finca puede, el Farm Operator no, y el Farm Manager de otra finca tampoco. Lo demás de la
 * parcela —sol, sombra, altitud, suelo…— se completa en su ficha de ajustes.
 */
export async function crearParcela(userAccountId: string, input: { siteId: string; nombre: string; areaHectareas?: number | null }) {
  await requireLocationAttributeAccess(userAccountId, input.siteId);
  const sitio = await prisma.location.findUniqueOrThrow({
    where: { id: input.siteId },
    select: { id: true, locationType: true, organizationId: true, classification: true, timezone: true },
  });
  if (!(await can(userAccountId, "create_site", "location", { scopeType: "location", scopeRefId: sitio.id }, sitio.classification))) {
    throw new LocationAccessError("no_location_create_access");
  }
  if (sitio.locationType !== "site") throw new FincaError("padre_no_es_una_finca");
  const nombre = exigeNombre(input.nombre);
  const area = input.areaHectareas ?? null;
  if (area !== null && !(Number.isFinite(area) && area > 0)) throw new FincaError("area_invalida");

  return prisma.$transaction(async (tx) => {
    if (!(await nombreLibreBajo(tx, sitio.id, nombre))) throw new FincaError("nombre_repetido");
    const parcela = await tx.location.create({
      data: {
        name: nombre,
        locationType: "plot",
        parentLocationId: sitio.id,
        organizationId: sitio.organizationId,
        classification: sitio.classification,
        timezone: sitio.timezone,
        areaHectares: area,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.create_plot",
        entityType: "location",
        entityId: parcela.id,
        after: parcela,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return parcela;
  });
}

/**
 * Las parcelas en el orden en que se eligen para cosechar: cada parcela, y justo debajo sus
 * microparcelas, con el nombre sangrado. Una microparcela es un `plot` cuyo padre es otro `plot`
 * de la misma lista; si su parcela no está en la lista, sale sola, al nivel de las demás.
 */
export function ordenarParcelas<T extends { id: string; name: string; parentLocationId: string | null }>(parcelas: readonly T[]): T[] {
  const ids = new Set(parcelas.map((p) => p.id));
  const esMicro = (p: T) => p.parentLocationId !== null && ids.has(p.parentLocationId);
  const salida: T[] = [];
  for (const p of sortByName(parcelas.filter((x) => !esMicro(x)), (x) => x.name)) {
    salida.push(p);
    for (const m of sortByName(parcelas.filter((x) => x.parentLocationId === p.id), (x) => x.name)) {
      salida.push({ ...m, name: `— ${m.name}` });
    }
  }
  return salida;
}
