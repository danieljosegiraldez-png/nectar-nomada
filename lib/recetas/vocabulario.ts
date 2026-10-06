/**
 * El vocabulario de la receta con pasos (Parte 2a, 2026-10-03). Puro: no importa nada ni toca la base, así
 * que lo leen por igual el servicio (tarea 3), la pantalla —también un componente cliente— y las pruebas
 * herméticas.
 *
 * - `TIPOS_DE_PASO`: los 23 `step_types` de `master_data/processing_axes.json` del paquete «farm-to-green v2» de
 *   Daniel, versionado en `docs/reference/farm-management/` (v2.0, 2026-10-02; sha256 c1e9c6c5…), en su orden y con sus ids tal cual, y al final `prefermentacion`,
 *   que no es del paquete sino de Daniel (D1). El catálogo `tipo_paso` de `lib/research/catalogs.ts` los
 *   declara con su definición, y su rótulo es/en es `Traceability.tipoPaso_<id>` en `messages/*.json`;
 *   `tests/recetas/vocabulario.test.ts` y `tests/arquitectura/tipos-de-paso-traducidos.test.ts` atan las tres.
 * - `TRAMOS_DE_MUCILAGO`: los seis tramos de mucílago que un paso declara, en lo que QUEDA (Daniel, 2026-10-03).
 * - `TIPOS_POR_REGISTRO`: qué tipos puede cumplir cada registro del lote (diseño §4.1).
 * - `FASE_DEL_TIPO`: la fase de una meta con paso (diseño §3.2).
 * - `EJES_POR_TIPO_DE_PASO`: qué ejes aplican a cada tipo. **Inferencia de la casa, no del paquete**: ver su
 *   comentario.
 */

export type TipoDePaso = "reception" | "sorting_flotation" | "sanitation" | "cold_hold" | "freezing" | "pulping" | "demucilage" | "fermentation" | "immersion_hot" | "immersion_cold" | "inoculation" | "addition" | "washing" | "soaking" | "drying" | "hulling_wet" | "reposo" | "storage" | "aging" | "monsooning" | "barrel_aging" | "decaf" | "milling" | "prefermentacion";

export const TIPOS_DE_PASO: readonly TipoDePaso[] = [
  "reception",
  "sorting_flotation",
  "sanitation",
  "cold_hold",
  "freezing",
  "pulping",
  "demucilage",
  "fermentation",
  "immersion_hot",
  "immersion_cold",
  "inoculation",
  "addition",
  "washing",
  "soaking",
  "drying",
  "hulling_wet",
  "reposo",
  "storage",
  "aging",
  "monsooning",
  "barrel_aging",
  "decaf",
  "milling",
  "prefermentacion",
];

/**
 * Los seis tramos de mucílago que un paso `washing` o `demucilage` puede declarar, en **lo que QUEDA** en el café al
 * terminar el paso (decisión de Daniel, 2026-10-03, que corrige ADR-181 #12): **0 = Lavado, 100 = Honey**, y
 * «Semi Wash 75 %» es que le queda el 75 %. Son los que se ven a ojo y al tacto: no hay un número libre. Es la misma lista
 * que el CHECK `process_recipe_step_mucilago_en_tramos` de la migración `receta_con_pasos` (tarea 1), y
 * `tests/recetas/vocabulario.test.ts` lee esa migración para comprobar que las dos dicen lo mismo.
 */
export const TRAMOS_DE_MUCILAGO = [0, 10, 25, 50, 75, 100] as const;

/**
 * Los ejes de un paso, cada uno con su columna en `ProcessRecipeStep` (tarea 1) y su vocabulario:
 * - `estadoFruto` → `estadoFrutoValueId`, catálogo `estado_cereza`;
 * - `mucilagoObjetivo` → la columna del mismo nombre (`Int`): cuánto mucílago QUEDA, en uno de los
 *   `TRAMOS_DE_MUCILAGO` (0 = Lavado, 100 = Honey; Daniel, 2026-10-03). El paquete lo llama
 *   `mucilage_retained_pct`: la misma dirección;
 * - `oxigeno` → `oxigenoValueId`, `condicion_oxigeno`;
 * - `temperatura` → `temperaturaValueId` (`manejo_temperatura`) y `temperaturaMinC`/`temperaturaMaxC`;
 * - `fuenteMicrobiana` → `fuenteMicrobianaValueId`, `fuente_microbiana`;
 * - `medio` → `medioValueId`, `medio_lavado`;
 * - `fisico` → `fisicoValueId`, `fisico`;
 * - `modoSecado` → `modoSecado`, el enum `DryingEnvironment` que ya usan las instalaciones;
 * - `adiciones` → las filas de `ProcessRecipeStepAddition`: la categoría de `sustrato_anadido`, o la cepa
 *   de `levadura_cultivo` en una inoculación (Daniel, 2026-10-03).
 */
export type EjeDelPaso = "estadoFruto" | "mucilagoObjetivo" | "oxigeno" | "temperatura" | "fuenteMicrobiana" | "medio" | "fisico" | "modoSecado" | "adiciones";

/**
 * Qué ejes aplican a cada tipo de paso: los que la pantalla enseña y los que el servicio acepta (tarea 3).
 *
 * **INFERENCIA DE LA CASA, NO DEL PAQUETE** (2026-10-03). El paquete no trae este mapa:
 * `processing_axes.json` lista los tipos (`step_types`) y los ejes (`axes`) sin relacionarlos, y su modelo
 * (06 §5) pone el vector entero A–F en TODO paso, que leído al pie de la letra no reduce nada. Cada fila
 * sale de la evidencia que sí trae, citada al lado:
 * - los 18 métodos de `processing_methods.json` codificados como secuencia de pasos (W03, W10, W11, N07,
 *   N10, H07, H11, WH01, A01, A02, A04, A06, A07, A08, C01, C02, T02, T04): 45 pasos, de los que sólo 11
 *   llevan su tipo explícito;
 * - los métodos de un solo vector cuando el método ES un tipo de paso (P02, T03, X01–X03, D01–D08…);
 * - la tabla de mediciones por paso del paquete (R6 §7.2), que dice qué se mira en cada uno.
 * Dos reglas de la casa encima: el frío, la congelación y las inmersiones NO van por `fisico` (el frío es
 * `temperatura`; congelar e inmersiones son tipos de paso — registro de la 2a), y `mucilagoObjetivo` sólo va en los dos
 * pasos que quitan mucílago, `washing` y `demucilage` (2b §8.2: es la ÚNICA fuente del tramo, y lo lee la comprobación del
 * último lavado antes de la cama), siempre junto a `estadoFruto`, porque en el paquete `mucilage_retained_pct` es un
 * campo de ese eje. Antes de la decisión de Daniel del 2026-10-03 (escala de lo que QUEDA) lo llevaban también `pulping`,
 * `fermentation` y `drying`: nadie lo lee ahí, y un tramo en un paso que no lava sería una segunda fuente.
 * Si Daniel corrige una fila, se cambia aquí y en su prueba; ninguna migración depende de esto.
 */
export const EJES_POR_TIPO_DE_PASO: Readonly<Record<TipoDePaso, readonly EjeDelPaso[]>> = {
  // R6 §7.2 mide masa, °Brix, madurez y flotadores; ningún método la codifica como paso. Lo que una receta
  // pide aquí son METAS (Brix, diseño §4.5), no ejes.
  reception: [],
  // R6 §7.2: flotadores retirados y agua usada. Ningún método la codifica.
  sorting_flotation: [],
  // P02: {"F": "ozone_uv", "step": "sanitation"}.
  sanitation: ["fisico"],
  // T02 (CryoBloom): A=whole_cherry, C=cold_hold_prefermentation con consigna, D=bioprotection (MP-72). Su
  // F=chilling es frío, que va por `temperatura`.
  cold_hold: ["estadoFruto", "temperatura", "fuenteMicrobiana"],
  // T03: A=whole_cherry, C=frozen. Su F=freezing es el propio tipo.
  freezing: ["estadoFruto", "temperatura"],
  // H11: {"step": "pulping", "A": "depulped_mucilage_full"}; R6 §7.2 mide el mucílago que queda, y eso lo dice el
  // estado del fruto con el que sale (`despulpada_con_mucilago`…), no un tramo.
  pulping: ["estadoFruto"],
  // W06: A=removed_mechanical; W08: A=removed_enzymatic y E=processing_aid (la pectinasa se declara). 2b §8.2: el tramo
  // de mucílago que QUEDA.
  demucilage: ["estadoFruto", "mucilagoObjetivo", "adiciones"],
  // Toda fermentación del paquete trae A–E (N07, W03, A01, C01…); H09 y H10 fermentan con parte del
  // mucílago, que dice `estadoFruto`; F=agitation, pressure o ultrasound en A10, P03, P04 y P01.
  fermentation: ["estadoFruto", "oxigeno", "temperatura", "fuenteMicrobiana", "fisico", "adiciones"],
  // T04: A=whole_cherry|depulped_mucilage_full, C=thermal_shock. Su F=hot_immersion es el propio tipo.
  immersion_hot: ["estadoFruto", "temperatura"],
  // T04, y A07 (la bolsa sellada en el río): B=sealed_valve, C=controlled_constant a 12 °C.
  immersion_cold: ["estadoFruto", "oxigeno", "temperatura"],
  // D con `inocula[]` (processing_axes.json, D_microbial_control). La cepa va como adición con cantidad.
  inoculation: ["fuenteMicrobiana", "adiciones"],
  // E con `additions[]` (processing_axes.json, E_substrate_additions).
  addition: ["adiciones"],
  // W11, WH01, A02 y C02 lo codifican sin ejes; R6 §7.2 mide agua, ciclos y remojo. El medio (agua limpia,
  // mosto propio, mosto de otro lote) es de la casa (ADR-053), no del paquete. El tramo de mucílago que QUEDA
  // dice si el café llega a la cama como Lavado (0) o como semi-lavado (2b §8.2); un 100 es Honey, que no se lava.
  washing: ["estadoFruto", "mucilagoObjetivo", "medio"],
  // W03: {"step": "soaking", "B": "submerged"}; el medio, como en el lavado.
  soaking: ["oxigeno", "medio"],
  // G con su régimen; A dice qué se seca (H07: A=depulped_mucilage_partial, G=raised_bed), y H01–H05 secan
  // con su porcentaje de mucílago, que dice `estadoFruto`, no un tramo.
  drying: ["estadoFruto", "modoSecado"],
  // WH01: {"step": "hulling_wet", "A": "parchment_hulled_wet"}.
  hulling_wet: ["estadoFruto"],
  // H=reposo y H=hermetic_storage: la 2a no guarda el eje H; los lee la 2b desde la bodega.
  reposo: [],
  storage: [],
  // X02, X01, D01–D08: A=green siempre (nada que elegir) más su eje H.
  aging: [],
  monsooning: [],
  // X03: E=«wood contact (post_green)»: la madera se declara como adición posterior al verde.
  barrel_aging: ["adiciones"],
  decaf: [],
  // Ningún método la codifica; A=green es su resultado.
  milling: [],
  // No es del paquete (D1). El paquete escribe una prefermentación como una fermentación antes del
  // despulpado (W10, A08: A=whole_cherry, B=sealed_valve) o como cold_hold (T02); la fiebre de la casa es
  // cereza entera en sacos sin sellar que se calienta (A, B y C), sin inóculo o con él (D).
  prefermentacion: ["estadoFruto", "oxigeno", "temperatura", "fuenteMicrobiana"],
};

/** Los cuatro registros del lote que cumplen un paso (diseño §4.1), con el nombre de su modelo. */
export type RegistroDePaso = "fermentationRun" | "dryingRun" | "lotProcessIntervention" | "fermentationIntervention";

/**
 * Qué tipos puede cumplir cada registro: la tabla §4.1 del diseño. Un registro con un paso de otro tipo se
 * rechaza `paso_no_corresponde` (tarea 7). `sorting_flotation` lo cumple una intervención de observación:
 * la flotación con pesos es una selección, y una selección no ocurre con el proceso abierto (registro de
 * la 2a). Los tipos que no salen aquí se pueden escribir en una receta y ningún registro los cumple
 * todavía (§4.6).
 */
export const TIPOS_POR_REGISTRO: Readonly<Record<RegistroDePaso, readonly TipoDePaso[]>> = {
  fermentationRun: ["fermentation", "prefermentacion", "cold_hold", "soaking", "immersion_hot", "immersion_cold"],
  dryingRun: ["drying"],
  lotProcessIntervention: ["pulping", "demucilage", "washing", "sorting_flotation", "sanitation", "inoculation", "addition"],
  // Sólo las de tipo `inoculation` o `addition` del enum `FermentationInterventionType`: lo que ocurre
  // dentro de una fermentación.
  fermentationIntervention: ["inoculation", "addition"],
};

/**
 * La fase de una meta con paso (§3.2): la de la corrida que cumple el tipo. Lo que cumple una
 * `FermentationRun` es `fermentation`; el secado, `drying`; el resto (lavado, despulpado…) no tiene fase y
 * su meta la lleva nula.
 */
export const FASE_DEL_TIPO: Readonly<Partial<Record<TipoDePaso, "fermentation" | "drying">>> = {
  fermentation: "fermentation",
  prefermentacion: "fermentation",
  cold_hold: "fermentation",
  soaking: "fermentation",
  immersion_hot: "fermentation",
  immersion_cold: "fermentation",
  drying: "drying",
};
