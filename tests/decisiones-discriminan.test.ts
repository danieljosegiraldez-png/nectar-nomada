import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Las cinco decisiones del dueño, contra la afirmación que su propio guion hace.
 *
 * `scripts/open-decisions.sh` dice en su cabecera: «Toda prueba pasó un
 * flip-test: se construyó el mundo donde la cosa ya es cierta y el veredicto
 * cambió». Eso era prosa, y hasta hoy nada lo comprobaba aquí. Las cinco dicen
 * «cerrada» y llevan diciéndolo desde que se escribieron: **la única respuesta
 * que se les ha observado es la que no distingue nada**. El `CLAUDE.md` de esta
 * máquina registra un item marcado como bloqueado dos días por una prueba que
 * sólo sabía decir «abierta».
 *
 * **Por qué es HERMÉTICO, y por qué eso es la mitad del trabajo.**
 * `tests/open-decisions.test.ts` está excluido de CI a propósito
 * —`scripts/pruebas-por-compuerta.txt`, grupo `maquina`— porque «lee
 * `$HOME/.zshrc` a través de su script» y «pasaría en verde por los dotfiles de
 * quien lo corriera». Aquí el `HOME` lo fabrica el propio test para cada mundo,
 * así que no lee los dotfiles de nadie y puede correr en CI como cualquier otro.
 *
 * **Se comprueba en LAS DOS DIRECCIONES.** Un flip-test de un solo sentido
 * —«ábrela y mira si se abre»— se pone rojo el día que Daniel reabra una
 * decisión de verdad, y un guardia que se pone rojo por un cambio legítimo
 * enseña a ignorarlo. Con las dos, el estado de hoy deja de importar.
 *
 * **P-A lleva DOS parejas.** Su comentario promete que «con una sola de las dos
 * no hay alarma»: código y URL. Una sola pareja dejaría la otra mitad sin
 * cubrir, y esa mitad puede pudrirse sola.
 *
 * **Mutaciones con `perl`, no con `sed -i ''`.** Esa forma es la de BSD; GNU sed
 * —lo que corre en CI— lee `''` como el guion. El repositorio web ya se comió
 * ese fallo y tumbó cuatro pruebas.
 *
 * **P-B sale a la red y no se puede abrir desde aquí.** Se comprueba lo otro que
 * promete: que sin red diga «no se pudo determinar» y NO se cuente como cerrada.
 * Un guardia que no pudo mirar no dice «todo bien».
 */

const RAIZ = process.cwd();
const ARBOLES = ["docs", "scripts"];
const temporales: string[] = [];

afterAll(() => {
  for (const d of temporales) {
    // Reintentos: atrapar un «recurso ocupado» convierte una carrera perdida en
    // basura permanente.
    for (let i = 0; i < 3; i++) {
      try {
        rmSync(d, { recursive: true, force: true });
        break;
      } catch {
        /* ocupado: reintentar */
      }
    }
  }
});

/** Copia fresca del árbol donde el guion puede correr y mutarse. */
function copia(): string {
  const d = mkdtempSync(path.join(tmpdir(), "dec-os-"));
  temporales.push(d);
  for (const a of ARBOLES) cpSync(path.join(RAIZ, a), path.join(d, a), { recursive: true });
  return d;
}

/** Un `HOME` fabricado. `conUrl` y `conZshrc` deciden qué cierra a P-A y P-E. */
function casa(opts: { url?: boolean; zshrc?: boolean } = {}): string {
  const h = mkdtempSync(path.join(tmpdir(), "casa-"));
  temporales.push(h);
  if (opts.url) {
    mkdirSync(path.join(h, ".config", "nectar-nomada"), { recursive: true });
    writeFileSync(
      path.join(h, ".config", "nectar-nomada", "backup.env"),
      'NN_HEALTHCHECK_URL="https://ejemplo.invalido/ping"\n',
    );
  }
  if (opts.zshrc) {
    writeFileSync(path.join(h, ".zshrc"), 'export NN_BACKUP_DIR="/tmp/copias"\n');
  }
  return h;
}

type Veredicto = { abiertas: Set<string>; rotas: string[]; salida: string };

function correr(dir: string, home: string): Veredicto {
  let salida = "";
  try {
    salida = execFileSync("bash", ["scripts/open-decisions.sh"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, HOME: home, OD_SIN_RED: "1" },
    });
  } catch (e: any) {
    salida = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  return {
    abiertas: new Set(
      [...salida.matchAll(/^ {2}ABIERTA {2}(\S+)/gm)].flatMap((m) => (m[1] ? [m[1]] : [])),
    ),
    rotas: [...salida.matchAll(/^ {2}ROTA {5}(\S+)/gm)].flatMap((m) => (m[1] ? [m[1]] : [])),
    salida,
  };
}

const sh = (dir: string, cmd: string) =>
  execFileSync("bash", ["-c", cmd], { cwd: dir, stdio: "pipe" });

const DEC = "docs/architecture/DECISIONS.md";
const conAdr = (frase: string) =>
  `printf '\\n## ADR-999 — ${frase}\\nCerrada a mano por la prueba de discriminacion.\\n' >> ${DEC}`;
const sinAdr = (frase: string) =>
  `perl -0pi -e 's/^## ADR-\\d+.*${frase}.*$//gmi' ${DEC}`;

/** Cada mundo: qué se le hace al árbol y con qué `HOME` se corre. */
type Mundo = { arbol?: string; home: Parameters<typeof casa>[0] };
const MUNDOS: Record<string, { abrir: Mundo; cerrar: Mundo }> = {
  "P-A · sin URL configurada": {
    abrir: { home: { url: false } },
    cerrar: { home: { url: true } },
  },
  "P-A · sin el código que hace el ping": {
    abrir: {
      arbol: `perl -0pi -e 's/ping_health/no_hay_ping/g' scripts/backup/run-scheduled.sh`,
      home: { url: true },
    },
    cerrar: { home: { url: true } },
  },
  "P-C": {
    abrir: { arbol: sinAdr("correos de las personas"), home: { url: true, zshrc: true } },
    cerrar: { arbol: conAdr("correos de las personas"), home: { url: true, zshrc: true } },
  },
  "P-D": {
    abrir: { arbol: sinAdr("huerbsch registrada"), home: { url: true, zshrc: true } },
    cerrar: { arbol: conAdr("huerbsch registrada"), home: { url: true, zshrc: true } },
  },
  "P-E": {
    abrir: { home: { zshrc: false, url: true } },
    cerrar: { home: { zshrc: true, url: true } },
  },
};

/** El id de la decisión que cada pareja cubre. */
const ID = (nombre: string): string => nombre.split(" ")[0] ?? nombre;

describe("las pruebas de las decisiones del dueño distinguen dos mundos", () => {
  it("fila patrón: el guion corre sobre la copia y ninguna prueba sale ROTA", () => {
    const { rotas, salida } = correr(copia(), casa({ url: true, zshrc: true }));
    expect(rotas, `pruebas rotas sobre una copia intacta:\n${salida}`).toEqual([]);
    expect(salida).toMatch(/TOTAL abiertas=\d+ cerradas=\d+/);
  });

  it("no lee el HOME de quien lo corre", () => {
    // Si leyera los dotfiles reales, P-E cambiaría de veredicto según la máquina.
    // Con un HOME inexistente tiene que salir ABIERTA, aquí y en CI.
    const { abiertas, salida } = correr(copia(), path.join(tmpdir(), "no-existe-jamas"));
    expect(abiertas.has("P-E"), `P-E no se abrió con un HOME vacío:\n${salida}`).toBe(true);
  });

  it("el guion sigue teniendo las cinco pruebas que estos mundos cubren", () => {
    const n = execFileSync("grep", ["-c", "^probar ", "scripts/open-decisions.sh"], {
      cwd: RAIZ,
      encoding: "utf8",
    }).trim();
    const cubiertas = new Set(Object.keys(MUNDOS).map(ID));
    expect(cubiertas.size, "cambiaron las decisiones cubiertas y nadie lo dijo").toBe(4);
    expect(
      n,
      `el guion tiene ${n} pruebas y aquí hay mundos para ${cubiertas.size} + P-B, que sale a la red. ` +
        `Si has añadido una decisión, añade su pareja de mundos; si has quitado una, quítala.`,
    ).toBe("5");
  });

  for (const [nombre, { abrir, cerrar }] of Object.entries(MUNDOS)) {
    const id = ID(nombre);
    it(`${nombre} distingue el mundo abierto del cerrado`, () => {
      const dA = copia();
      if (abrir.arbol) sh(dA, abrir.arbol);
      const a = correr(dA, casa(abrir.home));

      const dC = copia();
      if (cerrar.arbol) sh(dC, cerrar.arbol);
      const c = correr(dC, casa(cerrar.home));

      expect(
        a.abiertas.has(id),
        `${id} NO se abrió en el mundo que la abre. Su prueba no puede volver a ` +
          `decir «abierta», así que su «cerrada» de hoy no distingue nada.\n${a.salida}`,
      ).toBe(true);
      expect(
        c.abiertas.has(id),
        `${id} salió abierta en el mundo que la cierra: su prueba no puede cerrarse.\n${c.salida}`,
      ).toBe(false);
    });
  }

  it("P-B no puede mirar sin red, y entonces NO dice «cerrada»", () => {
    const { salida, abiertas } = correr(copia(), casa({ url: true, zshrc: true }));
    expect(salida, `P-B no se declaró indeterminada sin red:\n${salida}`).toMatch(/\?\? {7}P-B/);
    expect(salida).toMatch(/indeterminadas=([1-9])/);
    expect(abiertas.has("P-B"), "P-B salió abierta sin haber podido mirar").toBe(false);
    expect(salida, "el guion no avisa de que una indeterminada no es una cerrada").toMatch(
      /sin determinar\. Eso NO es "cerrada"/,
    );
  });
});
