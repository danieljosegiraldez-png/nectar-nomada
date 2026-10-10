/**
 * **El informe pinta la sanidad que congeló**, y no inventa filas para lo que no congeló. Arreglo
 * PR-2 de la revisión del #674 (Daniel, 2026-10-10).
 *
 * Tres estados, y la pantalla tiene que distinguirlos:
 *
 * - **con valor**: se pinta;
 * - **congelado vacío** (`null`, `[]`): se pinta «Sin registrar», o «Ninguna marcada» para las
 *   irregularidades, que son casillas y no distinguen «no se vio» de «no se miró»;
 * - **ausente** (`undefined`): el informe se emitió antes de que esto se congelara. No se pinta
 *   nada: una fila «Sin registrar» afirmaría que nadie lo contestó, cuando lo que pasa es que el
 *   documento no lo guardó.
 *
 * La mitad de que el servicio congele de verdad está en `jornadaEnApiario.test.ts`; esto es la de
 * la pantalla. Hermético: se llama al componente de servidor y se mira el HTML.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Las claves se devuelven tal cual: lo que se afirma es qué filas hay y qué valor llevan.
vi.mock("next-intl/server", () => ({ getTranslations: async () => (clave: string) => clave }));

const BASE = {
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

const CON_VALOR = {
  ...BASE,
  irregularidades: ["Varroa visible", "Cría salteada"],
  otraSenal: "TEST hormigas en la piquera",
  celdasReales: { tipo: "enjambrazon", cuantas: 2 },
  criaDeZangano: true,
  marcosNegros: 3,
  mielJuntoACria: true,
  polenJuntoACria: false,
};

const VACIO = {
  ...BASE,
  irregularidades: [],
  otraSenal: null,
  celdasReales: { tipo: null, cuantas: null },
  criaDeZangano: null,
  marcosNegros: null,
  mielJuntoACria: null,
  polenJuntoACria: null,
};

/** Los rótulos de las siete filas nuevas. */
const NUEVAS = [
  "irregularidadesLegend",
  "pestDiseaseFlagsLabel",
  "queenCellsLabel",
  "droneBroodLabel",
  "darkFramesLabel",
  "reportHoneyNextToBrood",
  "reportPollenNextToBrood",
];

async function html(inspeccion: unknown) {
  const { DetallesDelReporte } = await import("../../app/components/traceability/DetallesDelReporte");
  const elemento = await (DetallesDelReporte as unknown as (p: unknown) => Promise<React.ReactElement>)({
    registro: { cuando: "2026-05-10T14:00:00Z", clase: "inspeccion", inspeccion },
    enCuadros: true,
  });
  return renderToStaticMarkup(elemento);
}

const fila = (rotulo: string, valor: string | number) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
const rotulo = (r: string) => `<dt>${r}</dt>`;

describe("la sanidad congelada se pinta", () => {
  it("cada fila con su valor", async () => {
    const h = await html(CON_VALOR);
    expect(h).toContain(fila("irregularidadesLegend", "Varroa visible, Cría salteada"));
    expect(h).toContain(fila("pestDiseaseFlagsLabel", "TEST hormigas en la piquera"));
    expect(h).toContain(fila("queenCellsLabel", "queenCell_enjambrazon · 2"));
    expect(h).toContain(fila("droneBroodLabel", "triSi"));
    expect(h).toContain(fila("darkFramesLabel", 3));
    expect(h).toContain(fila("reportHoneyNextToBrood", "triSi"));
    expect(h).toContain(fila("reportPollenNextToBrood", "triNo"));
  });

  it("lo congelado vacío dice «Sin registrar», y las irregularidades «Ninguna marcada»", async () => {
    const h = await html(VACIO);
    expect(h).toContain(fila("irregularidadesLegend", "reportNoneMarked"));
    for (const r of NUEVAS.filter((x) => x !== "irregularidadesLegend")) {
      expect(h, r).toContain(fila(r, "reportNotRecorded"));
    }
  });

  it("«no hay celdas» se dice, no se confunde con «sin registrar»", async () => {
    const h = await html({ ...VACIO, celdasReales: { tipo: "no_hay", cuantas: null } });
    expect(h).toContain(fila("queenCellsLabel", "queenCell_no_hay"));
  });
});

describe("un informe emitido ANTES no gana filas", () => {
  it("sin los campos nuevos no se pinta ninguna de las siete", async () => {
    const h = await html(BASE);
    // Control: el resto de la inspección sí está. Sin esto, un componente que no pintara nada
    // pasaría el `not.toContain` de abajo.
    expect(h).toContain(rotulo("populationLabel"));
    for (const r of NUEVAS) expect(h, r).not.toContain(rotulo(r));
  });
});
