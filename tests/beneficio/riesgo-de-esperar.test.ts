/**
 * El riesgo de esperar: lo que `docs/beneficio/10_ph_fermentation.md` §1 dice de cada banda de
 * pH, **literal**, y nada para las variables que no tienen matriz.
 *
 * **Sólo el pH tiene riesgo citable.** Brix y humedad no tienen matriz de umbrales en ningún
 * documento del proyecto, y para ellos la función devuelve `null`: ninguna frase neutra, ningún
 * «sin riesgo». Un `null` es «no hay registro», que no es lo mismo que «no hay riesgo».
 *
 * Los números están escritos a mano, uno por borde. `NaN` comparado con lo que sea da `false`, así
 * que la prueba del valor no numérico afirma sobre `toBeNull`, nunca con una comparación.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { riesgoDeEsperar } from "../../lib/beneficio/riesgoDeEsperar";

describe("riesgoDeEsperar", () => {
  it("brix y humedad no tienen matriz de umbrales: devuelven null, no una frase neutra", () => {
    expect(riesgoDeEsperar("brix", 18.8)).toBeNull();
    expect(riesgoDeEsperar("moisture", 11)).toBeNull();
    // Control positivo: el pH SÍ la tiene. Sin él, «devuelve null» pasaría igual con una
    // función que devolviera null siempre.
    expect(riesgoDeEsperar("ph", 4.8)).not.toBeNull();
  });

  it("el riesgo es la columna del documento, palabra por palabra", () => {
    const r = riesgoDeEsperar("ph", 4.8)!;
    expect(r.banda).toBe("[4.50, 5.20)");
    expect(r.riesgo).toContain("butírica");
    expect(r.riesgo).toContain("stinker");
  });

  it("los bordes de banda: el límite inferior es de la banda, el superior ya es de la siguiente", () => {
    // Es donde un `<` por un `<=` se cuela. Cada par fija los dos lados de un borde.
    const banda = (v: number) => riesgoDeEsperar("ph", v)?.banda;
    expect(banda(4.5)).toBe("[4.50, 5.20)");
    expect(banda(5.2)).toBe("[5.20, 6.50)"); // 5.20 NO está en [4.50, 5.20)
    expect(banda(4.49)).toBe("[3.80, 4.50)");
    expect(banda(5.19)).toBe("[4.50, 5.20)");
    expect(banda(6.49)).toBe("[5.20, 6.50)");
    expect(banda(6.5)).toBe("[6.50, 8.00]");
    expect(banda(3.8)).toBe("[3.80, 4.50)");
    expect(banda(3.79)).toBe("[3.50, 3.80)");
    expect(banda(3.5)).toBe("[3.50, 3.80)");
    expect(banda(3.49)).toBe("[3.30, 3.50)");
    expect(banda(3.3)).toBe("[3.30, 3.50)");
    expect(banda(3.29)).toBe("< 3.30");
  });

  it("el rango medible es cerrado en 2.50 y 8.00; fuera de él manda la fila del sensor", () => {
    // `[6.50, 8.00]` y «fuera de [2.50, 8.00]» se solapan en el papel; el 8.00 es de la banda, el
    // 8.01 es del sensor. Y 2.50 todavía es medible: es `< 3.30`, no «fuera».
    const banda = (v: number) => riesgoDeEsperar("ph", v)?.banda;
    expect(banda(8)).toBe("[6.50, 8.00]");
    expect(banda(8.01)).toBe("fuera de [2.50, 8.00]");
    expect(banda(2.5)).toBe("< 3.30");
    expect(banda(2.49)).toBe("fuera de [2.50, 8.00]");
    expect(banda(-1)).toBe("fuera de [2.50, 8.00]");
  });

  it("un valor que no es un número no tiene riesgo citable", () => {
    expect(riesgoDeEsperar("ph", Number.NaN)).toBeNull();
  });

  it("una variable que el documento no conoce no tiene riesgo citable", () => {
    expect(riesgoDeEsperar("temperatura", 24)).toBeNull();
    expect(riesgoDeEsperar("", 4.8)).toBeNull();
  });
});

/**
 * El guardia de la transcripción. El módulo CITA el documento; sin esta prueba, alguien edita
 * `10_ph_fermentation.md` §1 y el módulo sigue citando lo que ya no dice. Lee el documento de
 * verdad (la tabla bajo la cabecera «Banda») y compara, fila por fila, las celdas «Banda» y
 * «Riesgo / vector» con lo que la función devuelve para un pH que cae en esa fila.
 *
 * Las columnas se buscan **por el nombre de su cabecera**, no por posición: una columna nueva en
 * medio de la tabla no desplaza silenciosamente lo que se compara.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;
const DOCUMENTO = readFileSync(join(RAIZ, "docs/beneficio/10_ph_fermentation.md"), "utf8");

const celdas = (linea: string) =>
  linea.split("|").slice(1, -1).map((c) => c.trim());

function filasDelDocumento() {
  const lineas = DOCUMENTO.split("\n");
  const i = lineas.findIndex((l) => /^\|\s*Banda\s*\|/.test(l));
  if (i < 0) return { columnas: { banda: -1, riesgo: -1 }, filas: [] as { banda: string; riesgo: string }[] };
  const cabecera = celdas(lineas[i] ?? "");
  const columnas = { banda: cabecera.indexOf("Banda"), riesgo: cabecera.indexOf("Riesgo / vector") };
  const filas: { banda: string; riesgo: string }[] = [];
  // i + 1 es la línea separadora `| :--- |`; los datos empiezan en i + 2 y acaban en la primera
  // línea que no es de la tabla.
  for (const l of lineas.slice(i + 2)) {
    if (!l.startsWith("|")) break;
    const c = celdas(l);
    filas.push({ banda: (c[columnas.banda] ?? "").replaceAll("`", ""), riesgo: c[columnas.riesgo] ?? "" });
  }
  return { columnas, filas };
}

/** Un pH que cae en cada fila, EN EL ORDEN DE LA TABLA del documento. */
const UN_PH_POR_FILA = [7.0, 6.0, 4.8, 4.0, 3.6, 3.4, 3.0, 9.0];

describe("riesgoDeEsperar cita la tabla de 10_ph_fermentation.md §1", () => {
  const { columnas, filas } = filasDelDocumento();

  it("control positivo: el documento se leyó y la tabla tiene sus ocho filas", () => {
    // Sin esto, «todas las filas coinciden» pasaría con CERO filas leídas: un parser que no
    // encuentra la tabla devuelve una lista vacía, y comparar nada con nada es verde.
    expect(columnas.banda, "columna «Banda» no encontrada en la cabecera").toBeGreaterThanOrEqual(0);
    expect(columnas.riesgo, "columna «Riesgo / vector» no encontrada en la cabecera").toBeGreaterThanOrEqual(0);
    expect(filas.length, `filas leídas: ${filas.map((f) => f.banda).join(" | ")}`).toBeGreaterThanOrEqual(8);
    // Una fila que se sabe presente y una palabra que se sabe presente, para que «leí algo»
    // no pase por «leí la tabla».
    expect(filas[0]?.banda).toBe("[6.50, 8.00]");
    expect(DOCUMENTO).toContain("stinker");
  });

  it("el módulo cita todas las filas del documento, ni una más ni una menos", () => {
    // Una fila nueva en el documento sin transcribir aquí cae en ESTA aserción, antes que en la
    // comparación celda a celda.
    expect(
      filas.length,
      `el documento tiene ${filas.length} filas y esta prueba conoce ${UN_PH_POR_FILA.length}: ${filas.map((f) => f.banda).join(" | ")}`,
    ).toBe(UN_PH_POR_FILA.length);
  });

  it.each(UN_PH_POR_FILA.map((ph, i) => [i, ph] as const))(
    "la fila %i de la tabla: banda y riesgo son los del documento, celda por celda",
    (i, ph) => {
      const doc = filas[i];
      if (!doc) throw new Error(`el documento no tiene la fila ${i}`);
      const r = riesgoDeEsperar("ph", ph);
      expect(r, `pH ${ph} no devuelve riesgo`).not.toBeNull();
      expect(r!.banda).toBe(doc.banda);
      expect(r!.riesgo).toBe(doc.riesgo);
    },
  );
});
