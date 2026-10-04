import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * **Un formulario que actúa sobre OTRO sitio que el de la página va condicionado.**
 *
 * La regla es de Daniel, el 2026-09-27: «si no tengo un permiso, no debería mostrarme botones o
 * opciones que no debería tener, ni siquiera intentar explicar o justificar; solo omitir y no
 * mostrar esto». `accion-que-no-puedes-no-se-ofrece.test.ts` ya la vigila **para los enlaces** a
 * páginas de crear, derivándolos con `git grep` de los `href`. Este guardia cubre la otra mitad: un
 * formulario montado EN LÍNEA, que ese otro no puede ver porque no es un enlace.
 *
 * **El caso que lo motivó, medido el 2026-10-03.** `/plots/[id]/ajustes` se abre con
 * `location:manage_attributes` sobre la parcela, y montaba `ReglaDeTrampasForm` **sin condición**.
 * Pero `guardarReglaDeTrampas` comprueba ese permiso sobre la **finca**
 * (`requireLocationAttributeAccess(userAccountId, input.farmLocationId)`, `lib/traceability/trapRules.ts`),
 * que es otro objetivo: un operario asignado a una parcela suelta veía el formulario, lo rellenaba y
 * se lo rechazaba el servidor. Diez de los once formularios de esa página sí desembocan en el permiso
 * con el que se entra; el undécimo no.
 *
 * Es la misma forma que esa página ya corrigió para `puedeSubdividir`, cuyo comentario dice «antes
 * bastaba con que el lugar fuera una parcela, así que el botón aparecía también a quien el servidor
 * iba a negar». Lo que faltaba no era el permiso: era el SITIO.
 *
 * **La señal es `farmLocationId`**, que es como un componente dice «actúo sobre la finca». Se deriva
 * con `git grep` y no se escribe a mano, por la misma razón que el guardia de los enlaces: una lista
 * envejece en cuanto alguien añade una pantalla, y el síntoma no aparece en desarrollo porque quien
 * programa suele ser Platform Admin y lo ve todo.
 *
 * **Sus tres límites, dichos para que nadie cuente este guardia dos veces:**
 *
 * 1. **La clase tiene UN miembro hoy** — medido: 1 de los 112 formularios que las páginas de `app/`
 *    monta recibe `farmLocationId`. Vale como red para el siguiente, no como barrido.
 * 2. Comprueba que el formulario esté DENTRO de una condición, no que la condición sea la correcta.
 *    Que el predicado sea el mismo que exige el destino lo sostiene el comentario en la página.
 * 3. `farmLocationId` es la única señal que se reconoce. Un formulario que actúe sobre otro sitio por
 *    otra vía —un `siteId`, un id sacado de un `detail`— es invisible para esto.
 */

/** Las páginas que pasan `farmLocationId` a un componente, preguntadas al árbol. */
function paginasConFormularioDeFinca(): string[] {
  try {
    return execFileSync("git", ["grep", "-l", "farmLocationId={", "--", "app/**/page.tsx"], { encoding: "utf8" })
      .split("\n")
      .filter((l) => l.endsWith("page.tsx"));
  } catch {
    return [];
  }
}

describe("un formulario sobre la finca, en una página de parcela, va condicionado", () => {
  /**
   * **Control positivo del ANÁLISIS.** Si `git grep` dejara de encontrarlas —porque cambia el nombre
   * de la prop o el patrón— la lista saldría vacía y «ninguna incumple» se leería igual que «no
   * miré». Hoy es una; el día que sean dos, esta cifra sube sola.
   */
  it("el detector encuentra al menos una", () => {
    const paginas = paginasConFormularioDeFinca();
    expect(paginas.length, `páginas encontradas: ${JSON.stringify(paginas)}`).toBeGreaterThanOrEqual(1);
  });

  it("y en todas, el formulario está dentro de una condición", () => {
    for (const pagina of paginasConFormularioDeFinca()) {
      const src = readFileSync(pagina, "utf8");
      const i = src.indexOf("farmLocationId={");
      expect(i, `${pagina}: el detector la eligió y luego no la encuentra`).toBeGreaterThan(-1);
      // El componente que la recibe abre antes de la prop; su apertura y las líneas de delante son
      // donde tiene que estar la condición. Se miran las seis anteriores: una condición de permiso
      // se escribe pegada al componente que protege.
      const apertura = src.lastIndexOf("<", i);
      const antes = src.slice(Math.max(0, apertura - 300), apertura);
      expect(
        antes,
        `${pagina} monta un formulario que actúa sobre la FINCA sin condicionarlo: quien tenga el permiso sobre la parcela y no sobre la finca lo verá y el servidor lo rechazará`,
      ).toMatch(/\{puede[A-Za-z]+\s*(\?|&&)/);
    }
  });

  /**
   * Y la condición se calcula contra la FINCA, no contra la parcela — que es el defecto entero: el
   * permiso era el mismo y el objetivo no. Sin esta aserción, condicionar con el predicado de la
   * parcela pasaría el guardia y seguiría ofreciendo lo negado.
   */
  it("y la bandera se calcula contra la finca, no contra la parcela", () => {
    for (const pagina of paginasConFormularioDeFinca()) {
      const src = readFileSync(pagina, "utf8");
      expect(src, `${pagina}: la bandera no mide el permiso sobre farmLocationId`).toMatch(
        /puedeGestionarAtributosDeUbicacion\(\s*user\.userAccountId,\s*farmLocationId\s*\)/,
      );
    }
  });
});
