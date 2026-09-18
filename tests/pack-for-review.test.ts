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

/**
 * El texto completo sale de la PUNTA del rango, no del árbol de trabajo.
 *
 * **El fallo que esto guarda, medido el 2026-09-17.** Empaquetando las specs #363,
 * #365, #370 y #387 con `origin/main..origin/spec/…` desde un checkout de `main`, las
 * cuatro salieron como **«borrado en este rango»** aunque el diff las añadía enteras:
 * la sección del texto completo miraba el disco, y en el disco de `main` no estaban.
 * Y un archivo que sí estaba pero distinto salía con la versión de `main`, no con la
 * revisada. Es el uso que documenta la propia cabecera: `866339f..main`.
 *
 * El control es el caso contrario: un archivo borrado DE VERDAD en el rango tiene que
 * seguir diciéndolo.
 */
describe("tools/pack-for-review.sh con la punta del rango fuera del árbol", () => {
  const dir2 = mkdtempSync(join(tmpdir(), "pack-punta-"));
  const git2 = (args: string[]) => execFileSync("git", args, { cwd: dir2, encoding: "utf8" });

  afterAll(() => {
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(dir2, { recursive: true, force: true });
        return;
      } catch {
        /* reintento */
      }
    }
  });

  git2(["init", "-q"]);
  git2(["config", "user.email", "prueba@example.invalid"]);
  git2(["config", "user.name", "Prueba"]);
  mkdirSync(join(dir2, "tools"), { recursive: true });
  copyFileSync(join(raizRepo, "tools/pack-for-review.sh"), join(dir2, "tools/pack-for-review.sh"));
  writeFileSync(join(dir2, "viejo.txt"), "se va\n");
  writeFileSync(join(dir2, "comun.txt"), "linea de la base\n");
  git2(["add", "tools/pack-for-review.sh", "viejo.txt", "comun.txt"]);
  git2(["commit", "-q", "-m", "base"]);
  const base = git2(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  git2(["checkout", "-q", "-b", "rama"]);
  writeFileSync(join(dir2, "nuevo.txt"), "uno\ndos\ntres\n");
  writeFileSync(join(dir2, "comun.txt"), "linea de la base\nlinea de la rama\n");
  git2(["rm", "-q", "viejo.txt"]);
  git2(["add", "nuevo.txt", "comun.txt"]);
  git2(["commit", "-q", "-m", "la rama a revisar"]);
  // Se empaqueta desde la base: ni nuevo.txt ni la línea de la rama están en el disco.
  git2(["checkout", "-q", base]);

  const salida = join(dir2, "paquete.md");
  const r = spawnSync(BASH, ["tools/pack-for-review.sh", `${base}..rama`, salida], { cwd: dir2, encoding: "utf8" });
  const paquete = r.status === 0 ? readFileSync(salida, "utf8") : "";
  // Sólo la sección del texto completo: el diff de más arriba también contiene las líneas.
  const textoCompleto = paquete.split(/^## Texto /m)[1] ?? "";

  it("el empaquetador termina bien y la sección del texto completo existe", () => {
    // Con el stderr al lado, para que un fallo diga por qué.
    expect({ status: r.status, stderr: r.stderr }).toMatchObject({ status: 0 });
    expect(textoCompleto.length).toBeGreaterThan(0);
  });

  it("un archivo que la rama AÑADE sale entero, no como borrado", () => {
    expect(textoCompleto).toContain("### nuevo.txt  (3 líneas)");
    expect(textoCompleto).toContain("uno\ndos\ntres\n");
    expect(textoCompleto).not.toContain("### nuevo.txt — borrado en este rango");
  });

  it("un archivo que la rama MODIFICA sale en su versión de la punta", () => {
    expect(textoCompleto).toContain("### comun.txt  (2 líneas)");
    expect(textoCompleto).toContain("linea de la rama");
  });

  it("control: un archivo borrado de verdad en el rango sigue diciéndolo", () => {
    expect(textoCompleto).toContain("### viejo.txt — borrado en este rango");
  });
});
