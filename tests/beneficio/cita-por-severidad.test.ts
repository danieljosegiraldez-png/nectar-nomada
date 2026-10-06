/**
 * Una lectura sostiene la cita que su instrumento permite, y ninguna más.
 *
 * **La regla es de Daniel, 2026-09-14**, y el propio código ya la lleva escrita en
 * `confianzaPorVerificacion`: `REVISION_VENCIDA` «alimenta curvas y puede avisar. **No confirma una
 * crítica**». Lo que faltaba era el otro lado de la frase: la matriz de pH no decía de qué grado es
 * cada cita, así que nada podía aplicar la regla. De las ocho bandas de
 * `docs/beneficio/10_ph_fermentation.md` §1, **tres son `CRITICAL`**.
 *
 * **El hueco que cierra** (`PENDING_IMPLEMENTATIONS/021`, encontrado por el CLI de Codex el
 * 2026-10-02): una última lectura de pH 3,00 tomada con un instrumento cuya verificación **falló**
 * se excluye del motor de veredictos —`UNCALIBRATED`— y la pantalla, en cambio, le colgaba «Daño
 * consumado» citado como criterio de Néctar Nómada. Dibujar el registro y usarlo como fundamento de
 * una interpretación son juicios distintos.
 *
 * **Por qué la severidad se transcribe y no se decide aquí:** la columna «Acción del software» de la
 * tabla la escribió Daniel. Este archivo la lee del documento y la compara con la del módulo, en las
 * dos direcciones, igual que `guia-no-inventada.test.ts` hace con «Qué hace el operario». Si alguien
 * cambia una celda y no el código —o al revés— esto cae.
 *
 * Hermético: lee dos archivos y llama a dos funciones puras. No toca la base.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PERFIL_DE_LA_MATRIZ,
  riesgoDeEsperar,
  sostieneLaCita,
  type SeveridadDelSoftware,
} from "../../lib/beneficio/riesgoDeEsperar";

const RAIZ = new URL("../..", import.meta.url).pathname;
const DOCUMENTO = readFileSync(join(RAIZ, "docs/beneficio/10_ph_fermentation.md"), "utf8");

const celdas = (linea: string) => linea.split("|").slice(1, -1).map((c) => c.trim());

/**
 * La tabla de §1, por el NOMBRE de sus columnas y no por su posición: una columna nueva en medio no
 * desplaza en silencio lo que se compara. Misma técnica que `riesgo-de-esperar.test.ts`.
 */
function filasDelDocumento(): { readonly banda: string; readonly accion: string }[] {
  const lineas = DOCUMENTO.split("\n");
  const i = lineas.findIndex((l) => /^\|\s*Banda\s*\|/.test(l));
  if (i < 0) return [];
  const cabecera = celdas(lineas[i] ?? "");
  const cBanda = cabecera.indexOf("Banda");
  const cAccion = cabecera.indexOf("Acción del software");
  if (cBanda < 0 || cAccion < 0) return [];
  const filas: { banda: string; accion: string }[] = [];
  for (const l of lineas.slice(i + 2)) {
    if (!l.startsWith("|")) break;
    const c = celdas(l);
    filas.push({ banda: (c[cBanda] ?? "").replaceAll("`", ""), accion: c[cAccion] ?? "" });
  }
  return filas;
}

/** Un pH que cae en cada banda, en el orden de la tabla del documento. `null`: ADR-181 la retira. */
const PH_POR_FILA: readonly (number | null)[] = [null /* [6.50, 8.00] */, 6.0, 4.8, 4.0, 3.6, 3.4, 3.0, 9.0];

describe("la severidad de cada banda se transcribe del documento", () => {
  const filas = filasDelDocumento();

  it("control positivo: la tabla se leyó y tiene sus ocho filas con su columna de acción", () => {
    // Sin esto, «todas coinciden» pasaría con CERO filas leídas: un parser que no encuentra la
    // tabla devuelve una lista vacía, y comparar nada con nada es verde.
    expect(filas.length, "no se encontró la tabla de §1 o su columna «Acción del software»").toBe(8);
    expect(filas.filter((f) => f.accion !== "").length, "hay filas con la acción vacía").toBe(8);
    expect(PH_POR_FILA.length).toBe(filas.length);
  });

  it("lo que el módulo dice de cada banda es el grado que la celda nombra", () => {
    const problemas: string[] = [];
    filas.forEach((f, i) => {
      const ph = PH_POR_FILA[i];
      if (ph === null || ph === undefined) return; // la retirada: el módulo devuelve `null` en todo su rango
      const r = riesgoDeEsperar("ph", ph, PERFIL_DE_LA_MATRIZ);
      if (!r) {
        problemas.push(`«${f.banda}»: el módulo no cita nada para pH ${ph}`);
        return;
      }
      if (r.banda !== f.banda) {
        problemas.push(`pH ${ph} cae en «${r.banda}» y el documento lo pone en «${f.banda}»`);
        return;
      }
      // El grado que la celda nombra. Se mira el MÁS GRAVE que aparezca en ella: la banda
      // `[4.50, 5.20)` dice «INFO antes de la gracia; CRITICAL (con confirmación) después», y la
      // pantalla cita el caso condicionado —«si el pH se estanca…»—, que es el CRITICAL. Y
      // `[3.80, 4.50)` no nombra ninguno: su acción es «Trazar curva de descenso».
      const esperado: SeveridadDelSoftware | null = f.accion.includes("CRITICAL")
        ? "CRITICAL"
        : f.accion.includes("WARNING")
          ? "WARNING"
          : f.accion.includes("INFO")
            ? "INFO"
            : null;
      if (r.severidad !== esperado) {
        problemas.push(
          `«${f.banda}»: la celda dice «${f.accion}» (grado ${esperado ?? "ninguno"}) y el módulo dice ${String(r.severidad)}`,
        );
      }
    });
    expect(problemas).toEqual([]);
  });

  it("y tres de las ocho son CRITICAL, que es lo que hace que esto importe", () => {
    // Control de que la clasificación discrimina: si todo saliera `null` o todo `INFO`, la
    // compuerta de abajo no gobernaría nada y las dos pruebas anteriores seguirían pasando.
    const grados = PH_POR_FILA.filter((p): p is number => p !== null)
      .map((p) => riesgoDeEsperar("ph", p, PERFIL_DE_LA_MATRIZ)?.severidad ?? null);
    expect(grados.filter((g) => g === "CRITICAL").length).toBe(3);
    expect(grados.filter((g) => g === "WARNING").length).toBe(2);
    expect(grados.filter((g) => g === "INFO").length).toBe(1);
    expect(grados.filter((g) => g === null).length).toBe(1);
  });
});

describe("sostieneLaCita", () => {
  it("un instrumento verificado sostiene los tres grados", () => {
    for (const s of ["INFO", "WARNING", "CRITICAL"] as const) {
      expect(sostieneLaCita("VALIDATED", s), s).toBe(true);
    }
  });

  it("una revisión vencida sostiene INFO y WARNING, y NO una crítica", () => {
    // La regla de Daniel del 2026-09-14, y la frase que `confianzaPorVerificacion` ya lleva.
    expect(sostieneLaCita("REVISION_VENCIDA", "INFO")).toBe(true);
    expect(sostieneLaCita("REVISION_VENCIDA", "WARNING")).toBe(true);
    expect(sostieneLaCita("REVISION_VENCIDA", "CRITICAL")).toBe(false);
  });

  it("un instrumento que falló su contraste no sostiene ninguna", () => {
    for (const s of ["INFO", "WARNING", "CRITICAL"] as const) {
      expect(sostieneLaCita("UNCALIBRATED", s), s).toBe(false);
    }
  });

  it("no saber con qué se midió NO degrada nada, y eso es deliberado", () => {
    // `confianzaPorVerificacion` devuelve `null` para `SIN_INSTRUMENTO`: «no impone nada, porque no
    // saber con qué se midió no es lo mismo que saber que el instrumento estaba mal». Y es el
    // estado de TODAS las lecturas de hoy —`measurement.instrument_id` acaba de existir y nadie lo
    // ha rellenado—, así que tratarlo como avería apagaría esta pantalla entera el día que se
    // despliegue. Ese defecto está nombrado en `desdeElLote.ts`; esta prueba lo impide.
    for (const s of ["INFO", "WARNING", "CRITICAL"] as const) {
      expect(sostieneLaCita(null, s), s).toBe(true);
    }
  });

  it("una banda sin grado la sostiene cualquiera, incluso la excluida", () => {
    // `[3.80, 4.50)` no afirma nada alarmante: su riesgo es «Ninguno» y su acción «Trazar curva de
    // descenso». Negar eso a una lectura excluida no protegería a nadie y borraría de la pantalla
    // la única banda que dice que todo va bien.
    expect(sostieneLaCita("UNCALIBRATED", null)).toBe(true);
    expect(sostieneLaCita("REVISION_VENCIDA", null)).toBe(true);
  });

  it("las confianzas intermedias sostienen todo: no son del instrumento", () => {
    // `RETROSPECTIVE`, `TEMP_DRIFT_RISK` y `TEMP_UNCOMPENSATED` salen de la procedencia o de la
    // temperatura, no de la verificación, y esta compuerta es sólo sobre la verificación. Quien
    // combine las dos lo hace con `peorConfianza`, que es otro eje.
    for (const c of ["RETROSPECTIVE", "TEMP_DRIFT_RISK", "TEMP_UNCOMPENSATED"] as const) {
      expect(sostieneLaCita(c, "CRITICAL"), c).toBe(true);
    }
  });
});
