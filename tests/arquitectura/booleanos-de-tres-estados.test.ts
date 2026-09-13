import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un booleano que admite «sin registrar» no se pregunta con una casilla.
 *
 * **Por qué existe.** Una casilla tiene dos estados; `Boolean?` tiene tres. El
 * 2026-09-01 la muestra foliar se preguntaba con una casilla más un
 * `<input type="hidden" name="branchBearingFruitPresent" value="1">`, y la
 * acción hacía `presente ? marcada : null`. Pero el oculto se enviaba SIEMPRE,
 * así que la rama `null` era inalcanzable: dejar la casilla intacta guardaba
 * `false` —«la rama no llevaba fruto»— cuando lo cierto era que nadie lo miró.
 *
 * Lo caro era lo que se deriva de ahí: `camposDeProtocoloQueFaltan` cuenta
 * `false` como registrado, así que esas muestras se presentaban además como
 * comparables. Ausencia convertida en afirmación, que es lo que ADR-080
 * prohíbe. Lo encontró la quinta revisión independiente, la de la pantalla; las
 * cuatro anteriores no miraban esta capa.
 *
 * **Por qué un test de FUENTE.** El defecto vive en el par formulario+acción y
 * no lo toca ningún test de servicio. Y la función que hace la conversión no se
 * puede importar aquí: vive en un archivo `"use server"`, del que Next.js sólo
 * deja exportar funciones `async` (ver `use-server-solo-async.test.ts`).
 * Exportarla para poder probarla rompería el build.
 *
 * **La regla se ata al esquema, no a una lista escrita a mano**, igual que
 * `valoresEnumerados.test.ts`: si mañana alguien añade un `Boolean?` nuevo y lo
 * pregunta con una casilla, este test lo ve sin que nadie lo actualice.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/** Los campos `Boolean?` del esquema: el dominio de tres estados. */
const booleanosNulables = (): string[] => {
  const esquema = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");
  return [...esquema.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9]*)\s+Boolean\?/gm)]
    .map((m) => m[1])
    .filter((nombre): nombre is string => nombre != null);
};

/**
 * El código sin sus comentarios.
 *
 * La primera versión de este test cayó sobre `TriStateField.tsx`, cuyo
 * comentario CITA el patrón prohibido para explicar por qué existe. Un guardia
 * que se dispara con la prosa que lo documenta enseña a no documentar.
 */
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const componentes = (dir: string): string[] => {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...componentes(ruta));
    else if (entrada.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
};

describe("un Boolean? no se pregunta con una casilla", () => {
  const campos = booleanosNulables();
  const archivos = componentes(join(RAIZ, "app/components")).map(
    (ruta) => [relative(RAIZ, ruta), readFileSync(ruta, "utf8")] as const,
  );

  /**
   * Control positivo. Sin él, un regex que dejara de casar con el esquema —o un
   * `app/components` que cambiara de sitio— dejaría este test verde sobre una
   * lista vacía, que es la comprobación negativa que `CLAUDE.md` prohíbe.
   */
  it("encuentra el dominio y los formularios donde deben estar", () => {
    expect(campos).toContain("branchBearingFruit");
    expect(campos).toContain("coComposted");
    expect(archivos.length).toBeGreaterThanOrEqual(10);
    expect(archivos.map(([ruta]) => ruta)).toContain(
      "app/components/traceability/SampleForms.tsx",
    );
  });

  /**
   * Control positivo del detector NUEVO, sobre una cadena a mano y no sobre el
   * árbol: si mañana el regex deja de casar, esta prueba lo dice en vez de
   * quedarse verde sobre cero hallazgos. Es la misma exigencia que el control de
   * arriba, aplicada a la otra mitad de la regla.
   *
   * La primera versión de este detector midió **0** casos teniendo uno delante:
   * construía el dominio con `m[0]` sobre cadenas, que devuelve la primera
   * LETRA, así que comparaba contra ocho letras sueltas. Lo destapó imprimir lo
   * que medía, no releer el resultado.
   */
  it("el detector por estado reconoce la forma que caza, y la que no", () => {
    const campo = campos[0]!;
    const mala = `<input type="checkbox" checked={${campo}} onChange={(e) =` ;
    const buena = `<input type="checkbox" checked={etapas.has(v)} onChange={(e) =`;
    const caza = (etiqueta: string) =>
      campos.some((c) => new RegExp(`checked=\\{${c}\\b`).test(etiqueta));
    expect(caza(mala), "no reconoce una casilla atada a un campo de tres estados").toBe(true);
    expect(caza(buena), "marca una casilla que NO es de tres estados").toBe(false);
    // Y que el dominio no esté vacío, que es lo que volvería inútil lo anterior.
    expect(campos.length).toBeGreaterThanOrEqual(8);
  });

  it.each(archivos.map(([ruta]) => ruta))("%s", (ruta) => {
    const [, bruto] = archivos.find(([r]) => r === ruta)!;
    const fuente = sinComentarios(bruto);

    // Una casilla cuyo `name` es un campo de tres estados.
    const casillas = [...fuente.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)]
      .map((m) => m[0])
      .filter((etiqueta) => campos.some((campo) => etiqueta.includes(`name="${campo}"`)));
    expect(casillas).toEqual([]);

    // **Y la mitad que este guardia no veía: las casillas atadas por ESTADO.**
    //
    // La regla de arriba busca `name="…"`, que es como se ata un formulario de
    // servidor. Los de campo —inspección, evento de colonia, fin de colonia,
    // varroa— guardan en IndexedDB, así que no tienen `name` y se atan con
    // `checked={campo}`. Medido el 2026-09-12: había **un** caso,
    // `queenSighted` en `InspectionForm.tsx`, con el defecto exacto que este
    // archivo describe —sin marcar guardaba `false`, «miré y no estaba», cuando
    // lo cierto era que nadie buscó la reina— y el guardia pasaba en verde.
    //
    // Son justo los formularios que más importan: son los que se usan de pie, al
    // sol y sin señal, y los únicos por los que entra dato de campo.
    const porEstado = [...fuente.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)]
      .map((m) => m[0])
      .filter((etiqueta) =>
        campos.some((campo) => new RegExp(`checked=\\{${campo}\\b`).test(etiqueta)),
      );
    expect(porEstado).toEqual([]);

    // Y el andamio que intentaba arreglarla: un oculto `…Present`.
    const ocultosPresent = [...fuente.matchAll(/name="([a-zA-Z0-9]+)Present"/g)].map((m) => m[0]);
    expect(ocultosPresent).toEqual([]);
  });
});
