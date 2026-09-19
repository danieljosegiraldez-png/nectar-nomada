import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearTipoDeBandeja } from "../../lib/equipos/bandejas";
import { createLot } from "../../lib/traceability/lots";
import { capacidadDeTipo, pesajesDeTipo, registrarPesaje } from "../../lib/traceability/capacidadDeBandeja";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/**
 * Tarea 4 del plan 2a de secado: el pesaje de bandeja cargada y la capacidad
 * por estado. El montaje sigue la forma de `tests/equipos/bandejas.test.ts`
 * (una organización de prueba con Farm Manager/Farm Operator), extendida con
 * dos sitios y una segunda organización (brief, paso 1):
 *
 * - `org`, con dos sitios A y B;
 * - `gerente`, Farm Manager en A (para crear el tipo de bandeja);
 * - `operario`, Farm Operator en A, dueño de `lotId` (creado con `createLot` en A);
 * - `vecino`, Farm Operator en B, dueño de `loteB`: misma organización, otro ámbito;
 * - `otraOrg`, con su propio lote `loteDeOtraOrg`.
 *
 * **Aislamiento por prueba**: `tipo4x2` se crea de nuevo en cada `it` (vía
 * `beforeEach`), porque la capacidad cuenta TODOS los pesajes vigentes del
 * tipo y un pesaje que sobreviviera de una prueba cambiaría la siguiente
 * (revisión de Codex del plan 2a).
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
// Un tipo de bandeja nuevo por `it` (ver `beforeEach` abajo); se acumulan aquí
// para que el `afterAll` los limpie a todos, junto con sus pesajes.
const tipos: string[] = [];

async function cuenta(etiqueta: string) {
  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) } });
  personIds.push(person.id);
  const account = await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } });
  accountIds.push(account.id);
  return account.id;
}

/** `Scope` es único por (tipo, referencia): se reutiliza si otra cuenta de esta
 *  prueba ya lo creó sobre el mismo lugar (gerente y operario comparten sitio A). */
async function asignar(userAccountId: string, perfil: "Farm Manager" | "Farm Operator", locationId: string) {
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!existente) scopeIds.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
}

async function sitioDe(organizationId: string, etiqueta: string) {
  const sitio = await prisma.location.create({
    data: { locationType: "site", name: nombre(etiqueta), organizationId, status: "approved", classification: "internal" },
  });
  locationIds.push(sitio.id);
  return sitio.id;
}

let org: string;
let sitioA: string;
let sitioB: string;
let gerente: string;
let operario: string;
let vecino: string;
let lotId: string;
let loteB: string;
let otraOrg: string;
let loteDeOtraOrg: string;

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("org"), status: "approved", classification: "internal" },
  });
  org = organization.id;
  orgIds.push(org);
  sitioA = await sitioDe(org, "sitio-a");
  sitioB = await sitioDe(org, "sitio-b");

  gerente = await cuenta("gerente");
  await asignar(gerente, "Farm Manager", sitioA);
  operario = await cuenta("operario");
  await asignar(operario, "Farm Operator", sitioA);
  vecino = await cuenta("vecino");
  await asignar(vecino, "Farm Operator", sitioB);

  const lot = await createLot(operario, { lotCode: nombre("lote-a"), lotType: "drying", organizationId: org, locationId: sitioA });
  lotId = lot.id;
  lotIds.push(lotId);
  const lotB = await createLot(vecino, { lotCode: nombre("lote-b"), lotType: "drying", organizationId: org, locationId: sitioB });
  loteB = lotB.id;
  lotIds.push(loteB);

  const otra = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("otra-org"), status: "approved", classification: "internal" },
  });
  otraOrg = otra.id;
  orgIds.push(otraOrg);
  const sitioOtra = await sitioDe(otraOrg, "sitio-otra");
  const operarioDeOtra = await cuenta("operario-otra");
  await asignar(operarioDeOtra, "Farm Operator", sitioOtra);
  const lotOtra = await createLot(operarioDeOtra, { lotCode: nombre("lote-otra"), lotType: "drying", organizationId: otraOrg, locationId: sitioOtra });
  loteDeOtraOrg = lotOtra.id;
  lotIds.push(loteDeOtraOrg);
});

let tipo4x2: string;
beforeEach(async () => {
  tipo4x2 = (await crearTipoDeBandeja(gerente, { organizationId: org, nombre: `4×2 ${randomUUID()}`, ancho: 4, largo: 2, unidad: "ft" })).id;
  tipos.push(tipo4x2);
});

afterAll(async () => {
  // Primero los pesajes: la única puerta de borrado en las pruebas (paso 3 del brief).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL nn.limpieza_de_pruebas = 'on'`;
    await tx.dryingTrayWeighing.deleteMany({ where: assertDefinedWhere({ trayTypeId: { in: tipos } }) });
  });
  await prisma.dryingTrayType.deleteMany({ where: assertDefinedWhere({ id: { in: tipos } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: accountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: accountIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: accountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgIds } }) });
});

describe("capacidad", () => {
  it("sin pesajes: cereza sale ESTIMADA con la fuente del plan de secado (≈ 8,3 kg en 4×2); mucílago y lavado, SIN MEDIR y sin número", async () => {
    const cap = await capacidadDeTipo(operario, tipo4x2);
    const por = (e: string) => cap.estados.find((x) => x.estado === e)!;
    // Control contra la fuente independiente: el plan de secado §6 dice 8,3 kg por
    // bandeja 4×2 a 2,8 cm y 400 kg/m³.
    expect(por("CHERRY")).toMatchObject({ fuente: "estimado", pesajes: 0, densidadKgM3: 400, profundidadCm: 2.8 });
    expect(por("CHERRY").capacidadKg!).toBeCloseTo(8.3, 1);
    expect(por("CHERRY").fuenteDelEstimado).toMatch(/Drying Plan 2026-27/);
    for (const e of ["MUCILAGE_HONEY", "PARCHMENT"]) {
      expect(por(e)).toMatchObject({ fuente: "sin_medir", pesajes: 0, densidadKgM3: null, capacidadKg: null });
    }
  });

  it("con pesajes: la densidad sale de ellos y reemplaza al estimado; sólo en su estado", async () => {
    // Área GUARDADA: 121,9 × 61,0 cm = 0,74359 m² (no la 0,7432 exacta: se guarda a un decimal).
    // 0,74359 × 0,030 m = 0,0223077 m³; 9,0 kg / 0,0223077 = 403,45 kg/m³
    const p = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 9, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const cap = await capacidadDeTipo(operario, tipo4x2);
    const cereza = cap.estados.find((x) => x.estado === "CHERRY")!;
    expect(cereza).toMatchObject({ fuente: "medido", pesajes: 1, pesajeIds: [p.id], fuenteDelEstimado: null });
    expect(cereza.densidadKgM3!).toBeCloseTo(403.45, 1);
    expect(cereza.capacidadKg!).toBeCloseTo(9, 1); // a su propia profundidad medida
    expect(cap.estados.find((x) => x.estado === "PARCHMENT")!.fuente).toBe("sin_medir"); // no contagia a otro estado
  });

  it("una corrección supersede: el original deja de contar pero sigue existiendo", async () => {
    const malo = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "PARCHMENT", netKg: 99, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "PARCHMENT", netKg: 6, profundidadesCm: [3, 3, 3], occurredAt: new Date(), supersedesId: malo.id, correctionReason: "Se tecleó 99 por 9,9" });
    const lavado = (await capacidadDeTipo(operario, tipo4x2)).estados.find((x) => x.estado === "PARCHMENT")!;
    expect(lavado.pesajes).toBe(1);
    expect(lavado.capacidadKg!).toBeCloseTo(6, 1);
    expect((await prisma.dryingTrayWeighing.findUniqueOrThrow({ where: { id: malo.id } })).supersededAt).not.toBeNull();
  });

  it("rechaza datos inválidos, cada rechazo al lado de uno que entra", async () => {
    const base = { trayTypeId: tipo4x2, lotId, materialState: "CHERRY" as const, netKg: 8, profundidadesCm: [2.8, 2.8, 2.8], occurredAt: new Date() };
    for (const mal of [{ netKg: 0 }, { netKg: -1 }, { profundidadesCm: [3, 3] }, { profundidadesCm: [3, 3, 3, 3, 3] }, { profundidadesCm: [3, 0, 3] }, { materialState: "GREEN" as never }]) {
      await expect(registrarPesaje(operario, { ...base, ...mal })).rejects.toThrow(/datos_invalidos|estado_invalido/);
    }
    // Corrección sin razón, sobre un pesaje QUE EXISTE: con un id inventado, `updateMany`
    // daría 0 y lanzaría lo mismo aunque faltara la validación de la razón (Codex).
    const original = await registrarPesaje(operario, base); // también es el control de que `base` es válido
    await expect(registrarPesaje(operario, { ...base, supersedesId: original.id })).rejects.toThrow("datos_invalidos");
    expect((await prisma.dryingTrayWeighing.findUniqueOrThrow({ where: { id: original.id } })).supersededAt).toBeNull(); // sigue vigente
    expect((await registrarPesaje(operario, { ...base, supersedesId: original.id, correctionReason: "Profundidad mal leída" })).id).toBeTruthy();
  });

  it("quien no gestiona el lote no pesa, ni corrige el pesaje de un lote que no gestiona", async () => {
    await expect(registrarPesaje(vecino, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() }))
      .rejects.toThrow();
    // El vecino pesa SU lote; el operario intenta supersederlo presentando el suyo.
    const delVecino = await registrarPesaje(vecino, { trayTypeId: tipo4x2, lotId: loteB, materialState: "CHERRY", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    await expect(registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 7, profundidadesCm: [3, 3, 3], occurredAt: new Date(), supersedesId: delVecino.id, correctionReason: "x" }))
      .rejects.toThrow();
    expect((await prisma.dryingTrayWeighing.findUniqueOrThrow({ where: { id: delVecino.id } })).supersededAt).toBeNull();
  });

  it("cada capacidad medida lleva a sus pesajes, y cada pesaje dice su lote sólo a quien lo ve", async () => {
    const mio = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const suyo = await registrarPesaje(vecino, { trayTypeId: tipo4x2, lotId: loteB, materialState: "CHERRY", netKg: 8.4, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const { visibles, ocultos } = await pesajesDeTipo(operario, tipo4x2, "CHERRY");
    expect(visibles.map((x) => x.id)).toEqual([mio.id]); // el suyo no sale: ni peso ni profundidades
    expect(visibles[0]!.lote).not.toBeNull();
    expect(ocultos).toBe(1); // pero cuenta, y la pantalla lo dice
    expect(suyo.id).toBeTruthy();
    // La capacidad (la media) sí los incluye a los dos, y lo dice con su contador.
    expect((await capacidadDeTipo(operario, tipo4x2)).estados.find((x) => x.estado === "CHERRY")!.pesajes).toBe(2);
  });
});

describe("reglas del pesaje en la base", () => {
  it("rechaza estado fuera del secado, 2 o 5 profundidades, profundidad 0, y editar el peso; acepta marcarlo superseded", async () => {
    const d = { trayTypeId: tipo4x2, lotId, netKg: 8, occurredAt: new Date(), provenanceClass: "measured_fact" as const };
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "GREEN", depthPointsCm: [3, 3, 3] } })).rejects.toThrow(/drying_tray_weighing_estado_de_secado/);
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "CHERRY", depthPointsCm: [3, 3] } })).rejects.toThrow(/drying_tray_weighing_tres_o_cuatro_puntos/);
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "CHERRY", depthPointsCm: [3, 0, 3] } })).rejects.toThrow(/drying_tray_weighing_profundidad_positiva/);
    const ok = await prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "CHERRY", depthPointsCm: [3, 3, 3] } }); // control
    await expect(prisma.dryingTrayWeighing.update({ where: { id: ok.id }, data: { netKg: 9 } })).rejects.toThrow(/pesaje no se edita/);
    expect((await prisma.dryingTrayWeighing.update({ where: { id: ok.id }, data: { supersededAt: new Date() } })).supersededAt).toBeTruthy();
  });

  it("los CHECK no dejan pasar un NULL: profundidad nula y corrección sin razón", async () => {
    // Por SQL directo: el cliente tipado no deja escribir un NULL dentro del array.
    const insertar = (profundidades: string, supersedes: string | null, razon: string | null) => prisma.$executeRawUnsafe(
      `INSERT INTO "traceability"."drying_tray_weighing" ("tray_type_id","lot_id","material_state","net_kg","depth_points_cm","occurred_at","provenance_class","supersedes_id","correction_reason")
       VALUES ($1::uuid,$2::uuid,'CHERRY',8,${profundidades},now(),'measured_fact',$3::uuid,$4)`,
      tipo4x2, lotId, supersedes, razon);
    await expect(insertar("ARRAY[3,NULL,3]::numeric[]", null, null)).rejects.toThrow(/tres_o_cuatro_puntos/);
    await expect(insertar("ARRAY[[3,3],[3,3]]::numeric[]", null, null)).rejects.toThrow(/tres_o_cuatro_puntos/);
    const base = await prisma.dryingTrayWeighing.create({ data: { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 8, depthPointsCm: [3, 3, 3], occurredAt: new Date(), provenanceClass: "measured_fact" } });
    await expect(insertar("ARRAY[3,3,3]::numeric[]", base.id, null)).rejects.toThrow(/correccion_con_razon/);
    expect(await insertar("ARRAY[3,3,3]::numeric[]", base.id, "control con razón")).toBe(1); // control positivo
  });

  it("sólo measured_fact, una organización, y no se borra; los padres no se mudan", async () => {
    const d = { trayTypeId: tipo4x2, lotId, materialState: "CHERRY" as const, netKg: 8, depthPointsCm: [3, 3, 3], occurredAt: new Date() };
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, provenanceClass: "original_record" } })).rejects.toThrow(/drying_tray_weighing_medido/);
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, lotId: loteDeOtraOrg, provenanceClass: "measured_fact" } })).rejects.toThrow(/mezcla organizaciones/);
    const p = await prisma.dryingTrayWeighing.create({ data: { ...d, provenanceClass: "measured_fact" } }); // control
    await expect(prisma.dryingTrayWeighing.delete({ where: { id: p.id } })).rejects.toThrow(/pesaje no se borra/);
    await expect(prisma.dryingTrayType.update({ where: { id: tipo4x2 }, data: { organizationId: otraOrg } })).rejects.toThrow(/no cambia de organizacion/);
    await expect(prisma.lot.update({ where: { id: lotId }, data: { organizationId: otraOrg } })).rejects.toThrow(/lote con pesajes de bandeja no cambia/);
  });
});
