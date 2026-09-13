/**
 * El esquema y las migraciones dicen lo mismo — y si dejan de decirlo, esto cae.
 *
 * **Por qué existe.** Durante días, `prisma migrate diff --from-migrations
 * --to-schema` proponía sentencias que **no eran de ningún cambio en curso**: FK con
 * otra acción de borrado e índices que el esquema no declaraba. Eran **seis** el
 * 2026-09-12 y **quince** el 2026-09-13, porque cada tabla nueva sumaba las suyas.
 *
 * Cada migración escrita a mano las excluía y lo decía en su prosa. Eso funciona
 * exactamente hasta el día en que alguien no se dé cuenta: entonces entran a
 * producción **atribuidas a un cambio que no las hizo**, y con ellas un cambio de
 * comportamiento que nadie revisó —por ejemplo, pasar una FK de `RESTRICT` a
 * `SET NULL`, que convierte «no puedes borrar esto» en «se borra y te vacío la
 * columna en silencio»—.
 *
 * **Cómo se cerró, y por qué importa la dirección.** No ejecutando las quince
 * sentencias: **declarando en el esquema lo que la base ya hacía**. Las migraciones
 * habían creado esas FK con `ON DELETE RESTRICT` y el esquema, al no decir nada,
 * heredaba el defecto de Prisma para relaciones opcionales, que es `SET NULL`.
 * Aplicar el diff habría cambiado producción; declarar la intención no cambia una
 * sola fila. ADR-120.
 *
 * **Este guardia necesita base de sombra.** La deriva `scripts/ci-con-base.sh` a
 * partir de `DATABASE_URL`, cambiándole el nombre. Si no la hubiera, `migrate diff` **falla** y este test falla
 * con él: un guardia que no puede medir no puede estar verde.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const RAIZ = new URL("..", import.meta.url).pathname;

/**
 * Corre `migrate diff` y devuelve su código y su salida.
 *
 * `--exit-code` habla en tres valores: **0 vacío, 2 hay diferencia, 1 error**. La
 * distinción entre 1 y 0 es la que hace honesto a este guardia: sin ella, un
 * comando que revienta —una bandera que Prisma renombró, una sombra inalcanzable—
 * se leería igual que «no hay deriva». Pasó el 2026-09-13, dos veces en una hora,
 * y las dos por esconder `stderr`.
 */
function diff(esquema: string): { codigo: number; salida: string } {
  try {
    const salida = execFileSync(
      "npx",
      ["prisma", "migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", esquema, "--script", "--exit-code"],
      { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { codigo: 0, salida };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { codigo: e.status ?? -1, salida: `${e.stdout ?? ""}\n${e.stderr ?? ""}` };
  }
}

describe("el esquema y las migraciones dicen lo mismo", () => {
  /**
   * Los temporales se limpian con reintentos y sin lanzar, que es lo que
   * `CLAUDE.md` pide y lo que `tests/arquitectura/temporales-se-limpian.test.ts`
   * comprueba — me cazó a mí en la primera versión de este archivo.
   */
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

  /**
   * **Control positivo, y va primero a propósito.** Un esquema al que se le quita
   * un índice TIENE que producir diferencia. Si esto no diera 2, el veredicto de
   * abajo no probaría nada — sería el cero de un comando que no midió.
   */
  it("el instrumento ve una diferencia cuando la hay", () => {
    const esquema = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");
    const marca = "  @@index([lotProcessId])\n";
    expect(esquema, "el esquema ya no tiene la marca que este control usa").toContain(marca);
    const dir = mkdtempSync(join(tmpdir(), "deriva-"));
    temporales.push(dir);
    const mutado = join(dir, "schema.prisma");
    writeFileSync(mutado, esquema.replace(marca, ""));

    const { codigo, salida } = diff(mutado);
    expect(codigo, `esperaba 2 (hay diferencia). Salida:\n${salida}`).toBe(2);
    expect(salida).toMatch(/DROP INDEX|CREATE INDEX/);
  }, 120_000);

  it("no hay deriva entre prisma/schema.prisma y prisma/migrations", () => {
    const { codigo, salida } = diff(join(RAIZ, "prisma/schema.prisma"));
    // 1 sería un error del propio comando, y se distingue de 0 a propósito.
    expect(
      codigo,
      codigo === 1
        ? `\`migrate diff\` FALLÓ, así que este guardia no pudo medir:\n${salida}`
        : `El esquema y las migraciones divergen. Declara en el esquema lo que la base ` +
          `ya hace —no ejecutes esto sin leerlo, puede cambiar comportamiento— o escribe ` +
          `la migración que falta:\n${salida}`,
    ).toBe(0);
  }, 120_000);
});
