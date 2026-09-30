/**
 * `restore_error_count()` y `restauracion_limpia()` de scripts/backup/pg-tools.sh.
 *
 * **Por qué existe.** Hasta el 2026-09-30 `verify-restore.sh` contaba los errores de `pg_restore`,
 * los imprimía, copiaba el log — y seguía adelante. Si el censo de filas cuadraba, el veredicto era
 * **PASS** con «restore errors: N» enterrado en una línea del resumen. Una restauración que falla a
 * medias puede traer todas las filas y perderse una restricción, un índice o una función: eso no es
 * una copia restaurable, y es justo lo que el único guardia de la red contra perder datos no puede
 * dejar pasar.
 *
 * **Se llama a la función de shell, no a una versión reescrita aquí**, por el motivo que da
 * `tests/backup/libpqUrl.test.ts`: una reformulación en TypeScript puede coincidir consigo misma
 * mientras el guion hace otra cosa.
 *
 * **Y sólo cuenta `error`, no `warning`.** Con `--no-owner --no-privileges` los avisos por los roles
 * de Neon que en el clúster desechable no existen son esperados; hacerlos fatales sería un guardia
 * que nunca puede pasar, que este `CLAUDE.md` considera peor que ninguno.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TOOLS = join(__dirname, "..", "..", "scripts", "backup", "pg-tools.sh");

let dir: string;

/** Llama a la función real y devuelve su cuenta. */
function contar(log: string): number {
  const out = execFileSync("bash", ["-c", `. "${TOOLS}" >/dev/null 2>&1; restore_error_count "$1"`, "_", log], {
    encoding: "utf8",
  });
  return Number(out.trim());
}

/** Llama al veredicto real y devuelve su estado de salida como booleano. */
function esLimpia(log: string): boolean {
  const out = execFileSync(
    "bash",
    ["-c", `. "${TOOLS}" >/dev/null 2>&1; if restauracion_limpia "$1"; then echo si; else echo no; fi`, "_", log],
    { encoding: "utf8" },
  );
  return out.trim() === "si";
}

const LIMPIO = "pg_restore: connecting to database for restore\npg_restore: creating SCHEMA \"core\"\n";
const CON_AVISOS = `${LIMPIO}pg_restore: warning: no privileges could be revoked for "public"\npg_restore: warning: errors ignored on restore: 0\n`;
const CON_ERRORES = `${LIMPIO}pg_restore: error: could not execute query: ERROR:  relation "core.person" already exists\npg_restore: error: could not execute query: ERROR:  function does not exist\n`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "nn-restore-"));
  writeFileSync(join(dir, "limpio.err"), LIMPIO);
  writeFileSync(join(dir, "avisos.err"), CON_AVISOS);
  writeFileSync(join(dir, "errores.err"), CON_ERRORES);
  writeFileSync(join(dir, "vacio.err"), "");
});

afterAll(() => {
  // Con reintentos y sin lanzar, como pide CLAUDE.md y comprueba
  // tests/arquitectura/temporales-se-limpian.test.ts.
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Una carrera perdida al borrar no debe tumbar la suite.
  }
});

describe("la cuenta de errores de pg_restore", () => {
  it("un log sin errores da 0, y un log vacío también", () => {
    expect(contar(join(dir, "limpio.err"))).toBe(0);
    expect(contar(join(dir, "vacio.err"))).toBe(0);
  });

  it("cuenta los errores, y los cuenta TODOS", () => {
    // Control positivo del instrumento: si el patrón dejara de casar, el 0 de arriba se leería
    // como «limpio» — que es exactamente el defecto que este archivo existe para cerrar.
    expect(contar(join(dir, "errores.err"))).toBe(2);
  });

  it("un aviso NO es un error: con `--no-owner` los roles de Neon avisan y eso es esperado", () => {
    expect(contar(join(dir, "avisos.err"))).toBe(0);
  });

  it("un log que no existe da 0 en vez de reventar — la restauración pudo no escribir nada", () => {
    expect(contar(join(dir, "no-existe.err"))).toBe(0);
  });
});

describe("el veredicto", () => {
  it("limpio y sólo-avisos pasan", () => {
    expect(esLimpia(join(dir, "limpio.err"))).toBe(true);
    expect(esLimpia(join(dir, "avisos.err"))).toBe(true);
  });

  it("con errores NO pasa — el caso que antes acababa en PASS", () => {
    expect(esLimpia(join(dir, "errores.err"))).toBe(false);
  });
});

describe("y el guion usa el veredicto en vez de sólo contarlo", () => {
  const fuente = () => execFileSync("cat", [join(__dirname, "..", "..", "scripts", "backup", "verify-restore.sh")], { encoding: "utf8" });

  it("verify-restore.sh llama a `restauracion_limpia` y sale 1 cuando no lo es", () => {
    const src = fuente();
    expect(src).toMatch(/if\s+!\s+restauracion_limpia\b/);
    // La conducta, no el token: tras ese `if` tiene que haber un `exit 1` antes del censo.
    const desde = src.indexOf("restauracion_limpia");
    const hastaCenso = src.indexOf("Recomputing row census");
    expect(desde).toBeGreaterThan(-1);
    expect(hastaCenso).toBeGreaterThan(desde);
    expect(src.slice(desde, hastaCenso)).toMatch(/exit 1/);
  });

  it("y el código de salida de pg_restore queda REGISTRADO en el manifiesto", () => {
    // No decide —nunca se ha medido— pero se anota para que algún día pueda decidir.
    expect(fuente()).toMatch(/restore_exit_code: \$RESTORE_RC/);
  });
});
