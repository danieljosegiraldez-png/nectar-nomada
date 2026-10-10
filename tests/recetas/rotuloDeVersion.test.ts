/**
 * El rótulo de una versión de receta en los tres selectores — Parte 2a, revisión final del PR-A (F1-5, 2026-10-10). Hermética.
 *
 * Los tres selectores (el proceso del lote, el perfil de tueste de la ficha y `roast/new`) rotulaban «<receta> · vN · <n> objetivos» con `n` = las metas de la VERSIÓN
 * (las de un paso, con `recipeStepId`, no cuentan): toda receta creada en el editor salía «0 objetivos» aunque tuviera cinco pasos. Ahora dice «<n> pasos» cuando la versión
 * tiene pasos y «<n> objetivos» sólo cuando no los tiene (una receta de antes de los pasos). `listRecipeVersionsForLot` ya trae `_count.steps`.
 *
 * Dos cosas: la función pura, con sus dos casos y el cruce (pasos Y metas de versión: manda lo que el editor escribe, los pasos), y que los tres selectores la LLAMAN — la
 * clase de defecto es «un selector que rotula a mano»; sin la segunda, el cuarto selector que alguien escriba vuelve a contar objetivos.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rotuloDeVersion } from "../../lib/recetas/rotuloDeVersion";
import { sinComentarios } from "../helpers/sinComentarios";
import { traductorDePrueba } from "../helpers/traductorDePrueba";

const RAIZ = new URL("../..", import.meta.url).pathname;
const es = traductorDePrueba("Traceability", "es");
const en = traductorDePrueba("Traceability", "en");

const version = (pasos: number, metas: number, extra: { nombre?: string; numero?: number } = {}) => ({
  version: extra.numero ?? 2,
  recipe: { name: extra.nombre ?? "Lavado tradicional" },
  targets: Array.from({ length: metas }, (_, i) => ({ id: `t${i}` })),
  _count: { steps: pasos },
});

describe("rotuloDeVersion", () => {
  it("una versión con pasos dice cuántos pasos tiene, y nunca «0 objetivos»", () => {
    expect(rotuloDeVersion(version(5, 0), es)).toBe("Lavado tradicional · v2 · 5 pasos");
    // Control: «0 objetivos» era justo lo que salía antes para esta versión (no tiene metas de versión).
    expect(rotuloDeVersion(version(5, 0), es)).not.toContain("objetivos");
    // Un solo paso, en singular.
    expect(rotuloDeVersion(version(1, 0), es)).toBe("Lavado tradicional · v2 · 1 paso");
  });

  it("una versión sin pasos —una receta de antes de los pasos— dice cuántos objetivos tiene", () => {
    expect(rotuloDeVersion(version(0, 3, { nombre: "Honey", numero: 1 }), es)).toBe("Honey · v1 · 3 objetivos");
    // Sin pasos y sin objetivos: lo de siempre, «0 objetivos» (no se inventa un paso).
    expect(rotuloDeVersion(version(0, 0), es)).toBe("Lavado tradicional · v2 · 0 objetivos");
  });

  it("con pasos Y metas de versión manda lo que el editor escribe: los pasos", () => {
    expect(rotuloDeVersion(version(4, 2), es)).toBe("Lavado tradicional · v2 · 4 pasos");
  });

  it("en inglés, los mismos dos casos", () => {
    expect(rotuloDeVersion(version(5, 0), en)).toBe("Lavado tradicional · v2 · 5 steps");
    expect(rotuloDeVersion(version(1, 0), en)).toBe("Lavado tradicional · v2 · 1 step");
    expect(rotuloDeVersion(version(0, 3), en)).toBe("Lavado tradicional · v2 · 3 targets");
  });
});

describe("los tres selectores de receta llaman a rotuloDeVersion y no rotulan a mano", () => {
  const SELECTORES = ["app/lots/[id]/process/page.tsx", "app/lots/[id]/page.tsx", "app/lots/[id]/roast/new/page.tsx"];

  it.each(SELECTORES)("%s", (ruta) => {
    const codigo = sinComentarios(readFileSync(`${RAIZ}${ruta}`, "utf8"));
    expect(codigo, "llama a la función").toMatch(/rotuloDeVersion\(\s*v\s*,\s*t\s*\)/);
    // La cuenta a mano es lo que contaba las metas de versión y dejaba «0 objetivos» a toda receta de pasos.
    expect(codigo, "no cuenta a mano las metas de la versión").not.toContain("targets.length");
    expect(codigo, "no usa el sufijo de objetivos por su cuenta").not.toContain("targetsCountSuffix");
  });

  it("control: el detector ve lo que busca (un selector escrito a mano sí lo incumple)", () => {
    const aMano = sinComentarios("label: `${v.recipe.name} · v${v.version} · ${v.targets.length} ${t(\"targetsCountSuffix\")}`,");
    expect(aMano).toContain("targets.length");
    expect(aMano).toContain("targetsCountSuffix");
    // …y uno que sólo lo menciona en un comentario no lo incumple.
    expect(sinComentarios("// antes: v.targets.length\nlabel: rotuloDeVersion(v, t),")).not.toContain("targets.length");
  });
});
