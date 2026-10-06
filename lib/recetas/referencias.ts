/**
 * Las referencias del paquete «farm-to-green v2» para cada tipo de paso (Parte 2a, 2026-10-03; diseño §3.5
 * y §6). Pura: lee la copia `referenciasDelPaquete.json` y no toca la base.
 *
 * **Son referencia, no la receta.** La pantalla las enseña junto a cada valor por defecto, con su fuente y
 * su confianza, y la receta decide (regla 1 del paquete; ADR-181: los umbrales salen de la receta). La
 * copia la hace `scripts/copiar-referencias-del-paquete.mjs`, tal cual, desde `04_reference_parameters.json`
 * v2.0 (versionado en `docs/reference/farm-management/`; la copia remite a él en `_procedencia.original` y una prueba la
 * compara con él); a qué tipos de paso aplica cada parámetro es inferencia de la casa, escrita en ese guion.
 *
 * **La nota del paquete (`note`) sale con su referencia, tal cual** (`nota`, registro I6): 22 de los 51 parámetros
 * copiados la traen, y varias son justo la salvedad que impide leer la referencia como un hecho («Importer soft target,
 * not a standard.», «Vendor rating; never exceed vessel rating.»). Sin ella la pantalla enseñaría el valor sin su
 * advertencia, que es lo que la regla 7 del paquete («never present references as facts») prohíbe.
 *
 * Tres reglas del paquete (`00_CLAUDE_CODE_PROMPT.md`) viven aquí, cada una con su prueba en
 * `tests/recetas/referencias.test.ts`:
 * - **Regla 2 — nunca elegir una autoridad en silencio.** El perfil del valor (`profile`) va en su fuente, y
 *   el valor de cada otra autoridad (`alt`) es una alternativa.
 * - **Regla 7 — `low` y `NN` se marcan visiblemente; nunca se recomiendan productos ni dosis.** `NN`
 *   («Néctar Nómada addition, verify before production use») es un id de FUENTE, no una confianza: se lee en
 *   `source`, y un parámetro `medium` puede llevarlo (`drying.interruption_rule`, «NN gate»). Lo que un
 *   fabricante publica de su producto no precarga nunca un paso: precargarlo sería recomendarlo. Es la misma
 *   regla que la casa ya puso a las dosis fitosanitarias (`tests/arquitectura/propuesta-de-dosis.test.ts`).
 * - **Regla 3 — los valores del lavado genérico nunca se aplican a una receta propia** (CryoBloom, inoculada
 *   o cualquier otra). El paquete los marca con `scope` («generic washed fallback ONLY») y con `use`
 *   («info-only; protocol endpoints rule»); en la 2a no existe la receta «lavado genérico», así que no
 *   precargan nunca. Se enseñan, porque son referencia.
 */
import copia from "./referenciasDelPaquete.json";
import type { TipoDePaso } from "./vocabulario";

export interface ReferenciaDelPaquete {
  parametro: string;
  tipoDePaso: TipoDePaso | null;
  valor: string;
  fuente: string;
  confianza: "high" | "medium" | "low";
  alternativas: readonly { valor: string; fuente: string }[];
  marcarVisible: boolean;
  noPrecargar: boolean;
  /** La salvedad del paquete (`note`), tal cual; `null` si el parámetro no la trae. */
  nota: string | null;
}

/** Un parámetro como lo dejó el guion de copia: los campos del paquete, sin tocar, más `tiposDePaso`. */
interface ParametroCopiado {
  key: string;
  value?: unknown;
  min?: number;
  max?: number;
  unit?: string;
  source: string | readonly string[];
  confidence: "high" | "medium" | "low";
  profile?: string;
  alt?: Readonly<Record<string, unknown>>;
  scope?: string;
  use?: string;
  note?: string;
  tiposDePaso: readonly TipoDePaso[];
}

// TypeScript sólo infiere del JSON una unión de formas; la forma real la vigila
// `tests/recetas/referencias.test.ts` («cada parámetro trae fuente y confianza…»).
const PARAMETROS = (copia as unknown as { parametros: readonly ParametroCopiado[] }).parametros;

/**
 * Las fuentes que son un fabricante hablando de su producto, según `_meta.sources` del paquete: «Fermentis
 * SafCoffee product pages (2026)» y «Penagos equipment pages (vendor)».
 */
const FUENTES_DE_FABRICANTE: readonly string[] = ["FERMENTIS", "PENAGOS"];

function fuentesDe(p: ParametroCopiado): readonly string[] {
  return typeof p.source === "string" ? [p.source] : p.source;
}

/** El id de una fuente es su primera palabra: «CENICAFE AT577» es CENICAFE; «NN gate» es NN. */
function idDeFuente(fuente: string): string {
  return fuente.trim().split(/\s+/)[0] ?? "";
}

/** Un valor del paquete como texto: un par de números es un rango; un objeto, sus sub-valores con nombre. */
function texto(v: unknown): string {
  if (Array.isArray(v)) {
    return v.length === 2 && v.every((x) => typeof x === "number") ? `${v[0]}–${v[1]}` : v.map(texto).join(", ");
  }
  if (v !== null && typeof v === "object") {
    return Object.entries(v)
      .map(([nombre, x]) => `${nombre}: ${texto(x)}`)
      .join(" · ");
  }
  return String(v);
}

function conUnidad(base: string, unidad: string | undefined): string {
  return unidad ? `${base} ${unidad}` : base;
}

/** Las formas en que el paquete da un valor: valor, valor con tope, rango, o un solo extremo. */
function valorDe(p: ParametroCopiado): string {
  const { value, min, max } = p;
  let base: string;
  if (value !== undefined && max !== undefined && min === undefined) base = `${texto(value)} (≤ ${max})`;
  else if (value !== undefined) base = texto(value);
  else if (min !== undefined && max !== undefined) base = `${min}–${max}`;
  else if (max !== undefined) base = `≤ ${max}`;
  else if (min !== undefined) base = `≥ ${min}`;
  else base = "—";
  return conUnidad(base, p.unit);
}

function aReferencia(p: ParametroCopiado, tipo: TipoDePaso): ReferenciaDelPaquete {
  const fuentes = fuentesDe(p);
  return {
    parametro: p.key,
    tipoDePaso: tipo,
    valor: valorDe(p),
    fuente: fuentes.join(" + ") + (p.profile ? ` · perfil ${p.profile}` : ""),
    confianza: p.confidence,
    alternativas: Object.entries(p.alt ?? {}).map(([autoridad, v]) => ({ valor: conUnidad(texto(v), p.unit), fuente: autoridad })),
    marcarVisible: p.confidence === "low" || fuentes.some((f) => idDeFuente(f) === "NN"),
    noPrecargar:
      p.scope !== undefined || p.use !== undefined || fuentes.some((f) => FUENTES_DE_FABRICANTE.includes(idDeFuente(f))),
    nota: p.note ?? null,
  };
}

/**
 * Los sinónimos que el paquete o el diseño dan a un valor de OTRO catálogo (registro de la 2a, I7). **Sólo para
 * mostrar** —la ayuda de un eje dice «mosto propio = medio de lavado · mosto_propio»—: **no son alias**, porque un
 * alias no cruza catálogos (la semilla lanza en `prisma/seed.ts` y el servicio lo rechaza), así que no se siembran ni
 * se leen para guardar nada.
 *
 * Cada destino existe en su catálogo y es un valor canónico: `tests/recetas/referencias.test.ts` lo comprueba contra
 * `lib/research/catalogs.ts`.
 * - «mosto propio» y «mosto de otro fermento» son los dos del diseño §7 (palabras de Daniel): `medio_lavado`.
 * - `backslopped` es el valor del eje D del paquete (`processing_axes.json`, `D_microbial_control`: «own
 *   must/mosto/lixiviado from a previous batch»): lo que la casa guarda como `doble_mosto` de `sustrato_anadido`, y
 *   cuyos otros nombres (`mosto`, `mossto`, `lixiviado`, «previous-batch starter») son alias de ese mismo valor dentro de su
 *   catálogo, y los siembra la tarea 8 del plan (no esta lista: aquí sólo se muestran, no se guardan ni se leen).
 * - «atomizado» NO está aquí: es un método de inoculación (`metodo_inoculacion`,
 *   `docs/arquitectura/cryobloom-contra-el-esquema.md:72`), no una fuente ni un medio.
 */
export const SINONIMOS_ENTRE_CATALOGOS: readonly { termino: string; catalogo: string; valor: string }[] = [
  { termino: "mosto propio", catalogo: "medio_lavado", valor: "mosto_propio" },
  { termino: "mosto de otro fermento", catalogo: "medio_lavado", valor: "mosto_de_otro_lote" },
  { termino: "backslopped", catalogo: "sustrato_anadido", valor: "doble_mosto" },
];

const POR_TIPO = new Map<TipoDePaso, ReferenciaDelPaquete[]>();
for (const p of PARAMETROS) {
  for (const tipo of p.tiposDePaso) {
    const lista = POR_TIPO.get(tipo) ?? [];
    lista.push(aReferencia(p, tipo));
    POR_TIPO.set(tipo, lista);
  }
}

/**
 * Las referencias del paquete para un tipo de paso, en el orden del paquete. Un parámetro que aplica a
 * varios tipos sale en cada uno, con su `tipoDePaso`; por eso esta copia nunca da `tipoDePaso: null`. Un
 * tipo sin referencias devuelve `[]`.
 */
export function referenciasDelTipo(tipo: TipoDePaso): readonly ReferenciaDelPaquete[] {
  return POR_TIPO.get(tipo) ?? [];
}
