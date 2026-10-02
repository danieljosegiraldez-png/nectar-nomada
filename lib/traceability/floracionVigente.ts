/**
 * ¿Aplica alguna de estas ventanas de floración a lo que se está registrando?
 *
 * **Vive en un módulo puro porque lo usa el navegador.** La fecha de una intervención se escribe en
 * el formulario y se calcula ahí a propósito —ronda final, hallazgo 1: calcularla en el servidor
 * horneaba la zona horaria del servidor en el valor precargado—, así que la decisión del aviso tiene
 * que tomarse donde está la fecha elegida. Si se tomara en el servidor con «ahora», el aviso se
 * equivocaría en cuanto el operario corrigiera la fecha, y un aviso que se equivoca es un aviso que
 * se aprende a ignorar.
 *
 * Aquí no hay imports de servidor. Nadie autoriza nada: quien llama ya pasó su compuerta.
 */

/** Lo que el servidor manda al navegador de cada ventana. Nada más hace falta para decidir. */
export interface VentanaDeFloracion {
  readonly startsAt: Date;
  /** Nulo = **todavía abierta**, que es el estado de campo mientras la floración dura. */
  readonly endsAt: Date | null;
  /** Nulo = la parcela entera. Con valor, sólo ese bloque. */
  readonly plotBlockId: string | null;
}

/**
 * El día de calendario de un **campo de día**: su medianoche UTC es el día que nombra, así que se
 * lee en UTC. Convertirlo a la zona del dispositivo lo movería un día atrás al oeste de Greenwich —
 * es la trampa que CLAUDE.md describe en «Precargar un `datetime-local` con `toISOString()`».
 */
const diaDelCampo = (d: Date): string | null =>
  Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);

/**
 * El día de calendario de un **instante**, en la zona de quien ejecuta. Esto corre en el navegador,
 * así que es la zona del dispositivo: el día que el operario quiere decir cuando escribe la fecha.
 */
const diaLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * ¿Hay floración que aplique a `cuando`, dados los bloques elegidos?
 *
 * Dos reglas, y las dos importan:
 *
 * - **El bloque, y aquí manda la contención.** `docs/superpowers/specs/2026-10-01-rejilla-y-bloques-design.md`
 *   §D1: «se trata la parcela y entra todo lo de dentro». Así que una ventana de un bloque aplica
 *   cuando ese bloque está entre los elegidos **y también cuando no se eligió ninguno**, porque
 *   entonces la intervención es de la parcela entera y la contiene. La primera versión de esto
 *   decía que sin el bloque elegido no aplicaba, y era un fallo: asperjar la parcela entera asperja
 *   el bloque en floración, y el aviso habría callado justo ahí. Una ventana de la parcela
 *   —`plotBlockId` nulo— aplica siempre. Lo que NUNCA aplica es la ventana de un bloque hermano
 *   que no se está tratando: ése es el mismo cuidado que `registrarFloracion` tiene al comprobar
 *   que el bloque es de su parcela.
 * - **Una limitación conocida, señalada y no arreglada a medias.** Una intervención puede dirigirse
 *   a PLANTAS concretas (`specimenIds`) además de a bloques. Si se eligen sólo plantas,
 *   `bloquesElegidos` llega vacío y la contención de arriba lo lee como «la parcela entera», así que
 *   una ventana de un bloque que esas plantas no tocan **sí** avisa. Lo encontró una revisión
 *   independiente. No se arregla aquí porque hacerlo bien exige resolver a qué bloque pertenece cada
 *   planta y pasarlo al navegador, y el error va en la dirección segura: avisa de más, nunca de
 *   menos, y el aviso no bloquea nada. Queda escrito para que nadie lo descubra dos veces.
 * - **El borde cuenta.** `startsAt <= cuando <= endsAt`, inclusive en los dos extremos. El día que
 *   se anota el inicio es un día de floración.
 *
 * **Y `startsAt`/`endsAt` son campos de DÍA, no instantes.** Lo dice el esquema —«Campo de DÍA,
 * como el resto de fechas de día de la casa: se parsea con `fechaDeDia`»— así que valen la
 * medianoche UTC del día que nombran. Compararlos con `<=` contra un instante real deja el día de
 * cierre ENTERO fuera: medido el 2026-10-01, con la ventana 1–20 de marzo y el operario registrando
 * a las 07:30 de Panamá, el día 20 **no avisaba**. Es el mismo fallo que una revisión de Codex ya
 * encontró en `lib/apiary/ceraDeExtraccion.ts`. Allí el arreglo fue «el día siguiente, exclusivo»
 * porque era un filtro de Postgres; **aquí no vale**, y lo dijo una prueba: el día del operario en
 * Panamá se sale de la ventana UTC por el desfase, así que a las 23:30 del día de cierre volvía a
 * callar. Lo que sí vale es comparar **días de calendario** — el de la ventana en UTC, porque es un
 * campo de día, y el del instante en la zona del dispositivo, porque es el día que el operario
 * quiere decir. Así los dos bordes cuentan enteros en cualquier zona.
 *
 * La primera versión de este archivo decía que `endsAt` era un instante y pedía a la pantalla de
 * registro que mandara el fin del día. Era redefinir el campo para que encajara con la comparación,
 * en vez de arreglar la comparación — y contradecía el esquema del mismo cambio.
 */
export function hayFloracion(
  ventanas: readonly VentanaDeFloracion[],
  cuando: Date,
  bloquesElegidos: readonly string[],
): boolean {
  // **Un instante inválido se rechaza ANTES de comparar, no después.** Un `new Date("")` da
  // `Invalid Date`, y toda comparación con su `NaN` es `false` — o sea que sin esta línea el
  // veredicto seguiría siendo «no hay floración», que es exactamente la respuesta que no avisa.
  // Salir por aquí no cambia el resultado hoy; lo que cambia es que está DICHO, en vez de depender
  // de que nadie invierta la condición algún día y convierta el `NaN` en un «sí» silencioso.
  if (Number.isNaN(cuando.getTime())) return false;

  const diaQueSeAplica = diaLocal(cuando);
  return ventanas.some((v) => {
    // Contención (§D1): sin bloques elegidos la intervención es de la parcela entera, así que
    // contiene todos sus bloques. Con bloques elegidos, sólo los elegidos.
    if (v.plotBlockId !== null && bloquesElegidos.length > 0 && !bloquesElegidos.includes(v.plotBlockId)) {
      return false;
    }
    const inicio = diaDelCampo(v.startsAt);
    if (inicio === null || diaQueSeAplica < inicio) return false;
    if (v.endsAt === null) return true;
    const fin = diaDelCampo(v.endsAt);
    return fin !== null && diaQueSeAplica <= fin;
  });
}
