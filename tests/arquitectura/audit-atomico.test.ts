import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cada `recordAuditEvent` dentro de una transacción recibe esa transacción.
 *
 * **Por qué existe.** La segunda revisión independiente (2026-09-01) encontró
 * que cuatro tests llamados «escribe el AuditEvent en la misma transacción» sólo
 * comprobaban que el evento EXISTIERA al terminar. Quitar el `tx` los dejaba
 * verdes a los cuatro: cuando nada falla, las dos filas existen igual. Eran
 * guardias que no podían fallar, que `CLAUDE.md` llama peores que ninguno.
 *
 * **Por qué es un test de FUENTE y no de ejecución.** Probar la atomicidad de
 * verdad exige que el audit falle a mitad, y un servicio no deja inyectar ese
 * fallo desde fuera: controla todos los campos del evento y su actor tiene que
 * existir para pasar RBAC. `plantingCohorts.test.ts` sí prueba el MECANISMO
 * —violando la FK del actor a mano— y eso basta una vez. Lo que faltaba era
 * comprobar que cada servicio lo USA, y eso se lee.
 *
 * **Qué cambió el 2026-09-06, y por qué era necesario.** Antes esto recorría una
 * LISTA DE ARCHIVOS y exigía que *todas* las llamadas de cada uno llevaran `tx`.
 * Esa granularidad dejaba fuera a `research/analysis.ts` y `research/protocols.ts`,
 * que mezclan legítimamente las dos clases: 3 llamadas dentro de una transacción
 * y 10 que acompañan una escritura suelta (`prisma.X.create` sin transacción).
 * Meterlos en la lista habría puesto el guardia en rojo sobre código correcto;
 * dejarlos fuera dejaba sus 3 conversiones sin proteger.
 *
 * Ahora la regla es POR LLAMADA y se aplica a todo `lib/`, así que no hay lista
 * que mantener y un servicio nuevo queda cubierto sin que nadie se acuerde de
 * añadirlo — que es como `scripts/ci.sh` dejaba fuera tests nuevos en silencio.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/**
 * Todo el `.ts`/`.tsx` de un directorio.
 *
 * **`app/` entró el 2026-09-06, y la omisión había costado algo.** Esto sólo
 * recorría `lib/` —«que es donde viven los servicios»—, y era verdad a medias:
 * las acciones de servidor escriben igual. `app/actions/auth.ts` auditaba
 * fuera de su transacción desde siempre y el guardia no podía verlo; se
 * descubrió leyéndolo a mano, buscando un precedente de nombre de operación.
 * Un guardia que elige su universo por una regla de dedo deja fuera justo lo
 * que nadie mira.
 */
function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (entrada.endsWith(".ts") || entrada.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

interface Llamada {
  /** Línea 1-indexada, para que el mensaje se pueda abrir. */
  linea: number;
  texto: string;
  dentroDeTransaccion: boolean;
  /** Inmediatamente después del `});` de una transacción: el patrón viejo. */
  trasElCierre: boolean;
  /**
   * La llamada declara, encima de sí misma, que no acompaña ninguna escritura.
   * La exención vive en el SITIO DE LA LLAMADA y no en una lista aquí: si el
   * audit desaparece, su excepción se va con él, que es lo que una lista de
   * rutas no puede prometer.
   */
  sinEscritura: boolean;
}

/**
 * Dónde empieza y acaba cada cuerpo que corre DENTRO de una transacción.
 *
 * **Ya no se busca `$transaction(`, sino el cierre cuyo parámetro es `tx`**
 * (2026-09-06). Buscar la llamada dejaba fuera a los ayudantes que abren la
 * transacción y reparten el mismo cliente: `unaVezPorEnvio` recibe un
 * `crear: async (tx) => …` y confirma la escritura, su clave de envío y su
 * audit juntos. Para el guardia viejo esas llamadas estaban «sueltas», así que
 * la regla del `tx` **no se les aplicaba** — tres quedaban sin proteger, y a
 * dos de ellas se llegó a mano precisamente por eso.
 *
 * En esta casa un parámetro llamado `tx` ES un cliente de transacción, así que
 * la forma cubre `$transaction(async (tx) => …)` y cualquier ayudante, presente
 * o futuro, sin una lista que mantener — que es la misma razón por la que este
 * guardia dejó de tener lista de archivos. Medido al cambiarlo: 110 cierres con
 * parámetro `tx` en `lib/`, `app/` y `scripts/`, tres llamadas más protegidas,
 * y CERO que pasaran a estar «dentro sin `tx`»: la regla nueva no señala nada
 * que estuviera bien.
 *
 * Lo que NO casa, comprobado: el `tx` de IndexedDB de
 * `lib/apiary/offlineQueue.ts` (`tx.onerror = () => …`) no es un parámetro de
 * cierre, y la firma de `recordAuditEvent(input, tx?)` no es una función
 * flecha.
 *
 * **La primera versión cerraba por indentación** — el `});` al mismo nivel que
 * la línea que abría — y daba tres falsos positivos. No por un formato exótico:
 * `lib/traceability/plantingCohorts.ts` tiene el cuerpo de su transacción al
 * MISMO nivel que su apertura, así que el `});` de un `create` interno pasaba
 * por el cierre de la transacción y todo lo que venía después quedaba
 * «fuera». La indentación no es estructura, y un guardia que la use para
 * decidir estructura señala código correcto.
 *
 * Del `=>` en adelante: si el cuerpo es un bloque se casan llaves, y si es una
 * expresión se corta en la primera coma o paréntesis de cierre a profundidad
 * cero. Ninguna de las dos depende del formato.
 *
 * **`function nombre(tx: Tipo, …)` entró el 2026-09-19**, con
 * `crearConsumoEnTx` (T3 de rutinas de instalaciones): antes todo cierre con
 * `tx` era una función flecha de un único parámetro —`(tx) => …`—, y una
 * función NOMBRADA que recibe `tx` como primer parámetro y otros detrás
 * —para que otra transacción pueda reutilizarla, en vez de un ayudante que
 * abre la suya— no casaba con ese molde. La llamada SÍ vive dentro de la
 * transacción de quien la invoca; lo que no reconocía el detector era la
 * forma. `envasesDelLote`/`disponiblesPorLote` (`commerce/tienda.ts`) y
 * `versionIdDe` (`traceability/reporteDeVisita.ts`) tienen la misma forma y no
 * auditan nada, así que ampliar el patrón no cambia su clasificación.
 */
/**
 * El mismo texto con comentarios y cadenas **en blanco**, conservando cada
 * posición y cada salto de línea para que los desplazamientos sigan valiendo.
 *
 * **Por qué, y cómo se descubrió (2026-09-06).** Contar paréntesis a pelo
 * cuenta también los que viven dentro de un comentario. Un comentario que
 * mencionaba el cierre de una transacción —literalmente las tres letras de un
 * `});`— cerró el rango tres líneas antes de tiempo, y la llamada que venía
 * después, que estaba DENTRO, se clasificó fuera.
 *
 * Aquí salió como falso positivo, que es ruidoso y se ve. La dirección
 * peligrosa es la contraria: un rango cortado antes deja llamadas de dentro
 * clasificadas como «fuera», y a ésas la regla del `tx` **no se les aplica**.
 * El guardia se habría quedado verde comprobando menos.
 *
 * Regex sin escapar sigue siendo un punto ciego: no se trata aquí porque no
 * aparece en el código que este guardia recorre, y el control de abajo se
 * pondría rojo si algún día rompiera el análisis entero.
 */
function sinRuido(src: string): string {
  const salida = src.split("");
  type Estado = "codigo" | "linea" | "bloque" | "comilla" | "doble" | "plantilla";
  let estado: Estado = "codigo";
  const blanquear = (i: number) => {
    if (salida[i] !== "\n") salida[i] = " ";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const sig = src[i + 1];
    if (estado === "codigo") {
      if (c === "/" && sig === "/") { estado = "linea"; blanquear(i); blanquear(i + 1); i++; }
      else if (c === "/" && sig === "*") { estado = "bloque"; blanquear(i); blanquear(i + 1); i++; }
      else if (c === "'") { estado = "comilla"; }
      else if (c === '"') { estado = "doble"; }
      else if (c === "`") { estado = "plantilla"; }
      continue;
    }
    if (estado === "linea") {
      if (c === "\n") estado = "codigo";
      else blanquear(i);
      continue;
    }
    if (estado === "bloque") {
      blanquear(i);
      if (c === "*" && sig === "/") { blanquear(i + 1); i++; estado = "codigo"; }
      continue;
    }
    // Dentro de una cadena: `\` se salta el siguiente carácter.
    if (c === "\\") { blanquear(i); blanquear(i + 1); i++; continue; }
    const cierra = (estado === "comilla" && c === "'") || (estado === "doble" && c === '"') || (estado === "plantilla" && c === "`");
    if (cierra) { estado = "codigo"; continue; }
    blanquear(i);
  }
  return salida.join("");
}

const CIERRE_CON_TX =
  /(?:async\s*)?\(\s*tx\s*(?::\s*[A-Za-z_$][\w.$<>\[\], ]*)?\)\s*=>|function\s+[A-Za-z_$][\w$]*\s*\(\s*tx\s*(?::\s*[A-Za-z_$][\w.$<>\[\],: ]*)?\)/g;

function rangosDeTransaccion(fuente: string): Array<[number, number]> {
  const src = sinRuido(fuente);
  const rangos: Array<[number, number]> = [];
  const re = new RegExp(CIERRE_CON_TX.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let j = m.index + m[0].length;
    while (j < src.length && /\s/.test(src[j]!)) j++;
    let fin = -1;
    if (src[j] === "{") {
      let profundidad = 0;
      for (let k = j; k < src.length; k++) {
        if (src[k] === "{") profundidad++;
        else if (src[k] === "}") {
          profundidad--;
          if (profundidad === 0) { fin = k; break; }
        }
      }
    } else {
      let profundidad = 0;
      for (let k = j; k < src.length; k++) {
        const c = src[k];
        if (c === "(" || c === "[" || c === "{") profundidad++;
        else if (c === ")" || c === "]" || c === "}") {
          if (profundidad === 0) { fin = k - 1; break; }
          profundidad--;
        } else if (c === "," && profundidad === 0) { fin = k - 1; break; }
      }
    }
    if (fin !== -1) rangos.push([m.index, fin]);
  }
  return rangos;
}

/**
 * **Ronda 1 de revisión de T3 (2026-09-19).** La rama `function nombre(tx…)`
 * de `CIERRE_CON_TX` sólo demuestra que el CUERPO de esa función corre con el
 * `tx` que recibe. No demuestra que quien la LLAMA le pase de verdad una
 * transacción: `lib/commerce/tienda.ts` ya llama a `envasesDelLote(prisma,
 * lotId)` con el cliente global —lícito, porque no audita nada—, y
 * `Prisma.TransactionClient` acepta un `PrismaClient` normal en su tipo, así
 * que `crearConsumoEnTx(prisma, …)` compilaría igual y partiría la fila, el
 * descuento de existencias y el `AuditEvent` en tres confirmaciones sueltas
 * con el guardia en verde.
 *
 * Esta sección aísla sólo esa rama —con el nombre capturado— para poder
 * preguntar, de cada función que cae en ella Y audita, si TODOS sus
 * llamadores en `lib/` y `app/` le pasan `tx` como primer argumento. El
 * `tests/` queda fuera a propósito: es donde vive el flip-test de esta misma
 * regla, y unos cuantos tests abren su propia `$transaction` y llaman al
 * ayudante desde el callback con la variable que ELLOS llamaron `tx` —la
 * misma convención que el resto de esta casa—, así que no aporta ninguna
 * llamada nueva que vigilar.
 */
const NOMBRE_FUNCION_CON_TX =
  /function\s+([A-Za-z_$][\w$]*)\s*\(\s*tx\s*(?::\s*[A-Za-z_$][\w.$<>\[\],: ]*)?\)/g;

/** Ver el punto ciego de firma en una sola línea, documentado más arriba. */
function funcionesNombradasConTx(fuente: string): Array<{ nombre: string; inicio: number; fin: number }> {
  const src = sinRuido(fuente);
  const re = new RegExp(NOMBRE_FUNCION_CON_TX.source, "g");
  const salida: Array<{ nombre: string; inicio: number; fin: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let j = m.index + m[0].length;
    while (j < src.length && /\s/.test(src[j]!)) j++;
    if (src[j] !== "{") continue;
    let profundidad = 0;
    let fin = -1;
    for (let k = j; k < src.length; k++) {
      if (src[k] === "{") profundidad++;
      else if (src[k] === "}") {
        profundidad--;
        if (profundidad === 0) { fin = k; break; }
      }
    }
    if (fin !== -1) salida.push({ nombre: m[1]!, inicio: m.index, fin });
  }
  return salida;
}

interface FuncionTransaccional {
  archivo: string;
  nombre: string;
}

/**
 * De las funciones nombradas con `tx` de un archivo, sólo las que auditan
 * —«al mínimo un `recordAuditEvent`», que es la condición que pidió la
 * revisión—. Busca en la fuente SIN blanquear porque el rango ya viene de la
 * versión blanqueada y ambas tienen la misma longitud y los mismos saltos de
 * línea: la comprobación es la misma que ya usa `llamadas` más abajo.
 */
function funcionesTransaccionalesConAudit(archivo: string, fuente: string): FuncionTransaccional[] {
  return funcionesNombradasConTx(fuente)
    .filter(({ inicio, fin }) => fuente.slice(inicio, fin).includes("recordAuditEvent("))
    .map(({ nombre }) => ({ archivo, nombre }));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * El primer argumento de una llamada `nombre(...)`, contando profundidad de
 * paréntesis/corchetes/llaves — la misma técnica que la rama de expresión de
 * `rangosDeTransaccion` y que `textoDeLaLlamada`, aplicada al primer
 * argumento en vez de a la llamada entera. `aperturaParen` es el índice del
 * `(` que abre la llamada.
 */
function primerArgumento(src: string, aperturaParen: number): string {
  let profundidad = 0;
  for (let k = aperturaParen; k < src.length; k++) {
    const c = src[k];
    if (c === "(" || c === "[" || c === "{") { profundidad++; continue; }
    if (c === ")" || c === "]" || c === "}") {
      profundidad--;
      if (profundidad === 0) return src.slice(aperturaParen + 1, k).trim();
      continue;
    }
    if (c === "," && profundidad === 1) return src.slice(aperturaParen + 1, k).trim();
  }
  return src.slice(aperturaParen + 1).trim();
}

/**
 * Líneas de `fuente` donde se llama a `nombre(` sin `tx` LITERAL como primer
 * argumento — sin resolver alias ni seguir el valor, que es la simplificación
 * que pidió la revisión: «el argumento literal `tx`». Excluye la propia
 * declaración (`function nombre(tx…)`), que también casa con `nombre\s*\(`.
 */
function llamadasSinTx(fuente: string, nombre: string): number[] {
  const src = sinRuido(fuente);
  const re = new RegExp(`\\b${escapeRegex(nombre)}\\s*\\(`, "g");
  const violaciones: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (/\bfunction\s+$/.test(src.slice(Math.max(0, m.index - 40), m.index))) continue;
    const aperturaParen = m.index + m[0].length - 1;
    if (primerArgumento(src, aperturaParen) !== "tx") violaciones.push(lineaDe(src, m.index));
  }
  return violaciones;
}

/** Número de línea 1-indexado de un desplazamiento absoluto. */
function lineaDe(src: string, offset: number): number {
  let n = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src[i] === "\n") n++;
  return n;
}

/** Los argumentos de un `recordAuditEvent(...)`, contando paréntesis. */
function textoDeLaLlamada(src: string, desde: number): string {
  let profundidad = 0;
  for (let j = desde; j < src.length; j++) {
    if (src[j] === "(") profundidad++;
    else if (src[j] === ")") {
      profundidad--;
      if (profundidad === 0) return src.slice(desde, j + 1);
    }
  }
  return src.slice(desde);
}

/**
 * La marca que exime a una llamada de la tercera regla. Exige una razón en la
 * misma línea —al menos veinte caracteres— para que no se pueda pegar en
 * blanco: una exención sin motivo escrito es la lista que esto evita, sólo que
 * repartida.
 */
const MARCA_SIN_ESCRITURA = /\/\/\s*audit-sin-escritura:\s*\S[^\n]{19,}/;

function llamadas(fuente: string): Llamada[] {
  const src = fuente;
  const rangos = rangosDeTransaccion(src);
  const marca = "recordAuditEvent(";
  const salida: Llamada[] = [];
  for (let i = src.indexOf(marca); i !== -1; i = src.indexOf(marca, i + 1)) {
    // La DEFINICIÓN no es una llamada. `lib/audit.ts` declara
    // `export async function recordAuditEvent(…)`, y hasta la tercera regla eso
    // daba igual: una definición nunca está dentro de una transacción ni justo
    // tras un cierre, así que las dos primeras reglas no la miraban. La tercera
    // sí, y la señaló al primer intento — un guardia nuevo encuentra primero los
    // límites del análisis que los del código.
    if (/\bfunction\s+$/.test(src.slice(Math.max(0, i - 30), i))) continue;

    const cierreAnterior = rangos.filter(([, b]) => b < i).map(([, b]) => b);
    const ultimo = cierreAnterior.length ? Math.max(...cierreAnterior) : -1;
    salida.push({
      linea: lineaDe(src, i),
      texto: textoDeLaLlamada(src, i + "recordAuditEvent".length),
      dentroDeTransaccion: rangos.some(([a, b]) => a < i && i < b),
      // «Justo después» se mide en LÍNEAS, no en caracteres: el `});`, una en
      // blanco y un comentario corto caben en cuatro.
      trasElCierre: ultimo >= 0 && lineaDe(src, i) - lineaDe(src, ultimo) <= 4,
      // Se busca en el texto SIN blanquear: la marca vive en un comentario, que
      // es justo lo que `sinRuido` borra.
      sinEscritura: MARCA_SIN_ESCRITURA.test(
        fuente.split("\n").slice(Math.max(0, lineaDe(src, i) - 9), lineaDe(src, i) - 1).join("\n"),
      ),
    });
  }
  return salida;
}

/**
 * `scripts/` entró el 2026-09-06, **después de medirlo**. Este comentario decía
 * que quedaba fuera «sin haber medido sus 9 llamadas»; medidas, eran **10** en
 * 7 archivos —otra sesión añadió una entre la cuenta y la medida— y de ellas
 * **2** auditaban justo tras cerrar una transacción. Las dos se arreglaron en
 * el mismo cambio que trajo esta línea, porque ampliar antes de arreglar habría
 * hecho nacer el guardia en rojo.
 *
 * Las demás eran llamadas sueltas —una escritura y su audit, sin transacción
 * ninguna—, y se cerraron el 2026-09-06 creando la transacción que faltaba en
 * cada una. **Este párrafo decía que eran 8 y eran 7:** el arreglo del mismo
 * cambio que lo escribió convirtió una en atómica y nadie recontó. Un número a
 * mano dentro de un guardia envejece igual que la lista de archivos que este
 * guardia dejó de tener; ahora no hay ninguno que mantener, porque las 10
 * llamadas de `scripts/` van dentro de su transacción.
 *
 * **Punto ciego, dicho aquí para que no haga falta descubrirlo.** Las dos
 * reglas de abajo cazan que a una llamada de dentro se le quite el `tx`, y que
 * una llamada vuelva justo detrás del `});`. NO cazan que alguien quite la
 * transacción entera y deje escritura y audit sueltas otra vez: para esas dos
 * reglas, una llamada sin ninguna transacción cerca es indistinguible de una
 * legítima.
 *
 * **Ese hueco ya casi no tiene dónde esconderse.** Este párrafo decía que en
 * `lib/` había 49 llamadas sueltas; quedan **1**, y es legítima:
 * `lib/traceability/export.ts` audita una EXPORTACIÓN y no escribe nada, así
 * que no hay con qué ser atómica. Una tercera regla —«todo audit va dentro de
 * una transacción»— sería hoy cierta con esa única excepción. No se escribe
 * porque una excepción nombrada es una lista, y una lista a mano es lo que este
 * guardia lleva todo el día quitándose de encima: envejece sin avisar. Queda
 * como decisión, no como descuido.
 *
 * En los dos guiones que recorren filas —`rename-finca-rosina` y
 * `p0-flag-overstated-lots`— la transacción es POR FILA, no una para toda la
 * tanda: lo que faltaba era que la escritura y su audit fueran juntas. Que las
 * N filas se apliquen todas o ninguna es otra decisión, y cambiaría el
 * comportamiento de dos guiones que ya se ejecutaron.
 *
 * **Otro punto ciego, de la rama `function nombre(tx…)` del 2026-09-19, dicho
 * aquí en vez de esperar a que alguien lo descubra (ronda 1 de revisión de
 * T3).** Sólo reconoce una firma en UNA sola línea y SIN anotación de tipo de
 * retorno:
 * - `function f(\n  tx: X,\n  …\n)` —firma partida en varias líneas— no casa.
 *   La función queda fuera de esta rama entera, así que ni la regla de abajo
 *   («cada `recordAuditEvent` en transacción recibe su cliente») ni la nueva
 *   regla del llamador la vigilan. Falla en rojo de todas formas, y a viva
 *   voz: al no reconocerse ningún rango de transacción para esa función, su
 *   `recordAuditEvent` sale «huérfano» y la tercera regla de abajo («todo
 *   `recordAuditEvent` va en una transacción, o dice por qué no») se pone roja
 *   con su nombre.
 * - `function f(tx: X): Promise<Y> {` —con anotación de tipo de retorno antes
 *   de la llave— hace que el rastreador de rangos SE PASE: tras el `)` de los
 *   parámetros no encuentra `{` sino `:`, cae en la rama pensada para el
 *   cuerpo-expresión de una flecha, y cuenta el `{` del cuerpo real como si
 *   fuera parte de esa expresión. El rango que sale de ahí no es de fiar.
 *
 * Ninguna de las dos se ha comprobado con mutación —queda dicho, no cazado—,
 * pero las dos fallan RUIDOSAMENTE (una tercera regla existente se pone roja
 * con nombre de archivo y línea) en vez de quedarse calladas.
 */
const ARCHIVOS = [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app")), ...fuentes(join(RAIZ, "scripts"))]
  .map((r) => relative(RAIZ, r))
  .filter((r) => readFileSync(join(RAIZ, r), "utf8").includes("recordAuditEvent("))
  .sort();

/**
 * Todo `lib/` y `app/` — no sólo `ARCHIVOS`, que se filtra por quien YA
 * audita — porque quien llama a una función transaccional puede vivir en un
 * archivo que no audita nada por su cuenta.
 */
const TODO_LIB_APP = [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app"))]
  .map((r) => relative(RAIZ, r))
  .sort();

const TRANSACCIONALES_CON_AUDIT: FuncionTransaccional[] = ARCHIVOS.flatMap((a) =>
  funcionesTransaccionalesConAudit(a, readFileSync(join(RAIZ, a), "utf8")),
);

describe("el audit viaja con la transacción que lo produjo", () => {
  /**
   * Control positivo del análisis, no del código. Si `rangosDeTransaccion`
   * dejara de reconocer la forma de un `$transaction` —un cambio de formato, un
   * `prettier` distinto— todas las llamadas saldrían «fuera de transacción» y
   * el guardia pasaría sin comprobar nada. Esto lo convierte en rojo.
   */
  /**
   * Control del ANÁLISIS sobre un caso sintético, porque el real acaba de
   * morder: un comentario que menciona un cierre de transacción no debe cerrar
   * el rango. Sin esto, la llamada de dentro se lee como de fuera y la regla
   * del `tx` deja de aplicársele — el guardia sigue verde comprobando menos.
   */
  it("un `});` dentro de un comentario o una cadena no cierra la transacción", () => {
    const fuente = [
      "await prisma.$transaction(async (tx) => {",
      "  await tx.cosa.create({ data: {} });",
      "  // antes esto vivía tras el `});` y dejaba un hecho sin rastro",
      '  const nota = "cierra con });";',
      "  await recordAuditEvent({ operation: 'x' }, tx);",
      "  return 1;",
      "});",
    ].join("\n");

    const dentro = llamadas(fuente).filter((l) => l.dentroDeTransaccion);
    expect(
      dentro.length,
      "un paréntesis dentro de un comentario o una cadena volvió a cortar el rango de la transacción",
    ).toBe(1);
  });

  /**
   * Control del ALCANCE del análisis, sobre un caso sintético. Tres de las
   * llamadas del repositorio viven en el `crear` de `unaVezPorEnvio`, no en un
   * `$transaction(` literal, y hasta el 2026-09-06 se leían como sueltas: la
   * regla del `tx` no se les aplicaba. Si alguien vuelve a atar el análisis a
   * la llamada en vez de al cierre, esto lo dice.
   */
  /**
   * Control POSITIVO de la exención. Sin esto, un cambio que rompiera la
   * detección de la marca —un regexp mal puesto, un renombrado— haría que la
   * tercera regla no eximiera a nadie… o, peor, que eximiera a todos y se
   * quedara verde sin comprobar nada. Que exista al menos una exención real y
   * que no sean muchas es lo que distingue «la regla se aplica» de «la regla
   * no encuentra a quién aplicarse».
   */
  it("la exención existe, se detecta, y sigue siendo excepcional", () => {
    const eximidas = ARCHIVOS.flatMap((a) =>
      llamadas(readFileSync(join(RAIZ, a), "utf8"))
        .filter((l) => l.sinEscritura)
        .map((l) => `${a}:${l.linea}`),
    );
    expect(
      eximidas.length,
      "ninguna llamada lleva `audit-sin-escritura:`: o se borró la única que la tenía, o la marca dejó de detectarse y la tercera regla no exime a nadie",
    ).toBeGreaterThan(0);
    expect(
      eximidas.length,
      `demasiadas exenciones (${eximidas.join(", ")}): la tercera regla se convierte en un formulario que se rellena`,
    ).toBeLessThan(5);
  });

  it("un ayudante que reparte `tx` cuenta como transacción", () => {
    const fuente = [
      "const creada = await unaVezPorEnvio(actor, clave, {",
      '  tipo: "Cosa",',
      "  recuperar: (id) => prisma.cosa.findUniqueOrThrow({ where: { id } }),",
      "  crear: async (tx) => {",
      "    const fila = await tx.cosa.create({ data: {} });",
      "    await recordAuditEvent({ operation: 'x' }, tx);",
      "    return fila;",
      "  },",
      "});",
    ].join("\n");

    const dentro = llamadas(fuente).filter((l) => l.dentroDeTransaccion);
    expect(
      dentro.length,
      "el audit del `crear` de un ayudante volvió a leerse como suelto: el análisis está atado a `$transaction(` otra vez",
    ).toBe(1);
  });

  /**
   * Control sintético del ANÁLISIS de la regla del llamador, sobre un
   * fixture aislado — el mismo estilo que el control de arriba. Un caller
   * que pasa `prisma` tiene que marcarse; uno que pasa `tx` no.
   */
  it("control sintético: pasar `prisma` en vez de `tx` se marca, pasar `tx` no", () => {
    const fuente = [
      "function ayudanteConAudit(tx: Prisma.TransactionClient, userAccountId: string, input: unknown) {",
      "  return recordAuditEvent({ operation: 'x' }, tx);",
      "}",
      "",
      "async function llamadorMalo() {",
      "  return ayudanteConAudit(prisma, actor, {});",
      "}",
      "",
      "async function llamadorBueno(tx: Prisma.TransactionClient) {",
      "  return ayudanteConAudit(tx, actor, {});",
      "}",
    ].join("\n");

    const funciones = funcionesTransaccionalesConAudit("fixture.ts", fuente);
    expect(
      funciones.map((f) => f.nombre),
      "el fixture no reconoció la función de prueba como transaccional-con-audit",
    ).toEqual(["ayudanteConAudit"]);

    const violaciones = llamadasSinTx(fuente, "ayudanteConAudit");
    expect(violaciones, "el caller que pasa `prisma` no se marcó, o el que pasa `tx` se marcó de más").toEqual([6]);
  });

  /**
   * **Regla nueva, ronda 1 de revisión de T3 (2026-09-19).** La rama
   * `function nombre(tx…)` sólo demuestra que el CUERPO corre con el `tx`
   * que recibe — no que quien la llama se lo pase de verdad. El repositorio
   * ya tiene el precedente de llamar a un ayudante con `tx` nombrado usando
   * el cliente global (`envasesDelLote(prisma, lotId)`, lícito porque no
   * audita nada), y `Prisma.TransactionClient` acepta un `PrismaClient`
   * normal en su tipo: `crearConsumoEnTx(prisma, …)` compilaría igual y
   * partiría la fila, el descuento de existencias y el `AuditEvent` en tres
   * confirmaciones sueltas con el guardia de arriba en verde, porque ese
   * guardia sólo mira DENTRO de la función, nunca a quien la llama.
   *
   * Por cada función que cae en esa rama Y audita, cada llamada suya en
   * `lib/` y `app/` —fuera de su propia definición— tiene que pasarle `tx`
   * literal como primer argumento.
   */
  it("quien llama a una función nombrada que audita en transacción le pasa `tx`", () => {
    expect(
      TRANSACCIONALES_CON_AUDIT.length,
      "ninguna función nombrada con `tx` audita: o no queda ninguna (revisar el comentario de esta regla), " +
        "o el detector dejó de reconocerlas",
    ).toBeGreaterThan(0);

    const violaciones = TRANSACCIONALES_CON_AUDIT.flatMap(({ archivo, nombre }) =>
      TODO_LIB_APP.flatMap((llamador) =>
        llamadasSinTx(readFileSync(join(RAIZ, llamador), "utf8"), nombre).map(
          (linea) => `${llamador}:${linea} llama a \`${nombre}\` (definida en ${archivo}) sin pasarle \`tx\` como primer argumento`,
        ),
      ),
    );
    expect(
      violaciones,
      "Recibe una transacción abierta pero se la puede llamar con el cliente global: eso separa la fila, el " +
        "descuento de existencias y el AuditEvent en tres confirmaciones sueltas en vez de una.",
    ).toEqual([]);
  });

  it("el análisis encuentra transacciones y llamadas de verdad", () => {
    expect(ARCHIVOS.length, "ningún archivo llama a recordAuditEvent").toBeGreaterThan(10);

    // Control positivo del ALCANCE, no del análisis. Sin esto, volver a dejar
    // `app/` fuera —un refactor de `fuentes`, un filtro de más— haría que el
    // guardia siguiera verde comprobando la mitad del mundo, que es
    // exactamente como llegó `app/actions/auth.ts` hasta aquí.
    for (const raiz of ["app/", "scripts/"]) {
      expect(
        ARCHIVOS.filter((a) => a.startsWith(raiz)),
        `ningún archivo de ${raiz} entró en el análisis: el guardia volvió a mirar menos código del que audita`,
      ).not.toHaveLength(0);
    }
    const dentro = ARCHIVOS.flatMap((a) =>
      llamadas(readFileSync(join(RAIZ, a), "utf8")).filter((l) => l.dentroDeTransaccion),
    );
    expect(
      dentro.length,
      "ninguna llamada aparece dentro de una transacción: el detector de rangos no está reconociendo nada",
    ).toBeGreaterThan(10);
  });

  for (const archivo of ARCHIVOS) {
    it(`${archivo}: cada recordAuditEvent en transacción recibe su cliente`, () => {
      const src = readFileSync(join(RAIZ, archivo), "utf8");

      for (const llamada of llamadas(src)) {
        if (!llamada.dentroDeTransaccion) continue;
        // El segundo argumento es el cliente. Se busca `, tx,` o `, tx)` — la
        // coma de cierre la pone el formateador del proyecto.
        expect(
          /,\s*tx\s*,?\s*\)$/.test(llamada.texto.trim()),
          `${archivo}:${llamada.linea} audita DENTRO de una transacción sin pasarle el cliente. ` +
            `Usaría la conexión global, así que su fila se confirmaría aunque la transacción revierta.`,
        ).toBe(true);
      }
    });

    /**
     * El patrón viejo, que es el que se arregló los días 5 y 6: auditar justo
     * después del `});`. La escritura ya confirmó, así que si el audit falla
     * queda un hecho sin rastro — el fallo que `lib/audit.ts` documenta.
     *
     * Se comprueba aparte del anterior para que el mensaje diga cuál de los dos
     * problemas es: uno se arregla pasando `tx`, el otro moviendo la llamada.
     */
    /**
     * **Tercera regla, 2026-09-06.** Todo audit va DENTRO de una transacción, o
     * declara encima de sí mismo por qué no puede.
     *
     * Las otras dos cazan que se quite el `tx` y que la llamada vuelva tras el
     * `});`. Ninguna caza que alguien quite la transacción ENTERA: una llamada
     * sin transacción cerca les es indistinguible de una legítima. Esta lo
     * cierra, y hoy puede escribirse porque de las 104 llamadas del repositorio
     * queda **una** que no acompaña ninguna escritura.
     *
     * **La exención se declara en el sitio de la llamada, no aquí.** Una lista
     * de rutas en este archivo sería la lista de archivos que este guardia se
     * quitó de encima: envejece sin avisar, y nada la borra cuando el código
     * que la justificaba desaparece. Un comentario `audit-sin-escritura:` con
     * su razón viaja con la llamada y muere con ella. Y exige razón escrita, de
     * al menos veinte caracteres, para que no se pueda pegar en blanco.
     */
    it(`${archivo}: todo recordAuditEvent va en una transacción, o dice por qué no`, () => {
      const src = readFileSync(join(RAIZ, archivo), "utf8");
      const huerfanas = llamadas(src).filter((l) => !l.dentroDeTransaccion && !l.sinEscritura);
      expect(
        huerfanas.map((l) => `${archivo}:${l.linea}`),
        "audita sin transacción y sin declarar por qué. Si acompaña una escritura, mételas en la misma " +
          "`$transaction` y pásale `tx`. Si de verdad no acompaña ninguna —auditar una lectura, una " +
          "exportación—, escríbelo encima de la llamada: `// audit-sin-escritura: <razón>`.",
      ).toEqual([]);
    });

    it(`${archivo}: ningún recordAuditEvent justo después de cerrar una transacción`, () => {
      const src = readFileSync(join(RAIZ, archivo), "utf8");
      const sospechosas = llamadas(src).filter((l) => l.trasElCierre && !l.dentroDeTransaccion);
      expect(
        sospechosas.map((l) => `${archivo}:${l.linea}`),
        "auditar tras el `});` deja la escritura confirmada y el audit fuera: si falla, hay hecho sin rastro. Muévelo dentro y pásale `tx`.",
      ).toEqual([]);
    });
  }
});
