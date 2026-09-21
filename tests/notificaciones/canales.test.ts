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
import { ROLE_PROFILES } from "../../lib/rbac/catalog";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a911-can-${Date.now()}`;

const scopesCreados: string[] = [];

/**
 * `person:manage_notifications` entró en el catálogo el 2026-09-21. La base de
 * CI se siembra de cero y lo trae; la de pruebas compartida no se resiembra
 * entera, así que se añade aquí sólo lo de este permiso, con el mismo upsert que
 * `prisma/seed.ts`. Aditivo y sin borrado: otras ramas usan la misma base.
 */
async function asegurarPermisoDeCanal() {
  const permiso = await prisma.permission.upsert({
    where: { resourceType_action: { resourceType: "person", action: "manage_notifications" } },
    update: {},
    create: { resourceType: "person", action: "manage_notifications", description: "test" },
  });
  for (const perfil of ROLE_PROFILES.filter((p) => p.permissions.some(([r, a]) => r === "person" && a === "manage_notifications"))) {
    const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil.name } });
    await prisma.roleProfilePermission.upsert({
      where: { roleProfileId_permissionId: { roleProfileId: roleProfile.id, permissionId: permiso.id } },
      update: {},
      create: { roleProfileId: roleProfile.id, permissionId: permiso.id },
    });
  }
}

async function asignar(
  userAccountId: string,
  perfil: string,
  scopeType: "platform" | "location",
  scopeRefId: string | null,
) {
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  // `Scope` es compartido entre corridas: se reutiliza y sólo se borra el que se creó aquí.
  const existente = await prisma.scope.findFirst({ where: { scopeType, scopeRefId } });
  const scope = existente ?? (await prisma.scope.create({ data: { scopeType, scopeRefId } }));
  if (!existente) scopesCreados.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
}

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
    // Declara por otras personas, así que desde el 2026-09-21 necesita poder:
    // Platform Admin, el caso más amplio de la regla que prueba el bloque de abajo.
    await asegurarPermisoDeCanal();
    await asignar(userAccountId, "Platform Admin", "platform", null);

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
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
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

/**
 * Quién puede declarar el canal de una persona. **Decisión de Daniel,
 * 2026-09-21:** ella misma, un Platform Admin, o quien coordina su finca
 * (`person:manage_notifications`, que tiene Farm Manager y no Farm Operator).
 * Antes de esto `declararCanal` sólo miraba que la persona existiera, y
 * cualquier cuenta podía apagarle los avisos a otra.
 */
describe("A9.11 — quién puede declarar el canal de una persona", () => {
  const RUN = `a911-aut-${Date.now()}`;
  const personas: string[] = [];
  const cuentas: string[] = [];
  const orgs: string[] = [];
  const lugares: string[] = [];

  let fincaA: string;
  let lugarA: string;
  let lugarB: string;
  let miembro: { personId: string; cuenta: string };
  let asignadoSinMembresia: { personId: string; cuenta: string };

  async function persona(etiqueta: string) {
    const p = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN})`, locale: "es" },
    });
    personas.push(p.id);
    const c = await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } });
    cuentas.push(c.id);
    return { personId: p.id, cuenta: c.id };
  }

  async function finca(etiqueta: string) {
    const org = await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${etiqueta} (${RUN})` } });
    orgs.push(org.id);
    const lugar = await prisma.location.create({
      data: { name: `TEST ${etiqueta} (${RUN})`, locationType: "site", classification: "internal", organizationId: org.id },
    });
    lugares.push(lugar.id);
    return { org: org.id, lugar: lugar.id };
  }

  beforeAll(async () => {
    await asegurarPermisoDeCanal();
    ({ org: fincaA, lugar: lugarA } = await finca("FincaA"));
    ({ lugar: lugarB } = await finca("FincaB"));

    miembro = await persona("Miembro");
    await prisma.organizationMembership.create({ data: { personId: miembro.personId, organizationId: fincaA } });

    // La otra mitad de «de la finca» (P-G): sin membresía, pero con asignación en un lugar suyo.
    asignadoSinMembresia = await persona("Asignado");
    await asignar(asignadoSinMembresia.cuenta, "Farm Operator", "location", lugarA);
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
    await prisma.personNotificationPreference.deleteMany({ where: assertDefinedWhere({ personId: { in: personas } }) });
    await prisma.organizationMembership.deleteMany({ where: assertDefinedWhere({ personId: { in: personas } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopesCreados } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: lugares } }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  });

  it("una cuenta ajena NO puede declarar el canal de otra persona, y no escribe nada", async () => {
    const ajena = await persona("Ajena");
    await expect(declararCanal(ajena.cuenta, { personId: miembro.personId, canal: "email" })).rejects.toThrow(
      "sin_permiso_sobre_la_persona",
    );
    expect(await canalesDe(miembro.personId)).toEqual([]);
  });

  it("la propia persona sí puede declarar el suyo", async () => {
    await declararCanal(miembro.cuenta, { personId: miembro.personId, canal: "in_app" });
    expect((await canalesDe(miembro.personId)).map((c) => c.canal)).toEqual(["in_app"]);
  });

  it("quien coordina su finca (Farm Manager) sí puede", async () => {
    const jefe = await persona("Jefe");
    await asignar(jefe.cuenta, "Farm Manager", "location", lugarA);
    await declararCanal(jefe.cuenta, { personId: miembro.personId, canal: "email", priority: 5 });
    expect((await canalesDe(miembro.personId)).find((c) => c.canal === "email")?.priority).toBe(5);
  });

  it("…también sobre quien es de la finca sólo por asignación, sin membresía", async () => {
    const jefe = await persona("Jefe2");
    await asignar(jefe.cuenta, "Farm Manager", "location", lugarA);
    await declararCanal(jefe.cuenta, { personId: asignadoSinMembresia.personId, canal: "in_app" });
    expect((await canalesDe(asignadoSinMembresia.personId)).map((c) => c.canal)).toEqual(["in_app"]);
  });

  it("un Farm Operator de la MISMA finca no puede: lo que decide es el permiso, no estar ahí", async () => {
    const operario = await persona("Operario");
    await asignar(operario.cuenta, "Farm Operator", "location", lugarA);
    // Control positivo: el operario SÍ tiene acceso a ese lugar. Sin esto la
    // negativa de abajo se cumpliría igual con una cuenta sin acceso a nada.
    const { can } = await import("../../lib/rbac/service");
    expect(await can(operario.cuenta, "manage_attributes", "location", { scopeType: "location", scopeRefId: lugarA }, "internal")).toBe(true);
    await expect(declararCanal(operario.cuenta, { personId: miembro.personId, canal: "whatsapp" })).rejects.toThrow(
      "sin_permiso_sobre_la_persona",
    );
  });

  it("el Farm Manager de OTRA finca no puede", async () => {
    const jefeAjeno = await persona("JefeAjeno");
    await asignar(jefeAjeno.cuenta, "Farm Manager", "location", lugarB);
    await expect(declararCanal(jefeAjeno.cuenta, { personId: miembro.personId, canal: "whatsapp" })).rejects.toThrow(
      "sin_permiso_sobre_la_persona",
    );
  });
});
