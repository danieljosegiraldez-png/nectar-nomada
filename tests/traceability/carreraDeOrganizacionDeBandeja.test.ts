import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearTipoDeBandeja } from "../../lib/equipos/bandejas";
import { createLot } from "../../lib/traceability/lots";

/**
 * A8, hallazgo 1 de la revisión independiente (P1, SUPUESTO — aquí reproducido):
 * insertar un pesaje leía la organización del TIPO sin bloquearla, así que un
 * UPDATE concurrente —todavía sin confirmar— de esa organización no se veía, y
 * el pesaje podía terminar mezclando organizaciones. La corrección (migración
 * `20260918191800_secado_2a_correcciones`) bloquea el tipo (y el lote) con
 * `FOR SHARE` antes de leer su organización.
 *
 * Dos conexiones RAW de `pg` (no dos `$transaction` del mismo Prisma Client:
 * hacen falta dos conexiones de servidor reales y solapadas). Una mantiene un
 * `UPDATE` del tipo abierto 1,5 s; la otra intenta insertar un pesaje de ese
 * tipo mientras tanto y se mide cuánto esperó.
 */

function nombre(etiqueta: string) {
  return `TEST ${etiqueta}-${randomUUID().slice(0, 8)}`;
}

const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = [];
const lotIds: string[] = [];
const tipoIds: string[] = [];

let org: string;
let orgB: string;
let sitio: string;
let gerente: string;
let operario: string;

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-carrera"), status: "approved", classification: "internal" } });
  org = organization.id;
  orgIds.push(org);
  const otra = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-carrera-b"), status: "approved", classification: "internal" } });
  orgB = otra.id;
  orgIds.push(orgB);
  const s = await prisma.location.create({ data: { locationType: "site", name: nombre("sitio-carrera"), organizationId: org, status: "approved", classification: "internal" } });
  sitio = s.id;
  locationIds.push(sitio);

  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: "carrera", displayName: nombre("gerente-carrera") } });
  personIds.push(person.id);
  const account = await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } });
  accountIds.push(account.id);
  gerente = account.id;
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitio } });
  scopeIds.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId: gerente, scopeId: scope.id, roleProfileId: roleProfile.id } });

  const personOp = await prisma.person.create({ data: { givenName: "TEST", familyName: "carrera-op", displayName: nombre("operario-carrera") } });
  personIds.push(personOp.id);
  const accountOp = await prisma.userAccount.create({ data: { personId: personOp.id, authProvider: "credentials", status: "active" } });
  accountIds.push(accountOp.id);
  operario = accountOp.id;
  const roleOp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: operario, scopeId: scope.id, roleProfileId: roleOp.id } });
});

afterAll(async () => {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL nn.limpieza_de_pruebas = 'on'`;
    await tx.dryingTrayWeighing.deleteMany({ where: { trayTypeId: { in: tipoIds } } });
  });
  await prisma.dryingTrayType.deleteMany({ where: { id: { in: tipoIds } } });
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.auditEvent.deleteMany({ where: { actorUserAccountId: { in: accountIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

it("un INSERT de pesaje espera a un UPDATE concurrente de la organización del tipo, y entonces rechaza (no la mezcla)", async () => {
  const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre("Carrera"), ancho: 1, largo: 1, unidad: "ft" });
  tipoIds.push(tipo.id);
  const lot = await createLot(operario, { lotCode: nombre("lote-carrera"), lotType: "drying", organizationId: org, locationId: sitio });
  lotIds.push(lot.id);

  const clientA = new Client({ connectionString: process.env.DATABASE_URL });
  const clientB = new Client({ connectionString: process.env.DATABASE_URL });
  await clientA.connect();
  await clientB.connect();
  try {
    await clientA.query("BEGIN");
    // Mueve el TIPO a la otra organización, sin confirmar todavía: el UPDATE ya
    // tiene el lock de fila de por sí (es una transacción abierta sobre esa fila).
    await clientA.query('UPDATE "core"."drying_tray_type" SET "organization_id" = $1 WHERE "id" = $2', [orgB, tipo.id]);
    const cierre = clientA.query("SELECT pg_sleep(1.5)").then(() => clientA.query("COMMIT"));

    // Un instante para asegurar que el UPDATE de A ya corrió antes de que B intente el INSERT.
    await new Promise((r) => setTimeout(r, 150));

    const inicio = Date.now();
    let error: unknown = null;
    try {
      await clientB.query(
        `INSERT INTO "traceability"."drying_tray_weighing"
           ("tray_type_id","lot_id","material_state","net_kg","depth_points_cm","occurred_at","provenance_class")
         VALUES ($1::uuid,$2::uuid,'CHERRY',8,ARRAY[3,3,3]::numeric[],now(),'measured_fact')`,
        [tipo.id, lot.id],
      );
    } catch (e) {
      error = e;
    }
    const esperoMs = Date.now() - inicio;
    await cierre; // no dejar la transacción A colgando aunque B ya haya terminado

    // La medición central: B esperó a que A soltara el lock del tipo (>= 1000 ms
    // de los 1500 que A retiene), no leyó el valor viejo al vuelo.
    expect(esperoMs).toBeGreaterThanOrEqual(1000);
    // Y una vez que pudo leer, vio la organización YA cambiada (B) contra la del
    // lote (que se quedó en A): rechazo, no una fila mezclando las dos.
    expect(error).toBeTruthy();
    expect(String((error as Error).message)).toMatch(/mezcla organizaciones/);
  } finally {
    await clientA.query("ROLLBACK").catch(() => {});
    await clientA.end();
    await clientB.end();
  }
}, 15_000);
