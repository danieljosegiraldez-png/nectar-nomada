/**
 * **Cada código de tueste del camino de la muestra tiene su frase, en los dos idiomas.**
 *
 * Nace de un defecto real, medido el 2026-10-04 recorriendo el tueste desde muestra con una cuenta
 * de operario: de los trece códigos que lanza `RoastSessionValidationError`, **ninguno** tenía
 * frase propia. La rama existe —`error_roast`, «No se pudo guardar el tueste: {detail}»— así que no
 * es un 500; lo que ve el operario es una frase en español con el código **en inglés** dentro:
 * «No se pudo guardar el tueste: sample_mass_in_kg_required».
 *
 * Los seis del camino de la muestra tienen frase desde hoy. Los otros siete siguen con el
 * envoltorio, y eso es deliberado: son de la pantalla de tueste de producción, que no se tocó.
 *
 * **Lo que este archivo NO caza, dicho antes de que alguien cuente con él.** Vigila que las frases
 * **existan** y que la lista de `roasting.ts` nombre códigos que de verdad se lanzan. No vigila que
 * la acción las **pida** bien: si alguien quitara la rama de `app/actions/traceability.ts` que las
 * usa, estas pruebas seguirían pasando y el operario volvería a ver el código crudo. Ese guardia es
 * `tests/arquitectura/acciones-traducen-sus-errores.test.ts`, que lee la acción.
 *
 * Hermética: sólo lee archivos, así que NO va a `scripts/pruebas-por-compuerta.txt`. Y lee la lista
 * de la FUENTE en vez de importarla, porque `lib/traceability/roasting.ts` importa el cliente de
 * Prisma y este carril corre sin base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;
const fuente = readFileSync("lib/traceability/roasting.ts", "utf8");

/** Los códigos que el servicio de tueste lanza de verdad, descubiertos y no enumerados. */
const LANZADOS = [...fuente.matchAll(/new RoastSessionValidationError\(\s*"([a-z_]+)"/g)].map((m) => m[1]!);

/** La lista que la acción usa para elegir la frase propia, leída de donde vive. */
const bloque = /export const CODIGOS_DE_TUESTE_CON_FRASE = \[([\s\S]*?)\] as const;/.exec(fuente)?.[1] ?? "";
const CON_FRASE = [...bloque.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);

const clave = (codigo: string) => `error_roast_${codigo}`;

describe("las frases del tueste desde muestra", () => {
  /**
   * **La fila patrón, y va primero.** Los dos patrones de arriba pueden dejar de casar —un formato
   * distinto, un renombrado— y entonces las listas salen vacías, todas las pruebas de abajo pasan
   * sobre cero elementos, y el cero se lee como «ninguno falta». Esto lo dice antes.
   */
  it("FILA PATRÓN: los dos patrones encuentran algo, y la lista no está vacía", () => {
    expect(LANZADOS.length, "códigos lanzados encontrados en roasting.ts").toBeGreaterThanOrEqual(13);
    expect(CON_FRASE.length, "códigos en CODIGOS_DE_TUESTE_CON_FRASE").toBe(6);
    expect(Object.keys(es.Traceability ?? {}).length, "el espacio «Traceability» de es.json").toBeGreaterThan(0);
    expect(Object.keys(en.Traceability ?? {}).length, "el espacio «Traceability» de en.json").toBeGreaterThan(0);
  });

  it("cada código con frase es un código que el servicio lanza de verdad", () => {
    const inventados = CON_FRASE.filter((c) => !LANZADOS.includes(c));
    expect(inventados, `mirados ${CON_FRASE.length} contra los ${LANZADOS.length} lanzados`).toEqual([]);
  });

  it("las frases existen en es.json", () => {
    const faltan = CON_FRASE.filter((c) => (es.Traceability?.[clave(c)] ?? "").trim() === "");
    expect(faltan, `miradas ${CON_FRASE.length} claves bajo «Traceability» de es.json`).toEqual([]);
  });

  it("las frases existen en en.json", () => {
    const faltan = CON_FRASE.filter((c) => (en.Traceability?.[clave(c)] ?? "").trim() === "");
    expect(faltan, `miradas ${CON_FRASE.length} claves bajo «Traceability» de en.json`).toEqual([]);
  });

  /**
   * **El otro sentido, que es el que se olvida.** Una frase escrita para un código que no está en la
   * lista no la pide nadie: queda en los mensajes pareciendo que el caso está cubierto, y el
   * operario sigue viendo el código crudo. Esto cuenta las claves `error_roast_*` que hay y exige
   * que sean exactamente las de la lista.
   */
  it("no hay ninguna frase huérfana, en ninguno de los dos idiomas", () => {
    const sufijos = (m: Record<string, string>) =>
      Object.keys(m)
        .filter((k) => k.startsWith("error_roast_"))
        .map((k) => k.slice("error_roast_".length))
        .sort();
    expect(sufijos(es.Traceability ?? {})).toEqual([...CON_FRASE].sort());
    expect(sufijos(en.Traceability ?? {})).toEqual([...CON_FRASE].sort());
  });

  /**
   * **El envoltorio sigue haciendo falta**, y esto lo deja escrito: los siete códigos sin frase
   * propia salen por ahí. Si alguien quitara `error_roast` creyendo que ya sobra, el tueste de
   * producción perdería su mensaje.
   */
  it("CONTROL: el envoltorio genérico sigue existiendo, y hay códigos que lo necesitan", () => {
    expect(es.Traceability?.error_roast).toBeTruthy();
    expect(en.Traceability?.error_roast).toBeTruthy();
    const sinFrase = [...new Set(LANZADOS)].filter((c) => !CON_FRASE.includes(c));
    expect(sinFrase.length, "códigos que todavía salen envueltos").toBeGreaterThan(0);
  });
});
