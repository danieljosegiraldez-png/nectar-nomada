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
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { CLASSIFICATION_NOT_APPLICABLE } from "../rbac/resolve";
import { sortByName } from "../naturalOrder";
import { getManageableContext } from "./lots";
import { LocationAccessError, nombreLibreBajo, requireLocationAttributeAccess } from "./locations";
import { UUID } from "../validation/uuid";

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
  /** El logotipo de la finca (`Location.logoAssetId`), o `null` si no tiene. */
  readonly logoAssetId: string | null;
  /**
   * El beneficio al que va su cereza (ADR-194, diseño 2026-09-30).
   *
   * **`null` NO es un hueco:** una finca cuya cereza se compra y se traslada no lleva destino, y
   * entra por el camino del proveedor. La pantalla dice **qué falta**, no «0 pendientes».
   */
  readonly beneficioDestino: { readonly id: string; readonly name: string } | null;
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
    select: { id: true, parentLocationId: true, locationType: true, name: true, logoAssetId: true, organization: { select: { id: true, organizationType: true } }, beneficioDestino: { select: { id: true, name: true } } },
  });
  const porId = new Map(arbol.map((l) => [l.id, l]));
  // El sitio **de más arriba**, no el primero que aparece al subir. Daniel, 2026-09-21:
  // «Invernadero solar» le salía en /fincas como otra finca. El import de Cafelino lo creó como
  // `site` colgado del sitio de Cafelino —antes de que existiera `drying_facility`—, y parar en
  // el primer `site` lo tomaba por una finca aparte. Un sitio dentro de otro es parte de la de
  // arriba. (Los datos se corrigen aparte; esto hace que la lista no dependa de que lo estén.)
  const sitioDe = (id: string) => {
    const vistos = new Set<string>();
    let actual = porId.get(id);
    let sitio: (typeof arbol)[number] | undefined;
    while (actual && !vistos.has(actual.id)) {
      if (actual.locationType === "site") sitio = actual;
      vistos.add(actual.id);
      actual = actual.parentLocationId ? porId.get(actual.parentLocationId) : undefined;
    }
    return sitio;
  };

  const fincas = new Map<string, Finca>();
  for (const l of locations) {
    if (l.locationType !== "site" && l.locationType !== "plot") continue;
    const sitio = sitioDe(l.id);
    if (!sitio?.organization || !esTipoDeFinca(sitio.organization.organizationType)) continue;
    fincas.set(sitio.id, { siteId: sitio.id, nombre: sitio.name, organizationId: sitio.organization.id, tipo: sitio.organization.organizationType, logoAssetId: sitio.logoAssetId, beneficioDestino: sitio.beneficioDestino });
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

/**
 * GPS de una parcela nueva (spec fincas y parcelas, formulario completo): las dos coordenadas o
 * ninguna, y dentro del rango del sistema de referencia — mismos límites que
 * `confirmarCoordenadasDelSitio` en `coordenadasDelSitio.ts`. Un dedo de más manda una parcela al
 * océano y nadie lo nota hasta ver el mapa.
 *
 * **No sincroniza `Location.geoPoint`.** El comentario del esquema junto a `latitude`/`longitude`
 * dice que ese punto PostGIS «se mantiene sincronizado en la capa de aplicación», pero
 * `coordenadasDelSitio.ts` deja escrito que **cero líneas de aplicación lo referencian** — el
 * propio esquema se contradice. No existe la función/servicio que el encargo pedía reusar; esta
 * sigue el único precedente real (`confirmarCoordenadasDelSitio`), que a propósito no toca
 * `geoPoint` y explica por qué. Sincronizarlo aquí habría sido inventar el primer punto de sync
 * del sistema sin que nadie lo pidiera.
 */
function exigeCoordenadas(latitude: number | null, longitude: number | null): { latitude: number; longitude: number } | null {
  if (latitude === null && longitude === null) return null;
  if (latitude === null || longitude === null) throw new FincaError("gps_incompleto");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new FincaError("latitud_fuera_de_rango");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new FincaError("longitud_fuera_de_rango");
  return { latitude, longitude };
}

export type CrearFincaInput =
  | { readonly nombre: string; readonly tipo: "farm" | "estate"; readonly descripcion?: string | null }
  | { readonly organizationId: string; readonly nombre?: string };

/**
 * ¿Está libre este nombre entre las fincas de una organización? Mismo criterio que
 * `nombreLibreBajo` —sin distinguir mayúsculas ni espacios de los extremos—, pero por
 * **organización** y no por padre: dos fincas hermanas de Kiva Estate no comparten padre, y llamar
 * a aquella con un padre nulo habría comparado contra todas las raíces del árbol. Se llama DENTRO
 * de la transacción que va a crear la fila.
 */
async function nombreLibreEnLaOrganizacion(db: Prisma.TransactionClient, organizationId: string, nombre: string) {
  const hermanas = await db.location.findMany({ where: { organizationId, locationType: "site" }, select: { name: true } });
  const clave = nombre.trim().toLowerCase();
  return !hermanas.some((h) => h.name.trim().toLowerCase() === clave);
}

/**
 * Dar de alta una finca: la organización y su terreno (`site`), en una transacción con su
 * AuditEvent. **Sólo el administrador de plataforma** (Daniel, 2026-09-18): crear una organización
 * no es trabajo de una finca.
 *
 * **Con `organizationId`, añade una finca a una organización que ya existe** — la primera, si no
 * tenía ninguna, o una más. **ADR-189**, decisión de Daniel del 2026-09-29: Kiva Estate tiene dos
 * fincas. Antes esto rechazaba la segunda con `ya_tiene_terreno`; esa regla no era una invariante
 * del dominio sino la intención de una rama escrita para un solo caso —completar la organización
 * que el seed creó sin sitio—, y se midió que sólo `crearFinca` suponía una finca por organización.
 *
 * El `nombre` es opcional ahí y sin él hereda el de la organización, que es lo que hacía siempre:
 * la primera finca de una organización sigue comportándose igual. Con dos, heredarlo las llamaría
 * a las dos «Kiva Estate», así que la pantalla lo pide.
 */
export async function crearFinca(userAccountId: string, input: CrearFincaInput) {
  if (!(await puedeCrearFincas(userAccountId))) throw new FincaError("sin_permiso");

  let existente: { id: string; name: string } | null = null;
  if ("organizationId" in input) {
    const org = await prisma.organization.findUnique({ where: { id: input.organizationId } });
    if (!org || !esTipoDeFinca(org.organizationType)) throw new FincaError("organizacion_no_es_finca");
    existente = { id: org.id, name: org.name };
  }
  const propuesto = "organizationId" in input ? (input.nombre ?? existente!.name) : input.nombre;
  const nombre = exigeNombre(propuesto);

  return prisma.$transaction(async (tx) => {
    // Sólo sobre una organización que ya existía: la recién creada no tiene fincas con las que
    // chocar, y preguntarlo sería una consulta que siempre contesta que sí.
    if (existente && !(await nombreLibreEnLaOrganizacion(tx, existente.id, nombre))) {
      throw new FincaError("nombre_repetido");
    }
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

/**
 * Todas las organizaciones de finca, con cuántas fincas tiene ya cada una.
 *
 * **ADR-189.** `organizacionesSinTerreno` no sirve para elegir a cuál añadirle una finca: por
 * definición deja fuera a las que ya tienen una, que desde hoy son justo las que pueden recibir la
 * segunda. Se añade al lado en vez de ensanchar aquella, porque aquella sigue teniendo su propio
 * trabajo — decir en `/fincas` a quién le falta la primera.
 */
export async function organizacionesDeFinca(userAccountId: string) {
  if (!(await puedeCrearFincas(userAccountId))) return [];
  const orgs = await prisma.organization.findMany({
    where: { organizationType: { in: [...TIPOS_DE_FINCA] } },
    select: { id: true, name: true, _count: { select: { locations: { where: { locationType: "site" } } } } },
    orderBy: { name: "asc" },
  });
  return orgs.map((o) => ({ id: o.id, name: o.name, fincas: o._count.locations }));
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
/**
 * ¿Puede esta cuenta subdividir esta parcela?
 *
 * **Por qué existe (2026-09-25).** `/plots/[id]/ajustes` pintaba el botón «Nueva microparcela» sólo
 * por que el lugar fuera una parcela (`locationType === "plot"`), sin mirar permisos: un botón que
 * promete lo que el servidor puede negar. Y era el ÚNICO camino, escondido tras «Ajustes», así que
 * Daniel lo buscó desde /finca el 2026-09-25 y creyó que la función había desaparecido.
 *
 * Pregunta exactamente lo que `createMicrolot` exige —`location:manage_attributes` sobre el padre,
 * por `requireLocationAttributeAccess`— y no una regla parecida: cuando la pantalla y el servicio
 * usan dos reglas distintas, la pantalla miente.
 */
export async function puedeSubdividirParcela(userAccountId: string, plotId: string) {
  // `/plots/[id]` la llama con el id de la URL fuera de su `try`: un id sin forma de UUID daba
  // `P2007` y un 500 (PENDING_IMPLEMENTATIONS/026). Contesta lo que contesta a una que no existe.
  if (!UUID.test(plotId)) return false;
  const parcela = await prisma.location.findUnique({
    where: { id: plotId },
    select: { id: true, locationType: true, classification: true },
  });
  if (!parcela) return false;
  if (parcela.locationType !== "plot" && parcela.locationType !== "micro_plot") return false;
  return can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: parcela.id }, parcela.classification);
}

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
 *
 * **Formulario completo (2026-09-21).** `areaHectareas`/`areaMetrosCuadrados` son alternativos —
 * el formulario manda uno u otro según el selector ha/m², y el segundo se convierte a hectáreas
 * (÷ 10 000) antes de guardar; `areaHectares` en la base es siempre hectáreas, nunca m². GPS
 * (`latitude`/`longitude`) es opcional pero, si llega, las dos o ninguna — ver `exigeCoordenadas`.
 * `descripcion` es texto libre («dónde está en la finca»); vacío se guarda `null` (ADR-080), nunca
 * se inventa ni se deriva.
 */
export async function crearParcela(
  userAccountId: string,
  input: {
    siteId: string;
    nombre: string;
    areaHectareas?: number | null;
    areaMetrosCuadrados?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    descripcion?: string | null;
  },
) {
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

  const areaHa = input.areaHectareas ?? null;
  const areaM2 = input.areaMetrosCuadrados ?? null;
  if (areaHa !== null && areaM2 !== null) throw new FincaError("area_invalida");
  const area = areaM2 !== null ? areaM2 / 10_000 : areaHa;
  if (area !== null && !(Number.isFinite(area) && area > 0)) throw new FincaError("area_invalida");

  const coordenadas = exigeCoordenadas(input.latitude ?? null, input.longitude ?? null);
  const descripcion = input.descripcion?.trim() || null;

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
        latitude: coordenadas?.latitude ?? null,
        longitude: coordenadas?.longitude ?? null,
        description: descripcion,
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
