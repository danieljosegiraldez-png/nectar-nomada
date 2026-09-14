import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Todo estado que un motor puede emitir tiene texto en los dos idiomas.
 *
 * **Por qué no basta con mirar el componente.** Las claves se construyen
 * dinámicamente —`t(\`estado_\${r.status}\`)`— así que un `grep` de literales
 * encuentra cuatro y se queda tan tranquilo. Un estado nuevo sin traducción no
 * rompe nada: **la pantalla pinta la clave cruda**, `estado_STAGNATION_HAZARD`,
 * y en el patio eso es exactamente igual de útil que no decir nada.
 *
 * **Y lo peligroso es la dirección.** Añadir un estado a un motor es normal y
 * frecuente; acordarse de traducirlo, no. Por eso el guardia lee los estados de
 * **la fuente de los motores**, no de una lista escrita a mano que derivaría en
 * silencio de lo que el código realmente devuelve.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const leer = (r: string) => readFileSync(join(RAIZ, r), "utf8");

/**
 * Los miembros de un tipo unión declarado como `export type X = "A" | "B" …`.
 *
 * Se leen de la fuente a propósito: una lista repetida aquí es una segunda
 * fuente de verdad, y las dos fuentes derivan.
 */
function miembrosDeUnion(fuente: string, nombre: string): string[] {
  const i = fuente.indexOf(`export type ${nombre} =`);
  if (i < 0) throw new Error(`no encuentro el tipo ${nombre}`);
  const cuerpo = fuente.slice(i, fuente.indexOf(";", i));
  return [...cuerpo.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);
}

const ESTADOS = [
  ...miembrosDeUnion(leer("lib/beneficio/ph.ts"), "PHStatus"),
  ...miembrosDeUnion(leer("lib/beneficio/brix.ts"), "BrixStatus"),
  ...miembrosDeUnion(leer("lib/beneficio/secado.ts"), "DryingStatus"),
];
const RAZONES = miembrosDeUnion(leer("lib/beneficio/desdeElLote.ts"), "SinVeredicto");

const mensajes = (idioma: string) =>
  JSON.parse(leer(`messages/${idioma}.json`)).Beneficio as Record<string, unknown>;

describe("todo lo que la pantalla puede tener que decir, sabe decirlo", () => {
  /**
   * **El control positivo del propio análisis.** Si el parseo de la unión se
   * rompiera —un cambio de formato, un tipo renombrado— las listas saldrían
   * vacías y las comprobaciones de abajo pasarían sin mirar un solo estado.
   */
  it("el parseo encuentra los estados que se sabe que existen", () => {
    expect(ESTADOS.length, `estados leídos: ${ESTADOS.join(", ")}`).toBeGreaterThanOrEqual(20);
    for (const conocido of ["KINETIC_PLATEAU", "STAGNATION_HAZARD", "STALLED_MOLD_HAZARD", "TARGET_REACHED"]) {
      expect(ESTADOS, `falta ${conocido} — el parseo está ciego`).toContain(conocido);
    }
    expect(RAZONES.length, `razones leídas: ${RAZONES.join(", ")}`).toBeGreaterThanOrEqual(4);
  });

  it.each(["es", "en"])("%s tiene texto para cada estado de motor", (idioma) => {
    const m = mensajes(idioma);
    const faltan = [...new Set(ESTADOS)].filter((e) => !(`estado_${e}` in m));
    expect(
      faltan,
      `sin traducir en ${idioma}: ${faltan.join(", ")} — la pantalla pintaría la clave cruda`,
    ).toEqual([]);
  });

  it.each(["es", "en"])("%s tiene texto para cada razón de NO haber veredicto", (idioma) => {
    const m = mensajes(idioma);
    const faltan = RAZONES.filter((r) => !(`sinVeredicto_${r}` in m));
    expect(faltan, `sin traducir en ${idioma}: ${faltan.join(", ")}`).toEqual([]);
  });

  /**
   * La limitación es lo que hace auditable el veredicto. Si el puente declara
   * una que nadie tradujo, la pantalla diría «esto no pudo mirar:
   * SIN_PUNTO_DE_MUESTREO», que no informa a nadie en el patio.
   */
  it.each(["es", "en"])("%s tiene texto para cada limitación que el puente declara", (idioma) => {
    const puente = leer("lib/beneficio/desdeElLote.ts");
    const declaradas = [...new Set([...puente.matchAll(/limitaciones\.push\("([A-Z_]+)"\)/g)].map((x) => x[1]!))];
    expect(declaradas.length, "el puente no declara ninguna limitación: ¿se rompió el parseo?").toBeGreaterThanOrEqual(3);
    const m = mensajes(idioma);
    const faltan = declaradas.filter((l) => !(`limitacion_${l}` in m));
    expect(faltan, `sin traducir en ${idioma}: ${faltan.join(", ")}`).toEqual([]);
  });

  /**
   * **Ningún texto de operador ordena una acción física.** Es el criterio de
   * aceptación §18 de la propuesta de UX y la regla de autonomía del paquete:
   * el motor recomienda, la persona frente al tanque decide. Un imperativo aquí
   * no es un matiz de estilo — le quita el juicio a quien ve el olor, el color y
   * la espuma que ningún motor mide.
   */
  it("ningún texto en español ordena lavar, detener o parar el lote", () => {
    const m = mensajes("es");
    const imperativos = /\b(lave|lava|lavar de inmediato|detenga|detén|pare|para el lote|suspenda)\b/i;
    const culpables = Object.entries(m)
      .filter(([k]) => k.startsWith("estado_") || k.startsWith("sinVeredicto_"))
      .filter(([, v]) => typeof v === "string" && imperativos.test(v))
      .map(([k]) => k);
    expect(culpables, `textos que ordenan en vez de preguntar: ${culpables.join(", ")}`).toEqual([]);
  });
});
