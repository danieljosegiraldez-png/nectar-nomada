import { describe, expect, it } from "vitest";
import { clasificarRespuesta } from "../../lib/sync/offlineQueue";

/**
 * P4 §4 — la frontera entre «el servidor se negó» y «el servidor no pudo».
 *
 * **Por qué existe este archivo.** La primera versión de `syncFieldEvents`
 * trataba todo `!res.ok` como rechazo, contradiciendo a su propia ruta, que
 * deja subir los errores inesperados precisamente para que el cliente conserve
 * la cola. Un 500 marcaba las anotaciones del operador como rechazadas: le
 * decía que el servidor había negado su trabajo cuando lo que pasó es que se
 * cayó. Nada fallaba de forma visible —los borradores se reintentan igual— y
 * por eso hacía falta un test: el defecto era un mensaje falso, no una excepción.
 *
 * Hermético a propósito: sólo la decisión, sin IndexedDB ni `fetch`. Este
 * repositorio no tiene `fake-indexeddb` ni entorno DOM (ver
 * `tests/apiary/offlineQueue.test.ts`), así que la parte probable se extrae y
 * se prueba, y lo que no se puede probar se dice en vez de insinuarse.
 */
describe("clasificarRespuesta: qué significa el código de estado de un push", () => {
  it("2xx se lee: hay resultado por mutación", () => {
    for (const s of [200, 201, 204, 299]) expect(clasificarRespuesta(s)).toBe("aplicar");
  });

  /**
   * El caso que motivó el arreglo. Un 500 no es un juicio sobre lo que el
   * operador anotó: nadie llegó a mirarlo.
   */
  it("5xx deja la cola intacta: el servidor no evaluó nada", () => {
    for (const s of [500, 502, 503, 504]) expect(clasificarRespuesta(s)).toBe("reintentar");
  });

  it("408 y 429 también son «ahora no», no «no»", () => {
    expect(clasificarRespuesta(408)).toBe("reintentar");
    expect(clasificarRespuesta(429)).toBe("reintentar");
  });

  /**
   * 403 es el caso real: aparato revocado. El servidor corrió, miró y se negó.
   * Reintentarlo para siempre no lo va a arreglar, y esconderlo del operador
   * tampoco.
   */
  it("el resto de 4xx sí es un no del servidor", () => {
    for (const s of [400, 401, 403, 404, 413, 422]) expect(clasificarRespuesta(s)).toBe("rechazar");
  });

  /**
   * El invariante que importa, dicho como propiedad y no como lista: ningún
   * código de servidor caído puede acabar marcando trabajo de campo como
   * rechazado. Si alguien añade un caso nuevo a la función y se equivoca de
   * rama, esto lo dice aunque no toque los tests de arriba.
   */
  it("ningún 5xx acaba nunca en «rechazar»", () => {
    const malos = Array.from({ length: 100 }, (_, i) => 500 + i).filter(
      (s) => clasificarRespuesta(s) === "rechazar",
    );
    expect(malos, "un servidor caído no rechaza nada: no llegó a mirarlo").toEqual([]);
  });
});
