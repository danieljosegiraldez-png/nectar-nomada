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
    const bandejas = await bandejasDeLaFinca(userAccountId, org.id);
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
