/**
 * Cada motivo de alerta del sitio tiene su texto, en los dos idiomas.
 *
 * **Por qué hace falta un guardia y no basta el compilador.**
 * `app/apiaries/page.tsx` pinta las alertas con `t(\`alerta_${a.motivo}\`)`: la clave se
 * construye en ejecución, así que TypeScript **no puede** ver que falte. Un motivo nuevo
 * sin su texto no rompe el build — rompe la lista de apiarios cuando alguien la abre, que
 * es la primera pantalla del módulo.
 *
 * Se escribió el 2026-09-14 al añadir tres motivos de golpe (Anexo E §3 y §4): la
 * comprobación se había hecho a mano, y una comprobación a mano es una que la próxima vez
 * no se hace.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FUENTE = "lib/apiary/vitalesDelSitio.ts";
const PANTALLA = "app/apiaries/page.tsx";

/**
 * Los motivos declarados en la unión `MotivoDeAlerta`. Se leen de la fuente y no se
 * importan: importar el módulo arrastra `prisma`, y este guardia corre en el carril
 * hermético.
 */
export function motivosDeclarados(fuente: string): string[] {
  const m = /export type MotivoDeAlerta =([\s\S]*?);/.exec(fuente);
  if (!m) return [];
  return [...m[1]!.matchAll(/"(\w+)"/g)].map((x) => x[1]!);
}

describe("cada alerta del sitio tiene su texto", () => {
  const fuente = readFileSync(FUENTE, "utf8");
  const motivos = motivosDeclarados(fuente);

  it("el detector lee la unión de verdad — control positivo antes de todo", () => {
    // Si esto baja, el guardia mide cero motivos y los demás `it` pasan sin mirar nada.
    expect(motivos.length).toBeGreaterThanOrEqual(5);
    // Y dos que sé que están desde antes de este guardia.
    expect(motivos).toContain("perdida_sin_reposicion");
    expect(motivos).toContain("visita_sin_cerrar");
  });

  it("la pantalla sigue construyendo la clave en ejecución — si deja de hacerlo, este guardia sobra", () => {
    // Es la razón de existir del archivo. Si alguien pasa a claves literales, el
    // compilador ya cubre el caso y esta prueba debería borrarse en vez de quedarse
    // vigilando algo que ya no ocurre.
    expect(readFileSync(PANTALLA, "utf8")).toContain("alerta_${a.motivo}");
  });

  for (const lang of ["es", "en"] as const) {
    it(`todos los motivos tienen texto en ${lang}.json`, () => {
      const mensajes = JSON.parse(readFileSync(`messages/${lang}.json`, "utf8")) as Record<
        string,
        Record<string, string>
      >;
      const apiario = mensajes.Apiary ?? {};
      const faltan = motivos.filter((m) => typeof apiario[`alerta_${m}`] !== "string");
      expect(faltan.map((m) => `alerta_${m}`)).toEqual([]);
    });
  }

  it("CONTROL DEL DETECTOR: sobre una unión sintética, saca los motivos", () => {
    const sintetica = 'export type MotivoDeAlerta =\n  | "uno"\n  | "dos_tres";\n';
    expect(motivosDeclarados(sintetica)).toEqual(["uno", "dos_tres"]);
    // Y sin la unión, devuelve vacío en vez de inventar — lo que hace fallar el control
    // positivo de arriba en vez de pasar en silencio.
    expect(motivosDeclarados("nada que ver")).toEqual([]);
  });
});
