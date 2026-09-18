import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * El empaquetador de revisión, pedido SIN rutas.
 *
 * **El fallo que esto guarda, medido el 2026-09-18.** Desde el #125 (2026-09-01) el
 * script expandía `"${RUTAS[@]}"` bajo `set -u`. En bash 3.2 —el `/bin/bash` de macOS,
 * que es donde se corre esta herramienta— un array vacío cuenta como variable sin
 * definir: la expansión revienta, la sustitución `$(...)` se traga el error por su
 * `|| true`, la lista de archivos sale vacía, y el script anuncia **«El rango no toca
 * ningún archivo. No hay nada que revisar.»** sobre un commit que tocó diecisiete.
 * Un vacío plausible en vez de un fallo en rojo: la forma exacta que el `CLAUDE.md` de
 * la máquina describe.
 *
 * **Límite honesto de esta prueba:** en bash ≥ 4.4 (el de los runners de Linux) un
 * array vacío bajo `set -u` es válido, así que allí pasaría también sin el arreglo.
 * Guarda el fallo donde ocurre —este Mac— y por eso llama a `/bin/bash` explícitamente
 * cuando existe, en vez de al `bash` que haya primero en el PATH.
 *
 * El árbol de prueba es un repositorio de juguete en un temporal: ningún fixture
 * escribe dentro de este repositorio, que comparten otras sesiones.
 */

const raizRepo = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pack-"));
const BASH = spawnSync("/bin/bash", ["-c", "true"]).status === 0 ? "/bin/bash" : "bash";

afterAll(() => {
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      /* reintento: un proceso puede tener aún el directorio abierto */
    }
  }
});

function git(args: string[]) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

function repoDeJuguete() {
  git(["init", "-q"]);
  git(["config", "user.email", "prueba@example.invalid"]);
  git(["config", "user.name", "Prueba"]);
  mkdirSync(join(dir, "tools"), { recursive: true });
  copyFileSync(join(raizRepo, "tools/pack-for-review.sh"), join(dir, "tools/pack-for-review.sh"));
  writeFileSync(join(dir, "uno.txt"), "base\n");
  git(["add", "tools/pack-for-review.sh", "uno.txt"]);
  git(["commit", "-q", "-m", "base"]);
  writeFileSync(join(dir, "uno.txt"), "base\ncambio\n");
  writeFileSync(join(dir, "dos.txt"), "nuevo\n");
  git(["add", "uno.txt", "dos.txt"]);
  git(["commit", "-q", "-m", "el cambio a revisar"]);
}

repoDeJuguete();

describe("tools/pack-for-review.sh", () => {
  it("sin rutas, empaqueta el rango entero en vez de decir que no toca nada", () => {
    const salida = join(dir, "paquete.md");
    const r = spawnSync(BASH, ["tools/pack-for-review.sh", "HEAD~1..HEAD", salida], { cwd: dir, encoding: "utf8" });
    expect(r.stderr).not.toContain("no toca ningún archivo");
    expect(r.stderr).not.toContain("unbound variable");
    expect(r.status).toBe(0);
    const paquete = readFileSync(salida, "utf8");
    // Los dos archivos que el commit tocó están en el paquete, con su diff.
    expect(paquete).toContain("uno.txt");
    expect(paquete).toContain("dos.txt");
    expect(paquete).toContain("+cambio");
  });

  it("y con rutas sigue acotando — el control de que el arreglo no rompió el filtro", () => {
    const salida = join(dir, "acotado.md");
    const r = spawnSync(BASH, ["tools/pack-for-review.sh", "HEAD~1..HEAD", salida, "dos.txt"], { cwd: dir, encoding: "utf8" });
    expect(r.status).toBe(0);
    const paquete = readFileSync(salida, "utf8");
    expect(paquete).toContain("dos.txt");
    // uno.txt también cambió en el commit, pero quedó fuera del alcance pedido.
    expect(paquete).not.toContain("+cambio");
  });
});
