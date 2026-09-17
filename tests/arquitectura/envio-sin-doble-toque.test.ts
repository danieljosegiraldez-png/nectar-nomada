/**
 * Ningún botón de envío se puede pulsar dos veces.
 *
 * **El defecto (2026-09-06).** 19 archivos tenían `<button type="submit">` sin
 * protección alguna. No es teórico: llamado dos veces con la misma entrada,
 * `recordLabourEntry` crea **dos filas indistinguibles** —3 trabajadores, 6
 * horas, «Deshierbe», dos veces—, y se comprobó contra la base. `LabourEntry`,
 * `MaterialConsumptionEntry`, `Measurement`, `Sample` y `StorageAssignment` no
 * tienen ningún índice único que lo rechace, y la web no usa el `clientDraftId`
 * que sí protege la cola de sincronización. Una semana después nadie sabe si
 * fue un jornal o dos.
 *
 * Dos formas válidas de estar protegido, y las dos cuentan:
 *   · `<BotonDeEnvio>`, que se apaga con `useFormStatus` — sirve dentro de un
 *     formulario de servidor, que eran catorce de los diecinueve;
 *   · un `<button type="submit" disabled={…pending…}>`, que es lo que ya hacían
 *     los 32 archivos con `useActionState`. No se tocaron.
 *
 * Este test mira **formas escritas**, como el inventario de acceso: reconoce un
 * `disabled` que menciona `pending`, no comprueba que ese `pending` signifique
 * algo. Es un suelo, no un techo.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../..", import.meta.url).pathname;

/**
 * Excepciones deliberadas. Vacío a propósito: si algún día hace falta una, va
 * aquí con su motivo escrito, no como un `disabled` suelto que nadie explica.
 *
 * `BotonQueNecesitaConexion.tsx` (tablero de parcela, Task 5): igual que
 * `BotonDeEnvio.tsx`, es la pieza compartida, no un botón suelto — su
 * `disabled` lo decide siempre el llamador. Las cuatro veces que se usa hoy
 * (`PlantingCohortForm`, `PlotAttributesForm`, `SoilProfileForm`,
 * `MarcarEnProduccionForm`) pasan `pending` o `pending || encolando`, así que
 * el heurístico de texto no ve la palabra dentro de ESTE archivo pero la
 * protección real está en cada sitio de llamada.
 */
const PERMITIDOS: string[] = ["app/components/traceability/BotonQueNecesitaConexion.tsx"];

function archivosTsx(): string[] {
  return execFileSync("find", ["app", "-name", "*.tsx"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .sort();
}

function botonesSinGuardia(ruta: string): string[] {
  const src = readFileSync(`${RAIZ}${ruta}`, "utf8");
  const sueltos: string[] = [];
  for (const m of src.matchAll(/<button([^>]*?)type="submit"([^>]*?)>/gs)) {
    const tag = m[0];
    if (/disabled=\{[^}]*pending/s.test(tag)) continue;
    sueltos.push(tag.replace(/\s+/g, " ").slice(0, 80));
  }
  return sueltos;
}

describe("un envío no se puede pulsar dos veces", () => {
  it("ningún <button type=\"submit\"> queda sin apagarse durante el envío", () => {
    const culpables: string[] = [];
    for (const f of archivosTsx()) {
      if (f.endsWith("components/BotonDeEnvio.tsx")) continue; // es la propia pieza
      if (PERMITIDOS.includes(f)) continue;
      for (const tag of botonesSinGuardia(f)) culpables.push(`${f}: ${tag}`);
    }
    expect(
      culpables,
      "usa <BotonDeEnvio> (sirve en formularios de servidor) o disabled={pending}",
    ).toEqual([]);
  });

  /**
   * Control positivo. Sin esto, un `find` roto o una expresión que no casa nada
   * darían cero culpables de cero botones, que se lee igual que «todo bien».
   */
  it("está mirando de verdad: hay botones de envío y la pieza compartida existe", () => {
    const todos = archivosTsx();
    expect(todos.length, "el descubrimiento de archivos está roto").toBeGreaterThan(50);

    const conSubmit = todos.filter((f) => readFileSync(`${RAIZ}${f}`, "utf8").includes('type="submit"'));
    expect(conSubmit.length, "no encuentra ni un botón de envío: la búsqueda no mide").toBeGreaterThan(20);

    const pieza = readFileSync(`${RAIZ}app/components/BotonDeEnvio.tsx`, "utf8");
    expect(pieza, "la pieza compartida debe apagarse con useFormStatus").toContain("useFormStatus");
    expect(pieza, "debe apagarse mientras el envío está en curso").toMatch(/disabled=\{pending/);
  });

  /**
   * **`disabled={pending}` no protege el camino SIN señal, y por eso hace falta
   * esta segunda mitad.** Medido en la revisión final de la cola de parcela: en
   * un formulario que encola, el `onSubmit` llama a `e.preventDefault()`, así
   * que la Server Action **nunca corre** y el `pending` de `useActionState` no
   * se pone a `true` jamás. El botón sigue habilitado mientras el `await
   * queueFieldEvent(...)` está en vuelo, y dos toques son dos borradores con
   * `clientDraftId` distintos — o sea **dos filas**. `SoilProfile` y
   * `PlantingCohort` no tienen clave natural que lo detecte después.
   *
   * Lo que se exige es un **pestillo síncrono**: un `useRef` que se mira y se
   * pone antes del `await`. Un `useState` solo no basta y no es un detalle: el
   * re-render que apagaría el botón llega DESPUÉS del toque, y el segundo toque
   * de un doble toque real cabe en esa ventana.
   *
   * Su límite, dicho: reconoce **formas escritas**, como el guardia de arriba y
   * como el inventario de acceso. Comprueba que existe el pestillo y que se lee
   * antes de encolar, no que la variable signifique lo que dice.
   */
  const ENCOLAN = "app/components/traceability";

  /**
   * Excepción con su motivo, no un hueco. `FieldSessionForms.tsx` tiene el mismo
   * defecto **heredado** —de ahí lo copiaron los tres de parcela— y arreglarlo
   * es otro trabajo, con su propia revisión: la cola de jornada de campo está
   * en producción y su arreglo no se cuela dentro de la ronda de otra rama.
   * Cuando se arregle, esta línea se borra y el guardia lo cubre sin tocar nada
   * más.
   */
  const PENDIENTE_EN_OTRO_TRABAJO = ["FieldSessionForms.tsx"];

  function archivosQueEncolan(): string[] {
    return readdirSync(`${RAIZ}${ENCOLAN}`)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => readFileSync(`${RAIZ}${ENCOLAN}/${f}`, "utf8").includes("queueFieldEvent("))
      .sort();
  }

  it("está mirando de verdad: hay formularios que encolan", () => {
    // Control positivo. Sin esto, un `readdir` roto o un nombre de función
    // cambiado darían cero culpables de cero archivos.
    const encolan = archivosQueEncolan();
    expect(encolan.length, "ningún formulario que encole detectado: el análisis no mide").toBeGreaterThan(2);
    expect(encolan, "el heredado tiene que seguir apareciendo, o la excepción no significa nada").toContain(
      "FieldSessionForms.tsx",
    );
  });

  it("un formulario que encola sin señal tiene un pestillo síncrono contra el doble toque", () => {
    const culpables: string[] = [];
    for (const f of archivosQueEncolan()) {
      if (PENDIENTE_EN_OTRO_TRABAJO.includes(f)) continue;
      const src = readFileSync(`${RAIZ}${ENCOLAN}/${f}`, "utf8");
      // Un `useRef` booleano cuyo `.current` se comprueba y se pone, y un
      // `disabled` que además de `pending` mira el estado de encolado.
      if (!/useRef/.test(src)) culpables.push(`${f}: no usa useRef`);
      else if (!/\.current\s*\)\s*return/.test(src)) culpables.push(`${f}: no corta la reentrada con .current`);
      else if (!/disabled=\{pending \|\| /.test(src)) culpables.push(`${f}: el botón no se apaga al encolar`);
    }
    expect(
      culpables,
      "sin señal `pending` nunca se pone a true: hace falta un ref que corte la segunda pulsación",
    ).toEqual([]);
  });

  /**
   * **El defecto que tenía la propia pieza, medido el 2026-09-13.** Con
   * `disabled={pending} {...resto}`, un llamador que pasara su propio `disabled` lo
   * **sobrescribía** y perdía la protección del doble toque sin que nada lo dijera — el
   * botón parecía protegido porque usaba el componente compartido. Le pasaba a
   * `app/sensory/[sessionId]/page.tsx`.
   *
   * Este guardia exige las dos mitades: que `disabled` se saque de las props (y no viaje
   * dentro del spread) y que se COMBINE con `pending`. Un `disabled={pending}` a secas
   * seguido de `{...resto}` vuelve a fallar aquí.
   */
  it("el propio botón combina el disabled del llamador, no lo deja sobrescribir", () => {
    const pieza = readFileSync(`${RAIZ}app/components/BotonDeEnvio.tsx`, "utf8");
    expect(pieza, "`disabled` debe desestructurarse para no llegar dentro del spread").toMatch(
      /\n\s*disabled,\n/,
    );
    expect(pieza, "el pending y el disabled del llamador se combinan").toMatch(
      /disabled=\{pending \|\| disabled\}/,
    );
    // **No hay una tercera aserción de posición, y se dice por qué.** La escribí
    // —«`{...resto}` va después del `disabled` combinado»— y falló: `indexOf` encontró el
    // `{...resto}` que este mismo archivo menciona **en un comentario**, no el del JSX.
    // Era el instrumento midiendo prosa. Y además era redundante: si `disabled` está
    // desestructurado, ya no viaja dentro de `resto` y el orden del spread deja de
    // importar. Las dos aserciones de arriba cierran el caso.
  });
});
