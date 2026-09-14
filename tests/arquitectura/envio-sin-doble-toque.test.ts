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
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../..", import.meta.url).pathname;

/**
 * Excepciones deliberadas. Vacío a propósito: si algún día hace falta una, va
 * aquí con su motivo escrito, no como un `disabled` suelto que nadie explica.
 */
const PERMITIDOS: string[] = [];

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
