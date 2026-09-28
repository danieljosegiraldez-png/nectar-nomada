/**
 * Un solo ámbito por tipo cuando NO tiene referente — y la regla vive en la BASE.
 *
 * **El hueco que cierra, medido el 2026-09-27.** `core.scope` ya tenía
 * `UNIQUE (scope_type, scope_ref_id)` y **no restringía nada** para el ámbito de plataforma: en
 * Postgres un índice único trata los `NULL` como distintos, así que `('platform', NULL)` se podía
 * insertar sin límite. La base de pruebas compartida había acumulado **19** ámbitos de plataforma,
 * **17 sin una sola asignación**, creados entre el 18 y el 21 de septiembre.
 *
 * **Por qué en la base y no en TypeScript.** Una restricción que vive en el servicio no existe
 * para un importador, una reparación operativa ni SQL directo — y estos 17 no los creó ninguna
 * pantalla. El índice parcial de `20260927120000_un_solo_ambito_sin_referente` lo impide en el
 * único sitio que nadie puede saltarse.
 *
 * **Este guardia se probó en las dos direcciones**, que es lo único que lo distingue de un adorno:
 * contra una base CON la migración aplicada pasa, y contra una base SIN ella —`nectar_test` antes
 * de fusionar— **cae** en la primera aserción. No mide el código: mide la base con la que corre.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";

describe("core.scope — un solo ámbito por tipo sin referente", () => {
  it("rechaza un segundo ámbito de plataforma", async () => {
    // Dentro de una transacción que SIEMPRE revierte: este test no deja filas ni depende de
    // cuántos ámbitos haya ya. Si el índice falta, el `create` pasa y `rejects` falla.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.scope.create({ data: { scopeType: "platform", scopeRefId: null } });
        throw new Error("revertir-siempre");
      }),
    ).rejects.toThrow(/Unique constraint|duplicate key|revertir-siempre/);

    // La aserción de arriba pasaría por el `throw` incluso sin índice, así que el veredicto real
    // es ÉSTE: con el índice puesto, el error tiene que ser el de la restricción, no el nuestro.
    let mensaje = "";
    try {
      await prisma.$transaction(async (tx) => {
        await tx.scope.create({ data: { scopeType: "platform", scopeRefId: null } });
        throw new Error("revertir-siempre");
      });
    } catch (e) {
      mensaje = e instanceof Error ? e.message : String(e);
    }
    expect(mensaje, "el índice parcial tiene que rechazarlo ANTES de llegar a nuestro throw").not.toContain(
      "revertir-siempre",
    );
  });

  /**
   * El control positivo, y no es decorativo: sin él, un índice mal escrito —uno que bloqueara
   * TODO ámbito nuevo— dejaría el test de arriba en verde mientras rompe la aplicación entera.
   */
  it("CONTROL: sigue aceptando un ámbito nuevo que SÍ tiene referente", async () => {
    let creado = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.scope.create({ data: { scopeType: "project", scopeRefId: crypto.randomUUID() } });
        creado = true;
        throw new Error("revertir-siempre");
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "revertir-siempre") throw e;
    }
    expect(creado, "un ámbito con referente propio no lo bloquea nadie").toBe(true);
  });

  it("y hoy hay exactamente uno de plataforma", async () => {
    const n = await prisma.scope.count({ where: { scopeType: "platform", scopeRefId: null } });
    expect(n, "más de uno significa que la migración no corrió en esta base").toBe(1);
  });
});
