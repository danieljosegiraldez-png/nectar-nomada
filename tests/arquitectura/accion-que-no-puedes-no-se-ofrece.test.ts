import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Un enlace a una pantalla de crear sólo se pinta si quien mira puede usarla.
 *
 * **La regla, de Daniel, el 2026-09-27**, después de recorrer la aplicación con una cuenta de
 * operario: «si no tengo un permiso, no debería mostrarme botones o opciones que no debería tener,
 * ni siquiera intentar explicar o justificar; solo omitir y no mostrar esto».
 *
 * **Lo que había, medido ese día** con un perfil Farm Operator —`lot:manage`, `equipment:view`,
 * `apiary:manage`, y NI `equipment:manage` NI `location:edit_beneficio`—: seis páginas ofrecían su
 * enlace de crear sin preguntar nada. Cinco destinos contestaban con una frase de disculpa y
 * **`/research/new` respondía con un 500** —`ResearchAccessError` sin atrapar desde
 * `listVariableCatalogs`—. Ninguno era un agujero de seguridad: los servicios rechazaban con
 * `forbidden`. Era ofrecer y luego negar, seis veces.
 *
 * **Por qué se deriva la lista y no se escribe.** Una lista a mano de «páginas con enlace de
 * crear» envejece en cuanto alguien añade una pantalla, y el síntoma no aparece en desarrollo
 * porque el dueño de la máquina suele ser Platform Admin y lo ve todo. Misma lección que
 * `rutas-de-operador.test.ts` aprendió con el service worker.
 *
 * **Sus dos límites, dichos:**
 *
 * 1. Comprueba que el enlace está DENTRO de una condición, no que la condición sea la correcta. Que
 *    el predicado sea el mismo que usa el destino lo sostienen las pruebas de cada predicado y los
 *    comentarios en cada página; esto sólo caza el enlace suelto.
 * 2. Mira las cuatro líneas anteriores, así que **dos enlaces en la misma línea comparten veredicto**:
 *    si el primero está condicionado, el segundo pasa por vecindad. Se acepta a sabiendas —una regla
 *    que entienda el árbol JSX pide un parser— y por eso la lista de exentos de abajo es explícita.
 */

const PAGINAS_CON_ENLACE_DE_CREAR = () => {
  // `git grep -l` sobre las páginas: enlaces a una ruta de crear, del propio sitio.
  const salida = execFileSync(
    "git",
    ["grep", "-l", "-E", 'href="(/[a-z-]+)+/(nuev[ao]|crear|new)"', "--", "app/**/page.tsx"],
    { encoding: "utf8" },
  );
  return salida.split("\n").filter((l) => l.endsWith("page.tsx"));
};

/**
 * Destinos cuyo enlace NO es cuestión de permiso, con su razón y la fecha en que se comprobó.
 * Cada entrada dice por qué ofrecerlo a cualquiera es correcto; sin razón no entra.
 */
const EXENTOS: ReadonlyArray<{ destino: string; razon: string }> = [
  {
    destino: "/inspecciones/nueva",
    razon:
      "2026-09-27: su compuerta es de DATOS, no de permiso — pinta el formulario si quien mira ve " +
      "algún lote y alguna cama, y si no dice «sin contexto». Un operario con lotes a la vista sí " +
      "puede inspeccionar, así que esconderle el enlace le quitaría trabajo suyo.",
  },
];

/** El enlace citado, y las 3 líneas de antes: ahí tiene que estar la condición. */
function enlaceSinCondicion(ruta: string) {
  const lineas = readFileSync(ruta, "utf8").split("\n");
  const sueltos: string[] = [];
  for (const [i, linea] of lineas.entries()) {
    if (!/href="(\/[a-z-]+)+\/(nuev[ao]|crear|new)"/.test(linea)) continue;
    const contexto = lineas.slice(Math.max(0, i - 4), i + 1).join("\n");
    // Una condición JSX delante: `{algo ? (` o `{algo && (`, o la línea misma dentro de `{x ?`.
    const destino = linea.match(/href="((?:\/[a-z-]+)+\/(?:nuev[ao]|crear|new))"/)?.[1];
    if (destino && EXENTOS.some((e) => e.destino === destino)) continue;
    if (!/\{[^}]*\b(puede|granted|permite|can)[A-Za-z]*\b[^}]*(\?|&&)/i.test(contexto)) {
      sueltos.push(`${ruta}:${i + 1} → ${linea.trim().slice(0, 80)}`);
    }
  }
  return sueltos;
}

describe("una acción que no puedes no se ofrece", () => {
  it("toda página deriva su lista y ninguna ofrece un enlace de crear sin condición", () => {
    const paginas = PAGINAS_CON_ENLACE_DE_CREAR();
    // Control positivo: si el derivado no encuentra páginas, la prueba no mide nada.
    expect(paginas.length).toBeGreaterThan(5);
    const sueltos = paginas.flatMap(enlaceSinCondicion);
    expect(sueltos, `enlaces de crear sin condición de permiso:\n${sueltos.join("\n")}`).toEqual([]);
  });

  /**
   * Y la otra mitad de la regla: **tampoco se explica**. Una pantalla de crear a la que se llega
   * escribiendo la dirección responde 404, no una disculpa.
   *
   * **Lo que se acepta y por qué:** las claves que empiezan por `error` son el mensaje DESPUÉS de
   * enviar —`codigoError === "forbidden"`, una carrera perdida contra un permiso que cambió— y ahí
   * decir por qué falló es lo correcto. Lo que se prohíbe es la disculpa PREVIA, la que se pinta en
   * vez del formulario.
   */
  it("ninguna pantalla de crear se disculpa por falta de permiso antes de enviar", () => {
    const paginasDeCrear = execFileSync(
      "git",
      ["ls-files", "app/**/page.tsx"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter((f) => /\/(nuev[ao]|new|crear)\/page\.tsx$/.test(f));
    // Control positivo: sin páginas derivadas, la prueba no mide nada.
    expect(paginasDeCrear.length).toBeGreaterThan(10);

    const disculpas: string[] = [];
    for (const ruta of paginasDeCrear) {
      const lineas = readFileSync(ruta, "utf8").split("\n");
      for (const [i, linea] of lineas.entries()) {
        const clave = linea.match(/\bt\(\s*"([A-Za-z_]*(?:[Ss]inPermiso|sin_acceso|sinAcceso)[A-Za-z_]*)"/)?.[1];
        if (!clave || clave.startsWith("error")) continue;
        disculpas.push(`${ruta}:${i + 1} → ${clave}`);
      }
    }
    expect(disculpas, `disculpas previas por falta de permiso:\n${disculpas.join("\n")}`).toEqual([]);
  });
});
