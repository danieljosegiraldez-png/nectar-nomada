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
 *
 * ## Y el 2026-09-14, más tarde: este guardia dejó de leer prosa
 *
 * Nació leyendo la unión `MotivoDeAlerta` con una expresión regular sobre el texto de
 * `vitalesDelSitio.ts`, porque ese archivo arrastra `prisma` y aquí no se puede importar.
 * Ese detector **midió cero motivos** el mismo día que se escribió: un comentario añadido
 * dentro de la declaración traía un `;` y la unión se cortó ahí. Con cero motivos, los `it`
 * de abajo pasan sin mirar nada — sólo lo destapó el control positivo.
 *
 * Los motivos viven ahora en `motivoDeAlerta.ts`, que es puro, así que **este guardia lee un
 * valor**. No queda expresión regular que romper ni comentario que la confunda, y el control
 * positivo se queda igual: si la lista llega vacía, la corrida se anula aquí y no en silencio.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOTIVOS_DE_ALERTA } from "../../lib/apiary/motivoDeAlerta";

const PANTALLA = "app/apiaries/page.tsx";

/** Un `import`/`require` del cliente de base de datos, mirando código y no comentarios. */
export function detectaImportDePrisma(fuente: string): boolean {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  return /\b(?:import|require)\b[^\n;]*\bprisma\b/i.test(sinComentarios) ||
    /\b(?:import|require)\b[^\n;]*["'][^"']*\/db["']/.test(sinComentarios);
}

function importaPrisma(ruta: string): boolean {
  return detectaImportDePrisma(readFileSync(ruta, "utf8"));
}

describe("cada alerta del sitio tiene su texto", () => {
  const motivos: readonly string[] = MOTIVOS_DE_ALERTA;

  it("la lista de motivos llega con contenido — control positivo antes de todo", () => {
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

  it("el módulo de motivos NO arrastra el cliente de base de datos — es la razón de que exista", () => {
    // Si alguien le añade un `import { prisma }`, este archivo deja de poder importarlo y
    // el carril hermético empieza a fallar por una razón que no se parece a la causa. Se
    // dice aquí, donde se lee, en vez de en el mensaje de error.
    //
    // **Y se mide sobre los `import`, no sobre el texto del archivo.** La primera versión
    // era `not.toContain("prisma")` y cayó al escribirla: la palabra está en el comentario
    // de cabecera del propio módulo, que explica por qué no lo importa. Un detector que
    // lee prosa dice que la hay donde sólo se habla de ella.
    expect(importaPrisma("lib/apiary/motivoDeAlerta.ts")).toBe(false);
  });

  it("CONTROL DEL DETECTOR: el mismo detector SÍ lo ve donde de verdad está", () => {
    // Sin esta mitad, el `false` de arriba podría significar «no miré». `vitalesDelSitio.ts`
    // importa el cliente en su primera línea, así que aquí tiene que salir `true`.
    expect(importaPrisma("lib/apiary/vitalesDelSitio.ts")).toBe(true);
    // Y sobre un archivo que sólo NOMBRA prisma en un comentario, `false`.
    expect(detectaImportDePrisma("// hablamos de prisma\nexport const x = 1;\n")).toBe(false);
    expect(detectaImportDePrisma('import { prisma } from "../db";\n')).toBe(true);

    // **EL CASO QUE EXIGE QUITAR LOS COMENTARIOS, y lo añadió un flip-test.** Sin él, la
    // línea que los quita no la ejercitaba ninguna prueba: quitándola entera, las seis
    // seguían en verde. Es la trampa del escapado del RSS —una transformación que el corpus
    // no dispara está sin probar aunque la prueba pase—. Un `import` comentado es el caso
    // realista: existe en cuanto alguien deja uno apagado con un TODO al lado.
    expect(detectaImportDePrisma('// import { prisma } from "../db";\nexport const x = 1;\n')).toBe(false);
    expect(detectaImportDePrisma('/* import { prisma } from "../db"; */\nexport const x = 1;\n')).toBe(false);
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
});
