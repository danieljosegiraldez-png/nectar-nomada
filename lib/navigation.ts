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
  { labelKey: "lots", href: "/lots", requiresAnyOf: ["lot:view", "lot:manage"] },
  {
    labelKey: "plots",
    href: "/plots",
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
