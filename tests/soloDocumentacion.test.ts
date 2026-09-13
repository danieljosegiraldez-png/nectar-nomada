/**
 * `scripts/solo-documentacion.sh` decide **si se construye**, y por eso se prueba.
 *
 * **Lo que costó no probarlo.** El script deducía la base como `HEAD^`. Eso es
 * verdad en GitHub Actions, que saca el commit de FUSIÓN de la PR — pero **Vercel
 * saca el commit de la rama**, donde `HEAD^` es el commit anterior del autor. Como
 * todas las PR de este repositorio terminan con un commit de estado
 * —`SESSION_STATE.md`, sólo documentación— el rango decía «sólo docs» y Vercel
 * **saltaba el build de un cambio de código entero**, reportando
 * `success — Canceled by Ignored Build Step`.
 *
 * Les pasó a las PR **#283, #284, #286 y #288**, y la #288 llegó a `main` sin que
 * nada hubiera construido su código: rompió producción y el sitio sirvió un build
 * viejo durante una hora.
 *
 * **Los casos se montan en repositorios de juguete**, no sobre commits reales del
 * proyecto: un test atado a un sha concreto se rompe cuando alguien rebasa, y
 * entonces se borra en vez de arreglarse.
 *
 * Hermético: sólo `git` y archivos en un temporal.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const GUION = new URL("../scripts/solo-documentacion.sh", import.meta.url).pathname;
const temporales: string[] = [];

afterAll(() => {
  for (const dir of temporales) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // Una carrera perdida al borrar no debe tumbar la suite.
    }
  }
});

/** Un repositorio de juguete con `main` y una rama, como los que el script ve. */
function repo(): { dir: string; git: (...args: string[]) => string; commit: (archivo: string, texto?: string) => void } {
  const dir = mkdtempSync(join(tmpdir(), "solodocs-"));
  temporales.push(dir);
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.email=t@t.invalid", "-c", "user.name=T", ...args], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  git("init", "-q", "-b", "main");
  const commit = (archivo: string, texto = "x") => {
    const ruta = join(dir, archivo);
    mkdirSync(join(ruta, ".."), { recursive: true });
    writeFileSync(ruta, `${texto}\n`);
    git("add", archivo);
    git("commit", "-q", "-m", `toca ${archivo}`);
  };
  commit("README.md", "raíz");
  // `origin/main` existe de verdad: es lo que el script busca para el merge-base.
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  return { dir, git, commit };
}

/** Devuelve `true` si el script dice «sólo documentación» (salida 0). */
function soloDocs(dir: string, args: string[] = [], env: Record<string, string> = {}): { veredicto: boolean; salida: string } {
  try {
    const salida = execFileSync("bash", [GUION, ...args], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { veredicto: true, salida };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    // 1 es «hay código», que es una respuesta y no un fallo. Cualquier otro código
    // sí es una avería del script y se distingue.
    if (e.status !== 1) throw new Error(`el script salió con ${e.status}: ${e.stdout}\n${e.stderr}`);
    return { veredicto: false, salida: `${e.stdout ?? ""}\n${e.stderr ?? ""}` };
  }
}

describe("solo-documentacion.sh", () => {
  it("EL DEFECTO QUE ROMPIÓ PRODUCCIÓN: rama con código y un commit de estado encima", () => {
    // Es la forma exacta de cada PR de este repositorio, y la que Vercel ve.
    const { dir, git, commit } = repo();
    git("checkout", "-q", "-b", "rama");
    commit("lib/algo.ts", "código");
    commit("SESSION_STATE.md", "el estado");

    const { veredicto, salida } = soloDocs(dir, [], { VERCEL_GIT_COMMIT_REF: "rama" });
    expect(veredicto, `dijo «sólo docs» y saltaría el build:\n${salida}`).toBe(false);
    // Y dice de dónde sacó la base, que es lo que hace auditable el veredicto.
    expect(salida).toMatch(/base deducida/);
  });

  it("una rama de SÓLO documentación sí salta el build", () => {
    // Control positivo del anterior: si esto también dijera «hay código», el
    // guardia de arriba pasaría por una respuesta constante y no probaría nada.
    const { dir, git, commit } = repo();
    git("checkout", "-q", "-b", "rama-docs");
    commit("docs/una-cosa.md", "prosa");
    commit("SESSION_STATE.md", "el estado");

    const { veredicto } = soloDocs(dir, [], { VERCEL_GIT_COMMIT_REF: "rama-docs" });
    expect(veredicto).toBe(true);
  });

  it("en un commit de FUSIÓN, el primer padre es la base — el caso de GitHub Actions", () => {
    const { dir, git, commit } = repo();
    git("checkout", "-q", "-b", "rama");
    commit("lib/algo.ts", "código");
    git("checkout", "-q", "main");
    commit("docs/otra.md", "prosa en main");
    git("merge", "-q", "--no-ff", "-m", "fusión", "rama");

    const { veredicto, salida } = soloDocs(dir, [], { VERCEL_GIT_COMMIT_REF: "main" });
    expect(veredicto, `la fusión trae código y dijo «sólo docs»:\n${salida}`).toBe(false);
  });

  it("`scripts/` y `prisma/` NO son documentación aunque no sean TypeScript", () => {
    // Deliberadamente estrecho, como dice su cabecera: cambiarlos cambia lo que corre.
    for (const archivo of ["scripts/algo.sh", "prisma/migrations/20260101000000_x/migration.sql", ".github/workflows/ci.yml"]) {
      const { dir, git, commit } = repo();
      git("checkout", "-q", "-b", "rama");
      commit(archivo, "no es prosa");
      const { veredicto } = soloDocs(dir, [], { VERCEL_GIT_COMMIT_REF: "rama" });
      expect(veredicto, `${archivo} pasó por documentación`).toBe(false);
    }
  });

  it("ante la duda construye: sin `origin/main` no se puede medir", () => {
    // La regla que su propia cabecera pone primero. Un build de más cuesta un
    // minuto; uno de menos deja producción sirviendo lo viejo.
    const { dir, git, commit } = repo();
    git("update-ref", "-d", "refs/remotes/origin/main");
    git("checkout", "-q", "-b", "huerfana");
    commit("docs/solo-prosa.md", "prosa");

    const { veredicto, salida } = soloDocs(dir, [], { VERCEL_GIT_COMMIT_REF: "huerfana" });
    expect(veredicto, `sin base medible debería construir:\n${salida}`).toBe(false);
    expect(salida).toMatch(/no se pudo deducir la base|construyo por si acaso/);
  });
});
