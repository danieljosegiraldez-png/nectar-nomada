/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md §3a/§3b). Seed-managed
 * VariableCatalog/VariableCatalogValue content — the exact real vocabulary
 * decided with the product owner, not invented. Same "data, not schema"
 * convention lib/rbac/catalog.ts already proves for Role Profiles: adding
 * a new yeast is one entry here + a re-seed, never a migration (§9.3).
 *
 * §3a's four catalog-typed variables (Recipiente, Levadura/cultivo, Método
 * de inoculación, Grado de proceso) plus §3b's "Estudio de cerezas"
 * categorical attributes, reused through the same mechanism rather than
 * standing up SensoryDescriptor-shaped infrastructure a second time (see
 * ProcessingStageObservation's own schema comment for why that pair
 * doesn't fit — no Assessment/BlindSample/judging-session context exists
 * for a pre-processing cherry inspection).
 */

export interface VariableCatalogValueDef {
  value: string;
  // §3a — "Spontaneous Wild ... no es una cepa, es ausencia de cepa
  // conocida." Only true for values that themselves assert unknown origin.
  impliesUnknownIdentity?: boolean;
  // RO1.1 (35_RO1.1_HONEY_PORCENTAJE_CANONICO.md §2) — seeded straight into
  // VariableCatalogValue.definition, not left for a later runtime call.
  // honey_color's four values are the first real use: each definition must
  // say explicitly that the color-to-percentage equivalence varies by
  // region and producer, so the percentage (grado_proceso) stays the
  // comparable value and color is read as a label, never assumed to be a
  // fixed conversion.
  definition?: string;
}

export interface VariableCatalogDef {
  key: string;
  name: string;
  description?: string;
  values: readonly VariableCatalogValueDef[];
}

export const VARIABLE_CATALOGS: readonly VariableCatalogDef[] = [
  {
    key: "recipiente",
    name: "Recipiente",
    values: [
      { value: "Tanque I" },
      { value: "Tanque II" },
      { value: "Tanque III" },
      { value: "Cooler I" },
      { value: "Cooler II" },
      { value: "GrainProBag" },
    ],
  },
  {
    key: "levadura_cultivo",
    name: "Levadura / cultivo",
    values: [
      { value: "Sunrise Orange" },
      { value: "Deep Amber" },
      { value: "Cool Blue" },
      { value: "Green Origin" },
      { value: "MP72" },
      { value: "HDA54" },
      { value: "Spontaneous Wild", impliesUnknownIdentity: true },
    ],
  },
  {
    key: "metodo_inoculacion",
    name: "Método de inoculación",
    values: [{ value: "direct pitch" }, { value: "rehydrated" }, { value: "spontaneous" }],
  },
  {
    key: "grado_proceso",
    name: "Grado de proceso",
    values: [{ value: "Natural" }, { value: "Washed" }, { value: "Semi Wash 50%" }, { value: "Semi Wash 75%" }],
  },
  // RO1.1 (35_RO1.1_HONEY_PORCENTAJE_CANONICO.md) — a separate catalog, not
  // values inside grado_proceso and not aliased to any of them. The
  // canonical, comparable value for a honey-process treatment is the
  // percentage of mucílago retenido, recorded via grado_proceso; color is
  // the producer's own commercial label for the same batch, recorded
  // alongside it, never in its place and never as an aliasOfId pointing at
  // a percentage — the industry sources for that equivalence contradict
  // each other seriously (§1), so no fixed mapping is asserted. `gold` was
  // considered and dropped by product-owner decision; only these four.
  {
    key: "honey_color",
    name: "Color de honey (etiqueta del productor)",
    values: [
      {
        value: "black honey",
        definition:
          "Etiqueta comercial del productor, no una medición. Las fuentes de la industria reportan la equivalencia con % de mucílago retenido de forma contradictoria entre sí: 75%, 75–100%, 50–100%, y 65–100% según la fuente. En varias regiones el color resulta de la caramelización de azúcares durante el secado, no de la cantidad de mucílago retenido. El % medido (grado_proceso) es el dato comparable entre productores; este color no lo es.",
      },
      {
        value: "red honey",
        definition:
          "Etiqueta comercial del productor, no una medición. Según fuentes de la industria (Efico), lo que más diferencia red de black no es el % de mucílago retenido sino la cantidad de luz y el tiempo de secado — un eje distinto al que separa white de yellow. No asumas una equivalencia fija con % de mucílago. El % medido (grado_proceso) es el dato comparable entre productores; este color no lo es.",
      },
      {
        value: "yellow honey",
        definition:
          "Etiqueta comercial del productor, no una medición. Las fuentes reportan 25% y 25–35% de mucílago retenido, y al menos una fuente lo define al revés — por mucílago removido, no retenido — invirtiendo el sistema respecto a las demás. El % medido (grado_proceso), con su base explícita, es el dato comparable entre productores; este color no lo es.",
      },
      {
        value: "white honey",
        definition:
          "Etiqueta comercial del productor, no una medición. Las fuentes van de 10% de mucílago retenido hasta 80–90% removido, según la fuente. El % medido (grado_proceso) es el dato comparable entre productores; este color no lo es.",
      },
    ],
  },
  // §3b — "Estudio de cerezas" controlled vocab, product-owner-authored.
  // Brix, peso inicial, and densidad-as-decimal stay ordinary numeric
  // Measurement rows (MeasurementVariable already has "brix") — not
  // catalogs, since they're precise readings, not brackets, in the two
  // real recorded rows (17.53, 18.5).
  {
    key: "cereza_seleccion",
    name: "Selección",
    values: [
      { value: "uniforme_alta" },
      { value: "uniforme_media" },
      { value: "heterogenea_leve" },
      { value: "heterogenea_alta" },
      { value: "mezcla_no_controlada" },
    ],
  },
  {
    key: "cereza_flotado",
    name: "Flotado",
    values: [
      { value: "sin_flotadores" },
      { value: "<2%" },
      { value: "2_5%" },
      { value: "5_10%" },
      { value: "10_20%" },
      { value: "20_30%" },
      { value: ">30%" },
    ],
  },
  {
    key: "cereza_condicion_visual",
    name: "Condición visual",
    values: [{ value: "brillante" }, { value: "opaco" }, { value: "deshidratado" }],
  },
  {
    key: "cereza_limpieza",
    name: "Limpieza",
    values: [{ value: "limpio" }, { value: "leve_impureza" }, { value: "contaminado" }],
  },
  {
    key: "cereza_color",
    name: "Color",
    values: [
      { value: "verde" },
      { value: "verde_amarillo" },
      { value: "pinton" },
      { value: "rojo" },
      { value: "rojo_intenso" },
      { value: "sobremaduro" },
      { value: "sobremaduro_fermentado" },
    ],
  },
  {
    key: "cereza_firmeza",
    name: "Firmeza",
    values: [
      { value: "muy_firme" },
      { value: "firme" },
      { value: "medio" },
      { value: "blando" },
      { value: "muy_blando" },
      { value: "colapsado" },
    ],
  },
  {
    key: "cereza_densidad",
    name: "Densidad",
    values: [{ value: "alta" }, { value: "media_alta" }, { value: "media" }, { value: "media_baja" }, { value: "baja" }],
  },
  {
    key: "cereza_tamano_forma",
    name: "Tamaño / forma de grano",
    values: [{ value: "uniforme" }, { value: "mezcla_tamaños" }, { value: "pequeño" }, { value: "irregular" }],
  },
  {
    key: "cereza_defectos",
    name: "Defectos de grano",
    values: [{ value: "sano" }, { value: "brocado" }, { value: "vano" }, { value: "defectuoso" }],
  },
] as const;

// §3a — "Enums cerrados": small, product-owner-fixed vocabularies that
// genuinely aren't expected to grow. Not VariableCatalog rows — these
// become ProtocolVariable.enumValues directly at protocol-authoring time
// (frozen per ProtocolVersion), listed here only as the reference values a
// UI/script should offer, not as seeded DB rows.
export const CLOSED_ENUM_REFERENCE_VALUES = {
  fuente_de_agua: ["río", "quebrada", "pozo", "red"],
  posicion_de_masa: ["vertical", "horizontal"],
} as const;
