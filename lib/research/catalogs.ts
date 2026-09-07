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
  // P1 (42_P1_LAND_FOUNDATION.md §2) — the canonical value this one is an
  // alias of, by `value` string within the same catalog. Resolved in a second
  // seeding pass, since the canonical row must exist first. One level only:
  // an alias points directly at a canonical row and never chains, matching
  // resolveCatalogValue's single hop (lib/research/protocols.ts).
  aliasOf?: string;
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
    // RO1.2 (36_RO1.2_METODOS_FERMENTACION.md §1) — "Flujo de proceso" is
    // this same axis, not a new catalog (see the RO1.2 comment block
    // below). "Honey" was missing entirely until this ticket; added bare,
    // without a baked-in percentage, matching how "Natural"/"Washed" carry
    // none either — NOT the same thing as inventing a color-to-percentage
    // equivalence (RO1.1/ADR-052's actual rule). A specific "Honey NN%"
    // value gets added, same insert-extensible mechanism, only once a real
    // batch's measured percentage justifies it — never guessed ahead of
    // that, same discipline as everywhere else in this catalog.
    values: [
      { value: "Natural" },
      { value: "Washed" },
      { value: "Semi Wash 50%" },
      { value: "Semi Wash 75%" },
      { value: "Honey" },
    ],
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

  // RO1.2 (36_RO1.2_METODOS_FERMENTACION.md §1). Six of the ticket's seven
  // "orthogonal dimensions" — independent axes a treatment selects one
  // value from each of, via the existing ProtocolVariable(catalog-typed)
  // + TreatmentBatchVariableValue mechanism (§3a). No new schema: this IS
  // the mechanism §3a already built for exactly this shape of question.
  //
  // The seventh dimension, "Flujo de proceso" (natural/honey/lavado/
  // semi-lavado), is deliberately NOT a new catalog here — it's the same
  // axis `grado_proceso` (above) already models: Natural/Washed/Semi Wash
  // 50%/Semi Wash 75%. Adding a duplicate catalog under a new name would
  // recreate what CLAUDE.md §2 already forbids ("the same X must not be
  // recreated unnecessarily"). Honey-specific values (with their measured
  // %, per ADR-052 — percentage is canonical, color is a separate label)
  // aren't pre-populated here: RO1.1 already established that inventing a
  // percentage without real product-owner data is exactly the fabrication
  // this platform's provenance discipline forbids. They get added as real
  // honey-process batches are recorded, same insert-extensible mechanism
  // as every other catalog value.
  {
    key: "condicion_oxigeno",
    name: "Condición de oxígeno",
    values: [
      {
        value: "abierto_aerobico",
        definition: "Fermentación con oxígeno disponible, sin sellado ni restricción de aire.",
      },
      {
        value: "anaerobico",
        definition:
          "Fermentación con oxígeno restringido en recipiente sellado. Puede ser con cereza entera o despulpada, y combinarse con cualquier flujo de proceso. No es lo mismo que maceración carbónica ni un alias suyo: anaeróbico no exige CO₂ ni cereza entera — maceración carbónica es un subconjunto específico con ambos requisitos. El mercado a veces los usa indistintamente; este catálogo los mantiene separados a propósito (§4).",
      },
      {
        value: "maceracion_carbonica",
        definition:
          "Cereza entera en tanque sellado saturado con CO₂; la fermentación ocurre dentro de cada cereza, no en la masa circundante. Es un subconjunto específico de anaeróbico, no equivalente ni intercambiable: exige CO₂ (purgado o medido) y cereza entera, que anaeróbico no exige por sí solo. No aliasear con anaerobico (§4).",
      },
      {
        value: "anoxico",
        definition:
          "Sin oxígeno y sin CO₂ — cámara sellada con purga de gas inerte. Distinto de anaeróbico: anaeróbico no excluye el CO₂ que la propia fermentación genera; anóxico lo purga activamente.",
      },
    ],
  },
  {
    key: "manejo_temperatura",
    name: "Manejo de temperatura",
    values: [
      { value: "ambiente", definition: "Sin manejo activo de temperatura; el ambiente del lugar de fermentación." },
      {
        value: "cold_hold_prefermentativo",
        definition:
          "Cereza entera enfriada antes de cualquier fermentación, para retrasar actividad microbiana. Protocolo CryoBloom.",
      },
      {
        value: "fermentacion_fria",
        definition:
          "Fermentación sostenida a temperatura reducida durante todo el proceso, distinta de un enfriamiento puntual.",
      },
      {
        value: "choque_termico",
        definition:
          "Ciclos rápidos de temperatura durante o después de la fermentación, para arrestar actividad microbiana en un punto preciso. Puede repetirse en varios ciclos.",
      },
      {
        value: "choque_en_frio",
        definition:
          "Descenso brusco de temperatura una sola vez, distinto del cold hold sostenido y de los ciclos repetidos del choque térmico.",
      },
    ],
  },
  {
    key: "fuente_microbiana",
    name: "Fuente microbiana",
    values: [
      {
        value: "espontanea",
        definition: "Sin inoculación deliberada; los microorganismos presentes de forma natural en la cereza y el ambiente.",
      },
      {
        value: "levadura_inoculada",
        definition:
          "Levadura comercial o cultivo añadido deliberadamente. La cepa específica se registra en el catálogo Levadura/cultivo.",
      },
      { value: "bacterias_lab", definition: "Bacterias ácido-lácticas añadidas o favorecidas deliberadamente." },
      { value: "koji", definition: "Aspergillus oryzae, usado para sacarificación (ver 23_ §5a)." },
      {
        value: "cultivo_mixto",
        definition: "Combinación deliberada de más de una fuente microbiana en el mismo tratamiento.",
      },
    ],
  },
  {
    key: "sustrato_anadido",
    name: "Sustrato añadido",
    values: [
      { value: "ninguno", definition: "Sin ingrediente añadido durante la fermentación." },
      {
        value: "co_fermentacion",
        definition:
          "Fruta, especias u otro ingrediente añadido durante la fermentación. Qué se añadió y cuánto se registra aparte, nunca oculto — la divulgación importa, los estándares de declaración varían por productor y mercado.",
      },
      {
        value: "doble_mosto",
        definition:
          "Reuso de mosto de una fermentación previa. De qué lote vino se registra vía Medio de lavado (mosto_de_otro_lote) cuando ese mosto también se usa como medio; si además hubo inoculación con él, ambos ejes se marcan.",
      },
    ],
  },
  {
    key: "estado_cereza",
    name: "Estado de la cereza",
    values: [{ value: "entera", definition: "Cereza sin despulpar." }, { value: "despulpada", definition: "Cereza sin la piel/pulpa exterior." }],
  },
  // §1a. Selected via ProcessingStage.washMediumCatalogValueId. Water rinses
  // and dilutes; mosto keeps the microbial load and the compounds already
  // developed — not a variant of "lavado," its own dimension.
  {
    key: "medio_lavado",
    name: "Medio de lavado",
    values: [
      {
        value: "agua_limpia",
        definition: "Agua sin carga microbiana ni compuestos de fermentación previa. Arrastra y diluye.",
      },
      {
        value: "mosto_propio",
        definition:
          "Mosto del mismo lote. Mantiene el lote cerrado sobre sí mismo — la carga microbiana y los compuestos ya desarrollados vienen del propio proceso.",
      },
      {
        value: "mosto_de_otro_lote",
        definition:
          "Mosto de un lote distinto o de una fermentación previa. Introduce material externo — más cercano a inocular que a lavar (PE-106/PE-107, \"Doble Mosto Guacho\"). El lote de origen se registra en ProcessingStage.washMediumSourceLotId, nunca solo en este valor de catálogo.",
      },
      {
        value: "ninguno_natural",
        definition: "Sin lavado — proceso natural; la cereza no pasa por medio líquido de lavado.",
      },
    ],
  },

  // P1 (42_P1_LAND_FOUNDATION.md §2). The first catalog here that is not a
  // *process* vocabulary — the other twenty all describe how coffee was
  // treated, this one describes what was planted.
  //
  // A VariableCatalog rather than Species/Cultivar tables: DOMAIN_MODEL.md §4
  // specifies that taxonomy, F1 and RO1 each declined to build it, and this
  // declines it a third time for the same reason. What is actually needed is
  // controlled values with aliases and definitions, which this mechanism
  // already provides.
  //
  // Aliases matter more here than anywhere else: "Catuaí" / "Catuai" /
  // "Catuaí Rojo" are the same plant written three ways, and resolving them
  // to one canonical row is the difference between "cultivar performance
  // across seasons" being answerable or not. The alias preserves what someone
  // actually typed instead of overwriting it.
  //
  // Deliberately NOT exhaustive. This seeds what the farms actually grow plus
  // the varieties already named in the repository; adding one later is an
  // entry here and a re-seed, never a migration (RO1 §9.3).
  // P3 (44_P3_SELECTION.md §2). How cherry was sorted. Free-standing from the
  // `cereza_seleccion`/`cereza_flotado` observation catalogs, which stay valid
  // and complementary: those record what was *seen* ("5-10% flotadores"), this
  // records what was *done* and produces material with weights behind it.
  {
    key: "seleccion_metodo",
    name: "Método de selección",
    description:
      "Cómo se separó la cereza. El resultado — aceptado y rechazos con peso — se registra como LotTransformation de tipo `selection`, no acá.",
    values: [
      { value: "flotacion", definition: "Separación por densidad en agua. El rechazo típico son flotadores." },
      { value: "manual", definition: "Selección a mano, en mesa o tolva." },
      { value: "madurez", definition: "Por grado de maduración — verde, pinton, maduro, sobremaduro." },
      { value: "densidad", definition: "Por densidad en seco, no en agua (mesa densimétrica)." },
      { value: "color" },
      { value: "optica", definition: "Clasificadora óptica automática." },
      { value: "tamano", definition: "Por tamaño o criba." },
      { value: "defectos", definition: "Retirando defectos identificados uno a uno." },
      { value: "otro", definition: "Siempre con nota libre — la regla de F1 §1." },
    ],
  },

  // P3 §3. Por qué se rechazó un lote. Vive en Lot.rejectionCategoryValueId,
  // no en lotType: un lote de flotadores sigue siendo cereza físicamente, y
  // mezclar etapa con calidad haría que lotType significara dos cosas.
  //
  // Un rechazo NO es necesariamente merma (audit §18). Un lote rechazado
  // puede almacenarse, venderse (`sale`), compostarse (`disposal`) o volver a
  // procesarse — todo eso ya funciona porque es un Lot de verdad.
  {
    key: "rechazo_categoria",
    name: "Categoría de rechazo",
    description:
      "Por qué se separó este material. Presente solo en lotes que son una corriente de rechazo; ausente en un lote ordinario.",
    values: [
      { value: "flotadores", definition: "Cereza que flota — grano vano, broca, sobremadura. Frecuentemente vendible como comercial." },
      { value: "cereza_verde" },
      { value: "sobremadura" },
      { value: "cereza_seca", definition: "Cereza pasada o secada en el árbol." },
      { value: "danada", definition: "Daño mecánico o por manipulación." },
      { value: "broca", definition: "Daño por Hypothenemus hampei." },
      { value: "moho" },
      { value: "materia_extrana", definition: "Hojas, ramas, piedras — no es café." },
      { value: "pergamino_defectuoso", definition: "Rechazo en etapa de pergamino, no de cereza." },
      { value: "otro", definition: "Siempre con nota libre." },
    ],
  },

  // P2 (43_P2_OPERATOR_CORE.md §4). What an operator did at a moment during a
  // field session. A catalog rather than an enum because this list will keep
  // growing as real field work reveals what people actually record — and P1
  // already established that a growing vocabulary is an entry here plus a
  // re-seed, never a migration.
  //
  // These are *kinds of moment*, not domain records. The row holding what
  // actually happened (a Measurement, a QuantityEvent, an Asset) hangs off
  // FieldEvent's nullable FKs; this only says what sort of thing it was, so a
  // timeline reads sensibly even where no domain row is attached.
  {
    key: "event_kind",
    name: "Tipo de evento de campo",
    description:
      "Qué hizo un operario en un momento dado durante una sesión de campo. No sustituye al registro de dominio (Measurement, QuantityEvent, Asset) — lo etiqueta.",
    values: [
      { value: "observacion", definition: "Algo notado y anotado, sin medición ni muestra asociada." },
      { value: "medicion", definition: "Una lectura numérica — pH, Brix, temperatura, humedad. El valor vive en Measurement." },
      { value: "foto" },
      { value: "video" },
      { value: "nota_de_voz" },
      { value: "punto_gps", definition: "Una posición registrada por sí misma, sin otro contenido." },
      { value: "recoleccion_muestra" },
      { value: "pesaje", definition: "Material pesado. La cantidad vive en QuantityEvent, nunca solo acá." },
      { value: "tarea_completada" },
      { value: "incidencia", definition: "Algo que salió mal o requiere atención — plaga, daño, equipo averiado." },
      { value: "movimiento_material", definition: "Material que cambió de lugar o de estado. El linaje vive en LotTransformation." },
      { value: "otro", definition: "Siempre acompañado de nota libre. La regla de F1 §1: una lista tipada siempre necesita dónde poner lo que no encaja." },
    ],
  },

  {
    key: "cultivar",
    name: "Cultivar",
    description:
      "Variedad de café sembrada. Vocabulario controlado con alias — no una taxonomía Species/Cultivar, que sigue especificada y sin construir (DOMAIN_MODEL.md §4).",
    values: [
      { value: "Caturra" },
      { value: "Catuaí" },
      { value: "Catuai", aliasOf: "Catuaí" },
      { value: "Castillo" },
      { value: "Geisha" },
      { value: "Gesha", aliasOf: "Geisha" },
      { value: "Pink Bourbon" },
      { value: "Bourbon" },
      { value: "Typica" },
      { value: "Típica", aliasOf: "Typica" },
      {
        value: "desconocido",
        impliesUnknownIdentity: true,
        definition:
          "La variedad no se conoce. Valor legítimo, no un hueco a rellenar — un lote sembrado antes de que alguien llevara registro suele no tener respuesta, y adivinarla la convertiría en un hecho (CLAUDE.md §3). Exige dataQuality, igual que 'Spontaneous Wild' en fuente_microbiana.",
      },
    ],
  },
  {
    // A9.10 (D6) — de dónde vino el pie de una colonia, agrupable.
    //
    // `Colony.originType` YA era un enum y YA agrupaba: comprada, capturada,
    // división, otro. Lo que NO agrupa es `originNote`, que es texto libre, y
    // por eso «compará Parita contra Santa Fe» no era una consulta sino leer
    // prosa. Eso es lo que D6 pide; la fila del ticket nombraba la columna
    // equivocada y queda corregida en el informe.
    //
    // Los dos valores son del dueño, no inventados: el pie original de Toabré
    // viene de Santa Fe, Veraguas, y los tres núcleos instalados en septiembre
    // de Parita, Chitré (`48_A9_CAPTURA_DE_CAMPO_PROMPT.md:199`,
    // `protocolos/apiario-campo-v1.json:109`). Los otros tres apiarios NO se
    // rellenan aquí: el prompt lo prohíbe en su línea 395.
    //
    // Crece por semilla, no por migración (precedente P1): el día que entre un
    // cuarto origen es una línea aquí y un `db:seed`.
    key: "origen_de_colonia",
    name: "Origen de la colonia",
    description:
      "Procedencia del pie de una colonia. Es el HECHO del origen, no la mecánica de la división: la genealogía sigue [DEFERRED] (DOMAIN_MODEL.md:205) y esto no la reabre — es una FK, no un grafo.",
    values: [
      { value: "Santa Fe, Veraguas", definition: "El pie original de Toabré." },
      {
        value: "Parita, Chitré",
        definition: "Los tres núcleos instalados en septiembre de 2026, que abrieron la comparación.",
      },
      {
        value: "desconocido",
        impliesUnknownIdentity: true,
        definition:
          "No se sabe de dónde vino. Valor legítimo y no un hueco a rellenar: una colonia instalada antes de que alguien llevara registro no tiene respuesta, y adivinarla la convertiría en un hecho (CLAUDE.md §3). Misma disciplina que «desconocido» en cultivar.",
      },
    ],
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
