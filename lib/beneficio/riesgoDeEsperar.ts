/**
 * Qué dice el proyecto que puede pasar si se sigue esperando, **citado**, puro y acotado al pH.
 *
 * **Sólo el pH tiene riesgo citable.** La única matriz de umbrales con una columna de riesgo es
 * `docs/beneficio/10_ph_fermentation.md` §1. Brix y humedad no la tienen en ningún documento, así
 * que para ellos esta función devuelve `null`, y `null` quiere decir **«no hay registro»**: no una
 * frase neutra y no «sin riesgo». Quien la llame no pinta nada con un `null`.
 *
 * **Y sólo para el perfil `WASHED_STANDARD`.** Esa sección se titula «Matriz de umbrales — perfil
 * `WASHED_STANDARD`», y la nota de ADR-181 que la abre dice que **el pH objetivo y los umbrales son de
 * la receta, por fase** (`00_conventions.md` §8: los cinco perfiles son «plantillas»; «el motor no los
 * usa directamente»). Citarla a un lote que no corre ese protocolo es decirle una cinética que no es la
 * suya: medido, treinta pH dentro de la ventana óptima de `NATURAL` (3,9–4,8) recibían la cita de
 * `[4.50, 5.20)` («proliferación butírica y mohos»). El repositorio ya decidió lo contrario en tres
 * sitios: `ph.ts` («ningún umbral vive aquí»), `desdeElLote.ts` (`PERFIL_POR_GRADO` sólo mapea `Washed` y
 * `Natural`, porque suponerles los del lavado «sería inventar una cinética») y el texto de
 * `GRADO_SIN_PERFIL` en `messages/es.json`. **Por eso la firma pide el perfil del lote y devuelve `null`
 * con cualquiera que no sea el de la matriz —también con `null`, «no se sabe cuál»—:** no hay un umbral
 * escrito para ningún otro y escribirlo no es de este módulo.
 *
 * **La matriz es también de una FASE: la fermentación.** Que el lote sea `Washed` no basta: con una corrida de
 * secado abierta, citarle esta matriz sería decirle cinética de fermentación sobre un pH de secado. Esa guarda
 * no vive aquí —esta función sólo recibe el perfil— sino en quien lo calcula (`perfilDeLaFaseAbierta`, que
 * devuelve `null` con una fase que no sea de fermentación), y `13_drying_moisture.md` no tiene ninguna matriz
 * de pH con la que sustituirla. **Ni basta el grado:** sin receta el motor no opina (ADR-181), y
 * `perfilDeLaFaseAbierta` tampoco devuelve perfil a un lote cuyo proceso no tiene `processRecipeVersion`.
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
 * **Una fila está RETIRADA y el módulo no la devuelve; otra la decide la pantalla:**
 * - `[6.50, 8.00]` (`SUSPECT_DILUTION`) está en la tabla, pero la nota de ADR-181 que abre §1 —que
 *   dice de sí misma «manda sobre este documento»— la retira («`SUSPECT_DILUTION` a 6,50 fijo se
 *   retira») y añade «nunca se avisa sobre una lectura de agua»: el mosto se compara contra el pH
 *   del agua de ese lote, que mide 6,5–6,9 y a veces 7–8. Citar esa fila a pH 7,0 sería apoyarse en
 *   un umbral que el dueño retiró. **Se queda TRANSCRITA** (el guardia de la transcripción sigue
 *   cubriendo las ocho, y la tabla del documento no se edita desde aquí) **pero marcada
 *   `retiradaPor: "ADR-181"`, y `riesgoDeEsperar` devuelve `null` en `[6.50, 8.00]`.** Ahí `null`
 *   es exacto: «no hay riesgo citable» es el estado en que ADR-181 dejó ese rango.
 * - «fuera de `[2.50, 8.00]`» (`SENSOR_FAULT`) habla del electrodo, no de esperar. Esa NO se retira
 *   aquí: se devuelve literal y es la pantalla quien decide si la enseña.
 *
 * **El orden de comprobación importa:** «fuera de `[2.50, 8.00]`» se mira ANTES que las bandas,
 * porque se solapa con `[6.50, 8.00]` (que incluye el 8.00) y con `< 3.30` (que, sin el rango
 * medible, se tragaría el 2.0 y el −1). Las demás bandas son semiabiertas `[inf, sup)`, así que no
 * se solapan entre sí.
 */

import type { DataConfidence } from "./ph";

/**
 * El grado que la columna «Acción del software» de `10_ph_fermentation.md` §1 nombra para una banda.
 * `null` cuando la celda no nombra ninguno — `[3.80, 4.50)` dice «Trazar curva de descenso», que no
 * afirma nada alarmante.
 *
 * **No es una escala de este módulo: son las palabras de la celda.** Que lo que aquí se diga sea lo
 * que el documento dice, en las dos direcciones, lo obliga `tests/beneficio/cita-por-severidad.test.ts`.
 */
export type SeveridadDelSoftware = "INFO" | "WARNING" | "CRITICAL";

/**
 * Si una lectura con esa confianza puede sostener una cita de ese grado.
 *
 * **La regla es de Daniel, 2026-09-14**, y `confianzaPorVerificacion` ya la lleva escrita:
 * `REVISION_VENCIDA` «alimenta curvas y puede avisar. **No confirma una crítica**». Esto es el otro
 * lado: hasta que la matriz dijo de qué grado es cada cita, nada podía aplicarla.
 *
 * Tres cosas que parecen detalles y no lo son:
 *
 * - **`null` de confianza NO degrada.** Es lo que `confianzaPorVerificacion` devuelve para
 *   `SIN_INSTRUMENTO`, que es el estado de **todas** las lecturas de hoy: `measurement.instrument_id`
 *   acaba de existir y nadie lo ha rellenado. Tratar el hueco como avería apagaría esta pantalla
 *   entera el día que se despliegue — el mismo defecto que `desdeElLote.ts` ya nombra.
 * - **`null` de severidad lo sostiene cualquiera.** Negar «Ninguno. Desarrollo ideal de precursores»
 *   a una lectura excluida no protege a nadie: borraría de la pantalla la única banda que dice que
 *   todo va bien.
 * - **Las confianzas intermedias pasan.** `RETROSPECTIVE`, `TEMP_DRIFT_RISK` y `TEMP_UNCOMPENSATED`
 *   salen de la procedencia o de la temperatura, no de la verificación, y esta compuerta es sólo
 *   sobre la verificación. Combinarlas es otro eje y tiene su función: `peorConfianza`.
 */
export function sostieneLaCita(
  confianza: DataConfidence | null,
  severidad: SeveridadDelSoftware | null,
): boolean {
  if (severidad === null) return true;
  if (confianza === null) return true;
  if (confianza === "UNCALIBRATED") return false;
  if (confianza === "REVISION_VENCIDA") return severidad !== "CRITICAL";
  return true;
}

export interface Riesgo {
  /**
   * El perfil de protocolo al que pertenece la matriz de donde sale la cita (`WASHED_STANDARD`):
   * quien la pinta lo dice, para que no haya que llegar al documento para descubrir que la matriz es
   * de un protocolo concreto.
   */
  readonly perfil: string;
  /** La banda de `10_ph_fermentation.md` §1 en la que cae el valor. */
  readonly banda: string;
  /** La columna «Riesgo / vector», literal del documento. */
  readonly riesgo: string;
  /**
   * El grado de la columna «Acción del software» para esta banda, o `null` si la celda no nombra
   * ninguno. Quien pinta la cita lo usa con `sostieneLaCita` para no colgarle una afirmación a una
   * lectura cuyo instrumento no la sostiene (`PENDING_IMPLEMENTATIONS/021`).
   *
   * **La banda `[4.50, 5.20)` lleva `CRITICAL` aunque su celda diga «`INFO` antes de
   * `ph_stall_grace_hours`; `CRITICAL` (con confirmación) después»:** este módulo no ve la
   * tendencia, y la pantalla cita esa fila **condicionada** —«si el pH se estanca…»—, que es el
   * caso crítico. Clasificarla como `INFO` dejaría que una lectura vencida sostuviera la frase que
   * de hecho se pinta.
   */
  readonly severidad: SeveridadDelSoftware | null;
  /**
   * La columna «Qué hace el operario» de la misma tabla, literal, **si Daniel ya la rellenó**. Hoy
   * ninguna de las ocho celdas lo está: ninguna fila la lleva, `riesgoDeEsperar` no la devuelve y
   * la pantalla no dice qué hacer. Ausente o `null` es «no hay registro», no «no hay nada que
   * hacer»; nunca una frase de este módulo. Que el día que se rellene una celda el módulo la
   * recoja —y que no diga nada que la celda no diga— lo obliga
   * `tests/arquitectura/guia-no-inventada.test.ts`. La fila retirada por ADR-181 no la puede
   * exponer nunca: su rango devuelve `null`.
   */
  readonly queHaceElOperario?: string | null;
}

interface FilaDePh extends Omit<Riesgo, "perfil"> {
  readonly cae: (valor: number) => boolean;
  /**
   * Si está, el documento ya no sostiene esta fila (la retira la nota que abre §1) y
   * `riesgoDeEsperar` devuelve `null` para su rango en vez de citarla. La fila sigue aquí,
   * transcrita, para que el guardia compare las ocho y para que el rango quede cubierto y no caiga
   * en otra fila por omisión.
   */
  readonly retiradaPor?: string;
}

/**
 * El único perfil para el que existe esta matriz: el del título de `10_ph_fermentation.md` §1. Que sigue
 * siendo el del documento lo prueba `tests/beneficio/riesgo-de-esperar.test.ts`, que lee el título.
 */
export const PERFIL_DE_LA_MATRIZ = "WASHED_STANDARD";

/**
 * `docs/beneficio/10_ph_fermentation.md` §1, en el orden en que se COMPRUEBAN (no el de la tabla:
 * la fila del sensor va primera). `banda` y `riesgo` son las celdas del documento, sin los
 * backticks de la celda de banda.
 */
const FILAS_DE_PH: readonly FilaDePh[] = [
  {
    banda: "fuera de [2.50, 8.00]",
    severidad: "WARNING",
    riesgo: "Electrodo dañado o fuera de rango medible",
    cae: (v) => v < 2.5 || v > 8,
  },
  {
    banda: "[6.50, 8.00]",
    severidad: "WARNING",
    riesgo:
      "El mucílago fresco no supera pH ~6.0. Un valor mayor sugiere agua de enjuague, electrodo fuera del líquido o descalibración",
    cae: (v) => v >= 6.5 && v <= 8,
    retiradaPor: "ADR-181",
  },
  {
    banda: "[5.20, 6.50)",
    severidad: "INFO",
    riesgo: "Inactividad microbiológica si se prolonga",
    cae: (v) => v >= 5.2 && v < 6.5,
  },
  {
    banda: "[4.50, 5.20)",
    severidad: "CRITICAL",
    riesgo: "Proliferación butírica y mohos → defecto *stinker*",
    cae: (v) => v >= 4.5 && v < 5.2,
  },
  {
    banda: "[3.80, 4.50)",
    severidad: null,
    riesgo: "Ninguno. Desarrollo ideal de precursores",
    cae: (v) => v >= 3.8 && v < 4.5,
  },
  {
    banda: "[3.50, 3.80)",
    severidad: "WARNING",
    riesgo: "Aproximación a sobrefermentación",
    cae: (v) => v >= 3.5 && v < 3.8,
  },
  {
    banda: "[3.30, 3.50)",
    severidad: "CRITICAL",
    riesgo: "Degradación ácida, decoloración del pergamino",
    cae: (v) => v >= 3.3 && v < 3.5,
  },
  {
    banda: "< 3.30",
    severidad: "CRITICAL",
    riesgo: "Daño consumado",
    cae: (v) => v < 3.3,
  },
];

/**
 * El riesgo que `10_ph_fermentation.md` §1 cita para `valor` de `variable` **en un lote de perfil
 * `perfil`**, o `null` si no hay uno CITABLE: variable sin matriz (todo lo que no sea `"ph"`), un perfil
 * que no es el de la matriz (`null` incluido: «no se sabe cuál»), un valor que no es un número, o una
 * banda que ADR-181 retiró (`[6.50, 8.00]`). Nunca una frase inventada.
 */
export function riesgoDeEsperar(variable: string, valor: number, perfil: string | null): Riesgo | null {
  if (variable !== "ph") return null;
  // La matriz es de UN perfil. Con otro, o sin saberlo, no hay umbral escrito y NO se presta el del
  // lavado: sería de otra cinética (ver la cabecera).
  if (perfil !== PERFIL_DE_LA_MATRIZ) return null;
  // `NaN` compara falso con todo: sin esta guarda caería por todas las filas y devolvería `null`
  // por casualidad, no por decisión. Se dice aquí.
  if (Number.isNaN(valor)) return null;
  const fila = FILAS_DE_PH.find((f) => f.cae(valor));
  // La fila retirada SE ENCUENTRA y se descarta aquí, a propósito: saltarla en el `find` dejaría el
  // rango a merced de lo que alguna fila posterior casara por omisión.
  if (!fila || fila.retiradaPor) return null;
  return { perfil: PERFIL_DE_LA_MATRIZ, banda: fila.banda, riesgo: fila.riesgo, severidad: fila.severidad };
}
