/**
 * **El enlace del cliente no enseña la nota de campo de la inspección**, y la valoración sale
 * rotulada como lo que es: la interpretación del técnico. Arreglo PR-4 de la revisión del #674,
 * decidido por Daniel el 2026-10-10.
 *
 * Por qué: `/informe/[token]` es la página que el cliente abre con su enlace, sin sesión. La nota
 * de la inspección es lo que el técnico apunta en el campo para sí —abreviada, a veces con una
 * sospecha que todavía no ha comprobado—; la valoración es lo que quiere decirle al cliente. El
 * #674 pintó las dos filas igual en el informe interno y en el enlace.
 *
 * **Lo que NO cambia, también por decisión de Daniel:** las notas de la visita y la nota de cada
 * registro siguen en el enlace como estaban. Esta prueba sólo mira las dos filas de la inspección.
 *
 * Hermético: no toca la base. Se llama al componente de servidor y se mira el HTML, que es la
 * conducta; el cableado de las dos páginas se comprueba aparte, abajo, leyendo la fuente.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Las claves se devuelven tal cual: lo que se afirma es qué filas hay y con qué rótulo.
vi.mock("next-intl/server", () => ({ getTranslations: async () => (clave: string) => clave }));

// Marcas únicas en el archivo: si aparecen en el HTML, es que se pintó ESA fila.
const NOTA = "NOTA-DE-CAMPO-sospecha-sin-comprobar";
const VALORACION = "VALORACION-para-el-cliente";

const INSPECCION = {
  poblacion: "normal",
  cuadrosCubiertos: 8,
  reina: "vista",
  patronCria: "compacto",
  etapasCria: ["huevo"],
  reservasMiel: "media",
  reservasPolen: "media",
  temperamento: "manso",
  nota: NOTA,
  valoracion: VALORACION,
};

async function html(paraCliente: boolean, inspeccion: unknown = INSPECCION) {
  const { DetallesDelReporte } = await import("../../app/components/traceability/DetallesDelReporte");
  const elemento = await (DetallesDelReporte as unknown as (p: unknown) => Promise<React.ReactElement>)({
    registro: { cuando: "2026-05-10T14:00:00Z", clase: "inspeccion", inspeccion },
    enCuadros: true,
    paraCliente,
  });
  return renderToStaticMarkup(elemento);
}

/** La fila con ese rótulo EXACTO. `reportAssessmentForClient` contiene `reportAssessment`, así que
 *  un `toContain` de la clave sola casaría con las dos. */
const fila = (rotulo: string) => `<dt>${rotulo}</dt>`;

describe("el informe interno sigue igual", () => {
  it("enseña la nota de campo y la valoración, con sus rótulos de siempre", async () => {
    // Control positivo de todo lo de abajo: si el interno no pintara la nota, el `not.toContain`
    // del cliente diría «no se renderizó», no «se ocultó».
    const h = await html(false);
    expect(h).toContain(fila("noteLabel"));
    expect(h).toContain(NOTA);
    expect(h).toContain(fila("reportAssessment"));
    expect(h).toContain(VALORACION);
  });
});

describe("el enlace del cliente", () => {
  it("no enseña la nota de campo: ni la fila ni su texto", async () => {
    const h = await html(true);
    expect(h).not.toContain(fila("noteLabel"));
    expect(h).not.toContain(NOTA);
  });

  it("enseña la valoración rotulada como interpretación del técnico", async () => {
    const h = await html(true);
    expect(h).toContain(fila("reportAssessmentForClient"));
    expect(h).toContain(VALORACION);
    expect(h).not.toContain(fila("reportAssessment"));
  });

  it("y el resto de la inspección sigue: no es que se apague entero", async () => {
    // Sin esto, un componente que devolviera poco pasaría las dos de arriba.
    const h = await html(true);
    expect(h).toContain(fila("populationLabel"));
    expect(h).toContain(fila("beeCoveredFramesLabel"));
    expect(h).toContain(fila("temperamentLabel"));
  });

  it("sin nota registrada tampoco hay fila «Nota: Sin registrar»", async () => {
    // «Sin registrar» en el enlace diría que el técnico no apuntó nada, que también es algo que
    // el cliente no tiene por qué leer.
    const h = await html(true, { ...INSPECCION, nota: null });
    expect(h).not.toContain(fila("noteLabel"));
  });
});

describe("el rótulo nuevo existe en los dos idiomas", () => {
  const leer = (ruta: string) => readFileSync(join(new URL("../..", import.meta.url).pathname, ruta), "utf8");
  it("Apiary.reportAssessmentForClient en es y en en", () => {
    // Sin la clave, next-intl pinta su nombre en la pantalla del cliente, y nada falla en rojo.
    expect(JSON.parse(leer("messages/es.json")).Apiary.reportAssessmentForClient).toBe("Interpretación del técnico");
    expect(JSON.parse(leer("messages/en.json")).Apiary.reportAssessmentForClient).toBeTruthy();
  });
});

describe("cada página pide el modo que le toca", () => {
  const leer = (ruta: string) => readFileSync(join(new URL("../..", import.meta.url).pathname, ruta), "utf8");
  const usos = (ruta: string) => leer(ruta).match(/<DetallesDelReporte\b[^>]*\/>/g) ?? [];

  it("la del enlace del cliente pasa `paraCliente`", () => {
    const u = usos("app/informe/[token]/page.tsx");
    expect(u.length, "no encuentro ningún <DetallesDelReporte …/> en la página del cliente").toBeGreaterThan(0);
    for (const uso of u) expect(uso).toMatch(/\bparaCliente(?!=\{false\})/);
  });

  it("la interna pasa `paraCliente={false}`", () => {
    const u = usos("app/field-sessions/[id]/report/page.tsx");
    expect(u.length, "no encuentro ningún <DetallesDelReporte …/> en el informe interno").toBeGreaterThan(0);
    for (const uso of u) expect(uso).toContain("paraCliente={false}");
  });
});
