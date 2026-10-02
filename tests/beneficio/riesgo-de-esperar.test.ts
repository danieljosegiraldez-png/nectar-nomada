/**
 * El riesgo de esperar: lo que `docs/beneficio/10_ph_fermentation.md` §1 dice de cada banda de
 * pH, **literal**, y nada para las variables que no tienen matriz.
 *
 * **Sólo el pH tiene riesgo citable.** Brix y humedad no tienen matriz de umbrales en ningún
 * documento del proyecto, y para ellos la función devuelve `null`: ninguna frase neutra, ningún
 * «sin riesgo». Un `null` es «no hay registro», que no es lo mismo que «no hay riesgo».
 *
 * **Y sólo para el perfil `WASHED_STANDARD`**, que es el título de la sección que se cita. Con cualquier otro
 * perfil —los otros cuatro, `null` («no se sabe cuál») o un texto que no es ninguno— la función devuelve
 * `null`: no hay umbral escrito para ellos y no se les presta el del lavado. Todas las pruebas de abajo
 * que no hablan del perfil consultan con el de la matriz (`riesgoDeEsperar`, local); las que sí hablan de
 * él llaman a la función real (`riesgoDeEsperarReal`) con otro.
 *
 * **La fila `[6.50, 8.00]` está RETIRADA por ADR-181** (la nota que abre §1 del documento): se
 * transcribe en el módulo, pero la función devuelve `null` en ese rango. Las pruebas de abajo lo
 * fijan, y el guardia de la transcripción la sigue comparando con el documento.
 *
 * Los números están escritos a mano, uno por borde. `NaN` comparado con lo que sea da `false`, así
 * que la prueba del valor no numérico afirma sobre `toBeNull`, nunca con una comparación.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAVES_DE_PERFIL } from "../../lib/beneficio/perfiles";
import {
  PERFIL_DE_LA_MATRIZ,
  riesgoDeEsperar as riesgoDeEsperarReal,
} from "../../lib/beneficio/riesgoDeEsperar";

/** El de la matriz: el perfil con el que se pregunta cuando la prueba no habla del perfil. */
const PERFIL = "WASHED_STANDARD";
const riesgoDeEsperar = (variable: string, valor: number) => riesgoDeEsperarReal(variable, valor, PERFIL);

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
    // 6.50 ya es de la banda retirada [6.50, 8.00]: ahí NO hay riesgo citable. Sigue siendo un borde
    // que discrimina: con un `<=` en vez de un `<`, 6.50 devolvería "[5.20, 6.50)".
    expect(riesgoDeEsperar("ph", 6.5)).toBeNull();
    expect(banda(3.8)).toBe("[3.80, 4.50)");
    expect(banda(3.79)).toBe("[3.50, 3.80)");
    expect(banda(3.5)).toBe("[3.50, 3.80)");
    expect(banda(3.49)).toBe("[3.30, 3.50)");
    expect(banda(3.3)).toBe("[3.30, 3.50)");
    expect(banda(3.29)).toBe("< 3.30");
  });

  it("el rango medible es cerrado en 2.50 y 8.00; fuera de él manda la fila del sensor", () => {
    // `[6.50, 8.00]` y «fuera de [2.50, 8.00]» se solapan en el papel; el 8.00 es de la banda
    // (retirada: `null`), el 8.01 es del sensor. Y 2.50 todavía es medible: es `< 3.30`, no «fuera».
    const banda = (v: number) => riesgoDeEsperar("ph", v)?.banda;
    expect(riesgoDeEsperar("ph", 8)).toBeNull();
    expect(banda(8.01)).toBe("fuera de [2.50, 8.00]");
    expect(banda(2.5)).toBe("< 3.30");
    expect(banda(2.49)).toBe("fuera de [2.50, 8.00]");
    expect(banda(-1)).toBe("fuera de [2.50, 8.00]");
  });

  it("ADR-181 retira la fila [6.50, 8.00]: en todo ese rango no hay riesgo citable", () => {
    // La nota que abre §1 retira `SUSPECT_DILUTION` a 6,50 fijo y dice que nunca se avisa sobre una
    // lectura de agua (la del agua de un lote mide 6,5–6,9, y a veces 7–8). Citar «sugiere agua de
    // enjuague» a pH 7,0 sería apoyarse en un umbral que el dueño retiró.
    expect(riesgoDeEsperar("ph", 7.0)).toBeNull();
    // Todo el rango, no un punto. Centésimas como enteros para que no derive el coma flotante.
    const citan: number[] = [];
    for (let i = 650; i <= 800; i++) {
      if (riesgoDeEsperar("ph", i / 100) !== null) citan.push(i / 100);
    }
    expect(citan, `pH dentro de [6.50, 8.00] que todavía citan algo: ${citan.join(", ")}`).toEqual([]);
    // Control positivo: «devuelve null» no pasa por una función que devuelva null siempre. A los
    // dos lados del rango y en 4.8, la función SIGUE citando su fila.
    expect(riesgoDeEsperar("ph", 4.8)?.banda).toBe("[4.50, 5.20)");
    expect(riesgoDeEsperar("ph", 6.49)?.banda).toBe("[5.20, 6.50)");
    expect(riesgoDeEsperar("ph", 8.01)?.banda).toBe("fuera de [2.50, 8.00]");
  });

  it("con cualquier perfil que no sea el de la matriz no hay riesgo citable: ni el de otro perfil, ni null, ni un texto cualquiera", () => {
    // Treinta pH dentro de la ventana óptima de NATURAL (3,9–4,8) recibían «proliferación butírica y mohos».
    // Se barre −2…16 en centésimas (enteros, para que no derive el coma flotante) con cada perfil que NO es el de la matriz.
    const otros: (string | null)[] = [...CLAVES_DE_PERFIL.filter((c) => c !== PERFIL), null, "", "washed_standard", "constructor"];
    for (const perfil of otros) {
      const citan: number[] = [];
      for (let i = -200; i <= 1600; i++) {
        if (riesgoDeEsperarReal("ph", i / 100, perfil) !== null) citan.push(i / 100);
      }
      expect(citan.length, `perfil ${JSON.stringify(perfil)}: ${citan.length} pH todavía citan algo (el primero: ${citan[0]})`).toBe(0);
    }
    // El control es la MISMA barrida con el perfil de la matriz: cita en siete bandas. Sin él, «cero citas» pasaría con una función que nunca cita.
    expect(otros.length, "se probaron los otros cuatro perfiles y los tres que no son un perfil").toBe(4 + 4);
    const bandas = new Set<string>();
    for (let i = -200; i <= 1600; i++) {
      const r = riesgoDeEsperarReal("ph", i / 100, PERFIL);
      if (r) bandas.add(r.banda);
    }
    expect(bandas.size).toBe(7);
    // Y el caso concreto: 4,7 está DENTRO de la ventana óptima de NATURAL y es «stinker» en la matriz del lavado.
    expect(riesgoDeEsperarReal("ph", 4.7, "NATURAL")).toBeNull();
    expect(riesgoDeEsperarReal("ph", 4.7, PERFIL)?.riesgo).toContain("stinker");
  });

  it("el riesgo dice de QUÉ perfil es la matriz de donde sale", () => {
    expect(riesgoDeEsperar("ph", 4.8)?.perfil).toBe("WASHED_STANDARD");
    expect(PERFIL_DE_LA_MATRIZ).toBe(PERFIL);
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
 * «Riesgo / vector» con lo que la función devuelve para un pH que cae en esa fila. Las filas
 * RETIRADAS no se devuelven, así que su transcripción se comprueba contra la fuente del módulo.
 *
 * Y en la otra dirección: un barrido de pH por la API pública exige que todo par `{banda, riesgo}`
 * que el módulo pueda devolver esté en el documento. Sin él, una fila INVENTADA en el módulo deja
 * el guardia en verde: el documento→módulo no puede ver lo que el documento no tiene.
 *
 * Las columnas se buscan **por el nombre de su cabecera**, no por posición: una columna nueva en
 * medio de la tabla no desplaza silenciosamente lo que se compara.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;
const DOCUMENTO = readFileSync(join(RAIZ, "docs/beneficio/10_ph_fermentation.md"), "utf8");
const FUENTE = readFileSync(join(RAIZ, "lib/beneficio/riesgoDeEsperar.ts"), "utf8");

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

/**
 * Las filas que esta prueba conoce, EN EL ORDEN DE LA TABLA del documento, con un pH que cae en
 * cada una. `retirada`: ADR-181 la retira y el módulo devuelve `null` en su rango.
 */
const FILAS_CONOCIDAS: readonly { readonly ph: number; readonly retirada?: boolean }[] = [
  { ph: 7.0, retirada: true }, // [6.50, 8.00]
  { ph: 6.0 },
  { ph: 4.8 },
  { ph: 4.0 },
  { ph: 3.6 },
  { ph: 3.4 },
  { ph: 3.0 },
  { ph: 9.0 }, // fuera de [2.50, 8.00]
];

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

  it("el título de §1 declara el perfil de la matriz: el mismo que el módulo cita", () => {
    // Si el documento retitula la matriz a otro perfil, `PERFIL_DE_LA_MATRIZ` sigue diciendo el de antes y el módulo
    // la citaría a lotes de un protocolo que ya no es el suyo. Se lee el título; no se supone.
    const titulo = /^## 1\.[^\n]*perfil `([A-Z_]+)`/m.exec(DOCUMENTO);
    expect(titulo, "no se encontró el título de §1 con «perfil `…`»").not.toBeNull();
    expect(titulo![1]).toBe(PERFIL_DE_LA_MATRIZ);
    // Control: la expresión es la que casa con el título de hoy, no una que casara con cualquier cosa.
    expect(titulo![0]).toContain("Matriz de umbrales");
  });

  it("el documento tiene exactamente las filas que esta prueba conoce", () => {
    // Mide documento → prueba, NO módulo → documento (eso es el barrido de más abajo). Una fila
    // nueva en el documento sin transcribir aquí cae en ESTA aserción, antes que en la comparación
    // celda a celda.
    expect(
      filas.length,
      `el documento tiene ${filas.length} filas y esta prueba conoce ${FILAS_CONOCIDAS.length}: ${filas.map((f) => f.banda).join(" | ")}`,
    ).toBe(FILAS_CONOCIDAS.length);
  });

  it.each(
    FILAS_CONOCIDAS.map((f, i) => [i, f.ph, f.retirada === true] as const).filter(([, , retirada]) => !retirada),
  )("la fila %i de la tabla: banda y riesgo son los del documento, celda por celda", (i, ph) => {
    const doc = filas[i];
    if (!doc) throw new Error(`el documento no tiene la fila ${i}`);
    const r = riesgoDeEsperar("ph", ph);
    expect(r, `pH ${ph} no devuelve riesgo`).not.toBeNull();
    expect(r!.banda).toBe(doc.banda);
    expect(r!.riesgo).toBe(doc.riesgo);
  });

  it.each(
    FILAS_CONOCIDAS.map((f, i) => [i, f.ph, f.retirada === true] as const).filter(([, , retirada]) => retirada),
  )(
    "la fila retirada %i: el módulo no la devuelve pero la sigue transcribiendo literal",
    (i, ph) => {
      const doc = filas[i];
      if (!doc) throw new Error(`el documento no tiene la fila ${i}`);
      expect(riesgoDeEsperar("ph", ph), `pH ${ph} cita una fila retirada`).toBeNull();
      // Como no se devuelve, sólo se ve en la fuente: cada celda tiene que estar como literal
      // entre comillas. (Los dos textos no tienen comillas ni barras invertidas que escapar.)
      expect(FUENTE, `banda «${doc.banda}» no está transcrita en el módulo`).toContain(`"${doc.banda}"`);
      expect(FUENTE, `riesgo «${doc.riesgo}» no está transcrito en el módulo`).toContain(`"${doc.riesgo}"`);
      // Control negativo: la misma búsqueda con una letra de más NO encuentra nada. Sin él,
      // `toContain` sobre una fuente que casara con todo pasaría igual.
      expect(FUENTE.includes(`"${doc.riesgo}x"`)).toBe(false);
    },
  );

  describe("módulo → documento: nada que el módulo pueda devolver falta en el documento", () => {
    // Barrido por la API pública, sin exportar nada: de −2 a 16 en milésimas (enteros, para que
    // el coma flotante no derive). Cubre todas las bandas, el rango del sensor por los dos lados y
    // cualquier fila que alguien añada al módulo con un ancho de una milésima o más.
    const vistos = new Map<string, { banda: string; riesgo: string }>();
    for (let i = -2000; i <= 16000; i++) {
      const r = riesgoDeEsperar("ph", i / 1000);
      if (r) vistos.set(`${r.banda}\u0000${r.riesgo}`, { banda: r.banda, riesgo: r.riesgo });
    }
    const alcanzables = [...vistos.values()];

    it("ningún par {banda, riesgo} alcanzable es ajeno al documento", () => {
      const ajenos = alcanzables.filter(
        (r) => !filas.some((f) => f.banda === r.banda && f.riesgo === r.riesgo),
      );
      expect(
        ajenos,
        `el módulo puede devolver ${ajenos.length} riesgo(s) que el documento no tiene: ${ajenos.map((a) => `${a.banda} → ${a.riesgo}`).join(" | ")}`,
      ).toEqual([]);
    });

    it("control del barrido: alcanza una fila por cada fila del documento que no está retirada", () => {
      // Sin esto, «0 ajenos» pasaría con un barrido que no encuentra NADA (una lista vacía no
      // tiene ajenos). Son 7 y no 8 porque [6.50, 8.00] está retirada y no es alcanzable.
      expect(
        alcanzables.map((a) => a.banda),
        `alcanzables: ${alcanzables.map((a) => a.banda).join(" | ")}`,
      ).toHaveLength(FILAS_CONOCIDAS.filter((f) => !f.retirada).length);
    });
  });
});
