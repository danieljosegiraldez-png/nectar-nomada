/**
 * S2 (docs/implementation/37_S2_PROPOSITO_SENSORIAL_NAVEGACION.md §4) —
 * the signed-in navigation, derived from resolved permissions.
 *
 * Two changes from the fixed ten-item list this replaces:
 *
 * 1. **Sensory, Competitions and Calibration collapse into one entry.** They
 *    are not three disciplines; they are one discipline used for three
 *    purposes (§1). The tools themselves are offered inside `/sensory`,
 *    crossed with the viewer's resolved role — which is what makes the
 *    consolidation mean something rather than being cosmetic.
 *
 * 2. **Nothing is shown that the viewer cannot use.** SECURITY.md §2 applied
 *    to navigation: the frontend is not the security boundary, but it should
 *    not offer what the server will refuse. Today `AI Suggestions` is visible
 *    to everyone and answers "no access" to almost everyone, which is exactly
 *    the failure this rule names.
 *
 * `16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md` remains the destination —
 * navigation derived from context, not just from permissions. This is the
 * cheap intermediate step it explicitly allows, not a replacement for it.
 *
 * Pure function of a permission set: no I/O, no Prisma, trivially testable.
 */

import { esSitioDeAbejas } from "./apiary/sitioDeAbejas";

export interface NavEntry {
  /** Key under the `Nav` namespace in messages/*.json. */
  labelKey: string;
  href: string;
}

/**
 * A section is visible when the viewer holds ANY of `requiresAnyOf`. An empty
 * list means "always", used only for destinations that need no grant beyond
 * being signed in — `/my-nectar` is the viewer's own account, which RBAC.md §5
 * treats as a baseline rather than an Assignment.
 */
interface NavDefinition extends NavEntry {
  requiresAnyOf: readonly string[];
}

const NAV: readonly NavDefinition[] = [
  { labelKey: "myNectar", href: "/my-nectar", requiresAnyOf: [] },
  {
    labelKey: "partnerWorkspace",
    href: "/partner",
    requiresAnyOf: ["partner:submit_task", "partner:submit_data", "partner:upload_media"],
  },
  // 2026-09-17, decisión de Daniel: la entrada es «Beneficio», y los lotes, las
  // recetas, las instalaciones y los equipos cuelgan de ella. Hereda la regla que
  // tenía «Lotes» sin tocarla: quien veía lotes ve la sección, y nadie más.
  // Las rutas no se mueven todavía (`/lots` sigue donde estaba); eso va en su PR
  // cuando exista el tablero del beneficio, para no mudarlas dos veces.
  { labelKey: "beneficio", href: "/beneficio", requiresAnyOf: ["lot:view", "lot:manage"] },
  // 2026-09-18, decisión de Daniel: «Parcelas» pasa a ser la sección «Finca»
  // —parcelas, cosecha, recolectores, rendimiento—, hermana de «Beneficio».
  // Hereda la regla que tenía Parcelas sin tocarla. `/plots` no se mueve.
  {
    labelKey: "finca",
    href: "/finca",
    requiresAnyOf: ["location:manage_attributes", "lot:view", "lot:manage"],
  },
  { labelKey: "apiaries", href: "/apiaries", requiresAnyOf: ["apiary:view", "apiary:manage"] },
  { labelKey: "research", href: "/research", requiresAnyOf: ["research:view"] },
  // ADR-092. Offered on any content action: this profile's four permissions
  // travel together in the catalog, and a create-without-view split would be
  // a new decision rather than one this entry should anticipate.
  {
    labelKey: "content",
    href: "/content",
    requiresAnyOf: ["content:view", "content:create", "content:edit", "content:publish"],
  },
  // The consolidation. Any of the three former entries' permissions opens the
  // one section; which tools appear inside is decided by SENSORY_TOOLS below.
  {
    labelKey: "sensory",
    href: "/sensory",
    requiresAnyOf: ["sensory:submit_assessment", "sensory:manage_session", "competition:manage"],
  },
  // §4 asked whether AI is a destination or a cross-cutting capability. Today
  // it is a destination: `/ai` is the suggestion review queue, gated on
  // ai:review_suggestion. `ai:converse` — the cross-cutting one — is
  // deliberately not in the catalog yet (ADR-037 decision 4 defers it until
  // Ask Néctar is actually built), so there is nothing cross-cutting to place.
  // It stays a destination, now correctly hidden from those who cannot use it.
  { labelKey: "ai", href: "/ai", requiresAnyOf: ["ai:review_suggestion"] },
  // Last, because it is administration rather than a place work happens
  // (ADR-074). Gated on manage_permissions specifically: granting a role *is*
  // managing permissions, and someone holding only manage_users would find the
  // page refusing them — which is the failure this file's rule 2 exists to
  // prevent.
  { labelKey: "admin", href: "/admin/users", requiresAnyOf: ["platform:manage_permissions"] },
];

/**
 * The tools inside the consolidated Sensory section. `/sensory` itself is the
 * session list, so it is not repeated here.
 */
const SENSORY_TOOLS: readonly NavDefinition[] = [
  { labelKey: "competitions", href: "/competitions", requiresAnyOf: ["competition:manage"] },
  { labelKey: "calibration", href: "/calibration", requiresAnyOf: ["sensory:manage_session"] },
  // 2026-09-06. Hasta hoy no había forma de crear una sesión: `sensorySession.create`
  // sólo existía en la semilla y en pruebas, así que el módulo entero no tenía
  // puerta de entrada. Mismo permiso que la calibración, que es el que el
  // servicio exige.
  { labelKey: "newSession", href: "/sensory/new", requiresAnyOf: ["sensory:manage_session"] },
  // 2026-09-08. El servicio para registrar el informe de un Q-grader existía
  // desde el PR #219 y sólo se podía usar por terminal, con un JSON a mano.
  // Mismo permiso que montar una cata: quien mete el resultado de un tercero
  // está montando una, no puntuando en ella.
  { labelKey: "externalReport", href: "/sensory/external-report", requiresAnyOf: ["sensory:manage_session"] },
];

/**
 * Where signing in should put you — ADR-082.
 *
 * Every sign-in path sent everyone to `/my-nectar`, which opens on an
 * inventory of the viewer's own Assignments and resolved permissions. That is
 * a reasonable *account* page and a poor place to arrive: an operator signing
 * in on a phone at a beneficio wants the lots that are fermenting, not a
 * reading of their own access.
 *
 * The order below is deliberately NOT the NAV order above. NAV is ordered for
 * scanning a menu; this is ordered by how likely a section is to be where the
 * holder's work actually happens, which matters only for someone holding
 * several — a Platform Admin holds every key here and should land on
 * operations, not on the first menu item that happens to match.
 *
 * `/admin/users` is deliberately absent for the reason NAV already gives for
 * placing it last: it is administration, not a place work happens. Nobody
 * should *arrive* there.
 *
 * `/my-nectar` remains the fallback, and it is the right one — a registered
 * customer with no Assignment at all has orders and bookings there and
 * nothing anywhere else. It stays reachable from the nav for everyone.
 */
const LANDING_PRIORITY: readonly NavDefinition[] = [
  // Leads with getActiveOperations — fermentation and drying under way, lots
  // gone unmeasured, samples awaiting sensory. The most work-like page there
  // is, which is why it goes first.
  { labelKey: "lots", href: "/lots", requiresAnyOf: ["lot:view", "lot:manage"] },
  { labelKey: "apiaries", href: "/apiaries", requiresAnyOf: ["apiary:view", "apiary:manage"] },
  {
    labelKey: "partnerWorkspace",
    href: "/partner",
    requiresAnyOf: ["partner:submit_task", "partner:submit_data", "partner:upload_media"],
  },
  { labelKey: "research", href: "/research", requiresAnyOf: ["research:view"] },
  // ADR-092. Offered on any content action: this profile's four permissions
  // travel together in the catalog, and a create-without-view split would be
  // a new decision rather than one this entry should anticipate.
  {
    labelKey: "content",
    href: "/content",
    requiresAnyOf: ["content:view", "content:create", "content:edit", "content:publish"],
  },
  {
    labelKey: "sensory",
    href: "/sensory",
    requiresAnyOf: ["sensory:submit_assessment", "sensory:manage_session", "competition:manage"],
  },
];

/** The fallback, and the destination for a viewer holding no operational grant. */
export const DEFAULT_LANDING = "/my-nectar";

/**
 * `granted` must come from `permissionKeysAnywhere`, for the same reason
 * `buildNavigation` requires it: "could this person use this section at all"
 * is a wider question than "may they act on this row", and a farm operator's
 * `lot:manage` lives on a project scope that a platform-scoped resolution
 * cannot see. Choosing a destination is an offer, never an authorization —
 * the destination re-checks on arrival, as every server entry point does.
 */
export function landingDestination(granted: ReadonlySet<string>): string {
  const match = LANDING_PRIORITY.find((entry) => entry.requiresAnyOf.some((key) => granted.has(key)));
  return match?.href ?? DEFAULT_LANDING;
}

/**
 * A dónde entra la app al iniciar sesión. **Anexo E §1, primera frase:** *«Si hay una jornada
 * abierta, la app entra directo en ella.»*
 *
 * **Una jornada abierta gana a la prioridad por permisos, y eso es deliberado.** Quien tiene
 * una visita sin cerrar está en medio de un trabajo; mandarlo al tablero que le corresponda
 * por rol le pide un toque para volver a donde estaba, y el Anexo cuenta los toques. El
 * ejemplo del dueño es el que manda: una jornada del 13 de septiembre con cero eventos y sin
 * cerrar es lo que pasa cuando la app no lleva a nadie de vuelta.
 *
 * **La consecuencia, dicha:** una cuenta con permisos de plataforma y una jornada abierta
 * aterriza en la jornada, no en su tablero. Es lo que el Anexo pide, y el banner global
 * (ADR-131) deja ver siempre que hay una abierta, así que nadie llega ahí sin saber por qué.
 *
 * **Elegir un destino es una oferta, nunca una autorización** — igual que
 * `landingDestination`, cuyo comentario lo dice: el destino vuelve a comprobar al llegar.
 * Pasar un id de jornada aquí no concede nada sobre ella.
 *
 * Pura: recibe los ids ya resueltos y no consulta nada. `apiarioUnicoId` es `null` siempre
 * que el sitio de llamada no haya comprobado que hay **exactamente uno**; contarlos es trabajo
 * de quien tiene la base delante, decidir con la cuenta hecha es trabajo de aquí.
 */
export function destinoDeEntrada(
  granted: ReadonlySet<string>,
  jornadaAbiertaId: string | null,
  apiarioUnicoId: string | null = null,
): string {
  if (jornadaAbiertaId) return `/field-sessions/${jornadaAbiertaId}`;

  const aterrizaje = landingDestination(granted);

  // **Anexo E §2, segunda frase: «entrada directa cuando hay uno solo».** Una lista de un
  // elemento no informa de nada y cobra un toque.
  //
  // **Va aquí y NO como un `redirect` dentro de `/apiaries`, y eso se midió.** La ficha del
  // apiario tiene una sola salida —un enlace «volver a apiarios»—, y la navegación global
  // sólo ofrece `/apiaries`. Con la lista redirigiendo, ese enlace rebotaría a la misma
  // ficha y **`/apiaries/new` dejaría de ser alcanzable**: nadie podría crear su segundo
  // apiario. Es la forma exacta del hallazgo que este módulo ya lleva cuatro veces —un
  // mecanismo que no se puede alcanzar se ve igual que uno que no existe—, y construir la
  // frase del Anexo al pie de la letra lo habría creado.
  //
  // Sólo cuando el aterrizaje por permisos ES la lista de apiarios. A quien entra por su
  // tablero no se le cambia el destino por tener un apiario: el id se ignora.
  if (aterrizaje === "/apiaries" && apiarioUnicoId) return `/apiaries/${apiarioUnicoId}`;

  return aterrizaje;
}

/**
 * La pantalla que le corresponde a una ubicación, según **el tipo de la fila**.
 *
 * **Por qué existe.** `app/field-sessions/[id]/page.tsx` enlazaba de vuelta a
 * `/plots/<id>` **siempre**, así que una jornada de apiario mandaba a la pantalla de parcelas
 * de café. Eso rompe el «toque 1 → colmena» del Anexo E §1 antes de empezar: desde la jornada
 * abierta no había forma de llegar a las colmenas.
 *
 * **Resuelve por `locationType`, que es un hecho de la fila, y nunca por un parámetro que
 * elija quien llama** — la misma disciplina que `requireFieldSessionAccess` (A9.0): si el
 * dominio lo eligiera el llamador, se podría pedir la pantalla equivocada desde el sitio
 * equivocado.
 *
 * **El resto cae en `/plots`, que es lo que hacía antes.** No se inventa una ruta para `site`
 * ni para `locality`: no existen como pantalla, y mandar ahí sería cambiar un destino
 * equivocado por otro.
 */
export function rutaDelSitio(locationType: string, locationId: string): string {
  return esSitioDeAbejas(locationType) ? `/apiaries/${locationId}` : `/plots/${locationId}`;
}

function visible(entry: NavDefinition, granted: ReadonlySet<string>): boolean {
  return entry.requiresAnyOf.length === 0 || entry.requiresAnyOf.some((key) => granted.has(key));
}

/**
 * The primary navigation for a signed-in viewer.
 *
 * `granted` must come from `permissionKeysAnywhere` — "could this person use
 * this section at all", not "may they act on this particular row". Deciding
 * what to *offer* is a wider question than deciding what to *allow*, and the
 * two must not share a resolver.
 */
export function buildNavigation(granted: ReadonlySet<string>): NavEntry[] {
  return NAV.filter((entry) => visible(entry, granted)).map(({ labelKey, href }) => ({ labelKey, href }));
}

/**
 * Las páginas que no son entrada del menú pero viven DENTRO de una sección que sí
 * lo es, con la sección que las enlaza.
 *
 * Existe desde el 2026-09-17, cuando «Lotes» dejó de ser entrada del menú y pasó a
 * colgar de «Beneficio» (decisión de Daniel), pero el aterrizaje de un operario
 * siguió en `/lots` (también decisión suya: nadie cambia su mañana). El invariante
 * de ADR-082 —«no aterrizar donde el menú no te deja volver»— sigue valiendo; lo
 * que cambia es que «volver» puede pasar por una sección. Escrito como dato y no
 * como excepción en una prueba, para que el compilador lo vea y la página índice de
 * la sección y este mapa no puedan divergir sin que algo lo note.
 */
export const DENTRO_DE_SECCION: Readonly<Record<string, string>> = {
  "/lots": "/beneficio",
  // 2026-09-18: las parcelas cuelgan de Finca.
  "/plots": "/finca",
};

/**
 * ¿Se puede volver a `href` desde el menú de quien mira? Sí si es una entrada, o si
 * vive dentro de una sección que es entrada. Es la pregunta que protege ADR-082.
 */
export function seAlcanzaDesdeElMenu(href: string, menu: readonly string[]): boolean {
  if (menu.includes(href)) return true;
  const seccion = DENTRO_DE_SECCION[href];
  return seccion !== undefined && menu.includes(seccion);
}

/**
 * Toda clave que abre una entrada del menú principal, derivada de `NAV`.
 *
 * **Existe porque escribirla a mano falló, y falló en silencio.** El test que
 * afirmaba «ni el visor más privilegiado pasa de 8 entradas» usaba una lista de
 * diez permisos escrita a mano; le faltaban `platform:manage_permissions` y los
 * de contenido — justo los dos que abren las dos entradas de más. Así que el
 * «visor más privilegiado» del test **no lo era**, el guardia decía lo
 * contrario de lo que pasaba, y pasaba en verde. Medido el 2026-09-08:
 * `NAV` tiene 10 entradas y esta unión, 18 claves.
 *
 * Derivada, una entrada nueva entra aquí sola. Es la misma lección que el mapa
 * de variables que pasó a `Record` total: un dato que el compilador mantiene
 * es mejor guardia que una lista que hay que acordarse de actualizar.
 */
export const NAV_PERMISSIONS: readonly string[] = [...new Set(NAV.flatMap((e) => e.requiresAnyOf))];

/** The tools offered inside `/sensory`, filtered the same way. */
export function buildSensoryTools(granted: ReadonlySet<string>): NavEntry[] {
  return SENSORY_TOOLS.filter((entry) => visible(entry, granted)).map(({ labelKey, href }) => ({
    labelKey,
    href,
  }));
}
