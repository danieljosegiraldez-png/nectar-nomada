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
    //
    // Parte 2a (2026-10-03/04): «added bare» deja de valer para los cuatro que no son `Natural`. Llevan la definición
    // que fijó el dueño, y la escala del mucílago es la de lo que QUEDA —0 = Lavado, 100 = Honey, y «Semi Wash 75 %» es
    // que le queda el 75 %— (Lavado, 2026-09-19; Honey, 2026-09-30; la escala, 2026-10-03, que corrige ADR-181 #12;
    // `docs/superpowers/specs/2026-09-30-recetas-del-beneficio-design.md`). No es una equivalencia de color a
    // porcentaje, que es lo que RO1.1 prohíbe: es la frontera entre Lavado, semi-lavado y Honey. Los procesos YA
    // registrados con los dos semi-lavados los lee Daniel, no esta definición.
    values: [
      { value: "Natural" },
      {
        value: "Washed",
        definition:
          "Lavado: el café llega a la cama de secado sin nada de mucílago —le queda el 0 %—. Si llega con mucílago es semi-lavado (Daniel, 2026-09-19; escala de lo que QUEDA, 2026-10-03).",
      },
      {
        value: "Semi Wash 50%",
        definition:
          "Semi-lavado: al llegar a la cama de secado le queda el 50 % del mucílago (Daniel, 2026-10-03). Es la escala de lo que QUEDA: ADR-181 #12 decía «quitado» y se corrigió el 2026-10-04; con el 50 % las dos lecturas coinciden.",
      },
      {
        value: "Semi Wash 75%",
        definition:
          "Semi-lavado: al llegar a la cama de secado le queda el 75 % del mucílago (Daniel, 2026-10-03). Es la escala de lo que QUEDA: ADR-181 #12 decía «quitado» y se corrigió el 2026-10-04, así que el 75 % de antes era que le quedaba el 25 %.",
      },
      {
        value: "Honey",
        definition:
          "Honey: 100 % del mucílago retenido —le queda el 100 %— a la cama de secado. Con menos es semi-lavado (Daniel, 2026-09-30; escala de lo que QUEDA, 2026-10-03).",
      },
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
      // Parte 2a (2026-10-03): el valor del eje D del paquete «farm-to-green v2» que faltaba y la 2a usa (el
      // paso `cold_hold` de CryoBloom). Al FINAL, para no mover el orden de los demás. «Mosto propio» y
      // «mosto de otro fermento» no entran: ya son `medio_lavado`, y un alias no cruza catálogos.
      {
        value: "bioproteccion",
        definition:
          "Levadura que coloniza la cereza sin fermentarla, durante la espera en frío (ADR-051, decisión 7; paquete farm-to-green v2, eje D: Metschnikowia pulcherrima, MP-72). La cepa se registra en Levadura/cultivo, donde están MP72 y HDA54.",
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
    // Parte 2a (2026-10-03, diseño §7): los estados del eje A del paquete «farm-to-green v2» que faltaban,
    // para que un paso diga cuánta fruta lleva la semilla. DETRÁS de los dos de siempre, porque la semilla
    // pone el orden por posición. El formulario de abrir proceso los ofrece también (registro de la 2a):
    // son estados válidos al abrir. El id del paquete va en cada definición. Cuánto mucílago LE QUEDA al café lo
    // dice el paso (`mucilagoObjetivo`), no el estado: la escala es la de lo que queda (Daniel, 2026-10-03).
    values: [
      { value: "entera", definition: "Cereza sin despulpar." },
      { value: "despulpada", definition: "Cereza sin la piel/pulpa exterior." },
      {
        value: "despulpada_con_mucilago",
        definition:
          "Sin piel, con todo el mucílago (paquete, eje A: depulped_mucilage_full). Secada así es Honey: le queda el 100 % del mucílago (Daniel, 2026-09-30).",
      },
      {
        value: "despulpada_mucilago_parcial",
        definition:
          "Sin piel, con parte del mucílago (paquete: depulped_mucilage_partial). Cuánto le queda lo dice el paso, en tramos de 0 a 100 —0 es Lavado y 100 es Honey (Daniel, 2026-10-03)—. Secada así es semi-lavado.",
      },
      {
        value: "sin_mucilago_por_fermentacion",
        definition:
          "El mucílago se degradó fermentando y después se lavó (paquete: depulped_mucilage_removed_fermentation). Si llega así a la cama de secado, sin nada de mucílago, el proceso es Lavado (Daniel, 2026-09-19).",
      },
      {
        value: "sin_mucilago_por_maquina",
        definition:
          "El mucílago se quitó con desmucilaginadora: Becolsub, Ecomill, Deslim, DELVA (paquete: depulped_mucilage_removed_mechanical). El «semi-washed» de Brasil que nombra el paquete es esto, no el semi-lavado de la casa.",
      },
      {
        value: "sin_mucilago_por_enzimas",
        definition:
          "El mucílago se quitó con pectinasa, que se declara como adición (paquete: depulped_mucilage_removed_enzymatic).",
      },
      {
        value: "pergamino_trillado_humedo",
        definition: "Pergamino trillado en húmedo, al 20–24 % de humedad (paquete: parchment_hulled_wet, giling basah).",
      },
      {
        value: "verde",
        definition: "Café verde, ya trillado: el estado de los pasos posteriores al verde (paquete: green).",
      },
    ],
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
      { value: "manejo_fitosanitario", definition: "Una intervención contra una plaga en la parcela. Lo que se hizo vive en PlotIntervention." },
      { value: "otro", definition: "Siempre acompañado de nota libre. La regla de F1 §1: una lista tipada siempre necesita dónde poner lo que no encaja." },
    ],
  },

  // Spec 2026-09-18 jornada y entrega §3.5 — lo variable del día que el recolector anota en su
  // jornada. Sin valor medido: los milímetros son la lectura de un instrumento instalado en el
  // sitio (spec de instrumentos de campo). Lo fijo del terreno no va aquí.
  {
    key: "condicion_del_dia",
    name: "Condición del día",
    description:
      "Lo que el recolector ve del tiempo en la parcela durante su jornada. Es una observación, no una medición: la cantidad la da un instrumento.",
    values: [
      { value: "lluvia" },
      { value: "neblina" },
      { value: "otro", definition: "Siempre acompañado de nota libre." },
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
        // Cuarto origen, declarado por el dueño el 2026-09-14: «todas las demás colmenas
        // de antes son origen San Francisco, Veraguas, Marcelino Guevara, apicultor».
        //
        // **OJO, y no se resuelve aquí:** `Santa Fe, Veraguas` está definido arriba como
        // «El pie original de Toabré», y el dueño dice que el origen de Toabré es
        // Marcelino, de **San Francisco**. Los dos son distritos de Veraguas, así que uno
        // de los dos está mal — y decidirlo cambia la procedencia de 15 colmenas. Se
        // señala en vez de corregirse: dos veces el dato estaba bien y la duda estaba mal.
        value: "San Francisco, Veraguas",
        definition:
          "Pie criado por Marcelino Guevara. Declarado por el dueño el 2026-09-14 como el origen de casi todos los apiarios — Toabré, Río Gatú, Lagartero y Los Palacios. Ver el aviso sobre «Santa Fe, Veraguas» en el código.",
      },
      {
        value: "desconocido",
        impliesUnknownIdentity: true,
        definition:
          "No se sabe de dónde vino. Valor legítimo y no un hueco a rellenar: una colonia instalada antes de que alguien llevara registro no tiene respuesta, y adivinarla la convertiría en un hecho (CLAUDE.md §3). Misma disciplina que «desconocido» en cultivar.",
      },
    ],
  },
  {
    // Por qué se perdió una colonia. Varias por pérdida — ver la cabecera de
    // `ColonyLossCause` en el esquema.
    //
    // NINGÚN VALOR ESTÁ INVENTADO. Cada uno viene de uno de tres sitios, y su
    // `definition` lo dice:
    //
    //   1. El estándar internacional de monitoreo de pérdidas: COLOSS y su
    //      versión latinoamericana de SOLATINA, **donde Panamá participa**.
    //      Clasifica toda pérdida en tres categorías —problema de reina
    //      irresoluble, desastre natural, colonia muerta o caja vacía— y la
    //      tercera engloba ausentamiento, enfermedad e intoxicación.
    //   2. `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.3, la lista de
    //      irregularidades que el dueño ya había documentado. De sus catorce
    //      banderas entran aquí las que son causa de PÉRDIDA; las que son
    //      señal de inspección y no causa —moho, alas deformadas, olor
    //      anormal, disentería, cría calva— se quedan allí. Son dos preguntas
    //      distintas y conviene que sigan siéndolo.
    //   3. Los casos que los propios documentos de la finca registran: la
    //      hipótesis de Toabré —un frente frío de enero coincidiendo con una
    //      poda que cortó la floración, `48_A9_ANEXO_C…` §4.2— y el aviso de
    //      enjambrazón de `…ANEXO_B` §2.2, «directamente relevante al
    //      ausentamiento de Toabré».
    //
    // LA CERTEZA NO VA EN EL NOMBRE. Se pensó en llamar a un valor
    // «intoxicación sospechada», como hace el cuestionario internacional, y
    // sería un error: dejaría sin nombre a la intoxicación confirmada y
    // obligaría a dos filas para el mismo hecho. La certeza vive en
    // `ColonyLossCause.provenanceClass`, que es obligatorio y no tiene valor
    // por defecto.
    //
    // Crece por semilla, no por migración: el día que aparezca una causa que
    // no está —y el dueño dijo que las habrá— es una línea aquí y un
    // `db:seed`.
    key: "causa_de_perdida_de_colonia",
    name: "Causa de pérdida de colonia",
    description:
      "Por qué dejó de existir una colonia. Admite varias a la vez: una caja vacía puede ser varroa y hambre, y elegir una de las dos falsearía el registro. Cada causa dice aparte cómo se estableció.",
    values: [
      {
        value: "Problema de reina irresoluble",
        definition:
          "Orfandad o postura deficiente sin arreglo. Es una de las tres categorías del estándar internacional (COLOSS/SOLATINA), y la que motiva el estado `combined`: la colonia está viva pero no es recuperable, así que se combina o se elimina.",
      },
      {
        value: "Obrera ponedora",
        definition:
          "Anexo B §2.3: «pérdida de reina consumada». Se distingue del problema de reina porque ya no tiene vuelta atrás y se reconoce en campo por la cría de zángano salteada.",
      },
      {
        value: "Enjambrazón",
        definition:
          "La colonia se dividió sola y se fue la mitad con la reina. Anexo B §2.2 la nombra como el aviso que se busca en las celdas reales, «directamente relevante al ausentamiento de Toabré».",
      },
      {
        value: "Hambre",
        definition:
          "Anexo B §2.3: «lo que el nivel de reservas anticipa». El cuestionario internacional la pregunta como sospecha, y aquí la sospecha se declara en `provenanceClass`, no en el nombre.",
      },
      {
        value: "Escasez de floración",
        definition:
          "Falta de néctar en el entorno, distinta de no haber alimentado. Es la hipótesis en pie de Toabré (`48_A9_ANEXO_C_TABLERO_Y_REPORTES.md` §4.2): un frente frío de enero coincidiendo con una poda que cortó la floración.",
      },
      {
        value: "Varroa",
        definition: "Anexo B §2.3: «la plaga que define el calendario de tratamiento».",
      },
      {
        value: "Polilla de la cera",
        definition: "Anexo B §2.3: «segunda causa de pérdida en caja debilitada».",
      },
      {
        value: "Pequeño escarabajo de la colmena",
        definition: "Anexo B §2.3: «presente en la región».",
      },
      {
        value: "Hormigas",
        definition:
          "Anexo B §2.3. Entraron a las cajas vacías de Toabré dos semanas después del ausentamiento, y registrarlo con fecha es lo que permitió DESCARTARLAS como causa — que es justo por qué el valor tiene que existir.",
      },
      {
        value: "Loque",
        definition: "Anexo B §2.3: «notificable». Su presencia obliga a avisar, no sólo a registrar.",
      },
      {
        value: "Saqueo",
        definition: "Anexo B §2.3: «explica una caja vacía sin ausentamiento». La distinción importa: el saqueo no es que la colonia se fuera.",
      },
      {
        value: "Intoxicación por agroquímicos",
        definition:
          "El cuestionario internacional la pregunta como «exposición tóxica sospechada»; en Panamá la literatura la asocia a la deriva de aplicaciones vecinas. La certeza va en `provenanceClass`.",
      },
      {
        value: "Desastre natural",
        definition:
          "Segunda categoría del estándar internacional: inundación, sequía, incendio, viento. Es la de menor tasa en todos los años medidos por SOLATINA, y aun así hace falta para que las otras no la absorban.",
      },
      {
        value: "Robo de colmenas",
        definition:
          "El estándar internacional lo mete dentro de «desastre natural». Aquí va aparte a propósito: no tiene nada de natural y lo que se hace al respecto es otra cosa.",
      },
      {
        value: "desconocido",
        impliesUnknownIdentity: true,
        definition:
          "No se sabe por qué se perdió. Valor legítimo y no un hueco a rellenar: una caja encontrada vacía meses después no tiene respuesta, y adivinarla la convertiría en un hecho (`CLAUDE.md` §3). Misma disciplina que «desconocido» en origen de colonia y en cultivar.",
      },
    ],
  },
  {
    // Lo que se VE en una inspección. Trece valores, y ninguno inventado: son
    // las banderas que el dueño ya tenía escritas en
    // `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.3, con su razón al lado.
    //
    // LA CATORCEAVA DE ESA LISTA NO ESTÁ AQUÍ, y es deliberado: «Otro | texto,
    // siempre disponible» no es un valor de catálogo, es
    // `Inspection.pestDiseaseFlags`, que se queda exactamente para eso.
    //
    // POR QUÉ NO ES EL CATÁLOGO DE CAUSAS DE PÉRDIDA. Lo que se observa no es
    // lo que mató a la colonia — `ADR-111` lo dejó escrito al construir aquél.
    // Cuatro de estos trece —moho, alas deformadas, olor anormal, disentería—
    // no son causa de pérdida y por eso no están allí; y «Enjambrazón»,
    // «Escasez de floración» o «Problema de reina irresoluble» son causas y no
    // están aquí. Se solapan, no coinciden.
    key: "irregularidad_de_inspeccion",
    name: "Irregularidad de inspección",
    description:
      "Lo que se vio al abrir la caja. Admite varias por inspección. Es el vocabulario que hace contable «todas las colonias con varroa esta temporada», que el Anexo B §2.3 nombra como el reporte que hace falta.",
    values: [
      { value: "Varroa", definition: "Anexo B §2.3: «la plaga que define el calendario de tratamiento»." },
      { value: "Polilla de la cera", definition: "Anexo B §2.3: «segunda causa de pérdida en caja debilitada»." },
      { value: "Pequeño escarabajo de la colmena", definition: "Anexo B §2.3: «presente en la región»." },
      {
        value: "Hormigas",
        definition:
          "Anexo B §2.3. Entraron a las cajas vacías de Toabré dos semanas después del ausentamiento, y registrarlo CON FECHA es lo que permitió descartarlas como causa — que es justo por qué el valor tiene que existir.",
      },
      { value: "Moho", definition: "Anexo B §2.3: «la condición que define Finca 1 frente a Finca 2»." },
      { value: "Cría calva", definition: "Anexo B §2.3, «cría calva / cría en perdigón»: patología de cría." },
      { value: "Loque", definition: "Anexo B §2.3: «notificable». Su presencia obliga a avisar, no sólo a registrar." },
      { value: "Alas deformadas", definition: "Anexo B §2.3: «virus asociado a varroa»." },
      { value: "Olor anormal", definition: "Anexo B §2.3: «primer indicio de loque»." },
      { value: "Disentería", definition: "Anexo B §2.3: «invernada o alimento fermentado»." },
      { value: "Obrera ponedora", definition: "Anexo B §2.3: «pérdida de reina consumada»." },
      { value: "Saqueo", definition: "Anexo B §2.3: «explica una caja vacía sin ausentamiento»." },
      { value: "Hambre", definition: "Anexo B §2.3: «lo que el nivel de reservas anticipa»." },
    ],
  },
  // Parte 1, R7 (Daniel, 2026-09-30): de bodega sólo se vuelve a secado por un defecto de humedad, y
  // el motivo sale de una lista para poder contar cuántas veces pasa y por qué.
  {
    key: "motivo_devolucion_a_secado",
    name: "Motivo de devolución a secado",
    description: "Por qué un lote volvió a secado desde bodega o desde la entrada a bodega. «otro» exige nota.",
    values: [
      { value: "humedad_alta_por_error_de_manejo", definition: "La humedad quedó por encima del objetivo por un error en el manejo del secado." },
      { value: "error_de_medicion", definition: "La medición con la que se cerró estaba mal tomada o el instrumento fallaba." },
      { value: "otro", definition: "Siempre con nota libre." },
    ],
  },
  // Parte 2a (2026-10-03, diseño §3 y §7): el vocabulario de la receta con pasos. Tres catálogos nuevos
  // porque no existe nada parecido; lo que ya existía se amplió arriba (`estado_cereza`,
  // `fuente_microbiana`), y el eje del secado es el enum `DryingEnvironment` de las instalaciones, no un
  // catálogo (registro de la 2a). Qué ejes aplican a cada tipo vive en `lib/recetas/vocabulario.ts`.
  //
  // `tipo_paso`: los 23 `step_types` del paquete «farm-to-green v2» (`processing_axes.json`, v2.0) EN SU
  // ORDEN y con sus ids de programa tal cual —como los de `DryingEnvironment`—, más `prefermentacion`,
  // que es de Daniel (D1). El rótulo es/en vive en `messages/*.json` (`Traceability.tipoPaso_<id>`). Las
  // definiciones salen de la tabla de mediciones por paso del paquete (R6 §7.2), de sus métodos (W03,
  // T02…) y de las definiciones de la casa (diseño §7); ninguna cifra es nuestra.
  {
    key: "tipo_paso",
    name: "Tipo de paso",
    description:
      "Qué hace un paso de una receta. Los 23 tipos del paquete farm-to-green v2, con sus ids, más la prefermentación (Daniel). Qué registro del lote cumple cada uno lo dice la tabla §4.1 de la Parte 2a.",
    values: [
      {
        value: "reception",
        definition:
          "Recepción de la cereza: masa, °Brix, mezcla de madurez, flotadores y temperatura al llegar (paquete, R6 §7.2). Ningún registro del proceso la cumple: se compara, al leer la ficha, con las recepciones del lote.",
      },
      {
        value: "sorting_flotation",
        definition:
          "Selección y flotación: flotadores retirados y agua usada (R6 §7.2). Con el proceso abierto se cumple como intervención de observación; la flotación con pesos es una selección y ocurre antes de abrir el proceso.",
      },
      {
        value: "sanitation",
        definition:
          "Sanitización o pretratamiento de la cereza: agente, concentración, tiempo de contacto y enjuague; ozono o UV opcional (R6 §7.2).",
      },
      {
        value: "cold_hold",
        definition:
          "Espera en frío de la cereza antes de fermentar: consigna de la cámara, temperatura del núcleo y duración (R6 §7.2). Es su propio paso para poder ir antes de cualquier fermentación (paquete, 06). Es el cold hold de CryoBloom.",
      },
      {
        value: "freezing",
        definition: "Congelar la cereza (paquete, T03). Se puede escribir en una receta; ningún registro lo cumple todavía.",
      },
      {
        value: "pulping",
        definition:
          "Despulpado: quitar la piel y la pulpa (R6 §7.2: calibre de la despulpadora, masa que entra y sale, mucílago que queda, agua).",
      },
      {
        value: "demucilage",
        definition:
          "Desmucilaginado: quitar el mucílago con máquina o con enzimas, sin fermentarlo (paquete, eje A). Con enzimas, la pectinasa se declara como adición. Cuánto mucílago le queda lo declara el paso, en tramos de 0 a 100 (2b §8.2).",
      },
      {
        value: "fermentation",
        definition:
          "Fermentación (R6 §7.2: temperatura de la masa y del ambiente, pH, °Brix, acidez, gases, presión). Láctico, málico y acético son resultados, no métodos: exigen datos medidos o se publican como perfil buscado (diseño §7).",
      },
      {
        value: "immersion_hot",
        definition:
          "Inmersión en agua caliente, parte de un choque térmico (paquete, T04): temperatura del agua, tiempo de contacto y proporción masa:agua (R6 §7.2).",
      },
      {
        value: "immersion_cold",
        definition: "Inmersión en agua fría, parte de un choque térmico (paquete, T04), o la bolsa sellada en el río (A07).",
      },
      {
        value: "inoculation",
        definition: "Inoculación: producto, lote, dosis, rehidratación y momento (R6 §7.2). La cepa sale del catálogo Levadura/cultivo.",
      },
      {
        value: "addition",
        definition: "Adición: sustancia, forma, cantidad y momento respecto al verde (R6 §7.2). Decide la divulgación (paquete, eje E).",
      },
      {
        value: "washing",
        definition:
          "Lavado: agua, ciclos, horas de remojo y temperatura del agua (R6 §7.2). Para que el proceso sea Lavado, el café llega a la cama de secado sin nada de mucílago —le queda el 0 %—; si llega con mucílago es semi-lavado (Daniel, 2026-09-19). Cuánto le queda lo declara el paso, en tramos de 0 a 100 (2b §8.2).",
      },
      {
        value: "soaking",
        definition: "Remojo bajo agua después de fermentar (paquete, W03: el doble proceso keniano).",
      },
      {
        value: "drying",
        definition: "Secado: humedad, aw, temperatura del grano y del aire, capa, volteos, luz y días (R6 §7.2).",
      },
      {
        value: "hulling_wet",
        definition: "Trillado en húmedo, al 20–24 % de humedad (paquete, WH01, giling basah). Ningún registro lo cumple todavía.",
      },
      {
        value: "reposo",
        definition:
          "Reposo después del secado: días, contenedor, registro de temperatura y humedad (R6 §7.2). Lo lee la Parte 2b desde la bodega.",
      },
      {
        value: "storage",
        definition: "Almacenamiento (R6 §7.2, junto al reposo). Lo lee la Parte 2b desde la bodega.",
      },
      {
        value: "aging",
        definition: "Añejado del café verde (paquete, X02). Posterior al verde: ningún registro lo cumple.",
      },
      {
        value: "monsooning",
        definition: "Monzonado del café verde (paquete, X01). Posterior al verde: ningún registro lo cumple.",
      },
      {
        value: "barrel_aging",
        definition: "Café verde en barrica (paquete, X03). Posterior al verde: ningún registro lo cumple.",
      },
      {
        value: "decaf",
        definition: "Descafeinado del café verde (paquete, D01–D08). Posterior al verde: ningún registro lo cumple.",
      },
      {
        value: "milling",
        definition: "Trilla hasta el café verde. Ningún registro de paso la cumple: la trilla ocurre con el proceso cerrado (diseño §4.4).",
      },
      {
        value: "prefermentacion",
        definition:
          "Fermentación ANTES de la principal, por intención (Daniel, D1, 2026-10-02); no es del paquete. Una es la fiebre: la cereza entera reposa, de horas a días, en sus sacos de cosecha sin sellar, y se calienta (Daniel, 2026-09-30).",
      },
    ],
  },
  // `fisico`: el eje F del paquete, SÓLO con lo que no existe en otro sitio. El frío va por
  // `manejo_temperatura`, y congelar y las inmersiones son tipos de paso (registro de la 2a).
  {
    key: "fisico",
    name: "Intervención física",
    description:
      "Lo físico que se le hace al café en un paso, fuera del frío (que es Manejo de temperatura) y de congelar o sumergir (que son tipos de paso).",
    values: [
      { value: "ninguno", definition: "Sin intervención física en el paso." },
      {
        value: "agitacion",
        definition:
          "Agitar o rotar la masa durante el paso (paquete: P04; A10, biorreactor agitado). Una agitación puntual dentro de una fermentación se registra además como intervención de tipo agitación.",
      },
      {
        value: "presion",
        definition: "Tanque presurizado: el paso trabaja con presión aplicada (paquete: P03). La presión del recipiente se mide como vessel_pressure.",
      },
      { value: "ultrasonido", definition: "Fermentación asistida por ultrasonido (paquete: P01)." },
      { value: "ozono_uv", definition: "Sanitización de la cereza con ozono o luz UV (paquete: P02, en el paso sanitation)." },
    ],
  },
  // `capacidad`: lo que un paso pide de un equipo o de una instalación, NUNCA el equipo (decisión de
  // Daniel, 2026-10-03). Son los campos que el paquete declara para un paso (`vessel_requirement`, 06 §5)
  // y los que usa su comprobación al planear (07 §4; R7 §5.3). La 2a lo guarda; comprobarlo al abrir el
  // proceso es de la 2c, y si la 2c necesita otro, se añade aquí con su fuente.
  {
    key: "capacidad",
    name: "Capacidad requerida",
    description:
      "Lo que un paso necesita de un equipo o de una instalación, nunca el equipo concreto (Daniel, 2026-10-03). La Parte 2a lo guarda; comprobar al abrir el proceso que el beneficio lo tiene es de la Parte 2c.",
    values: [
      {
        value: "sellable",
        definition:
          "El recipiente cierra hermético (paquete 06 §5, vessel_requirement.sealable). Lo exige un paso con CO₂ o gas inerte purgado (07 §4).",
      },
      {
        value: "valvula",
        definition:
          "Válvula de una vía o airlock: deja salir el gas sin dejar entrar aire (paquete R7 §5.3, pressure.one_way_valve; régimen de oxígeno sealed_valve).",
      },
      {
        value: "puertos_de_gas",
        definition: "Conexión para purgar con CO₂, N₂ o argón (paquete 06 §5, gas_ports). Lo exige un paso con CO₂ o gas inerte purgado (07 §4).",
      },
      {
        value: "control_temperatura",
        definition:
          "Mantener una consigna distinta del ambiente: chaqueta con enfriador o cámara fría (paquete 06 §5, thermal_control). Una consigna bajo el ambiente lo exige (07 §4).",
      },
      {
        value: "oscuridad",
        definition: "Excluir la luz (paquete 06 §5, light_exclusion). El secado en cuarto oscuro lo exige (07 §4).",
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
