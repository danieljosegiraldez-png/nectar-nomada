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
}

/**
 * Dónde empieza y acaba cada callback de `$transaction`, **contando paréntesis**.
 *
 * **La primera versión cerraba por indentación** — el `});` al mismo nivel que
 * la línea que abría — y daba tres falsos positivos. No por un formato exótico:
 * `lib/traceability/plantingCohorts.ts` tiene el cuerpo de su transacción al
 * MISMO nivel que su apertura, así que el `});` de un `create` interno pasaba
 * por el cierre de la transacción y todo lo que venía después quedaba
 * «fuera». La indentación no es estructura, y un guardia que la use para
 * decidir estructura señala código correcto.
 *
 * Contar paréntesis desde el `(` de `$transaction(` no depende del formato.
 */
function rangosDeTransaccion(src: string): Array<[number, number]> {
  const rangos: Array<[number, number]> = [];
  const marca = "$transaction(";
  for (let i = src.indexOf(marca); i !== -1; i = src.indexOf(marca, i + 1)) {
    let profundidad = 0;
    for (let j = i + marca.length - 1; j < src.length; j++) {
      if (src[j] === "(") profundidad++;
      else if (src[j] === ")") {
        profundidad--;
        if (profundidad === 0) {
          rangos.push([i, j]);
          break;
        }
      }
    }
  }
  return rangos;
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

function llamadas(src: string): Llamada[] {
  const rangos = rangosDeTransaccion(src);
  const marca = "recordAuditEvent(";
  const salida: Llamada[] = [];
  for (let i = src.indexOf(marca); i !== -1; i = src.indexOf(marca, i + 1)) {
    const cierreAnterior = rangos.filter(([, b]) => b < i).map(([, b]) => b);
    const ultimo = cierreAnterior.length ? Math.max(...cierreAnterior) : -1;
    salida.push({
      linea: lineaDe(src, i),
      texto: textoDeLaLlamada(src, i + "recordAuditEvent".length),
      dentroDeTransaccion: rangos.some(([a, b]) => a < i && i < b),
      // «Justo después» se mide en LÍNEAS, no en caracteres: el `});`, una en
      // blanco y un comentario corto caben en cuatro.
      trasElCierre: ultimo >= 0 && lineaDe(src, i) - lineaDe(src, ultimo) <= 4,
    });
  }
  return salida;
}

/**
 * `scripts/` queda fuera a propósito: son herramientas de administración que se
 * corren a mano contra una base concreta, no caminos que ejerza un usuario.
 * Si alguna vez auditan dentro de una transacción, entrarán aquí — pero
 * meterlas hoy sería ampliar el guardia sin haber medido sus 9 llamadas.
 */
const ARCHIVOS = [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app"))]
  .map((r) => relative(RAIZ, r))
  .filter((r) => readFileSync(join(RAIZ, r), "utf8").includes("recordAuditEvent("))
  .sort();

describe("el audit viaja con la transacción que lo produjo", () => {
  /**
   * Control positivo del análisis, no del código. Si `rangosDeTransaccion`
   * dejara de reconocer la forma de un `$transaction` —un cambio de formato, un
   * `prettier` distinto— todas las llamadas saldrían «fuera de transacción» y
   * el guardia pasaría sin comprobar nada. Esto lo convierte en rojo.
   */
  it("el análisis encuentra transacciones y llamadas de verdad", () => {
    expect(ARCHIVOS.length, "ningún archivo llama a recordAuditEvent").toBeGreaterThan(10);

    // Control positivo del ALCANCE, no del análisis. Sin esto, volver a dejar
    // `app/` fuera —un refactor de `fuentes`, un filtro de más— haría que el
    // guardia siguiera verde comprobando la mitad del mundo, que es
    // exactamente como llegó `app/actions/auth.ts` hasta aquí.
    expect(
      ARCHIVOS.filter((a) => a.startsWith("app/")),
      "ningún archivo de app/ entró en el análisis: el guardia volvió a mirar sólo lib/",
    ).not.toHaveLength(0);
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
