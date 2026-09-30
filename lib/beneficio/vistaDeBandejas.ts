import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { bandejasDeLaFinca, tiposDeBandeja } from "../equipos/bandejas";
import { puedeConfigurarEn, sitiosParaRegistrar } from "../equipos/equipos";
import { capacidadDeTipo } from "../traceability/capacidadDeBandeja";
import { puedeEditarBeneficioEnOrganizacion } from "../traceability/locations";
import { lotWhereFromVisibility, puedeGestionarLote, resolveLotVisibility } from "../traceability/lots";

/**
 * F4 (revisión final 2, plan 2a de secado): antes se tomaban 101 candidatos y
 * SÓLO DESPUÉS se autorizaba cada uno — con 100 lotes restringidos por delante
 * de uno gestionable, el formulario de pesaje desaparecía sin explicación,
 * porque el gestionable ni siquiera entraba en la página. Ahora se pagina
 * hasta llenar la cuota de gestionables O agotar los candidatos, con un tope
 * de páginas para acotar el trabajo. `cuota`/`tamanoPagina`/`maxPaginas` son
 * parámetros (no constantes) para que la prueba pueda forzar la paginación
 * sin crear cientos de filas.
 */
export async function lotesGestionablesDeOrganizacion(
  userAccountId: string,
  loteWhere: Prisma.LotWhereInput,
  organizationId: string,
  opciones: { cuota?: number; tamanoPagina?: number; maxPaginas?: number } = {},
): Promise<{ lotes: { id: string; lotCode: string }[]; recortados: boolean }> {
  const cuota = opciones.cuota ?? 100;
  const tamanoPagina = opciones.tamanoPagina ?? 100;
  const maxPaginas = opciones.maxPaginas ?? 5;
  const lotes: { id: string; lotCode: string }[] = [];
  let recortados = false;
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const candidatos = await prisma.lot.findMany({
      where: { ...loteWhere, organizationId },
      select: { id: true, lotCode: true, projectId: true, locationId: true, classification: true },
      orderBy: { createdAt: "desc" },
      skip: pagina * tamanoPagina,
      take: tamanoPagina,
    });
    if (candidatos.length === 0) break;
    for (const lote of candidatos) {
      if (lotes.length >= cuota) { recortados = true; break; }
      if (await puedeGestionarLote(userAccountId, lote)) lotes.push({ id: lote.id, lotCode: lote.lotCode });
    }
    if (lotes.length >= cuota) break;
    if (candidatos.length < tamanoPagina) break; // se agotaron de verdad los candidatos
    if (pagina === maxPaginas - 1) recortados = true; // tope de páginas, sin agotar
  }
  return { lotes, recortados };
}

/**
 * El modelo de vista de `/beneficio/bandejas` (Tarea 5 del plan 2a): una
 * fila por organización, con sus tipos ya resueltos a su capacidad, sus
 * bandejas, y qué puede hacer esta persona ahí.
 *
 * **Vive en `lib/` y no en `app/beneficio/bandejas/page.tsx`** porque
 * `app/**` no puede importar un cliente de base de datos directamente
 * (`eslint.config.mjs`, regla `no-restricted-imports` sobre `lib/db`) — la
 * página sólo pinta lo que esto devuelve, igual que `detalleInstalacion` hace
 * por `/instalaciones/[id]`.
 *
 * **Qué organizaciones entran.** El brief pide "cada organización donde
 * quien mira ve algún tipo o alguna bandeja". Tomado al pie de la letra, una
 * organización con `edit_beneficio` pero CERO tipos todavía quedaría fuera —
 * y entonces nadie podría crear el primer tipo desde la pantalla, justo lo
 * que pide el primer paso de la propia verificación en navegador de la
 * Tarea 5. Así que la condición real es: hay algún tipo, alguna bandeja, O
 * quien mira puede crear un tipo aquí. Registrar bandejas y registrar pesaje
 * siguen exigiendo que ya exista al menos un tipo, porque las dos necesitan
 * elegir uno.
 */
export async function vistaDeBandejas(userAccountId: string) {
  const sitiosPropios = await sitiosParaRegistrar(userAccountId);
  const visibilidadDeLotes = await resolveLotVisibility(userAccountId, "manage");
  const loteWhere = lotWhereFromVisibility(visibilidadDeLotes);

  // A5 (revisión final del plan 2a): sólo organizaciones con al menos un
  // `site` — sin esto un Platform Admin ve una sección por cada
  // roaster/cliente, que nunca va a tener bandejas.
  const organizaciones = await prisma.organization.findMany({
    where: { locations: { some: { locationType: "site" } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const secciones = [];
  for (const org of organizaciones) {
    const tipos = await tiposDeBandeja(userAccountId, org.id);
    const bandejasSinOcupacion = await bandejasDeLaFinca(userAccountId, org.id);
    // Lo que cada una tiene encima. Va aquí y no dentro de `bandejasDeLaFinca` porque esa
    // función la comparten otras pantallas de equipos, a las que el secado no les importa.
    const ocupaciones = await ocupacionDeBandejas(userAccountId, bandejasSinOcupacion.map((b) => b.id));
    const bandejas = bandejasSinOcupacion.map((b) => ({ ...b, ocupacion: ocupaciones.get(b.id) ?? null }));
    const puedeEditar = await puedeEditarBeneficioEnOrganizacion(userAccountId, org.id);
    if (!tipos.length && !bandejas.length && !puedeEditar) continue;

    const tiposConCapacidad = [];
    for (const tipo of tipos) {
      // F5 (RULING, revisión final 2): un fallo en UN tipo no puede tirar
      // abajo toda la página — no hay `error.tsx` bajo `app/`. Arreglo
      // ACOTADO: esta fila se degrada a `fallo: true`; no se toca la
      // autorización ni se añade un error boundary global (fuera de alcance
      // de esta rama, ya grande de por sí).
      try {
        // F5 (cheap win, misma revisión): `capacidad.estados[].detalle` ya
        // trae el detalle del MISMO conjunto que `capacidadDeTipo` autorizó —
        // antes se volvía a consultar y a autorizar cada pesaje visible con
        // una segunda llamada a `pesajesDeTipo`, por cada estado medido.
        const capacidad = await capacidadDeTipo(userAccountId, tipo.id);
        tiposConCapacidad.push({ ...tipo, estados: capacidad.estados, fallo: false as const });
      } catch {
        tiposConCapacidad.push({ ...tipo, estados: [], fallo: true as const });
      }
    }

    // F2 (revisión final 2, medido antes de elegir dónde filtrar):
    // `sitiosParaRegistrar` (lib/equipos/equipos.ts:916) tiene otros dos
    // llamadores además de esta vista — `app/equipos/nuevo/page.tsx` y
    // `app/actions/equipos.ts`, el alta y la validación de equipo EN GENERAL,
    // no sólo de bandejas — así que no se puede acotar ahí a `site`/`beneficio`
    // sin romper el registro de otros equipos en una parcela, un apiario o una
    // instalación. Se filtra AQUÍ, sólo para el selector de bandejas.
    const candidatos = sitiosPropios.filter(
      (s) => s.organizationId === org.id && (s.locationType === "site" || s.locationType === "beneficio"),
    );
    const sitiosDisponibles = [];
    for (const s of candidatos) if (await puedeConfigurarEn(userAccountId, s.id)) sitiosDisponibles.push(s);

    // A1 (revisión final del plan 2a): el selector no puede enseñar id y código
    // de un lote que esta cuenta no gestiona (`lotWhereFromVisibility` sólo
    // acota ÁMBITO — proyecto o ubicación —, no clasificación). Se filtra cada
    // candidato con el mismo guardia que usa `registrarPesaje`
    // (`puedeGestionarLote`, que llama a `requireLotAccess`). `resolveLotVisibility`
    // NO se toca: es compartido y está fuera de este alcance.
    const { lotes: lotesGestionables, recortados: lotesRecortados } =
      tipos.length && loteWhere
        ? await lotesGestionablesDeOrganizacion(userAccountId, loteWhere, org.id)
        : { lotes: [], recortados: false };

    secciones.push({ org, tipos: tiposConCapacidad, bandejas, puedeEditar, sitiosDisponibles, lotesGestionables, lotesRecortados });
  }
  return secciones;
}

/** Lo que una bandeja tiene encima ahora, o desde cuándo está libre. */
export type OcupacionDeBandeja =
  | { readonly estado: "ocupada"; readonly desde: Date; readonly lotId: string | null; readonly lotCode: string | null }
  | { readonly estado: "libre"; readonly desde: Date | null };

/**
 * Qué hay encima de cada bandeja, leyendo `DryingRunTray`, que ya lo sabía.
 *
 * **El hueco que lo motiva** (diseño §B.4, medido el 2026-09-27): `lib/equipos/bandejas.ts` no
 * menciona `dryingRunTray` ni una vez —control: menciona `equipment` ocho veces—, así que la
 * lista decía que las ocho bandejas están «en Finca Rosina» cuando cuatro tenían café encima.
 *
 * **El código del lote se acota por VISIBILIDAD DE LOTES, no por la de la bandeja.** Una bandeja
 * que esta cuenta puede ver puede tener encima un lote que no: entonces dice «ocupada» y **no
 * nombra el lote**. Lo contrario convertiría esta lista en un canal para leer códigos de lote
 * ajenos, que es justo lo que `resolveLotVisibility` existe para impedir.
 *
 * **«Libre desde» sale del último `hasta`**, y es nulo cuando la bandeja no ha estado nunca en
 * una corrida — que no es lo mismo que «libre desde siempre» y por eso no se inventa una fecha.
 */
export async function ocupacionDeBandejas(
  userAccountId: string,
  equipmentIds: readonly string[],
): Promise<Map<string, OcupacionDeBandeja>> {
  const salida = new Map<string, OcupacionDeBandeja>();
  if (equipmentIds.length === 0) return salida;

  const ocupadas = await prisma.dryingRunTray.findMany({
    where: { equipmentId: { in: [...equipmentIds] }, hasta: null },
    select: {
      equipmentId: true,
      desde: true,
      dryingRun: {
        select: {
          transformations: {
            select: { inputs: { select: { lotId: true }, take: 1 } },
            orderBy: { occurredAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  const lotIds = [
    ...new Set(
      ocupadas
        .map((o) => o.dryingRun.transformations[0]?.inputs[0]?.lotId)
        .filter((id): id is string => id != null),
    ),
  ];

  // Los que esta cuenta puede ver. `null` de `lotWhereFromVisibility` significa «ninguno»,
  // y entonces ningún código se nombra — que es lo correcto, no un caso límite raro.
  const visibilidad = await resolveLotVisibility(userAccountId, "view");
  const loteWhere = lotWhereFromVisibility(visibilidad);
  const visibles = new Map<string, string>();
  if (loteWhere && lotIds.length > 0) {
    const lotes = await prisma.lot.findMany({
      where: { ...loteWhere, id: { in: lotIds } },
      select: { id: true, lotCode: true },
    });
    for (const l of lotes) visibles.set(l.id, l.lotCode);
  }

  for (const o of ocupadas) {
    const lotId = o.dryingRun.transformations[0]?.inputs[0]?.lotId ?? null;
    const lotCode = lotId ? visibles.get(lotId) ?? null : null;
    salida.set(o.equipmentId, {
      estado: "ocupada",
      desde: o.desde,
      lotId: lotCode ? lotId : null,
      lotCode,
    });
  }

  const libres = equipmentIds.filter((id) => !salida.has(id));
  if (libres.length > 0) {
    const ultimas = await prisma.dryingRunTray.findMany({
      where: { equipmentId: { in: libres }, hasta: { not: null } },
      select: { equipmentId: true, hasta: true },
      orderBy: { hasta: "desc" },
    });
    const vistas = new Set<string>();
    for (const u of ultimas) {
      if (vistas.has(u.equipmentId)) continue;
      vistas.add(u.equipmentId);
      salida.set(u.equipmentId, { estado: "libre", desde: u.hasta });
    }
    for (const id of libres) if (!salida.has(id)) salida.set(id, { estado: "libre", desde: null });
  }

  return salida;
}
