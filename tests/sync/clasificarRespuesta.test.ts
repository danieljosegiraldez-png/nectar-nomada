import { describe, expect, it } from "vitest";
import { clasificarRespuesta, leerJson } from "../../lib/sync/offlineQueue";

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

/**
 * Un 2xx que no es JSON: qué se le dice a quien lo depura.
 *
 * **De dónde sale.** Medido contra el artefacto vivo el 2026-09-09: un POST a
 * una ruta inexistente contesta **200 con la página HTML de not-found**, y un
 * GET a la misma ruta contesta 404. `clasificarRespuesta(200)` dice «aplicar»
 * —correctamente, mira sólo el estado— y el `res.json()` siguiente revienta con
 * un `SyntaxError` que no nombra la ruta, ni el estado, ni lo que llegó.
 *
 * **No hay pérdida de datos y estos tests no la vigilan**, porque no la hay: el
 * throw ocurre antes de descartar ningún borrador. Lo que se prueba aquí es que
 * el error DICE algo — es un guardia sobre el diagnóstico, no sobre los datos,
 * y así hay que leerlo.
 *
 * Las aserciones miran el CONTENIDO del mensaje a propósito. Comprobar sólo que
 * lanza pasaría igual sin el ayudante —el parseo también lanza—, y sería el
 * adorno que este repositorio se pasa el día cazando.
 */
describe("leerJson: un 2xx que no es JSON dice qué llegó", () => {
  const resp = (cuerpo: string, tipo: string | null, status = 200) =>
    new Response(cuerpo, { status, headers: tipo ? { "content-type": tipo } : {} });

  it("con JSON devuelve el objeto", async () => {
    const r = resp('{"id":"abc"}', "application/json");
    await expect(leerJson<{ id: string }>(r, "ctx")).resolves.toEqual({ id: "abc" });
  });

  it("acepta el content-type con charset", async () => {
    const r = resp('{"id":"abc"}', "application/json; charset=utf-8");
    await expect(leerJson<{ id: string }>(r, "ctx")).resolves.toEqual({ id: "abc" });
  });

  /** El caso real: 200 con la página de not-found. */
  it("con HTML lanza nombrando el estado y el tipo recibido", async () => {
    const r = resp("<!DOCTYPE html><html></html>", "text/html; charset=utf-8");
    await expect(leerJson(r, "POST /api/v1/devices")).rejects.toThrow(/POST \/api\/v1\/devices/);
    await expect(leerJson(resp("<!DOCTYPE html>", "text/html"), "ctx")).rejects.toThrow(/200/);
    await expect(leerJson(resp("<!DOCTYPE html>", "text/html"), "ctx")).rejects.toThrow(/text\/html/);
  });

  /**
   * Un 204 no trae cuerpo ni `content-type`. `clasificarRespuesta(204)` dice
   * «aplicar», así que esta rama se alcanza de verdad.
   *
   * Nota de cómo se construyó: `new Response("texto")` NO sirve para probar la
   * ausencia — Node le pone `text/plain` solo, y la primera versión de este
   * test falló por eso. Hace falta un cuerpo nulo.
   */
  it("sin content-type lo dice en vez de callarlo", async () => {
    const r = new Response(null, { status: 204 });
    await expect(leerJson(r, "ctx")).rejects.toThrow(/sin content-type/);
    await expect(leerJson(new Response(null, { status: 204 }), "ctx")).rejects.toThrow(/204/);
  });
});
