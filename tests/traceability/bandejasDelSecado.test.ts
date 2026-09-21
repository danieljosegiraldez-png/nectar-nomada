// Sondas del servicio de bandejas de secado (spec de secado por bandeja §4.2–
// §4.3; task-2-brief.md, con los ajustes de ajustes.md aplicados donde el
// encargo y el ajuste difieren — ver la cabecera de
// lib/traceability/bandejasDelSecado.ts).
//
// D4 (ajustes.md, igual que en bandejasEnLaBase.test.ts): toda bandeja nace
// numerada — tipo y número —, porque la base ya no acepta una que no lo sea.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { endDryingRun, startDryingRun } from "../../lib/traceability/drying";
import { bajarBandeja, bandejasDeCorrida, bandejasDisponibles, cargarBandeja, moverBandeja, posicionDeBandeja, posicionesParaMover } from "../../lib/traceability/bandejasDelSecado";
import { puedeVerEquipo } from "../../lib/equipos/equipos";
import { can } from "../../lib/rbac/service";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `bdj-${Date.now()}`;
let org: string; let otraOrg: string;
let sitio: string; let otroSitio: string; let sitioDeOtraOrg: string;
let tipoId: string; let tipoOtra: string; let trayCounter = 0;
let operador: string; let ajeno: string; let configurador: string;
const equipos: string[] = []; const ubicaciones: string[] = []; // hijos antes que padres
const tipos: string[] = [];
const cierre = (codigo: string) => ({ outputLotCode: `${RUN_ID}-${codigo}-verde`, outputLotType: "green" as const, provenanceClass: "original_record" as const });

async function ubicacion(data: { name: string; locationType: "site" | "drying_facility" | "drying_rack" | "drying_bed"; organizationId: string; parentLocationId?: string; rackLevel?: number; rackSlot?: number }) {
  const l = await prisma.location.create({ data: { ...data, name: `${data.name} (${RUN_ID})` } });
  ubicaciones.unshift(l.id); return l;
}
async function tipoDeBandeja(organizationId: string, etiqueta: string) {
  const t = await prisma.dryingTrayType.create({ data: {
    organizationId, name: `TEST Tipo ${etiqueta} (${RUN_ID})`, widthCm: 100, lengthCm: 60, entryUnit: "cm",
  } });
  tipos.push(t.id);
  return t.id;
}
async function cuenta(label: string, siteId: string, perfil: "Farm Operator" | "Farm Manager" = "Farm Operator") {
  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" } });
  const ua = await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } });
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  // `Scope` es único por (tipo, referencia): `configurador` comparte `sitio`
  // con `operador`, así que se reutiliza el que ya exista en vez de chocar
  // con la unicidad (mismo patrón que tests/traceability/editarBeneficio.test.ts).
  const scope = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: siteId } })
    ?? await prisma.scope.create({ data: { scopeType: "location", scopeRefId: siteId } });
  await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: roleProfile.id, scopeId: scope.id } });
  return ua.id;
}
async function trasladar(equipmentId: string, toLocationId: string, occurredAt: string) {
  await prisma.equipmentTransfer.create({ data: { equipmentId, toLocationId, occurredAt: new Date(occurredAt) } });
}
/** Un recipiente registrado en un sitio: su primer traslado es su alta, como hace `registrarEquipo`.
 *  D4: toda bandeja `vessel` nace con tipo y número — la base ya no acepta una que no lo sea. */
async function bandeja(n: string, o: { organizationId?: string; kind?: "vessel" | "instrument"; alta?: string } = {}) {
  const organizationId = o.organizationId ?? org;
  const kind = o.kind ?? "vessel";
  const e = await prisma.equipment.create({ data: {
    name: `TEST Bandeja ${n} (${RUN_ID})`, kind, format: kind === "vessel" ? "other" : null,
    organizationId, provenanceClass: "original_record",
    ...(kind === "vessel" ? { trayTypeId: organizationId === otraOrg ? tipoOtra : tipoId, trayNumber: ++trayCounter } : {}),
  } });
  equipos.push(e.id);
  await trasladar(e.id, o.alta ?? sitio, "2026-08-01T00:00:00Z");
  return e;
}
async function posicion(nivel: number, puesto: number, organizationId = org, padre = sitio) {
  const inv = await ubicacion({ name: `TEST Cuarto N${nivel}P${puesto}`, locationType: "drying_facility", organizationId, parentLocationId: padre });
  const estante = await ubicacion({ name: `TEST Estante N${nivel}P${puesto}`, locationType: "drying_rack", organizationId, parentLocationId: inv.id });
  return ubicacion({ name: `N${nivel} · P${puesto} (${RUN_ID})`, locationType: "drying_bed", organizationId, parentLocationId: estante.id, rackLevel: nivel, rackSlot: puesto });
}
async function secado(codigo: string) {
  const lot = await createLot(operador, { lotCode: `${RUN_ID}-${codigo}`, lotType: "drying", organizationId: org, locationId: sitio });
  const { run } = await startDryingRun(operador, { lotId: lot.id, startedAt: new Date("2026-09-01T10:00:00Z"), provenanceClass: "original_record" });
  return run;
}

beforeAll(async () => {
  org = await createTestOrganization(RUN_ID);
  otraOrg = await createTestOrganization(`${RUN_ID}-otra`);
  sitio = (await ubicacion({ name: "TEST Sitio", locationType: "site", organizationId: org })).id;
  otroSitio = (await ubicacion({ name: "TEST Otro sitio", locationType: "site", organizationId: org })).id;
  sitioDeOtraOrg = (await ubicacion({ name: "TEST Sitio ajeno", locationType: "site", organizationId: otraOrg })).id;
  tipoId = await tipoDeBandeja(org, "principal");
  tipoOtra = await tipoDeBandeja(otraOrg, "otra-org");
  operador = await cuenta("Operador", sitio);
  ajeno = await cuenta("Ajeno", otroSitio);
  // C3: Farm Manager en `sitio` — configura equipos ahí, y NO gestiona lotes
  // por sí solo (a diferencia de `operador`, que es Farm Operator).
  configurador = await cuenta("Configurador", sitio, "Farm Manager");
});

afterAll(async () => {
  const lots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = lots.map((l) => l.id);
  const runs = await prisma.dryingRun.findMany({ where: { transformations: { some: { inputs: { some: { lotId: { in: lotIds } } } } } } });
  const runIds = runs.map((r) => r.id);
  const trayIds = (await prisma.dryingRunTray.findMany({ where: { dryingRunId: { in: runIds } } })).map((t) => t.id);
  // C4: los `drying_tray.move` (entidad equipment_transfer) también se limpian.
  const transferIds = (await prisma.equipmentTransfer.findMany({ where: { equipmentId: { in: equipos } } })).map((t) => t.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...runIds, ...trayIds, ...transferIds] } }) });
  await prisma.dryingRunTray.deleteMany({ where: assertDefinedWhere({ id: { in: trayIds } }) });
  await prisma.equipmentTransfer.deleteMany({ where: assertDefinedWhere({ equipmentId: { in: equipos } }) });
  // El lote de salida del cierre se llama `${RUN_ID}-…-verde`: ya está en `lotIds`.
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: runIds } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: runIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  await prisma.equipment.deleteMany({ where: assertDefinedWhere({ id: { in: equipos } }) });
  await prisma.dryingTrayType.deleteMany({ where: assertDefinedWhere({ id: { in: tipos } }) });
  // C3: assignment ANTES que scope (FK).
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [operador, ajeno, configurador] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [sitio, otroSitio] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [operador, ajeno, configurador] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  for (const id of ubicaciones) await prisma.location.delete({ where: { id } }); // hijos antes que padres
  await deleteTestOrganizations(RUN_ID);
});

const T = (s: string) => new Date(s);

describe("el secado termina bandeja a bandeja", () => {
  it("bajar la última cierra el secado con su hora; sin datos de cierre no se baja; con otras cargadas no se cierra", async () => {
    const run = await secado("ciclo");
    const [a, b] = [await bandeja("A"), await bandeja("B")];
    const ta = await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: a.id, desde: T("2026-09-01T11:00:00Z") });
    const tb = await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });

    await expect(bajarBandeja(operador, { dryingRunTrayId: ta.id, hasta: T("2026-09-04T11:00:00Z"), cierre: cierre("ciclo") })).rejects.toThrow("quedan_otras_bandejas");
    expect((await prisma.dryingRunTray.findUniqueOrThrow({ where: { id: ta.id } })).hasta).toBeNull(); // la transacción se deshizo
    expect(await bajarBandeja(operador, { dryingRunTrayId: ta.id, hasta: T("2026-09-04T11:00:00Z") })).toEqual({ id: ta.id, cerro: false });

    await expect(bajarBandeja(operador, { dryingRunTrayId: tb.id, hasta: T("2026-09-05T11:00:00Z") })).rejects.toThrow("la_ultima_cierra_el_secado");
    expect((await prisma.dryingRunTray.findUniqueOrThrow({ where: { id: tb.id } })).hasta).toBeNull();

    expect(await bajarBandeja(operador, { dryingRunTrayId: tb.id, hasta: T("2026-09-05T11:00:00Z"), cierre: cierre("ciclo") })).toEqual({ id: tb.id, cerro: true });
    const cerrada = await prisma.dryingRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(cerrada.endedAt).toEqual(T("2026-09-05T11:00:00Z"));
    expect(await prisma.lot.findFirst({ where: { lotCode: `${RUN_ID}-ciclo-verde`, lotType: "green" } })).not.toBeNull();
  });

  // Fix round 1, hallazgo 4: bajar la última bandeja no puede adelantar el
  // reloj del cierre con una hora retrasada. El `endedAt` es el `hasta` MÁS
  // TARDÍO entre todas las bandejas de la corrida, no el de la que se
  // registra al final.
  it("una bandeja registrada tarde, con una hora anterior a otra ya bajada, no adelanta el cierre", async () => {
    const run = await secado("cierre-retrasado");
    const [a, b] = [await bandeja("retraso-A"), await bandeja("retraso-B")];
    const ta = await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: a.id, desde: T("2026-09-01T11:00:00Z") });
    const tb = await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    // A baja primero, a las 12:00.
    await bajarBandeja(operador, { dryingRunTrayId: ta.id, hasta: T("2026-09-04T12:00:00Z") });
    // B es la ÚLTIMA en registrarse, pero con una hora ANTERIOR (un parte que
    // llega tarde): las 10:00, dos horas antes de que A ya hubiera bajado.
    expect(await bajarBandeja(operador, { dryingRunTrayId: tb.id, hasta: T("2026-09-04T10:00:00Z"), cierre: cierre("cierre-retrasado") }))
      .toEqual({ id: tb.id, cerro: true });
    const cerrada = await prisma.dryingRun.findUniqueOrThrow({ where: { id: run.id } });
    // El MÁS TARDÍO de los dos (12:00, de A), no el de B (10:00) ni "el de la
    // fila que cerró" — que sería el bug: cerraría con las 10:00.
    expect(cerrada.endedAt).toEqual(T("2026-09-04T12:00:00Z"));
  });

  it("endDryingRun directo: con bandejas abiertas lo rechaza, pero sólo DESPUÉS del permiso", async () => {
    const run = await secado("directo");
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: (await bandeja("directo")).id, desde: T("2026-09-01T11:00:00Z") });
    const cerrar = (quien: string) => endDryingRun(quien, { dryingRunId: run.id, endedAt: T("2026-09-06T11:00:00Z"), ...cierre("directo") });
    await expect(cerrar(ajeno)).rejects.toBeInstanceOf(TraceabilityAccessError); // no revela que hay bandejas
    await expect(cerrar(operador)).rejects.toThrow("bandejas_sin_bajar");
    // Control: un secado sin bandejas cierra por endDryingRun como siempre.
    const sin = await secado("sin-bandejas");
    expect((await endDryingRun(operador, { dryingRunId: sin.id, endedAt: T("2026-09-06T11:00:00Z"), ...cierre("sin-bandejas") })).run.endedAt).toBeTruthy();
  });
});

describe("qué se puede cargar", () => {
  it("rechaza cada caso inválido, al lado de uno que sí entra", async () => {
    const run = await secado("rechazos");
    const desde = T("2026-09-01T11:00:00Z");
    const intentar = (equipmentId: string, d = desde, dryingRunId = run.id) => cargarBandeja(operador, { dryingRunId, equipmentId, desde: d });
    await expect(intentar((await bandeja("instr", { kind: "instrument" })).id)).rejects.toThrow("no_es_bandeja");
    // D4: un vessel SIN tipo ni número tampoco es una bandeja (la base ya lo
    // exige; aquí se comprueba antes para dar el mismo código legible).
    const sinNumero = await prisma.equipment.create({ data: {
      name: `TEST Bandeja sin-numero (${RUN_ID})`, kind: "vessel", format: "other", organizationId: org, provenanceClass: "original_record",
    } });
    equipos.push(sinNumero.id);
    await trasladar(sinNumero.id, sitio, "2026-08-01T00:00:00Z");
    await expect(intentar(sinNumero.id)).rejects.toThrow("no_es_bandeja");
    await expect(intentar((await bandeja("otra-org", { organizationId: otraOrg, alta: sitioDeOtraOrg })).id)).rejects.toThrow("bandeja_de_otra_organizacion");
    await expect(intentar((await bandeja("sin-ver", { alta: otroSitio })).id)).rejects.toThrow("bandeja_sin_acceso");
    const retirada = await bandeja("retirada");
    await prisma.equipment.update({ where: { id: retirada.id }, data: { lifecycleStatus: "retired" } });
    await expect(intentar(retirada.id)).rejects.toThrow("bandeja_retirada");
    await expect(intentar((await bandeja("antes")).id, T("2026-08-31T00:00:00Z"))).rejects.toThrow("fecha_antes_del_secado");

    const ok = await bandeja("ok");
    const t = await intentar(ok.id); // control positivo
    await expect(intentar(ok.id, desde, (await secado("otro")).id)).rejects.toThrow("bandeja_ocupada");
    await expect(bajarBandeja(operador, { dryingRunTrayId: t.id, hasta: T("2026-09-01T10:00:00Z") })).rejects.toThrow("fecha_antes_de_cargar");
    await bajarBandeja(operador, { dryingRunTrayId: t.id, hasta: T("2026-09-02T10:00:00Z"), cierre: cierre("rechazos") });
    await expect(bajarBandeja(operador, { dryingRunTrayId: t.id, hasta: T("2026-09-03T10:00:00Z") })).rejects.toThrow(/ya_bajada|secado_cerrado/);
  });

  it("una corrida con cama no lleva bandejas: el servicio lo dice con su código", async () => {
    const run = await secado("con-cama");
    await prisma.dryingRun.update({ where: { id: run.id }, data: { dryingBedLocationId: (await posicion(9, 9)).id } });
    await expect(cargarBandeja(operador, { dryingRunId: run.id, equipmentId: (await bandeja("en-cama")).id, desde: T("2026-09-01T11:00:00Z") }))
      .rejects.toThrow("corrida_con_cama");
  });

  it("un rechazo de la BASE llega como código, no como error de SQL", async () => {
    // La lectura previa del servicio sólo mira filas ABIERTAS; un intervalo cerrado
    // que se solapa lo caza el disparador. Tiene que llegar como `bandeja_ocupada`.
    const b = await bandeja("solape");
    const r1 = await secado("solape-1");
    const t1 = await cargarBandeja(operador, { dryingRunId: r1.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    await bajarBandeja(operador, { dryingRunTrayId: t1.id, hasta: T("2026-09-05T11:00:00Z"), cierre: cierre("solape-1") });
    await expect(cargarBandeja(operador, { dryingRunId: (await secado("solape-2")).id, equipmentId: b.id, desde: T("2026-09-03T11:00:00Z") }))
      .rejects.toThrow("bandeja_ocupada");
  });

  // Fix round 1, hallazgo 1 (D3): el permiso se decide con el traslado
  // VIGENTE ([occurredAt desc, createdAt desc], <= ahora), no con el de mayor
  // `occurredAt` a secas — que puede ser uno futuro que todavía no rige.
  it("D3: un traslado FUTURO no decide el permiso; manda el traslado vigente", async () => {
    const b = await bandeja("d3-futuro"); // su alta ya la deja en `sitio`, donde `operador` SÍ tiene permiso
    // Traslado futuro a `otroSitio`, donde `operador` NO tiene permiso (es el
    // sitio de `ajeno`). Si el futuro contara, cargar rechazaría con
    // `bandeja_sin_acceso` aunque la posición VIGENTE siga siendo `sitio`.
    await trasladar(b.id, otroSitio, "2099-01-01T00:00:00Z");
    const run = await secado("d3-futuro");
    const t = await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    expect(t.id).toBeTruthy(); // control: sin el traslado futuro, esto ya pasaba
  });
});

describe("permisos y auditoría", () => {
  it("quien no ve el lote no carga ni lista; quien sí, sí", async () => {
    const run = await secado("permiso");
    const b = await bandeja("permiso");
    await expect(cargarBandeja(ajeno, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") })).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(bandejasDeCorrida(ajeno, run.id)).rejects.toBeInstanceOf(TraceabilityAccessError);
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    expect(await bandejasDeCorrida(operador, run.id)).toHaveLength(1);
  });

  it("escribe su AuditEvent al cargar y al bajar", async () => {
    const run = await secado("audit");
    const [t, otra] = [
      await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: (await bandeja("audit")).id, desde: T("2026-09-01T11:00:00Z") }),
      await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: (await bandeja("audit-2")).id, desde: T("2026-09-01T11:00:00Z") }),
    ];
    await bajarBandeja(operador, { dryingRunTrayId: t.id, hasta: T("2026-09-02T11:00:00Z") });
    const ops = (await prisma.auditEvent.findMany({ where: { entityType: "drying_run_tray", entityId: t.id } })).map((e) => e.operation).sort();
    expect(ops).toEqual(["drying_run_tray.bajar", "drying_run_tray.cargar"]);
    expect(otra.id).toBeTruthy();
  });
});

describe("dónde está cada bandeja", () => {
  it("una bandeja movida dos veces responde dónde estaba en cada momento", async () => {
    const [p1, p2] = [await posicion(1, 1), await posicion(3, 2)];
    const b = await bandeja("movida");
    await trasladar(b.id, p1.id, "2026-09-01T12:00:00Z");
    await trasladar(b.id, p2.id, "2026-09-03T12:00:00Z");
    expect(await posicionDeBandeja(operador, b.id, T("2026-08-15T00:00:00Z"), org)).toBeNull(); // en el sitio, no en una cama
    expect(await posicionDeBandeja(operador, b.id, T("2026-09-02T00:00:00Z"), org)).toMatchObject({ camaId: p1.id, ajena: false, nivel: 1, puesto: 1 });
    expect(await posicionDeBandeja(operador, b.id, T("2026-09-04T00:00:00Z"), org)).toMatchObject({ camaId: p2.id, ajena: false, nivel: 3, puesto: 2 });
  });

  it("una cama de otra organización no dice su nombre", async () => {
    const ajenaCama = await posicion(4, 4, otraOrg, sitioDeOtraOrg);
    const b = await bandeja("en-cama-ajena");
    await trasladar(b.id, ajenaCama.id, "2026-09-01T12:00:00Z");
    expect(await posicionDeBandeja(operador, b.id, T("2026-09-02T00:00:00Z"), org))
      .toEqual({ camaId: ajenaCama.id, ajena: true, cama: null, instalacion: null, estante: null, nivel: null, puesto: null });
  });

  // D1 (ajustes.md, «bloquea» en preflight.md): el nombre de una posición lo
  // autoriza LA POSICIÓN misma (`manage_attributes`), no el permiso del lote ni
  // el de la organización. Farm Operator tiene `manage_attributes` con techo
  // `clear_internal`: una posición `trade_secret`, aunque sea de SU
  // organización, se queda sin nombre.
  it("una posición confidencial de la MISMA organización tampoco dice su nombre", async () => {
    const confidencial = await posicion(9, 1);
    await prisma.location.update({ where: { id: confidencial.id }, data: { classification: "trade_secret" } });
    // Control ANTES de afirmar nada: si Farm Operator sí administra un lugar
    // `trade_secret`, el caso no se puede construir aquí.
    const puedeAdministrar = await can(operador, "manage_attributes", "location", { scopeType: "location", scopeRefId: confidencial.id }, "trade_secret");
    expect(puedeAdministrar).toBe(false);

    const b = await bandeja("cama-confidencial");
    await trasladar(b.id, confidencial.id, "2026-09-01T12:00:00Z");
    expect(await posicionDeBandeja(operador, b.id, T("2026-09-02T00:00:00Z"), org))
      .toEqual({ camaId: confidencial.id, ajena: false, oculta: true, cama: null, instalacion: null, estante: null, nivel: null, puesto: null });

    // Control positivo: una posición normal (internal) SÍ dice su nombre.
    const normal = await posicion(9, 2);
    const b2 = await bandeja("cama-normal-control");
    await trasladar(b2.id, normal.id, "2026-09-01T12:00:00Z");
    expect(await posicionDeBandeja(operador, b2.id, T("2026-09-02T00:00:00Z"), org)).toMatchObject({ cama: normal.name, ajena: false });
  });

  // Fix round 1, hallazgo 3 (D1 parcial): el nombre del ESTANTE y el de la
  // INSTALACIÓN se autorizan con su PROPIO permiso, no con el de la cama. Una
  // cama VISIBLE bajo un estante que quien mira NO puede ver enseña su propio
  // nombre, pero no el del estante.
  it("una cama visible bajo un estante que quien mira no puede ver enseña su propio nombre, pero no el del estante", async () => {
    const instalacionVisible = await ubicacion({ name: "TEST Instalacion visible D1", locationType: "drying_facility", organizationId: org, parentLocationId: sitio });
    const estanteOculto = await ubicacion({ name: "TEST Estante oculto D1", locationType: "drying_rack", organizationId: org, parentLocationId: instalacionVisible.id });
    await prisma.location.update({ where: { id: estanteOculto.id }, data: { classification: "trade_secret" } });
    const camaVisible = await ubicacion({ name: "TEST Cama bajo estante oculto D1", locationType: "drying_bed", organizationId: org, parentLocationId: estanteOculto.id, rackLevel: 30, rackSlot: 30 });
    // Control: la CAMA sigue "internal" (visible); sólo el ESTANTE es trade_secret.
    expect(await can(operador, "manage_attributes", "location", { scopeType: "location", scopeRefId: camaVisible.id }, "internal")).toBe(true);
    expect(await can(operador, "manage_attributes", "location", { scopeType: "location", scopeRefId: estanteOculto.id }, "trade_secret")).toBe(false);

    const b = await bandeja("bajo-estante-oculto-d1");
    await trasladar(b.id, camaVisible.id, "2026-09-01T12:00:00Z");
    const p = await posicionDeBandeja(operador, b.id, T("2026-09-02T00:00:00Z"), org);
    expect(p).toMatchObject({ cama: camaVisible.name, ajena: false, estante: null, estanteOculto: true });
    // La instalación, en cambio, es "internal" y SÍ se ve: su propio permiso
    // no depende del estante intermedio.
    expect(p).toMatchObject({ instalacion: instalacionVisible.name });
  });

  it("conflicto = otro recipiente de la organización registrado en la misma cama, cargado o no", async () => {
    const run = await secado("conflicto");
    const [p, sola] = [await posicion(2, 2), await posicion(2, 3)];
    const [a, b, c] = [await bandeja("C1"), await bandeja("C2"), await bandeja("C3")];
    for (const e of [a, b, c]) await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: e.id, desde: T("2026-09-01T11:00:00Z") });
    await trasladar(a.id, p.id, "2026-09-01T12:00:00Z");
    await trasladar(b.id, p.id, "2026-09-01T12:30:00Z");
    await trasladar(c.id, sola.id, "2026-09-01T12:00:00Z");
    const vacia = await bandeja("vacia-en-p");              // de la organización, SIN cargar, registrada en p
    await trasladar(vacia.id, p.id, "2026-09-01T13:00:00Z");
    const deOtra = await bandeja("de-otra-en-p", { organizationId: otraOrg, alta: sitioDeOtraOrg });
    await trasladar(deOtra.id, p.id, "2026-09-01T13:00:00Z"); // otra organización: no cuenta ni se nombra

    const filas = await bandejasDeCorrida(operador, run.id);
    const por = (id: string) => filas.find((f) => f.equipmentId === id)!;
    expect(por(a.id).conflicto.sort()).toEqual([b.name, vacia.name].sort());
    expect(por(b.id).conflicto.sort()).toEqual([a.name, vacia.name].sort());
    expect(por(c.id)).toMatchObject({ conflicto: [] });      // sola en su posición real: sin conflicto
    expect(por(c.id).posicion).toMatchObject({ camaId: sola.id, nivel: 2, puesto: 3 });
    expect(filas.flatMap((f) => f.conflicto)).not.toContain(deOtra.name);
  });

  // Fix round 1, hallazgo 2: regresión del refactor de D10. `transfersDeCandidatos`
  // se quedó sin el techo de fecha que la versión anterior (una consulta por
  // candidato) sí traía, y un traslado FUTURO a la cama contaba como
  // ocupación de HOY.
  it("un traslado FUTURO a la misma cama no es un conflicto hoy", async () => {
    const run = await secado("conflicto-futuro");
    const p = await posicion(10, 10);
    const a = await bandeja("conflicto-futuro-a");
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: a.id, desde: T("2026-09-01T11:00:00Z") });
    await trasladar(a.id, p.id, "2026-09-01T12:00:00Z");
    const futura = await bandeja("conflicto-futuro-b");
    await trasladar(futura.id, p.id, "2099-01-01T00:00:00Z"); // futuro: no cuenta como conflicto HOY
    const filas = await bandejasDeCorrida(operador, run.id);
    const fila = filas.find((f) => f.equipmentId === a.id)!;
    expect(fila.conflicto).not.toContain(futura.name);
    expect(fila.conflictoSinAcceso).toBe(0);
  });

  it("una bandeja que esta persona no ve cuenta en el conflicto, pero sin su nombre", async () => {
    const run = await secado("conflicto-oculto");
    const p = await posicion(5, 5);
    const visible = await bandeja("visible-5");
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: visible.id, desde: T("2026-09-01T11:00:00Z") });
    await trasladar(visible.id, p.id, "2026-09-01T12:00:00Z");
    // `puedeVerEquipo` mira la `classification` del objeto que se le pasa, no
    // vuelve a leerlo: hay que pasarle la fila YA reclasificada, no la de antes.
    let secreta = await bandeja("secreta-5");
    secreta = await prisma.equipment.update({ where: { id: secreta.id }, data: { classification: "trade_secret" } });
    await trasladar(secreta.id, p.id, "2026-09-01T12:30:00Z");
    // Control ANTES de afirmar nada: el caso existe sólo si el operador de verdad
    // no ve `trade_secret`. El catálogo dice que Farm Operator sólo tiene
    // `clear_partner` y `clear_internal`, y también que la compuerta de
    // clasificación puede no estar aplicada. Si esto sale `true`, el caso no se
    // puede construir aquí: se dice en el PR y el flip 9 no cuenta.
    expect(await puedeVerEquipo(operador, secreta)).toBe(false);

    const fila = (await bandejasDeCorrida(operador, run.id)).find((f) => f.equipmentId === visible.id)!;
    expect(fila.conflicto).not.toContain(secreta.name);
    expect(fila.conflictoSinAcceso).toBe(1);
  });

  // D2 (ajustes.md): el NOMBRE de cada fila de la corrida pasa por
  // `puedeVerEquipo`, no sólo los nombres del conflicto.
  it("el nombre de la propia fila también pasa por puedeVerEquipo, no sólo el del conflicto", async () => {
    const run = await secado("nombre-oculto");
    const visible = await bandeja("nombre-visible");
    let secreta = await bandeja("nombre-secreta");
    // Se cargan mientras las dos son visibles (`cargarBandeja` exige verlas);
    // la reclasificación ocurre DESPUÉS, como en la prueba del conflicto oculto.
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: visible.id, desde: T("2026-09-01T11:00:00Z") });
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: secreta.id, desde: T("2026-09-01T11:00:00Z") });
    secreta = await prisma.equipment.update({ where: { id: secreta.id }, data: { classification: "trade_secret" } });
    expect(await puedeVerEquipo(operador, secreta)).toBe(false); // control: si sale true, el caso no se puede construir aquí

    const filas = await bandejasDeCorrida(operador, run.id);
    expect(filas.find((f) => f.equipmentId === visible.id)?.nombre).toBe(visible.name); // control positivo
    expect(filas.find((f) => f.equipmentId === secreta.id)?.nombre).toBe("(bandeja oculta)");
  });

  // Fix round 1, ronda 2 de revisión (Codex + un revisor Claude, independientes):
  // D3 seguía partido para una bandeja YA BAJADA. La posición se resolvía a
  // `f.hasta` (dónde secaba); el permiso del nombre, siempre a `ahora`. Si la
  // bandeja se movía DESPUÉS de bajar, las dos fechas caían en traslados
  // distintos.
  it("D3 (ronda 2): una bandeja ya bajada y luego movida se autoriza y se muestra con LA MISMA fila — la de cuando secaba, no la de ahora", async () => {
    const run = await secado("d3-r2");
    const p1 = await posicion(11, 1); // en `sitio`: `operador` la ve
    const b = await bandeja("d3-r2");
    const t = await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    await trasladar(b.id, p1.id, "2026-09-01T11:30:00Z");
    // Control positivo, cargada ANTES de bajar `b` (para que `b` no sea la
    // última): otra bandeja de la MISMA corrida, sin mover, que para que esta
    // prueba no pueda pasar con una lista vacía sigue enseñando su nombre y
    // su posición con normalidad.
    const otra = await bandeja("d3-r2-control");
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: otra.id, desde: T("2026-09-01T11:00:00Z") });

    await bajarBandeja(operador, { dryingRunTrayId: t.id, hasta: T("2026-09-02T10:00:00Z") });
    // DESPUÉS de bajar, se mueve a `otroSitio` — donde `operador` NO tiene
    // permiso de ver el equipo (sólo `ajeno` está asignado ahí). Si el
    // permiso se resolviera a "ahora" (el bug), el nombre saldría oculto.
    await trasladar(b.id, otroSitio, "2026-09-02T11:00:00Z");

    const filas = await bandejasDeCorrida(operador, run.id);
    expect(filas.length).toBeGreaterThan(0); // control: la lista no está vacía
    const fila = filas.find((f) => f.equipmentId === b.id)!;
    // La posición mostrada es la de CUANDO SECABA (p1), no la de ahora (otroSitio).
    expect(fila.posicion).toMatchObject({ camaId: p1.id });
    // Y el nombre se autoriza con ESA MISMA fila: `operador` sí veía la
    // bandeja en `p1`, aunque hoy esté en un sitio que no puede ver.
    expect(fila.nombre).toBe(b.name);
    // Control positivo de la corrida: la otra fila sigue con su nombre normal.
    expect(filas.find((f) => f.equipmentId === otra.id)?.nombre).toBe(otra.name);
  });

  it("disponibles: recipientes activos, numerados, de la organización, visibles y libres", async () => {
    const run = await secado("disponibles");
    const libre = await bandeja("libre");
    const ocupada = await bandeja("ocupada");
    await cargarBandeja(operador, { dryingRunId: (await secado("ocupa")).id, equipmentId: ocupada.id, desde: T("2026-09-01T11:00:00Z") });
    const instr = await bandeja("instr-disp", { kind: "instrument" });
    const retirada = await bandeja("retirada-disp");
    await prisma.equipment.update({ where: { id: retirada.id }, data: { lifecycleStatus: "retired" } });
    const deOtra = await bandeja("otra-disp", { organizationId: otraOrg, alta: sitioDeOtraOrg });
    const sinVer = await bandeja("sin-ver-disp", { alta: otroSitio });
    // D4: un vessel sin tipo ni número tampoco sale como disponible.
    const sinNumeroDisp = await prisma.equipment.create({ data: {
      name: `TEST Bandeja sin-numero-disp (${RUN_ID})`, kind: "vessel", format: "other", organizationId: org, provenanceClass: "original_record",
    } });
    equipos.push(sinNumeroDisp.id);
    await trasladar(sinNumeroDisp.id, sitio, "2026-08-01T00:00:00Z");

    const ids = (await bandejasDisponibles(operador, run.id)).map((d) => d.id);
    expect(ids).toContain(libre.id); // control positivo
    for (const fuera of [ocupada, instr, retirada, deOtra, sinVer, sinNumeroDisp]) expect(ids).not.toContain(fuera.id);
  });
});

describe("mover una bandeja", () => {
  it("quien gestiona el lote cargado la mueve; queda el traslado con su origen, su hora y su auditoría", async () => {
    const run = await secado("mover");
    const [p1, p2] = [await posicion(1, 6), await posicion(2, 6)];
    const b = await bandeja("mover");
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    await moverBandeja(operador, { equipmentId: b.id, posicionId: p1.id, occurredAt: T("2026-09-01T12:00:00Z") });
    const t2 = await moverBandeja(operador, { equipmentId: b.id, posicionId: p2.id, occurredAt: T("2026-09-02T12:00:00Z") });
    expect(await posicionDeBandeja(operador, b.id, T("2026-09-03T00:00:00Z"), org)).toMatchObject({ camaId: p2.id, nivel: 2, puesto: 6 });
    const t = await prisma.equipmentTransfer.findUniqueOrThrow({ where: { id: t2.id } });
    expect(t).toMatchObject({ fromLocationId: p1.id, toLocationId: p2.id, occurredAt: T("2026-09-02T12:00:00Z") });
    expect(await prisma.auditEvent.count({ where: { entityType: "equipment_transfer", entityId: t2.id, operation: "drying_tray.move" } })).toBe(1);
  });

  it("rechaza cada caso inválido, al lado de uno que entra", async () => {
    const run = await secado("mover-rechazos");
    const p = await posicion(3, 6);
    const b = await bandeja("mover-rechazos");
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    const mover = (quien: string, equipmentId: string, posicionId: string, t = "2026-09-02T12:00:00Z") => moverBandeja(quien, { equipmentId, posicionId, occurredAt: T(t) });
    await expect(mover(operador, (await bandeja("vacia-mover")).id, p.id)).rejects.toThrow("bandeja_sin_acceso");      // vacía, sin configurar
    await expect(mover(operador, b.id, (await posicion(3, 7, otraOrg, sitioDeOtraOrg)).id)).rejects.toThrow("posicion_invalida"); // otra organización
    const camaSuelta = await ubicacion({ name: "TEST Cama suelta", locationType: "drying_bed", organizationId: org, parentLocationId: (await ubicacion({ name: "TEST Patio", locationType: "drying_facility", organizationId: org, parentLocationId: sitio })).id });
    await expect(mover(operador, b.id, camaSuelta.id)).rejects.toThrow("posicion_invalida");                              // no es posición de estante
    const fija = await bandeja("fija"); await prisma.equipment.update({ where: { id: fija.id }, data: { isFixedInPlace: true } });
    await expect(mover(configurador, fija.id, p.id)).rejects.toThrow("bandeja_fija");
    await expect(mover(ajeno, b.id, p.id)).rejects.toThrow("bandeja_sin_acceso");
    await mover(operador, b.id, p.id);                                                                                   // control positivo
    await expect(mover(operador, b.id, (await posicion(3, 8)).id, "2026-09-01T00:00:00Z")).rejects.toThrow("fecha_antes_del_ultimo_traslado");
  });

  it("quien configura el destino mueve una vacía y una cargada que no gestiona; fuera de su ámbito, no", async () => {
    const p = await posicion(4, 7);
    const vacia = await bandeja("vacia-config");
    await moverBandeja(configurador, { equipmentId: vacia.id, posicionId: p.id, occurredAt: T("2026-09-02T12:00:00Z") });
    expect(await posicionDeBandeja(operador, vacia.id, T("2026-09-03T00:00:00Z"), org)).toMatchObject({ camaId: p.id });
    const fuera = await posicion(4, 8, org, otroSitio);    // otro sitio: el configurador no manda ahí
    await expect(moverBandeja(configurador, { equipmentId: vacia.id, posicionId: fuera.id, occurredAt: T("2026-09-03T12:00:00Z") })).rejects.toThrow("bandeja_sin_acceso");
  });

  // D6 (ajustes.md): la vía de "configura el destino" exige TAMBIÉN ver la
  // bandeja — configurar el lugar no basta si la bandeja misma es ajena.
  it("D6: configura el destino pero no puede ver la bandeja (clasificada): rechaza, aunque sea vacía", async () => {
    const p = await posicion(4, 9);
    let secreta = await bandeja("secreta-mover");
    secreta = await prisma.equipment.update({ where: { id: secreta.id }, data: { classification: "trade_secret" } });
    expect(await puedeVerEquipo(configurador, secreta)).toBe(false); // control: si sale true, el caso no se puede construir aquí
    await expect(moverBandeja(configurador, { equipmentId: secreta.id, posicionId: p.id, occurredAt: T("2026-09-02T12:00:00Z") })).rejects.toThrow("bandeja_sin_acceso");
    // Control positivo: la misma vía SÍ mueve una bandeja visible.
    const visible = await bandeja("visible-mover-d6");
    await moverBandeja(configurador, { equipmentId: visible.id, posicionId: p.id, occurredAt: T("2026-09-02T13:00:00Z") });
    expect(await posicionDeBandeja(operador, visible.id, T("2026-09-03T00:00:00Z"), org)).toMatchObject({ camaId: p.id });
  });

  // D1 (ajustes.md): una posición de la MISMA organización pero clasificada por
  // encima del techo de quien mueve no se lista ni se acepta como destino,
  // aunque gestione el lote cargado.
  it("D1: una posición confidencial no aparece para moverse, ni se puede mover ahí", async () => {
    const posConf = await posicion(4, 20);
    await prisma.location.update({ where: { id: posConf.id }, data: { classification: "trade_secret" } });
    expect(await can(operador, "manage_attributes", "location", { scopeType: "location", scopeRefId: posConf.id }, "trade_secret")).toBe(false);

    const run = await secado("posicion-oculta");
    const b = await bandeja("mia-posicion-oculta");
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    const opciones = await posicionesParaMover(operador, b.id);
    expect(opciones.find((o) => o.id === posConf.id)).toBeUndefined();
    // Control positivo: una posición normal de la organización SÍ aparece.
    const normal = await posicion(4, 21);
    expect((await posicionesParaMover(operador, b.id)).find((o) => o.id === normal.id)).toBeDefined();
    await expect(moverBandeja(operador, { equipmentId: b.id, posicionId: posConf.id, occurredAt: T("2026-09-02T12:00:00Z") })).rejects.toThrow("posicion_invalida");
  });

  // C5: mismos controles (a)/(b) que la carrera de Task 1 — dos transacciones
  // de verdad, la segunda tiene que esperar el bloqueo de la primera y perder.
  describe("si la carga cambia entre la comprobación y la escritura, no se mueve (carrera)", () => {
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const resultado = (p: PromiseLike<unknown>) => Promise.resolve(p).then(() => null, (e: unknown) => e as Error);

    async function carrera(primera: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<unknown>, segunda: () => PromiseLike<unknown>) {
      let bloqueadoEn = 0;
      const lenta = resultado(prisma.$transaction(async (tx) => {
        await primera(tx);
        bloqueadoEn = Date.now();
        await espera(1500);
      }, { timeout: 10_000 }));
      await espera(300);
      const arranca = Date.now();
      const error = await resultado(segunda());
      const tardo = Date.now() - arranca;
      expect(await lenta).toBeNull();
      expect(bloqueadoEn).toBeGreaterThan(0);
      expect(bloqueadoEn).toBeLessThan(arranca);   // (a)
      expect(tardo).toBeGreaterThanOrEqual(1000);  // (b): 1500 − 300 − margen [B4]
      return error;
    }

    it("cambia la carga mientras se espera el bloqueo del equipo: rechaza", async () => {
      const run = await secado("mover-carrera");
      const [p, q] = [await posicion(5, 6), await posicion(5, 7)];
      const b = await bandeja("mover-carrera");
      const t = await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
      await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: (await bandeja("mover-carrera-2")).id, desde: T("2026-09-01T11:00:00Z") }); // para que la primera no sea la última
      await moverBandeja(operador, { equipmentId: b.id, posicionId: p.id, occurredAt: T("2026-09-01T12:00:00Z") });
      const error = await carrera(
        // La escritura de `hasta` dispara `exigir_bandeja_valida`, que bloquea
        // el equipo con FOR NO KEY UPDATE — mismo bloqueo que espera moverBandeja.
        (tx) => tx.dryingRunTray.update({ where: { id: t.id }, data: { hasta: T("2026-09-02T10:00:00Z") } }),
        () => moverBandeja(operador, { equipmentId: b.id, posicionId: q.id, occurredAt: T("2026-09-02T12:00:00Z") }),
      );
      expect(String(error)).toMatch(/bandeja_cambio/);
    });
  });

  it("posicionesParaMover: la ocupación hasta ahora, y el nombre sólo si se ve", async () => {
    const p = await posicion(6, 6);
    const b = await bandeja("ocupa-6-6");
    await trasladar(b.id, p.id, "2026-09-01T12:00:00Z");
    const futura = await posicion(6, 7);
    await trasladar(b.id, futura.id, "2099-01-01T00:00:00Z");  // futuro: no cuenta hoy
    let secreta = await bandeja("secreta-6-8");
    secreta = await prisma.equipment.update({ where: { id: secreta.id }, data: { classification: "trade_secret" } });
    const p8 = await posicion(6, 8);
    await trasladar(secreta.id, p8.id, "2026-09-01T12:00:00Z");
    const run = await secado("posiciones");
    const mia = await bandeja("mia-posiciones");
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: mia.id, desde: T("2026-09-01T11:00:00Z") });
    const opciones = await posicionesParaMover(operador, mia.id);
    expect(opciones.find((o) => o.id === p.id)).toMatchObject({ ocupada: true, ocupadaPor: b.name, nivel: 6, puesto: 6 });
    expect(opciones.find((o) => o.id === futura.id)).toMatchObject({ ocupada: false });
    if (!(await puedeVerEquipo(operador, secreta))) {                // sólo si el caso se puede construir (ver el conflicto oculto)
      expect(opciones.find((o) => o.id === p8.id)).toMatchObject({ ocupada: true, ocupadaPor: null });
    }
  });
});
