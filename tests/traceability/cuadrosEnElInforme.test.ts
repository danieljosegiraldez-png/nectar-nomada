/**
 * El informe tampoco pregunta por cuadros donde no aplica.
 *
 * **Es la otra mitad del #690.** Aquel arregló el FORMULARIO de inspección; el informe quedó
 * fuera porque `DetallesDelReporte` no existía en `main` todavía — llegó con el #674. Una fila
 * «Cuadros cubiertos: Sin registrar» en el informe de un meliponario afirma que alguien miró y
 * no contó, cuando la pregunta no existe ahí.
 *
 * **Y aquí SÍ se renderiza**, a diferencia del guardia del formulario. Aquél tuvo que leer la
 * fuente porque el componente es de cliente y sus campos viven tras un `useState` que un render
 * estático no abre. Éste es de servidor: se le llama, se mira el HTML, y lo que se afirma es la
 * conducta y no el cableado.
 *
 * Hermético: no toca la base.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Las claves se devuelven tal cual: lo que se afirma es qué filas hay, no su texto.
vi.mock("next-intl/server", () => ({ getTranslations: async () => (clave: string) => clave }));

const INSPECCION = {
  poblacion: "normal",
  cuadrosCubiertos: 8,
  reina: "vista",
  patronCria: "compacto",
  etapasCria: ["huevo"],
  reservasMiel: "media",
  reservasPolen: "media",
  temperamento: "manso",
  nota: null,
  valoracion: null,
};

async function html(enCuadros: boolean, inspeccion: unknown = INSPECCION) {
  const { DetallesDelReporte } = await import("../../app/components/traceability/DetallesDelReporte");
  // Un componente de servidor es una función async que devuelve JSX: se la llama y se renderiza.
  const elemento = await (DetallesDelReporte as unknown as (p: unknown) => Promise<React.ReactElement>)({
    registro: { cuando: "2026-05-10T14:00:00Z", clase: "inspeccion", inspeccion },
    enCuadros,
  });
  return renderToStaticMarkup(elemento);
}

describe("los cuadros en el informe", () => {
  it("en un apiario la fila está", async () => {
    // Control positivo, y va primero: si esto no apareciera, el `not.toContain` de abajo
    // significaría «no se renderizó nada», no «se ocultó». Es justo el fallo que la primera
    // versión del guardia del formulario tuvo, y que su control destapó.
    expect(await html(true)).toContain("beeCoveredFramesLabel");
  });

  it("en un meliponario la fila NO está", async () => {
    expect(await html(false)).not.toContain("beeCoveredFramesLabel");
  });

  it("y el resto del informe sigue: no es que se apague entero", async () => {
    // Sin esto, un componente que reventara y devolviera poco pasaría la prueba de arriba.
    const sinCuadros = await html(false);
    expect(sinCuadros).toContain("populationLabel");
    expect(sinCuadros).toContain("queenSightedLabel");
    expect(sinCuadros).toContain("temperamentLabel");
  });

  it("el valor tampoco se cuela por otro lado", async () => {
    // La etiqueta podría desaparecer y el número seguir pintado en otra fila. Se mira el dato.
    const conCuadros = await html(true);
    const sinCuadros = await html(false);
    expect(conCuadros).toContain(">8<");
    expect(sinCuadros).not.toContain(">8<");
  });

  it("sin inspección no pinta nada, con cuadros o sin ellos", async () => {
    // Un registro que no es una inspección —una alimentación, una cosecha— no gana filas por
    // esto. `renderToStaticMarkup(null)` da la cadena vacía.
    expect(await html(true, null)).toBe("");
    expect(await html(false, null)).toBe("");
  });
});

describe("y las dos pantallas lo calculan desde el SNAPSHOT", () => {
  // El tipo sale del snapshot y no de la ubicación de hoy: un informe congelado no debe cambiar
  // de preguntas si el sitio se reclasifica después. `tsc` ya exige que la propiedad se pase;
  // esto fija de DÓNDE sale.
  for (const p of ["app/field-sessions/[id]/report/page.tsx", "app/informe/[token]/page.tsx"]) {
    it(`${p} usa seManejaEnCuadros(snapshot.sitio.tipo)`, () => {
      const src = readFileSync(join(process.cwd(), p), "utf8");
      expect(src.length).toBeGreaterThan(1_000);
      expect(src).toContain("enCuadros={seManejaEnCuadros(snapshot.sitio.tipo)}");
    });
  }
});
