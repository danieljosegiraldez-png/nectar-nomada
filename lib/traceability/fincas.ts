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
import { sortByName } from "../naturalOrder";
import { getManageableContext } from "./lots";

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
