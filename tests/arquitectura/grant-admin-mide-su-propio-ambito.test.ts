import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La post-condición de `grant-platform-admin.sql` mide EL ÁMBITO QUE CONCEDE, no todos.**
 *
 * El 2026-10-02 el guion abortó una concesión legítima con «expected exactly 1 active Platform Admin
 * assignment, found 4». Las cuatro eran reales: la que acababa de insertar en plataforma, y **tres ya
 * existentes acotadas a otros ámbitos**. Tener las dos cosas es normal — `scopeContains`
 * (`lib/rbac/resolve.ts`) resuelve el ámbito de plataforma por TIPO, así que un Platform Admin
 * acotado a una ubicación concede su juego de permisos sólo ahí — y el guion no tenía por qué
 * negarse.
 *
 * Es la hermana exacta del 89 congelado del mismo archivo, y por eso este guardia vive al lado del
 * suyo: **una post-condición que mide algo distinto de lo que afirma**. Allí abortaba por el
 * crecimiento legítimo del catálogo; aquí, por el historial legítimo de la persona. Las dos formas
 * tienen el mismo arreglo: comparar la propiedad que importa.
 *
 * **Qué prueba esto, y qué no.** No prueba que el guion conceda: eso se verificó reproduciendo el
 * fallo sobre una restauración del respaldo con las tres asignaciones de otro ámbito puestas, viendo
 * abortar la versión vieja y conceder la nueva, y con un flip que deja el `INSERT` sin crear nada
 * para ver la post-condición abortar con «hay 0». Previene la regresión: que alguien vuelva a contar
 * sin mirar el ámbito.
 */
const GUION = new URL("../../scripts/grant-platform-admin.sql", import.meta.url).pathname;
const fuente = () => readFileSync(GUION, "utf8");

describe("grant-platform-admin mide su propio ámbito", () => {
  it("el guion sigue siendo el que elige un ámbito de plataforma y concede en él", () => {
    const src = fuente();
    expect(src.length, "el guion está vacío o no se leyó").toBeGreaterThan(500);
    expect(src, "ya no elige el ámbito de plataforma").toMatch(/CREATE TEMP TABLE pscope ON COMMIT DROP AS/);
    expect(src, "ya no inserta la asignación").toMatch(/INSERT INTO core\.assignment/);
  });

  /**
   * La aserción que caza la regresión: el recuento de la post-condición tiene que filtrar por el
   * ámbito elegido. Sin ese filtro vuelve a contar el historial de la persona, que es lo que abortó
   * una concesión buena.
   */
  it("la post-condición cuenta SÓLO en el ámbito que acaba de usar", () => {
    const src = fuente();
    const i = src.indexOf("rp.name = 'Platform Admin' AND a.status = 'active'");
    expect(i, "no existe el recuento de asignaciones activas").toBeGreaterThan(-1);
    // Los 300 caracteres anteriores son el `WHERE` de ese recuento: ahí tiene que estar el ámbito.
    const where = src.slice(Math.max(0, i - 300), i);
    expect(where, "el recuento no filtra por el ámbito elegido").toMatch(/a\.scope_id = \(SELECT id FROM pscope\)/);
  });

  /**
   * Y las de otros ámbitos se dicen, no bloquean. Un operador que vea «found 4» sin más contexto
   * concluye que alguien manipuló permisos; un `NOTICE` que las nombra le dice qué está mirando.
   */
  it("las asignaciones de otros ámbitos se avisan, no abortan", () => {
    const src = fuente();
    const i = src.indexOf("otros");
    expect(i, "no mide las de otros ámbitos").toBeGreaterThan(-1);
    expect(src, "no las cuenta fuera del ámbito elegido").toMatch(/a\.scope_id <> \(SELECT id FROM pscope\)/);
    const j = src.indexOf("IF otros > 0 THEN");
    expect(j, "no hay rama para ellas").toBeGreaterThan(-1);
    const bloque = src.slice(j, j + 300);
    expect(bloque, "avisa con una excepción en vez de un NOTICE").toMatch(/RAISE NOTICE/);
    expect(bloque, "aborta por asignaciones de otro ámbito").not.toMatch(/RAISE EXCEPTION/);
  });
});
