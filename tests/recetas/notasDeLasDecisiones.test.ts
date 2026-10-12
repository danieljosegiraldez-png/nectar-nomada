/**
 * Las notas con que la Parte 2a corrige decisiones anteriores siguen en `docs/architecture/DECISIONS.md` — revisión final del PR-A (F1-10, 2026-10-10). Hermética: sólo lee el archivo.
 *
 * Un ADR no se reescribe: se anota. La decisión 2 de ADR-167 («Recetas: `edit_beneficio`») y su «Consecuencias» seguían vigentes, sin una palabra de que V16 (Daniel, 2026-10-04) las sustituye: quien
 * lee el ADR concluía que un Farm Manager con `edit_beneficio` escribe recetas, y desde V16 no. La nota se busca por su TEXTO dentro de la sección de su ADR, no por línea: el archivo crece cada día.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const decisiones = readFileSync(new URL("../../docs/architecture/DECISIONS.md", import.meta.url), "utf8");

/** La sección de un ADR: desde su encabezado hasta el siguiente. Exige que el encabezado exista una vez. */
function seccion(adr: string): string {
  const inicio = decisiones.indexOf(`\n## ${adr} `);
  expect(inicio, `control: ${adr} tiene encabezado en DECISIONS.md`).toBeGreaterThan(-1);
  expect(decisiones.indexOf(`\n## ${adr} `, inicio + 1), `${adr} aparece una sola vez`).toBe(-1);
  const fin = decisiones.indexOf("\n## ADR-", inicio + 1);
  return decisiones.slice(inicio, fin === -1 ? undefined : fin);
}

describe("ADR-167, decisión 2 (recetas): la nota de que V16 la sustituye", () => {
  it("está bajo la decisión 2, fechada, con el permiso nuevo y con el efecto sobre quien tenía `edit_beneficio`", () => {
    const adr = seccion("ADR-167");
    const decision2 = adr.indexOf("2. **Recetas: `edit_beneficio`");
    const decision3 = adr.indexOf("3. **Equipos:");
    expect(decision2, "control: la decisión 2 sigue donde estaba").toBeGreaterThan(-1);
    expect(decision3, "control: la decisión 3 sigue detrás").toBeGreaterThan(decision2);
    const nota = adr.slice(decision2, decision3);
    expect(nota).toContain("Corregido el 2026-10-10");
    expect(nota).toContain("V16");
    expect(nota).toContain("lot:approve_exception");
    expect(nota).toContain("Coffee Process Manager");
    // El efecto: `edit_beneficio` ya no basta para escribir recetas, tampoco a un Farm Manager que lo lleva de serie.
    expect(nota).toMatch(/ya no basta/);
    expect(nota).toContain("Farm Manager");
    // Y lo que sigue valiendo: el resto de la lista de ADR-167 (instalaciones, camas, equipos) no se toca.
    expect(nota).toMatch(/instalaciones/);
  });

  it("la nota nombra también las «Consecuencias» del ADR, que contaban las recetas entre lo que exige `edit_beneficio`", () => {
    const adr = seccion("ADR-167");
    const consecuencias = adr.indexOf("**Consecuencias.**");
    expect(consecuencias, "control: «Consecuencias» sigue en el ADR").toBeGreaterThan(-1);
    expect(adr.slice(adr.indexOf("Corregido el 2026-10-10"), consecuencias)).toMatch(/Consecuencias/);
  });

  it("control: la otra corrección de la Parte 2a, la de ADR-181 #12, sigue en su sitio", () => {
    expect(seccion("ADR-181")).toContain("Corregido el 2026-10-04 (decisión de Daniel del 2026-10-03");
  });
});
