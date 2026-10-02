/**
 * Qué dice el proyecto que puede pasar si se sigue esperando, **citado**, puro y acotado al pH.
 *
 * **Sólo el pH tiene riesgo citable.** La única matriz de umbrales con una columna de riesgo es
 * `docs/beneficio/10_ph_fermentation.md` §1. Brix y humedad no la tienen en ningún documento, así
 * que para ellos esta función devuelve `null`, y `null` quiere decir **«no hay registro»**: no una
 * frase neutra y no «sin riesgo». Quien la llame no pinta nada con un `null`.
 *
 * **Sin base de datos ni imports a propósito**, igual que `curvaDeLote.ts` y `ejesDeLaCurva.ts`.
 *
 * **Las ocho filas de abajo están TRANSCRITAS**, columna «Banda» y columna «Riesgo / vector» de
 * `docs/beneficio/10_ph_fermentation.md` §1, **sin parafrasear**: ni una palabra cambiada, ni los
 * asteriscos de `*stinker*` quitados. Parafrasear una columna normativa es escribir un riesgo que
 * el documento no dice. Que siguen siendo literales lo prueba `tests/beneficio/riesgo-de-esperar
 * .test.ts`, que lee el documento: si alguien lo edita, el módulo no sigue citando lo que ya no
 * dice sin que una prueba caiga.
 *
 * **Son ocho, no seis.** Seis son bandas con corchetes; las otras dos son `< 3.30` y «fuera de
 * `[2.50, 8.00]`». Se transcriben todas: si faltara la de `< 3.30`, un pH de 3.0 devolvería `null`
 * («no hay riesgo citable») donde el documento sí tiene uno, que es un cero donde hay registro. Y
 * decidir cuáles de las ocho son «del lote» y cuáles «del dato» no es de este módulo: lo decide la
 * pantalla, con el texto delante.
 *
 * **Dos filas piden esa decisión a quien las pinte, y este módulo no la toma:**
 * - «fuera de `[2.50, 8.00]`» (`SENSOR_FAULT`) habla del electrodo, no de esperar.
 * - `[6.50, 8.00]` (`SUSPECT_DILUTION`) está en la tabla, pero la nota de ADR-181 que abre §1 dice
 *   que ese aviso «se retira». La tabla no se ha editado, y aquí se cita la tabla.
 *
 * **El orden de comprobación importa:** «fuera de `[2.50, 8.00]`» se mira ANTES que las bandas,
 * porque se solapa con `[6.50, 8.00]` (que incluye el 8.00) y con `< 3.30` (que, sin el rango
 * medible, se tragaría el 2.0 y el −1). Las demás bandas son semiabiertas `[inf, sup)`, así que no
 * se solapan entre sí.
 */

export interface Riesgo {
  /** La banda de `10_ph_fermentation.md` §1 en la que cae el valor. */
  readonly banda: string;
  /** La columna «Riesgo / vector», literal del documento. */
  readonly riesgo: string;
}

interface FilaDePh extends Riesgo {
  readonly cae: (valor: number) => boolean;
}

/**
 * `docs/beneficio/10_ph_fermentation.md` §1, en el orden en que se COMPRUEBAN (no el de la tabla:
 * la fila del sensor va primera). `banda` y `riesgo` son las celdas del documento, sin los
 * backticks de la celda de banda.
 */
const FILAS_DE_PH: readonly FilaDePh[] = [
  {
    banda: "fuera de [2.50, 8.00]",
    riesgo: "Electrodo dañado o fuera de rango medible",
    cae: (v) => v < 2.5 || v > 8,
  },
  {
    banda: "[6.50, 8.00]",
    riesgo:
      "El mucílago fresco no supera pH ~6.0. Un valor mayor sugiere agua de enjuague, electrodo fuera del líquido o descalibración",
    cae: (v) => v >= 6.5 && v <= 8,
  },
  {
    banda: "[5.20, 6.50)",
    riesgo: "Inactividad microbiológica si se prolonga",
    cae: (v) => v >= 5.2 && v < 6.5,
  },
  {
    banda: "[4.50, 5.20)",
    riesgo: "Proliferación butírica y mohos → defecto *stinker*",
    cae: (v) => v >= 4.5 && v < 5.2,
  },
  {
    banda: "[3.80, 4.50)",
    riesgo: "Ninguno. Desarrollo ideal de precursores",
    cae: (v) => v >= 3.8 && v < 4.5,
  },
  {
    banda: "[3.50, 3.80)",
    riesgo: "Aproximación a sobrefermentación",
    cae: (v) => v >= 3.5 && v < 3.8,
  },
  {
    banda: "[3.30, 3.50)",
    riesgo: "Degradación ácida, decoloración del pergamino",
    cae: (v) => v >= 3.3 && v < 3.5,
  },
  {
    banda: "< 3.30",
    riesgo: "Daño consumado",
    cae: (v) => v < 3.3,
  },
];

/**
 * El riesgo que `10_ph_fermentation.md` §1 cita para `valor` de `variable`, o `null` si no hay uno
 * CITABLE: variable sin matriz (todo lo que no sea `"ph"`) o un valor que no es un número.
 * Nunca una frase inventada.
 */
export function riesgoDeEsperar(variable: string, valor: number): Riesgo | null {
  if (variable !== "ph") return null;
  // `NaN` compara falso con todo: sin esta guarda caería por todas las filas y devolvería `null`
  // por casualidad, no por decisión. Se dice aquí.
  if (Number.isNaN(valor)) return null;
  const fila = FILAS_DE_PH.find((f) => f.cae(valor));
  return fila ? { banda: fila.banda, riesgo: fila.riesgo } : null;
}
