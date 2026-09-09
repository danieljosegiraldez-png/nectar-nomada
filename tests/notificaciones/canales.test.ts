/**
 * A9.11 (D10a) — la preferencia de canal por persona.
 *
 * Lo que estas pruebas afirman y ninguna lectura del código puede afirmar: que
 * la tabla guarda, que el orden manda, y sobre todo que **querer un canal y
 * poder recibirlo son cosas distintas**. Ese último es el que importa: medido el
 * 2026-09-08, de 19 personas 0 tienen teléfono, así que un lector que no
 * distinguiera devolvería «prefiere WhatsApp» sobre un canal que no alcanza a
 * nadie.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  PreferenciaDeCanalError,
  canalesDe,
  declararCanal,
  primerCanalUtil,
} from "../../lib/notificaciones/canales";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a911-can-${Date.now()}`;

describe("A9.11 — preferencia de canal", () => {
  let userAccountId: string;
  let conTodoId: string;
  let soloCuentaId: string;
  let sinNadaId: string;

  async function crearPersona(etiqueta: string, datos: { email?: string; phone?: string; conCuenta?: boolean }) {
    const person = await prisma.person.create({
      data: {
        givenName: "TEST",
        familyName: etiqueta,
        displayName: `TEST ${etiqueta} (${RUN_ID})`,
        locale: "es",
        email: datos.email ?? null,
        phone: datos.phone ?? null,
      },
    });
    if (datos.conCuenta) {
      await prisma.userAccount.create({
        data: { personId: person.id, authProvider: "credentials", status: "active" },
      });
    }
    return person.id;
  }

  beforeAll(async () => {
    // El actor que declara: necesita cuenta porque el AuditEvent la exige.
    const actor = await crearPersona("Actor", { email: `actor-${RUN_ID}@ejemplo.test`, conCuenta: true });
    const cuenta = await prisma.userAccount.findFirstOrThrow({ where: { personId: actor } });
    userAccountId = cuenta.id;

    conTodoId = await crearPersona("ConTodo", {
      email: `todo-${RUN_ID}@ejemplo.test`,
      phone: "+507 6000 0000",
      conCuenta: true,
    });
    soloCuentaId = await crearPersona("SoloCuenta", { email: `cuenta-${RUN_ID}@ejemplo.test`, conCuenta: true });
    // El caso real de esta base: alguien del campo, sin correo y sin cuenta.
    sinNadaId = await crearPersona("SinNada", {});
  });

  afterAll(async () => {
    const ids = [conTodoId, soloCuentaId, sinNadaId];
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    // Las preferencias caen por CASCADE al borrar la persona, pero se borran
    // explícitas: el test no debe depender de una regla que está probando otro.
    await prisma.personNotificationPreference.deleteMany({ where: assertDefinedWhere({ personId: { in: ids } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ person: { displayName: { contains: RUN_ID } } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  });

  it("sin declarar nada, una persona no tiene canales — y eso no es un error", async () => {
    // Control positivo de todo lo que sigue: si esto no saliera vacío, las
    // aserciones de abajo no probarían que declarar es lo que las causa.
    expect(await canalesDe(conTodoId)).toEqual([]);
    expect(primerCanalUtil([])).toBeNull();
  });

  it("guarda lo declarado y lo devuelve en su orden, no en el de inserción", async () => {
    await declararCanal(userAccountId, { personId: conTodoId, canal: "email", priority: 2 });
    await declararCanal(userAccountId, { personId: conTodoId, canal: "in_app", priority: 1 });

    const canales = await canalesDe(conTodoId);
    expect(canales.map((c) => c.canal)).toEqual(["in_app", "email"]);
  });

  it("querer WhatsApp sin teléfono NO lo hace entregable, y dice por qué", async () => {
    // El caso que la medición obligó a modelar: 0 de 19 personas tienen teléfono.
    await declararCanal(userAccountId, { personId: soloCuentaId, canal: "whatsapp", priority: 0 });
    await declararCanal(userAccountId, { personId: soloCuentaId, canal: "in_app", priority: 1 });

    const canales = await canalesDe(soloCuentaId);
    const wa = canales.find((c) => c.canal === "whatsapp")!;
    expect(wa.querido).toBe(true);
    expect(wa.entregable).toBe(false);
    expect(wa.porQueNo).toContain("teléfono");

    // Y el primero que sirve se salta el que no se puede entregar.
    expect(primerCanalUtil(canales)!.canal).toBe("in_app");
  });

  it("una persona sin correo, sin teléfono y sin cuenta no tiene ningún canal útil", async () => {
    // El caso normal de esta base, no el excepcional.
    await declararCanal(userAccountId, { personId: sinNadaId, canal: "in_app", priority: 0 });
    await declararCanal(userAccountId, { personId: sinNadaId, canal: "email", priority: 1 });

    const canales = await canalesDe(sinNadaId);
    expect(canales).toHaveLength(2);
    expect(canales.every((c) => c.entregable)).toBe(false);
    // `null`, no una excepción: no poder avisar a alguien es un hecho del
    // mundo, no un fallo del programa.
    expect(primerCanalUtil(canales)).toBeNull();
  });

  it("apagar un canal lo deja declarado pero fuera del primero útil", async () => {
    await declararCanal(userAccountId, { personId: conTodoId, canal: "in_app", enabled: false });
    const canales = await canalesDe(conTodoId);
    const app = canales.find((c) => c.canal === "in_app")!;
    // Sigue en la lista: apagar no es lo mismo que no haberlo elegido nunca.
    expect(app.querido).toBe(false);
    expect(app.entregable).toBe(true);
    expect(primerCanalUtil(canales)!.canal).toBe("email");
    await declararCanal(userAccountId, { personId: conTodoId, canal: "in_app", enabled: true });
  });

  it("declarar dos veces el mismo canal corrige, no duplica", async () => {
    await declararCanal(userAccountId, { personId: conTodoId, canal: "email", priority: 9 });
    const canales = await canalesDe(conTodoId);
    expect(canales.filter((c) => c.canal === "email")).toHaveLength(1);
    expect(canales.find((c) => c.canal === "email")!.priority).toBe(9);
  });

  it("cada declaración deja su AuditEvent, y distingue crear de corregir", async () => {
    const eventos = await prisma.auditEvent.findMany({
      where: { entityType: "person_notification_preference", actorUserAccountId: userAccountId },
      select: { operation: true },
    });
    const ops = new Set(eventos.map((e) => e.operation));
    expect(ops.has("person_notification_preference.create")).toBe(true);
    expect(ops.has("person_notification_preference.update")).toBe(true);
  });

  it("una persona que no existe se rechaza, no se inventa", async () => {
    await expect(canalesDe("00000000-0000-0000-0000-000000000000")).rejects.toThrow(PreferenciaDeCanalError);
    await expect(
      declararCanal(userAccountId, { personId: "00000000-0000-0000-0000-000000000000", canal: "email" }),
    ).rejects.toThrow(PreferenciaDeCanalError);
  });
});
