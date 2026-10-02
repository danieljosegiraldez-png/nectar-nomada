/**
 * F1 (docs/implementation/30_F1_OPERACION_FINCA_ESQUEMA.md §1-2). Stable
 * terroir attributes on `Location`, and microlot subdivision. Schema only —
 * this ticket has no UI by explicit product-owner decision
 * (`29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` §6).
 *
 * RBAC: `location:manage_attributes`, not `lot:manage` — editing a
 * Location's own record is a different authority than recording a fact
 * under an existing one (§4's labourEntry/materialConsumptionEntry
 * extension, in operations.ts, does reuse lot:manage — that's a different
 * kind of write, a new child row, not an edit to the parent).
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { CLASSIFICATION_NOT_APPLICABLE } from "../rbac/resolve";
import { recordAuditEvent } from "../audit";
import type { ScopeTarget } from "../rbac/types";
import type { Aspect, GridOrigin, LocationType, Prisma, ShadePercentageBracket, SubdivisionReason, SunExposure } from "../../generated/prisma/client";

export class LocationAccessError extends Error {}

/**
 * Los tipos que son configuración del beneficio a efectos de
 * `location:edit_beneficio`, decisión de Daniel del 2026-09-18: **todas** las
 * instalaciones de secado y sus camas cuentan, cuelguen de donde cuelguen —
 * no sólo el propio `beneficio`. La auditoría final de Codex sobre el plan 2
 * encontró que `exigeEditarBeneficioSiLoEs` sólo miraba `beneficio`, así que un
 * capataz con `manage_attributes` en el sitio editaba una `drying_facility` o
 * `drying_bed` por los caminos genéricos (`updatePlotAttributesAction`,
 * `confirmarCoordenadasDelSitio`), que no pasan por `exigeEditarBeneficioEn`.
 */
const TIPOS_DEL_BENEFICIO = new Set<LocationType>(["beneficio", "drying_facility", "drying_bed", "drying_rack", "storage_facility"]);

/**
 * La organización a la que pertenece una Location, subiendo por la jerarquía.
 *
 * Existe por un hallazgo de la revisión independiente del 2026-09-01:
 * `createBiocharBatch` aceptaba `organizationId` del llamador y sólo comprobaba
 * que existiera, así que un lote podía quedar **producido en la finca A y
 * propiedad de la organización B**. Eso contradice la regla del repositorio —
 * el dueño de una Location se mira en `core.location.organization_id`, y leer
 * otra cosa es exactamente lo que salió mal en el renombrado de Finca Rosina.
 *
 * Sube por `parentLocationId` porque una parcela puede no llevar organización
 * propia y heredarla de su finca; es la misma resolución que
 * `getManageableContext` hace para decidir visibilidad, aquí extraída para que
 * no viva sólo dentro de aquella función.
 *
 * Devuelve `null` cuando ni ella ni ningún ancestro la declaran. Quien llame
 * decide si eso es un error: para un lote de biochar lo es, porque un lote sin
 * dueño no se puede atribuir.
 */
export async function resolveOrganizationForLocation(locationId: string): Promise<string | null> {
  const vistos = new Set<string>();
  let actual: { id: string; organizationId: string | null; parentLocationId: string | null } | null =
    await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, organizationId: true, parentLocationId: true },
    });

  while (actual) {
    if (actual.organizationId) return actual.organizationId;
    // Un ciclo en la jerarquía colgaría el bucle. No debería haberlos, pero
    // «no debería» no es una garantía y el coste de comprobarlo es un Set.
    if (vistos.has(actual.id)) return null;
    vistos.add(actual.id);
    if (!actual.parentLocationId) return null;
    actual = await prisma.location.findUnique({
      where: { id: actual.parentLocationId },
      select: { id: true, organizationId: true, parentLocationId: true },
    });
  }
  return null;
}
export class LocationValidationError extends Error {}

/**
 * La rejilla de la parcela (diseño D3/D4). Clase propia y no `LocationValidationError`
 * porque sus códigos tienen frase propia: «media rejilla» y «algo queda fuera» se
 * corrigen de maneras distintas, y un `detail` con el código crudo no le dice al
 * operario cuál de las dos le pasó.
 *
 * `friendlyError` **tiene** que conocerla. No es opcional: una clase que una acción
 * no sabe traducir se relanza y el formulario recibe un 500 en vez de un mensaje
 * — el defecto del PR #433 —, y `tests/arquitectura/acciones-traducen-sus-errores.test.ts`
 * lo exige por su cuenta.
 */
export class RejillaInvalida extends Error {}

/**
 * El `RAISE EXCEPTION` de un disparador, tal como llega a traves de Prisma.
 *
 * **La forma esta medida, no deducida** (2026-10-01, sonda contra la base): un
 * `RAISE` de plpgsql llega como `PrismaClientKnownRequestError` con `code` de
 * Prisma `P2039`, y el unico sitio donde aparece el codigo de Postgres es
 * `meta.driverAdapterError.cause.originalCode`. La clase NO discrimina: el
 * control —un `update` de una fila que no existe— es la misma clase con `P2025`.
 *
 * Nadie mas en el repositorio traduce un `P0001`; medido el mismo dia: 0
 * archivos, con el control de que el mismo `grep` encuentra
 * `PrismaClientKnownRequestError` en 19. O sea que hasta hoy el `RAISE` de
 * cualquier disparador era una pantalla de error.
 */
function mensajeDeDisparador(error: unknown): string | null {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } })
    .meta;
  const causa = meta?.driverAdapterError?.cause;
  return causa?.originalCode === "P0001" ? (causa.originalMessage ?? null) : null;
}

/**
 * Las TRES formas del culpable que el disparador de D4 puede nombrar, cada una
 * con su codigo propio.
 *
 * **Y son tres y no una por una razon medida, no estetica.** La primera version
 * metia la frase del `RAISE` entera dentro de `{value}`, asi que la pantalla en
 * INGLES decia «The grid can't shrink: una planta en la hilera 9, planta 3 would
 * be left outside». Lo encontro una revision independiente, y es exactamente lo
 * que el RULING de la tarea 3 de las bandejas ya habia resuelto en
 * `app/actions/traceability.ts`: el `detail` es el mensaje TRADUCIDO, no el texto
 * crudo, porque el texto crudo se lee en espanol en la pantalla en ingles. En
 * espanol tampoco concordaba: «Muevelo o borralo» detras de «una planta».
 *
 * `[\s\S]` y no `.` porque `.` no casa saltos de linea, y el nombre de un
 * bloque puede llevarlos: sin eso la frase no casaria y volveria a salir el
 * error crudo, o sea un 500.
 *
 * Acoplan este archivo a la redaccion del `RAISE` de
 * `20261001224423_rejilla_y_rangos`, y por eso hay UNA PRUEBA POR FORMA que las
 * ejerce contra el disparador de verdad: si la redaccion cambia, caen en vez de
 * que el acople se pudra en silencio.
 */
const CULPABLES: ReadonlyArray<readonly [RegExp, (m: RegExpMatchArray) => string]> = [
  [/^No se puede encoger la rejilla: la microparcela ([\s\S]+) queda fuera$/, (m) => `rejilla_con_microparcela_fuera:${m[1]}`],
  [/^No se puede encoger la rejilla: el bloque ([\s\S]+) queda fuera$/, (m) => `rejilla_con_bloque_fuera:${m[1]}`],
  [/^No se puede encoger la rejilla: una planta en la hilera (\d+), planta (\d+) queda fuera$/, (m) => `rejilla_con_planta_fuera:${m[1]},${m[2]}`],
];

/**
 * `Location` carries no `projectId` of its own (a farm's plots aren't
 * scoped to a single Project the way a Lot is) — the only concrete scope
 * target a Location resolves against is itself, leaf-scope containment
 * (RBAC.md §3) doing the rest for a location-scoped Farm Operator
 * Assignment.
 */
/**
 * La versión que pregunta en vez de exigir, para que una pantalla pueda decidir
 * si ofrece el formulario. Misma comprobación que la escritura —no una copia—,
 * y sólo se traga la negativa.
 */
export async function puedeGestionarAtributosDeUbicacion(userAccountId: string, locationId: string): Promise<boolean> {
  try {
    await requireLocationAttributeAccess(userAccountId, locationId);
    return true;
  } catch (error) {
    if (error instanceof LocationAccessError) return false;
    throw error;
  }
}

export async function requireLocationAttributeAccess(userAccountId: string, locationId: string) {
  // Gate on the Location's own classification (ADR-068). A Location is one of
  // the records that declares its sensitivity — sixteen of them are `internal`
  // — so the AND-gate has a real subject here, unlike the platform-wide
  // capability checks elsewhere.
  //
  // A location that does not exist is refused rather than treated as public:
  // defaulting a missing record to the most permissive level is how a gate
  // gets bypassed by a bad id.
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { classification: true },
  });
  if (!location) throw new LocationAccessError("location_not_found");

  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (await can(userAccountId, "manage_attributes", "location", target, location.classification)) return;
  throw new LocationAccessError("no_location_attribute_access");
}

/**
 * «Editar beneficio» (spec #370 §4.3). No hace nada si la ubicación no es
 * configuración del beneficio (`TIPOS_DEL_BENEFICIO`): parcelas y sitios
 * siguen como estaban. Si lo es, exige `location:edit_beneficio` sobre la
 * propia ubicación.
 *
 * Existe porque la auditoría de Codex del 2026-09-18 encontró que el capataz
 * —que tiene `manage_attributes` por perfil y lo hereda del sitio— editaba
 * atributos y coordenadas de un beneficio por la acción de parcela, que no
 * miraba el tipo. Una segunda pasada de esa misma auditoría encontró que la
 * comprobación seguía dejando fuera `drying_facility`/`drying_bed`: el
 * capataz podía editarlas por los mismos caminos genéricos, porque
 * `crearUbicacionDeSecado`/`actualizarUbicacionDeSecado` sí llaman a
 * `exigeEditarBeneficioEn`, pero `updateLocationAttributes` y
 * `confirmarCoordenadasDelSitio` sólo llamaban a ésta. La regla de Daniel es
 * sobre escrituras, así que vive aquí, en el servicio, y cada camino la llama.
 */
export async function exigeEditarBeneficioSiLoEs(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { locationType: true, classification: true },
  });
  if (!location) throw new LocationAccessError("location_not_found");
  if (!TIPOS_DEL_BENEFICIO.has(location.locationType)) return;
  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (await can(userAccountId, "edit_beneficio", "location", target, location.classification)) return;
  throw new LocationAccessError("no_beneficio_edit_access");
}

/**
 * `location:edit_beneficio` sobre una ubicación, sea del tipo que sea. Para lo
 * que es configuración del beneficio aunque no cuelgue de él: las
 * instalaciones de secado y sus camas cuelgan del sitio (decisión de Daniel
 * del 2026-09-18: «todas», cuelguen de donde cuelguen). `can()` sube por los
 * ancestros, así que un Farm Manager asignado en la finca pasa sobre sus hijos.
 */
export async function exigeEditarBeneficioEn(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { classification: true } });
  if (!location) throw new LocationAccessError("location_not_found");
  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (await can(userAccountId, "edit_beneficio", "location", target, location.classification)) return;
  throw new LocationAccessError("no_beneficio_edit_access");
}

/**
 * La versión que pregunta en vez de exigir, para que una pantalla (ajustes,
 * recetas, instalaciones) decida si ofrece un formulario sin duplicar la
 * regla del servidor. Misma comprobación que la escritura, y sólo se traga la
 * negativa concreta de este permiso — cualquier otro error (una ubicación que
 * no existe) se relanza, porque eso no es «no puede editar», es un id malo.
 */
export async function puedeEditarBeneficioEn(userAccountId: string, locationId: string): Promise<boolean> {
  try {
    await exigeEditarBeneficioEn(userAccountId, locationId);
    return true;
  } catch (error) {
    if (error instanceof LocationAccessError && error.message === "no_beneficio_edit_access") return false;
    throw error;
  }
}

/**
 * Las Location de una organización: las propias y sus descendientes que la
 * HEREDAN (organizationId nulo). Un descendiente con otra organización corta el
 * camino. Extraída de `exigeEditarBeneficioEnOrganizacion`, que la sigue usando.
 *
 * `resolveOrganizationForLocation` trata la organización como heredable
 * subiendo por `parentLocationId`, así que esta bajada tiene que recorrer el
 * mismo camino al revés para no dejar fuera a quien esté asignado justo en uno
 * de esos hijos. Medido el 2026-09-18 en la base de pruebas compartida: 8 de
 * 135 `Location` (sitios y parcelas) tienen `organizationId` nulo bajo un
 * padre que sí lo declara.
 */
export async function lugaresDeOrganizacion(organizationId: string) {
  const propias = await prisma.location.findMany({ where: { organizationId }, select: { id: true, classification: true } });
  const lugares = [...propias];
  let frontera = propias.map((l) => l.id);
  while (frontera.length > 0) {
    const hijos = await prisma.location.findMany({
      where: { parentLocationId: { in: frontera }, organizationId: null },
      select: { id: true, classification: true },
    });
    if (hijos.length === 0) break;
    lugares.push(...hijos);
    frontera = hijos.map((h) => h.id);
  }
  return lugares;
}

/**
 * `location:edit_beneficio` en ALGÚN lugar de una organización — para lo que es
 * de la organización y no de un lugar, como las recetas. Una receta compartida
 * (`organizationId` nulo) sólo se configura con alcance de plataforma.
 *
 * Los candidatos son `lugaresDeOrganizacion`: las Location propias de la
 * organización más sus descendientes con `organizationId` nulo. Sin esto, un
 * capataz asignado en uno de esos hijos —los permisos sólo descienden, nunca
 * suben— no podía pasar esta guardia aunque se le concediera el permiso ahí
 * mismo.
 */
export async function exigeEditarBeneficioEnOrganizacion(userAccountId: string, organizationId: string | null) {
  if (organizationId === null) {
    if (
      await can(
        userAccountId,
        "edit_beneficio",
        "location",
        { scopeType: "platform", scopeRefId: null },
        CLASSIFICATION_NOT_APPLICABLE,
      )
    )
      return;
    throw new LocationAccessError("no_beneficio_edit_access");
  }
  const lugares = await lugaresDeOrganizacion(organizationId);
  for (const l of lugares) {
    if (await can(userAccountId, "edit_beneficio", "location", { scopeType: "location", scopeRefId: l.id }, l.classification)) return;
  }
  // Una organización con lotes pero sin ninguna Location propia (los tres
  // archivos de recetas existentes, con actor Platform Admin, la dejan así)
  // no tiene ningún lugar contra el que comprobar `can()`: sin este último
  // intento de plataforma, ni siquiera un Platform Admin podría configurarla
  // — el mismo respaldo que `scopeTargetsFor` en lots.ts usa para un lote sin
  // proyecto ni ubicación.
  if (
    await can(
      userAccountId,
      "edit_beneficio",
      "location",
      { scopeType: "platform", scopeRefId: null },
      CLASSIFICATION_NOT_APPLICABLE,
    )
  )
    return;
  throw new LocationAccessError("no_beneficio_edit_access");
}

/** La versión que pregunta, hermana de `puedeEditarBeneficioEn` — para las
 * pantallas de recetas, que preguntan por organización en vez de por lugar. */
export async function puedeEditarBeneficioEnOrganizacion(userAccountId: string, organizationId: string | null): Promise<boolean> {
  try {
    await exigeEditarBeneficioEnOrganizacion(userAccountId, organizationId);
    return true;
  } catch (error) {
    if (error instanceof LocationAccessError && error.message === "no_beneficio_edit_access") return false;
    throw error;
  }
}

export interface UpdateLocationAttributesInput {
  locationId: string;
  sunExposure?: SunExposure | null;
  shadePercentage?: ShadePercentageBracket | null;
  altitudeMinM?: number | null;
  altitudeMaxM?: number | null;
  slopeDescription?: string | null;
  // S1 §2 — orientación de la ladera. Enumerada, no texto: el marco la usa
  // para comparar bloques entre sí, y eso exige que el valor agrupe.
  aspect?: Aspect | null;
  soilType?: string | null;
  plantSpacingMeters?: number | null;
  // La rejilla de la parcela (D3): UNA sola numeración, la de la parcela, y los
  // cuatro campos juntos o ninguno. El `CHECK` de la base es la garantía; esto es
  // el mensaje. La aritmética de los rangos que cuelgan de ella vive aparte, en
  // `lib/territorio/rejilla.ts`.
  gridOrigin?: GridOrigin | null;
  rowCount?: number | null;
  plantsPerRow?: number | null;
  rowSpacingMeters?: number | null;
  // P1 §3 — declared block area. Not derived from a boundary polygon: none
  // exists, and a producer knows their hectares before anyone walks the
  // perimeter. When polygons arrive this becomes the value to reconcile the
  // computed one against.
  areaHectares?: number | null;
  description?: string | null;
}

/**
 * §1's "typed value + free note" rule is enforced by the schema itself
 * (every field nullable, `description` always present as a column) — there
 * is nothing to validate here beyond the altitude range ordering. Every
 * field is independently updatable; omitted keys are left untouched (a
 * `PATCH` shape, not a full replace) so recording just the altitude range
 * today doesn't require knowing the soil type too.
 */
export async function updateLocationAttributes(userAccountId: string, input: UpdateLocationAttributesInput) {
  const existing = await prisma.location.findUnique({ where: { id: input.locationId } });
  if (!existing) throw new LocationAccessError("location_not_found");

  await requireLocationAttributeAccess(userAccountId, input.locationId);
  await exigeEditarBeneficioSiLoEs(userAccountId, input.locationId);

  const nextMin = input.altitudeMinM !== undefined ? input.altitudeMinM : existing.altitudeMinM;
  const nextMax = input.altitudeMaxM !== undefined ? input.altitudeMaxM : existing.altitudeMaxM;
  if (nextMin != null && nextMax != null && nextMin > nextMax) {
    throw new LocationValidationError("altitude_min_exceeds_max");
  }

  // **Se cuenta la FILA RESULTANTE, no el input**, por lo mismo que la altitud de
  // arriba: con una rejilla ya puesta, cambiar sólo `rowCount` manda UN campo, y
  // contar el input llamaría «media rejilla» a la edición más normal que existe.
  // El `CHECK` de la base es `num_nonnulls(...) IN (0, 4)` sobre la fila, así que
  // contar otra cosa haría que el servicio y la base no dijeran lo mismo.
  const rejilla = {
    gridOrigin: input.gridOrigin !== undefined ? input.gridOrigin : existing.gridOrigin,
    rowCount: input.rowCount !== undefined ? input.rowCount : existing.rowCount,
    plantsPerRow: input.plantsPerRow !== undefined ? input.plantsPerRow : existing.plantsPerRow,
    rowSpacingMeters: input.rowSpacingMeters !== undefined ? input.rowSpacingMeters : existing.rowSpacingMeters,
  };
  const puestos = Object.values(rejilla).filter((v) => v !== null && v !== undefined).length;
  if (puestos !== 0 && puestos !== 4) throw new RejillaInvalida("rejilla_a_medias");
  // «No entera» seria falso para el 0 y el -3, que SON enteros. La propiedad es
  // «entero y desde 1», y el codigo lo dice entera: la misma correccion que se le
  // hizo a `no_es_celda` en `lib/territorio/rejilla.ts`.
  for (const v of [rejilla.rowCount, rejilla.plantsPerRow]) {
    // El techo es el de la columna `int4`, no un numero inventado: por encima de
    // el, Prisma devuelve un `P2020` crudo —medido— que en una accion es un 500.
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 2147483647)) {
      throw new RejillaInvalida("rejilla_no_entera_positiva");
    }
  }
  // La separacion entre hileras. Mismo nombre y misma forma que
  // `non_positive_spacing` de `plantingCohorts.ts` para ESTA MISMA magnitud, y
  // con su `CHECK` en `20261002013000_separacion_de_hileras_positiva`.
  //
  // Medido con una sonda el 2026-10-01, y lo encontro una revision
  // independiente: antes de esto, `rowSpacingMeters: 0` y `-2.5` SE GUARDABAN
  // —el `CHECK` de la tarea 2 solo cubria las dos cuentas— y `1000` y `NaN`
  // salian como `P2020`/`P2039` crudos, o sea 500.
  if (input.rowSpacingMeters != null) {
    const s = input.rowSpacingMeters;
    if (!Number.isFinite(s) || s <= 0) throw new RejillaInvalida("rejilla_separacion_no_positiva");
    // `numeric(5, 2)` no guarda 1000: tres enteros como mucho.
    if (s >= 1000) throw new RejillaInvalida("rejilla_separacion_fuera_de_rango");
  }

  const before = existing;
  const escritura = prisma.$transaction(async (tx) => {
    const after = await tx.location.update({
      where: { id: input.locationId },
      data: {
        ...(input.sunExposure !== undefined ? { sunExposure: input.sunExposure } : {}),
        ...(input.shadePercentage !== undefined ? { shadePercentage: input.shadePercentage } : {}),
        ...(input.altitudeMinM !== undefined ? { altitudeMinM: input.altitudeMinM } : {}),
        ...(input.altitudeMaxM !== undefined ? { altitudeMaxM: input.altitudeMaxM } : {}),
        ...(input.slopeDescription !== undefined ? { slopeDescription: input.slopeDescription } : {}),
        ...(input.aspect !== undefined ? { aspect: input.aspect } : {}),
        ...(input.soilType !== undefined ? { soilType: input.soilType } : {}),
        ...(input.plantSpacingMeters !== undefined ? { plantSpacingMeters: input.plantSpacingMeters } : {}),
        ...(input.gridOrigin !== undefined ? { gridOrigin: input.gridOrigin } : {}),
        ...(input.rowCount !== undefined ? { rowCount: input.rowCount } : {}),
        ...(input.plantsPerRow !== undefined ? { plantsPerRow: input.plantsPerRow } : {}),
        ...(input.rowSpacingMeters !== undefined ? { rowSpacingMeters: input.rowSpacingMeters } : {}),
        ...(input.areaHectares !== undefined ? { areaHectares: input.areaHectares } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });

    // C1 §3 pattern: editing a Location's own attribute record is an
    // evidentiary write in spirit (it's the basis for future terroir
    // analysis), even though Location itself doesn't carry the generic
    // provenanceClass column — same reasoning already applied to Assessment.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.update_attributes",
        entityType: "location",
        entityId: after.id,
        before,
        after,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return after;
  });

  // Lo que la base rechaza sale de aqui como `RejillaInvalida`, con lo que
  // estorba dentro del mensaje. Si la frase del `RAISE` no casa, se relanza el
  // error original: equivocarse de mensaje es peor que no dar ninguno.
  let after;
  try {
    after = await escritura;
  } catch (error) {
    const raise = mensajeDeDisparador(error);
    if (raise) {
      for (const [forma, codigo] of CULPABLES) {
        const m = raise.match(forma);
        if (m) throw new RejillaInvalida(codigo(m));
      }
    }
    throw error;
  }

  return after;
}

/**
 * ¿Está libre este nombre entre los hijos de `parentLocationId`? Sin distinguir mayúsculas ni
 * espacios de los extremos: «Lote 7» y « lote 7 » son el mismo nombre en el patio. Se llama DENTRO
 * de la transacción que va a crear la fila.
 */
export async function nombreLibreBajo(db: Prisma.TransactionClient, parentLocationId: string, nombre: string) {
  const hermanos = await db.location.findMany({ where: { parentLocationId }, select: { name: true } });
  const clave = nombre.trim().toLowerCase();
  return !hermanos.some((h) => h.name.trim().toLowerCase() === clave);
}

export interface CreateMicrolotInput {
  parentLocationId: string;
  name: string;
  slug?: string | null;
  subdivisionReason: SubdivisionReason;
  subdivisionReasonNote?: string | null;
}

/**
 * §2 rule 1 (a batch harvested before the microlot existed stays
 * attributed to the whole lot) needs no code — there is no function
 * anywhere in this codebase that reassigns an existing Lot/HarvestEvent's
 * locationId, and this function doesn't add one. §2 rule 2 (the system
 * never detects microlots) also needs no code — see `getAltitudeRange`
 * below for the one arithmetic-only exception the ticket explicitly
 * allows.
 */
export async function createMicrolot(userAccountId: string, input: CreateMicrolotInput) {
  if (!input.name.trim()) throw new LocationValidationError("name_required");

  const parent = await prisma.location.findUnique({ where: { id: input.parentLocationId } });
  if (!parent) throw new LocationAccessError("parent_location_not_found");

  await requireLocationAttributeAccess(userAccountId, input.parentLocationId);

  // Un microlote copia el tipo del padre, así que sobre un beneficio crearía
  // OTRO beneficio, saltándose `create_site` y la regla de que un beneficio
  // cuelga de un sitio. Hoy ninguna pantalla lo llama; se cierra igual.
  //
  // Lo mismo vale para una instalación de secado o una cama
  // (`TIPOS_DEL_BENEFICIO` sin `beneficio`): sin este rechazo,
  // `requireLocationAttributeAccess` sobre el padre bastaba para crear una
  // NUEVA `drying_facility`/`drying_bed` bajo `manage_attributes`, saltándose
  // por completo `exigeEditarBeneficioEn` — hallazgo de la auditoría final de
  // Codex sobre el plan 2.
  if (parent.locationType === "beneficio") throw new LocationValidationError("beneficio_no_se_subdivide");
  if (parent.locationType === "drying_facility" || parent.locationType === "drying_bed" || parent.locationType === "drying_rack") {
    throw new LocationValidationError("secado_no_se_subdivide");
  }
  if (parent.locationType === "storage_facility") throw new LocationValidationError("bodega_no_se_subdivide");

  const microlot = await prisma.$transaction(async (tx) => {
    // Spec fincas y parcelas §3.3: un nombre no se repite dentro del mismo padre.
    if (!(await nombreLibreBajo(tx, parent.id, input.name))) throw new LocationValidationError("nombre_repetido");
    const microlot = await tx.location.create({
      data: {
        name: input.name.trim(),
        slug: input.slug ?? null,
        locationType: parent.locationType,
        parentLocationId: parent.id,
        organizationId: parent.organizationId,
        subdivisionReason: input.subdivisionReason,
        subdivisionReasonNote: input.subdivisionReasonNote ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.create_microlot",
        entityType: "location",
        entityId: microlot.id,
        after: microlot,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return microlot;
  });

  return microlot;
}

/**
 * §2's own boundary: "el sistema puede señalar que un lote con rango de
 * altitud amplio es candidato a subdividirse — pero eso es aritmética
 * sobre un dato cargado, no detección." Deliberately returns the raw
 * range, not a boolean against an invented threshold — Cerro Azul's own
 * 50m range (600-650) is the example the ticket cites as real
 * subdivision-worthy variation, and Las Nubes Jaramillo's 200m (1300-1500)
 * is another; picking a magic cutoff number here wasn't asked for and
 * would just move the invention from "detecting a microlot" to
 * "guessing which range counts as wide," the same mistake by another name.
 */
export function getAltitudeRange(location: { altitudeMinM: number | null; altitudeMaxM: number | null }): number | null {
  if (location.altitudeMinM == null || location.altitudeMaxM == null) return null;
  return location.altitudeMaxM - location.altitudeMinM;
}
