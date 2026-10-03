import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **El guardia de `grant-platform-admin.sql` no vuelve a comparar contra un número escrito.**
 *
 * El 2026-10-01 ese guion abortó una concesión legítima con «permission grants changed: 144
 * (expected 89)». Nadie había tocado los permisos: el 89 se escribió cuando Platform Admin no tenía
 * filas en `core.role_profile_permission`, y hoy el total legítimo es 144 —los trece perfiles
 * acotados suman exactamente 89 y Platform Admin añade 55 porque `ROLE_PROFILES` lo define como
 * `PERMISSIONS.map(...)`, el catálogo entero—. Un número fijo envejece cada vez que el catálogo gana
 * un permiso, y entonces el guion deja de poder conceder nada **con un mensaje que se lee como si
 * alguien hubiera manipulado los permisos**.
 *
 * **Qué prueba esto, y qué NO.** No prueba que el guion funcione: eso lo probó un flip-test manual
 * contra una base sembrada de cero, en las dos direcciones (fila patrón que concede con 144, y una
 * mutación que altera `role_profile_permission` para verlo abortar y revertir). Esa parte **no se
 * puede automatizar aquí todavía**: el guion es `psql` —usa `\\set` y `-v email=`, así que no se puede
 * ejecutar por Prisma— y `scripts/ci-con-base.sh` evita `psql` a propósito, con la nota de que «no
 * aparece ni una vez en el log del runner». Si está disponible ahí, está sin medir.
 *
 * Lo que esto SÍ previene es la regresión exacta que ya ocurrió: que la post-condición vuelva a
 * comparar el recuento contra una constante en vez de contra la foto del principio de la transacción.
 * Es un guardia de una línea de conducta, no del guion entero, y decirlo es parte del guardia — un
 * test que promete más de lo que mide es peor que ninguno.
 */
const GUION = new URL("../../scripts/grant-platform-admin.sql", import.meta.url).pathname;
const fuente = () => readFileSync(GUION, "utf8");

describe("grant-platform-admin no congela un número", () => {
  /**
   * Control positivo del ANÁLISIS: si el archivo se renombra o se vacía, lo de abajo pasaría sobre
   * nada. Esto lo impide — y además fija las dos piezas que tienen que seguir existiendo.
   */
  it("el guion existe y sigue siendo el que concede Platform Admin", () => {
    const src = fuente();
    expect(src.length, "el guion está vacío o no se leyó").toBeGreaterThan(500);
    expect(src, "ya no inserta la asignación").toMatch(/INSERT INTO core\.assignment/);
    expect(src, "ya no mira role_profile_permission").toMatch(/core\.role_profile_permission/);
  });

  it("toma una foto del recuento ANTES de escribir, en una tabla temporal", () => {
    const src = fuente();
    expect(src, "no existe la foto").toMatch(/CREATE TEMP TABLE permisos_antes ON COMMIT DROP AS/);
    // La foto va antes del INSERT, o mediría el estado que ella misma provocó.
    const iFoto = src.indexOf("CREATE TEMP TABLE permisos_antes");
    const iInsert = src.indexOf("INSERT INTO core.assignment");
    expect(iFoto, "la foto se toma DESPUÉS de escribir").toBeLessThan(iInsert);
  });

  it("y la post-condición compara contra la foto, no contra una constante", () => {
    const src = fuente();
    expect(src, "la post-condición no lee la foto").toMatch(/SELECT [a-z]+\.n INTO antes FROM permisos_antes/);
    expect(src, "la comparación no es contra la foto").toMatch(/IF n <> antes THEN/);
  });

  /**
   * **La aserción que de verdad caza la regresión, acotada al recuento que importa.**
   *
   * La primera versión buscaba cualquier `IF n <> <número>` en el archivo y **marcaba código
   * correcto**: el guion tiene tres comparaciones legítimas contra `1` —exactamente una cuenta de
   * credenciales, un ámbito de plataforma, una asignación activa— y contar «uno» ahí es justo lo que
   * debe hacer. Apretar un guardia hasta que señale lo bueno enseña a ignorarlo, que es peor que no
   * tenerlo. Así que se mira **sólo la ventana que sigue al recuento de `role_profile_permission`**,
   * que es donde vivía el 89.
   *
   * Se busca el patrón y no la cifra: volver a congelarlo con 144 tiene el mismo defecto.
   */
  it("el recuento de permisos no se compara contra un número literal", () => {
    const src = fuente();
    const i = src.indexOf("SELECT count(*) INTO n FROM core.role_profile_permission;");
    expect(i, "ya no se lee ese recuento en una variable").toBeGreaterThan(-1);
    const ventana = src.slice(i, i + 400);
    const congelados = [...ventana.matchAll(/IF\s+n\s*<>\s*(\d+)/g)].map((m) => m[1]);
    expect(congelados, `vuelve a comparar contra ${congelados.join(", ")} en vez de contra la foto`).toEqual([]);
    expect(ventana, "la comparación de esa ventana no es contra la foto").toMatch(/IF n <> antes THEN/);
  });

  /**
   * El mensaje importa tanto como la comparación: el viejo decía «permission grants changed», que se
   * lee como una manipulación. El nuevo nombra las dos cifras, así que quien lo vea sabe si creció
   * el catálogo o si el guion rompió algo.
   */
  it("y si aborta, el mensaje nombra las DOS cifras", () => {
    const src = fuente();
    const i = src.indexOf("IF n <> antes THEN");
    expect(i, "no existe la comparación").toBeGreaterThan(-1);
    const bloque = src.slice(i, i + 400);
    expect(bloque, "no lanza excepción").toMatch(/RAISE EXCEPTION/);
    expect(bloque.match(/%/g)?.length ?? 0, "el mensaje no nombra las dos cifras").toBeGreaterThanOrEqual(2);
  });
});
