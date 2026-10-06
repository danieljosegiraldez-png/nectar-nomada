import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * SESSION_STATE.md tiene que caber en una sola lectura.
 *
 * Esto es un test y no una regla escrita porque la regla se escribió y se
 * rompió dos veces en dos días, ambas por el commit que añadía una entrada.
 * Pasada aproximadamente la marca de los 25K tokens una lectura devuelve solo
 * el principio **y reporta éxito**: un archivo de estado de 1.264 líneas dejó
 * de llegar a las sesiones sin que nada, en ningún sitio, lo dijera.
 *
 * La primera versión de este test solo corría el guardia contra el archivo
 * actual y exigía salida 0 — habría seguido en verde si el guardia se
 * convirtiera en `process.exit(0)`. Un test llamado "el guardia" tiene que
 * hacer la mutación que dice atrapar y verla fallar, así que los fixtures
 * negativos de abajo son la parte que importa.
 */

const raiz = new URL("..", import.meta.url).pathname;
const guardia = "scripts/check-state-budget.mjs";

function correr(ruta?: string): { codigo: number; salida: string } {
  try {
    const salida = execFileSync("node", ruta ? [guardia, ruta] : [guardia], {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { codigo: 0, salida };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { codigo: e.status ?? 1, salida: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const dir = mkdtempSync(join(tmpdir(), "estado-"));

afterAll(() => {
  // Con reintentos: atrapar un "recurso ocupado" y rendirse convierte una
  // carrera perdida en basura permanente en el directorio temporal.
  for (let intento = 0; intento < 5; intento++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      // siguiente intento
    }
  }
});

function fixture(nombre: string, contenido: string): string {
  const ruta = join(dir, nombre);
  writeFileSync(ruta, contenido, "utf8");
  return ruta;
}

describe("SESSION_STATE.md", () => {
  it("cabe en una sola lectura", () => {
    const { codigo, salida } = correr();
    expect(salida.trim()).not.toBe("");
    expect(codigo, salida).toBe(0);
  });
});

describe("el guardia del presupuesto", () => {
  it("falla cuando sobran líneas, y dice cuántas secciones mover", () => {
    const relleno = Array.from({ length: 6 }, (_, i) =>
      `\n### 2026-0${i + 1}-01 · relleno ${i + 1}\n` +
      Array.from({ length: 90 }, (_, j) => `linea ${j}`).join("\n")
    ).join("\n");
    const { codigo, salida } = correr(fixture("gordo.md", `# Estado\n${relleno}\n`));

    expect(codigo).toBe(1);
    expect(salida).toContain("excede el presupuesto");
    expect(salida).toMatch(/líneas\s*:\s*\d+ \/ 450\s+← excedido/);
    // Nombra la más VIEJA primero, y cuenta cuántas hacen falta.
    expect(salida).toMatch(/Mover [1-9]\d* sección/);
    expect(salida).toContain("### 2026-01-01 · relleno 1");
  });

  it("falla por bytes aunque la estimación de tokens no se dispare", () => {
    // Prosa acentuada: pesa el doble en bytes que en caracteres, que es
    // justamente el caso que `caracteres / 3` no acota.
    const denso =
      "# Estado\n\n## Prosa\n" +
      Array.from({ length: 600 }, () =>
        "Ñandú ñoño çedilla — prosa densa con acentos que pesa más en bytes."
      ).join("\n");
    const { codigo, salida } = correr(fixture("denso.md", denso));

    expect(codigo).toBe(1);
    expect(salida).toMatch(/bytes\s*:\s*\d+ \/ 45000\s+← excedido/);
  });

  it("avisa cuando archivar el historial no basta", () => {
    const contenido =
      "# Estado\n\n### 2026-01-01 · una entrada pequeña\ncorta\n\n## Prosa\n" +
      Array.from({ length: 600 }, () => "prosa que no se puede archivar").join("\n");
    const { salida } = correr(fixture("insuficiente.md", contenido));

    expect(salida).toContain("Aun archivando todo lo archivable sigue sin caber");
  });

  it("dice qué hacer cuando no hay nada fechado que archivar", () => {
    const contenido =
      "# Estado\n" + Array.from({ length: 500 }, () => "linea").join("\n");
    const { codigo, salida } = correr(fixture("sinfechas.md", contenido));

    expect(codigo).toBe(1);
    expect(salida).toContain("No hay entradas");
    expect(salida).toContain("Hay que recortar, no archivar");
  });

  it("falla si el archivo de estado no existe", () => {
    const { codigo, salida } = correr(join(dir, "no-existe.md"));
    expect(codigo).toBe(1);
    expect(salida).toContain("no existe");
  });
});

describe("el aviso al 90 %", () => {
  const relleno = (n: number) => Array.from({ length: n }, (_, i) => `linea ${i}`).join("\n");

  it("avisa cerca del techo sin romper la compuerta", () => {
    // ~92 % de las 450 líneas: avisa, pero sale 0. Un aviso que falla a los
    // pocos días de cada archivado enseñaría a ignorar la compuerta entera.
    // Re-dimensionado dos veces el 2026-10-04: el umbral subió de 0,8 a 0,9 y el
    // techo de 400 a 450, y cada cambio deja esta franja en otro sitio.
    const contenido = `# Estado\n\n### 2026-01-01 · la más vieja\n${relleno(205)}\n\n### 2026-02-02 · la nueva\n${relleno(205)}\n`;
    const { codigo, salida } = correr(fixture("cerca.md", contenido));
    expect(codigo, salida).toBe(0);
    expect(salida).toContain("⚠");
    expect(salida).toMatch(/Al \d+ % del presupuesto/);
    expect(salida, "tiene que decir cuál archivar, no sólo que hay prisa")
      .toContain("### 2026-01-01 · la más vieja");
  });

  /**
   * Todas las entradas de un mismo día empatan en fecha, y con el empate
   * decidía el orden del documento — que en §2 va **de más nuevo a más viejo**.
   * El aviso nombraba entonces la entrada recién escrita como «la más vieja».
   * Encontrado el 2026-08-31 al cerrar la sesión, usando el propio aviso:
   * cinco entradas compartían fecha.
   */
  it("con fechas empatadas nombra la de más abajo, que es la más vieja", () => {
    const contenido =
      "# Estado\n\n## 2. Lo que se entregó — más nuevo primero\n\n" +
      `### 2026-05-05 · la nueva de hoy\n${relleno(204)}\n\n` +
      `### 2026-05-05 · la vieja de hoy\n${relleno(204)}\n`;
    const { codigo, salida } = correr(fixture("empate.md", contenido));
    expect(codigo, salida).toBe(0);
    expect(salida).toContain("⚠");
    expect(salida, "entre fechas iguales, la más vieja es la de más abajo")
      .toContain("### 2026-05-05 · la vieja de hoy");
    expect(salida, "no puede nombrar la recién escrita")
      .not.toContain("### 2026-05-05 · la nueva de hoy");
  });

  /**
   * El suelo: al menos una entrada fechada se queda viva.
   *
   * El 2026-09-01 seguí al aviso hasta que se calló y **vació §2**: era la
   * última sección, el aviso la nombró, y archivarla dejó «Lo que se entregó»
   * en blanco. Nada se perdió, pero una sesión nueva abre el estado y no ve
   * trabajo reciente — que es lo que ese archivo existe para contar.
   */
  it("con una sola entrada no la nombra: archivarla vaciaría §2", () => {
    const contenido = `# Estado\n\n### 2026-01-01 · la única\n${relleno(412)}\n`;
    const { codigo, salida } = correr(fixture("suelo.md", contenido));
    expect(codigo, salida).toBe(0);
    expect(salida).toContain("⚠");
    expect(salida, "no puede proponer archivar la última").not.toContain("### 2026-01-01 · la única");
    expect(salida).toContain("dejaría §2");
  });

  it("por encima del techo con una sola entrada, tampoco propone moverla", () => {
    const contenido = `# Estado\n\n### 2026-01-01 · la única\n${relleno(500)}\n`;
    const { codigo, salida } = correr(fixture("suelo-duro.md", contenido));
    expect(codigo, salida).toBe(1);
    expect(salida, "no debe listarla como movible").not.toContain("### 2026-01-01 · la única");
    expect(salida).toContain("La última entrada");
  });

  it("no dice nada por debajo del 90 %", () => {
    const { codigo, salida } = correr(fixture("holgado.md", `# Estado\n\n${relleno(50)}\n`));
    expect(codigo).toBe(0);
    expect(salida).not.toContain("⚠");
  });

  /**
   * **El par que fija el umbral, y es lo único que de verdad lo prueba.**
   * El 2026-10-04 subió de 0,8 a 0,9 por decisión de Daniel. Sin estas dos, un
   * cambio del número no rompería nada: los otros casos están muy por encima y
   * «holgado» muy por debajo, así que los dos valores darían el mismo verde.
   *
   * El filtro es `>=`, así que el 90 % EXACTO avisa. Importa: con el techo en
   * 450, un archivo de 405 líneas está justo en el borde y sí suena.
   */
  it("a un pelo por debajo del umbral se calla", () => {
    const { codigo, salida } = correr(fixture("justo-debajo.md", `# Estado\n\n${relleno(399)}\n`));
    expect(codigo, salida).toBe(0);
    expect(salida, "402/450 es el 89 %: no debe avisar").not.toContain("⚠");
  });

  it("y en el umbral exacto avisa, porque el filtro es >=", () => {
    const { codigo, salida } = correr(fixture("justo-encima.md", `# Estado\n\n${relleno(402)}\n`));
    expect(codigo, salida).toBe(0);
    expect(salida, "405/450 es el 90 % exacto: tiene que avisar").toContain("⚠");
    expect(salida).toMatch(/Al 90 % del presupuesto/);
  });

  it("por encima del techo sigue fallando, no avisando", () => {
    const { codigo, salida } = correr(fixture("pasado.md", `# Estado\n\n${relleno(480)}\n`));
    expect(codigo).toBe(1);
    expect(salida).toContain("excede el presupuesto");
  });
});
