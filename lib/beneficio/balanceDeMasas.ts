/**
 * ¿Cuadra lo que entró con lo que salió? — y **en qué etapa**.
 *
 * **El error estructural de la v2.0 era sumar dos dominios distintos.**
 * `BiomassYieldProcessor` exigía que **una sola** ecuación cuadrara contra el
 * peso de cereza fresca, y metía `pulp_kg` dentro. La pulpa no es una fracción
 * de cereza que se apartó junto a los verdes: **es el 38–45 % de la masa de las
 * cerezas maduras que ya se contaron** en `prime_ripe`. Sumarla las cuenta dos
 * veces.
 *
 * Lo que eso producía, y es lo peor que hace un validador:
 *
 * > Un registro **físicamente correcto falla**. Para que pase, el operador tiene
 * > que subdeclarar `prime_ripe` — y `prime_ripe` es el numerador del índice de
 * > pureza. **El índice acababa midiendo cuánto tuvo que mentir el operador
 * > para que el software lo dejara guardar.**
 *
 * ## Tres ecuaciones encadenadas y separadas
 *
 * ```
 * A · selección   total_cherry = prime_ripe + semi_ripe + underripe + overripe
 *                              + floaters + foreign_matter + sorting_loss
 * B · despulpado  depulped_input = depulped_in_mucilage + pulp + process_loss
 * C · lavado      depulped_in_mucilage = wet_parchment + mucilage_washout + wash_loss
 * ```
 *
 * **Cada etapa calcula su tolerancia sobre el insumo de SU etapa**, y
 * `purity_index` sale **sólo** de categorías de la A.
 *
 * **Y «despulpado en baba» NO es «pergamino lavado».** El primero es el grano
 * con su mucílago todavía pegado, 55–62 % de la cereza despulpada; el segundo
 * aparece sólo tras la Etapa C y es 40–46 % de la cereza. Compararlos produce
 * `YIELD_IMPLAUSIBLE` en lotes perfectamente normales — y el propio documento
 * admite que su autor confundió los dos al redactar la primera versión.
 *
 * ## Un desbalance de campo NUNCA lanza
 *
 * La v2.0 hacía `raise ValueError` y **descartaba la captura completa**. En un
 * beneficio, a las cinco de la mañana y bajo lluvia, eso significa que el dato
 * no se registra nunca. Registrar con la discrepancia marcada preserva la
 * trazabilidad; rechazar la destruye.
 *
 * Las excepciones se reservan para **violaciones de esquema** —clave
 * desconocida, masa negativa, total no positivo, `prime_ripe` ausente—, que son
 * errores de programación o de integración, no condiciones de campo.
 */

const REL = 0.005;

export class SchemaError extends Error {}

export type Severity = "INFO" | "WARNING" | "CRITICAL";

/**
 * **Los umbrales de conservación, parametrizados.** La v2.0 usaba `0.05 kg`
 * fijos: sobre 5.000 kg eso exige 0,001 % de precisión —inalcanzable con báscula
 * de plataforma— y sobre una muestra de 2 kg es holgadísimo. Peor: **la
 * conservación perfecta es físicamente falsa**, porque la cereza absorbe agua en
 * el canal de flote y pierde masa por escurrido.
 */
export interface BalancePolicy {
  readonly relativeTolerance: number;
  /** Piso para microlotes: 0,5 % de 20 kg son 100 g, y eso no lo da una báscula de campo. */
  readonly absoluteFloorKg: number;
  readonly grossThreshold: number;
  /** Por encima de esta pureza el lote se propone como especialidad. */
  readonly qualityTarget: number;
}

export const POLITICA_POR_DEFECTO: BalancePolicy = {
  relativeTolerance: REL,
  absoluteFloorKg: 0.5,
  grossThreshold: 0.05,
  qualityTarget: 0.8,
};

export const CATEGORIAS_A = [
  "prime_ripe",
  "semi_ripe",
  "underripe",
  "overripe",
  "floaters",
  "foreign_matter",
  "sorting_loss",
] as const;
export type CategoriaA = (typeof CATEGORIAS_A)[number];

export type WeighingCondition = "DRAINED" | "WET" | "DRY";
export type BalanceStatus = "BALANCED" | "DISCREPANCY_FLAGGED" | "GROSS_IMBALANCE";
export type LotTier = "PREMIUM_SPECIALTY" | "COMMERCIAL_VOLUME";

/**
 * A dónde va cada corriente. **Enums, no prosa.** La v2.0 devolvía frases en
 * español dentro del manifiesto, lo que las vuelve inservibles como
 * identificador aguas abajo y rompe la regla de i18n.
 */
export type RoutingTarget =
  | "SPECIALTY_FERMENTATION"
  | "NATURAL_PATIO_COMMERCIAL"
  | "DRY_PASILLA_LINE"
  | "ANAEROBIC_SHORT_FERMENTATION"
  | "MECHANICAL_DEMUCILAGE"
  | "CASCARA_OR_COMPOST";

const RUTAS: Readonly<Record<CategoriaA, RoutingTarget>> = {
  prime_ripe: "SPECIALTY_FERMENTATION",
  floaters: "NATURAL_PATIO_COMMERCIAL",
  underripe: "DRY_PASILLA_LINE",
  overripe: "ANAEROBIC_SHORT_FERMENTATION",
  semi_ripe: "MECHANICAL_DEMUCILAGE",
  foreign_matter: "CASCARA_OR_COMPOST",
  sorting_loss: "CASCARA_OR_COMPOST",
};

interface Veredicto {
  readonly status: BalanceStatus;
  readonly severity: Severity;
  readonly alertKey: string | null;
  readonly discrepancyKg: number;
  readonly discrepancyPct: number;
  readonly toleranceKg: number;
  /** **Siempre `true`**: un dato de campo no se descarta nunca. */
  readonly persistable: boolean;
  /** Sólo en `GROSS_IMBALANCE`: se guarda como borrador y no deja avanzar de etapa. */
  readonly blocksTransition: boolean;
}

export interface IntakeAssessment extends Veredicto {
  readonly totalCherryKg: number;
  readonly purityIndex: number;
  /** Una **propuesta**, no una clasificación aplicada. Ver la nota de §32 abajo. */
  readonly lotTier: LotTier;
  readonly routingManifest: Readonly<Partial<Record<CategoriaA, RoutingTarget>>>;
  readonly warnings: readonly string[];
}

export interface DepulpAssessment extends Veredicto {
  readonly depulpedInputKg: number;
  readonly pulpYieldPct: number;
  readonly depulpedYieldPct: number;
  /**
   * Lo que el sistema **propone abrir**, no lo que crea. §32 prohíbe que una
   * capa automática dé de alta una entidad que nadie declaró: esto viaja hasta
   * la pantalla, que pregunta.
   */
  readonly cascaraBatchPropuesto: { readonly parentLotId: string } | null;
  readonly flags: readonly string[];
  readonly warnings: readonly string[];
}

export interface WashAssessment extends Veredicto {
  readonly depulpedInMucilageKg: number;
  readonly parchmentYieldPct: number;
  readonly warnings: readonly string[];
}

const redondear = (x: number, n = 4): number => Math.round(x * 10 ** n) / 10 ** n;

/** La misma fórmula en las tres etapas, sobre el insumo de cada una. */
function juzgar(insumo: number, declarado: number, p: BalancePolicy): Veredicto {
  const discrepancia = redondear(declarado - insumo);
  const tolerancia = redondear(Math.max(insumo * p.relativeTolerance, p.absoluteFloorKg));
  const bruto = insumo * p.grossThreshold;
  const abs = Math.abs(discrepancia);

  const status: BalanceStatus =
    abs <= tolerancia ? "BALANCED" : abs <= bruto ? "DISCREPANCY_FLAGGED" : "GROSS_IMBALANCE";

  return {
    status,
    severity: status === "BALANCED" ? "INFO" : status === "DISCREPANCY_FLAGGED" ? "WARNING" : "CRITICAL",
    alertKey:
      status === "BALANCED"
        ? null
        : status === "DISCREPANCY_FLAGGED"
          ? "alert.balance.discrepancy_flagged"
          : "alert.balance.gross_imbalance",
    discrepancyKg: discrepancia,
    discrepancyPct: redondear((discrepancia / insumo) * 100),
    toleranceKg: tolerancia,
    persistable: true,
    blocksTransition: status === "GROSS_IMBALANCE",
  };
}

/**
 * Rangos de rendimiento de industria, todos `[PROVISIONAL]`.
 *
 * **El balance sólo prueba que los números suman, no que sean ciertos.** Una
 * báscula descalibrada o una unidad mal digitada dan un balance cuadrado y un
 * rendimiento imposible. Por eso es `WARNING` y no error: casi siempre es el
 * instrumento, no una anomalía agronómica.
 */
const RENDIMIENTOS = {
  pulpa: [38, 45],
  despulpadoEnBaba: [55, 62],
  pergaminoHumedo: [40, 46],
} as const;

const fuera = (v: number, [lo, hi]: readonly [number, number]) => v < lo || v > hi;

/** Etapa A — selección de cereza entera. `pulp` **nunca** entra aquí. */
export function validarSeleccion(input: {
  totalCherryKg: number;
  distribucion: Partial<Record<string, number>>;
  policy?: BalancePolicy;
}): IntakeAssessment {
  const p = input.policy ?? POLITICA_POR_DEFECTO;
  const d = input.distribucion;

  // --- Esquema: AQUÍ sí se lanza -----------------------------------------
  const desconocidas = Object.keys(d).filter((k) => !(CATEGORIAS_A as readonly string[]).includes(k));
  if (desconocidas.length > 0) {
    throw new SchemaError(`categorías de Etapa A desconocidas: ${desconocidas.join(", ")}`);
  }
  if (Object.values(d).some((v) => (v ?? 0) < 0)) throw new SchemaError("masa negativa");
  if (!(input.totalCherryKg > 0)) throw new SchemaError("total_cherry_kg debe ser positivo");
  // La v2.0 usaba `.get("prime_ripe_kg", 0.0)`: devolvía pureza 0 y etiquetaba
  // COMMERCIAL_VOLUME un lote que podía ser premium, sin un solo error visible.
  // Un campo que alimenta un índice de calidad no admite valor por defecto.
  if (d["prime_ripe"] === undefined) {
    throw new SchemaError("prime_ripe es obligatorio, no admite valor por defecto");
  }

  const declarado = Object.values(d).reduce<number>((s, v) => s + (v ?? 0), 0);
  const veredicto = juzgar(input.totalCherryKg, declarado, p);
  const pureza = redondear(d["prime_ripe"]! / input.totalCherryKg);

  const manifiesto: Partial<Record<CategoriaA, RoutingTarget>> = {};
  for (const c of CATEGORIAS_A) if ((d[c] ?? 0) > 0) manifiesto[c] = RUTAS[c];

  return {
    ...veredicto,
    totalCherryKg: input.totalCherryKg,
    purityIndex: pureza,
    lotTier: pureza >= p.qualityTarget ? "PREMIUM_SPECIALTY" : "COMMERCIAL_VOLUME",
    routingManifest: manifiesto,
    warnings: [],
  };
}

/** Etapa B — despulpado. Transforma un subconjunto de la A; no la re-suma. */
export function validarDespulpado(input: {
  depulpedInputKg: number;
  depulpedInMucilageKg: number;
  pulpKg: number;
  processLossKg: number;
  lotId: string;
  weighingCondition: WeighingCondition;
  upstreamWeighingCondition: WeighingCondition;
  policy?: BalancePolicy;
}): DepulpAssessment {
  const p = input.policy ?? POLITICA_POR_DEFECTO;
  if (!(input.depulpedInputKg > 0)) throw new SchemaError("depulped_input_kg debe ser positivo");
  for (const [k, v] of Object.entries({
    depulped_in_mucilage: input.depulpedInMucilageKg,
    pulp: input.pulpKg,
    process_loss: input.processLossKg,
  })) {
    if (v < 0) throw new SchemaError(`masa negativa en ${k}`);
  }

  const declarado = input.depulpedInMucilageKg + input.pulpKg + input.processLossKg;
  const veredicto = juzgar(input.depulpedInputKg, declarado, p);

  const rendPulpa = redondear((input.pulpKg / input.depulpedInputKg) * 100, 2);
  const rendBaba = redondear((input.depulpedInMucilageKg / input.depulpedInputKg) * 100, 2);

  const warnings: string[] = [];
  if (fuera(rendPulpa, RENDIMIENTOS.pulpa)) warnings.push("YIELD_IMPLAUSIBLE_PULP");
  if (fuera(rendBaba, RENDIMIENTOS.despulpadoEnBaba)) warnings.push("YIELD_IMPLAUSIBLE_DEPULPED");
  // Un peso WET contra uno DRAINED da una relación de rendimiento ficticia.
  if (input.weighingCondition !== input.upstreamWeighingCondition) {
    warnings.push("INCOMPARABLE_WEIGHING_CONDITION");
  }

  // La cáscara es un ALIMENTO DE EXPORTACIÓN, no una salida de proceso más, y
  // arrastra obligaciones que ninguna otra línea tiene. Se propone abrirle su
  // lote para que el inventario aguas abajo exista; crearlo solo sería inferir
  // una entidad que nadie declaró.
  const flags: string[] = [];
  let cascara: { parentLotId: string } | null = null;
  if (input.pulpKg > 0) {
    cascara = { parentLotId: input.lotId };
    // El perfil térmico heredado —75–80 °C durante 12 h— viaja marcado hasta que
    // Daniel registre un ensayo. Un choque térmico es por definición breve; doce
    // horas a esa temperatura es un secado largo, con pardeamiento y sabor
    // cocido previsibles. No se borra el parámetro: se señala.
    flags.push("CASCARA_PROFILE_UNVALIDATED");
  }

  return {
    ...veredicto,
    depulpedInputKg: input.depulpedInputKg,
    pulpYieldPct: rendPulpa,
    depulpedYieldPct: rendBaba,
    cascaraBatchPropuesto: cascara,
    flags,
    warnings,
  };
}

/** Etapa C — lavado. El pergamino húmedo aparece **aquí**, no antes. */
export function validarLavado(input: {
  depulpedInMucilageKg: number;
  wetParchmentKg: number;
  mucilageWashoutKg: number;
  washLossKg: number;
  totalCherryKg: number;
  policy?: BalancePolicy;
}): WashAssessment {
  const p = input.policy ?? POLITICA_POR_DEFECTO;
  if (!(input.depulpedInMucilageKg > 0)) {
    throw new SchemaError("depulped_in_mucilage_kg debe ser positivo");
  }
  if (!(input.totalCherryKg > 0)) throw new SchemaError("total_cherry_kg debe ser positivo");

  const declarado = input.wetParchmentKg + input.mucilageWashoutKg + input.washLossKg;
  const veredicto = juzgar(input.depulpedInMucilageKg, declarado, p);

  // Contra la CEREZA, que es donde el rango 40–46 % tiene sentido.
  const rendPergamino = redondear((input.wetParchmentKg / input.totalCherryKg) * 100, 2);
  const warnings: string[] = [];
  if (fuera(rendPergamino, RENDIMIENTOS.pergaminoHumedo)) warnings.push("YIELD_IMPLAUSIBLE_PARCHMENT");

  return {
    ...veredicto,
    depulpedInMucilageKg: input.depulpedInMucilageKg,
    parchmentYieldPct: rendPergamino,
    warnings,
  };
}
