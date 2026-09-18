/**
 * La escoba de `core.audit_event`, y las dos formas en que podría hacer daño.
 *
 * **Uno: apuntar a la base equivocada.** Borrar el rastro de auditoría de
 * producción no tiene ningún caso de uso legítimo, así que el script no lleva
 * bandera de escape —a diferencia de `tests/setup.ts`, que sí tiene
 * `ALLOW_REMOTE_TEST_DB` porque LEER producción a veces se quiere—. Los casos
 * de abajo fijan eso: remoto y URL ilegible se niegan, local pasa.
 *
 * **Dos: que «sin actor» deje de significar «fixture borrado».** El script
 * borra por `actorUserAccountId: null`, apoyado en que la FK es `SET NULL` y
 * las cuentas sólo se borran limpiando fixtures. Eso es una hipótesis sobre los
 * datos, no un teorema, así que el guardia la comprueba en cada corrida. El
 * caso de abajo lo ejerce de verdad: siembra dos filas —una con actor vivo y
 * otra sin actor— y afirma que se va UNA. Sin la de actor vivo, «borró la que
 * debía» no probaría nada: lo habría cumplido igual un `deleteMany` sin filtro.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import { decidirBase, urlAUsar, contar, limpiar } from "../scripts/limpiar-audit-de-pruebas";
import { assertDefinedWhere } from "./helpers/assertDefinedWhere";

const RUN_ID = `limpia-audit-${Date.now()}`;

describe("a qué base se le permite borrar", () => {
  it("una base remota se niega, y dice cuál era", () => {
    const v = decidirBase("postgresql://u:p@ep-cool-name-123.us-east-2.aws.neon.tech/neondb");
    expect(v.ok).toBe(false);
    expect(v.host).toBe("ep-cool-name-123.us-east-2.aws.neon.tech");
    expect(v.motivo).toMatch(/no es una base de esta máquina/);
  });

  it("una URL ilegible se niega: «no sé dónde apunto» no es prueba de ser local", () => {
    expect(decidirBase("").ok).toBe(false);
    expect(decidirBase(undefined).ok).toBe(false);
    expect(decidirBase("esto no es una url").ok).toBe(false);
  });

  /**
   * **El fallo que este caso fija, y que casi se cuela.** El script decide con
   * `TEST_DATABASE_URL`, pero `lib/db` se conecta con `DATABASE_URL`. Mientras
   * fueran dos variables distintas, el guardia aprobaba una base y el borrado
   * caía en otra: con un `.env` apuntando a Neon —lo normal en un worktree— el
   * veredicto decía «127.0.0.1, adelante». Se descubrió porque aquí
   * `DATABASE_URL` estaba vacía y reventó; con `.env` habría funcionado, contra
   * producción.
   */
  it("manda TEST_DATABASE_URL sobre DATABASE_URL, que es la que usa el cliente", () => {
    expect(urlAUsar({ TEST_DATABASE_URL: "postgresql://postgres@127.0.0.1:55433/t", DATABASE_URL: "postgresql://u@neon.tech/p" }))
      .toBe("postgresql://postgres@127.0.0.1:55433/t");
    // Y sin la de pruebas, la otra: es lo que hace que un `.env` de Neon sea
    // justamente lo que el veredicto tiene que rechazar, no ignorar.
    expect(urlAUsar({ DATABASE_URL: "postgresql://u@neon.tech/p" })).toBe("postgresql://u@neon.tech/p");
    expect(urlAUsar({})).toBe("");
  });

  // Control positivo: sin esto, un `decidirBase` que devolviera SIEMPRE false
  // pasaría los dos casos de arriba.
  it("la local pasa", () => {
    expect(decidirBase("postgresql://postgres@127.0.0.1:55433/nectar_test").ok).toBe(true);
    expect(decidirBase("postgresql://postgres@localhost:5432/x").ok).toBe(true);
  });
});

describe("qué filas se lleva", () => {
  let personId: string;
  let userAccountId: string;
  let idConActor: string;
  let idSinActor: string;

  beforeAll(async () => {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Escoba", displayName: `TEST Escoba (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    const cuenta = await prisma.userAccount.create({
      data: { personId, authProvider: "credentials", status: "active" },
    });
    userAccountId = cuenta.id;

    const conActor = await prisma.auditEvent.create({
      data: {
        actorUserAccountId: userAccountId,
        operation: `${RUN_ID}.con_actor`,
        entityType: "person",
        entityId: personId,
        sourceInterface: "test",
      },
    });
    idConActor = conActor.id;
    const sinActor = await prisma.auditEvent.create({
      // Sin `actorUserAccountId`: la columna es opcional y queda nula, que es
      // exactamente el estado en que la deja el `SET NULL` al borrar la cuenta.
      data: {
        operation: `${RUN_ID}.sin_actor`,
        entityType: "person",
        entityId: personId,
        sourceInterface: "test",
      },
    });
    idSinActor = sinActor.id;
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ operation: { startsWith: RUN_ID } }) });
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
  });

  /**
   * **Dentro de una transacción que se deshace, y no es un detalle de estilo.**
   * `limpiar()` borra TODAS las filas sin actor de la base a la que apunte, y
   * esta base la comparten todas las sesiones: la primera versión de esta
   * prueba se llevó cuarenta mil filas por el camino, en silencio, sólo por
   * correrla. Una prueba no debe barrer la base de nadie como efecto
   * colateral; barrer es lo que hace `npm run limpiar:audit`, que además pide
   * `--aplicar`. Aquí se ejerce la función de verdad y luego se revierte.
   */
  it("se lleva la que no tiene actor y deja la que sí — las dos mitades", async () => {
    class Revertir extends Error {}
    let visto: { borradas: number; sinActorAntes: number; quedaSinActor: number; quedaConActor: number } | null = null;

    await expect(
      prisma.$transaction(async (tx) => {
        const antes = await contar(tx);
        // Fila patrón: si las dos sembradas no estuvieran, lo de abajo no mediría nada.
        expect(await tx.auditEvent.count({ where: { id: idConActor } }), "la sembrada con actor no está").toBe(1);
        expect(await tx.auditEvent.count({ where: { id: idSinActor } }), "la sembrada sin actor no está").toBe(1);
        expect(antes.sinActorPeroCuentaViva, "el control del script debería estar limpio").toBe(0);

        const borradas = await limpiar(tx);
        visto = {
          borradas,
          sinActorAntes: antes.sinActor,
          quedaSinActor: await tx.auditEvent.count({ where: { id: idSinActor } }),
          quedaConActor: await tx.auditEvent.count({ where: { id: idConActor } }),
        };
        throw new Revertir();
        // **El tope, a propósito.** `limpiar()` bloquea TODAS las filas sin actor, y otras
        // pruebas en paralelo retienen algunas dentro de sus transacciones. Mientras espera,
        // el reloj de Prisma corre: con el tope por defecto (5 s) la transacción caduca y la
        // consulta siguiente revienta con P2028 en vez de llegar a `Revertir`. Reproducido el
        // 2026-09-18 reteniendo una fila 14 s desde otro proceso: sin esto cae, con esto pasa.
      }, { timeout: 60_000 }),
    ).rejects.toBeInstanceOf(Revertir);

    const v = visto!;
    // **NO se compara `borradas` con el recuento previo.** Lo hacía, y fallaba
    // en la suite completa: entre `contar()` y `limpiar()` otras pruebas en
    // paralelo commitean sus propias filas sin actor, así que el borrado se
    // lleva MÁS de las que se contaron —medido el 2026-09-15: 38.605 contra
    // 38.599—. Es una base compartida; ese número cambia mientras se mide, y
    // una aserción sobre él es una carrera, no un guardia. Lo que sí es estable
    // es que se llevó al menos las sembradas, y cuál de las dos.
    expect(v.borradas, "no borró ni la que sembramos sin actor").toBeGreaterThanOrEqual(1);
    expect(v.quedaSinActor, "la de actor nulo debía irse").toBe(0);
    // La mitad que importa: un borrado sin filtro también habría dejado 0 arriba.
    expect(v.quedaConActor, "la de actor vivo NO debía tocarse").toBe(1);

    // Y el control de que la transacción se deshizo: fuera de ella, las dos siguen.
    expect(await prisma.auditEvent.count({ where: { id: idSinActor } }), "la prueba no debe barrer la base").toBe(1);
    expect(await prisma.auditEvent.count({ where: { id: idConActor } })).toBe(1);
  });
});
