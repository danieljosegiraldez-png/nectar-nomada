// Sondas de las reglas de DryingRunTray (spec de secado por bandeja §4.3, §5).
// Cada rechazo lleva al lado su control positivo: lo válido SÍ entra. Sin él,
// «no entró» no prueba nada (CLAUDE.md, «Ocho guardias falsos en un día»).
//
// C2 (ajustes.md): estas sondas cuelgan de un sitio PROPIO, nunca de
// `findFirstOrThrow({ locationType: "site" })` — en la base compartida eso es
// una finca real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `bdb-${Date.now()}`;
let organizationId: string;
let tipoId: string;
let trayCounter = 0;
const equipos: string[] = [];
const corridas: string[] = [];
const ubicaciones: string[] = [];
const tipos: string[] = [];
const lotes: string[] = [];
const transformaciones: string[] = [];

async function tipoDeBandeja(orgId: string, etiqueta: string) {
  const t = await prisma.dryingTrayType.create({ data: {
    organizationId: orgId, name: `TEST Tipo ${etiqueta} (${RUN_ID})`,
    widthCm: 100, lengthCm: 60, entryUnit: "cm",
  } });
  tipos.push(t.id);
  return t.id;
}
// D4 (ajustes.md): toda bandeja de estas sondas nace numerada — tipo y
// número —, porque la base ya no acepta una que no lo sea.
async function equipo(kind: "vessel" | "instrument", n: string) {
  const e = await prisma.equipment.create({ data: {
    name: `TEST Bandeja ${n} (${RUN_ID})`, kind, format: kind === "vessel" ? "other" : null,
    organizationId, provenanceClass: "original_record",
    ...(kind === "vessel" ? { trayTypeId: tipoId, trayNumber: ++trayCounter } : {}),
  } });
  equipos.push(e.id);
  return e;
}
async function corrida(dryingBedLocationId: string | null = null) {
  const r = await prisma.dryingRun.create({ data: { startedAt: new Date("2026-09-01T10:00:00Z"), dryingBedLocationId } });
  corridas.push(r.id);
  return r;
}
function cargar(dryingRunId: string, equipmentId: string, desde: string, hasta: string | null = null) {
  return prisma.dryingRunTray.create({ data: {
    dryingRunId, equipmentId, desde: new Date(desde), hasta: hasta ? new Date(hasta) : null, provenanceClass: "original_record",
  } });
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  tipoId = await tipoDeBandeja(organizationId, "principal");
});
afterAll(async () => {
  await prisma.dryingRunTray.deleteMany({ where: { dryingRunId: { in: corridas } } });
  await prisma.lotTransformation.deleteMany({ where: { id: { in: transformaciones } } }); // cascada a lot_transformation_input
  await prisma.lot.deleteMany({ where: { id: { in: lotes } } });
  await prisma.dryingRun.deleteMany({ where: { id: { in: corridas } } });
  await prisma.equipment.deleteMany({ where: { id: { in: equipos } } });
  await prisma.dryingTrayType.deleteMany({ where: { id: { in: tipos } } });
  for (const id of ubicaciones) await prisma.location.delete({ where: { id } }); // hijos antes que padres
  await deleteTestOrganizations(RUN_ID);
});

describe("una bandeja lleva un solo lote a la vez", () => {
  it("rechaza dos filas abiertas de la misma bandeja; acepta la segunda cuando la primera bajó", async () => {
    const b = await equipo("vessel", "doble");
    const [r1, r2] = [await corrida(), await corrida()];
    await cargar(r1.id, b.id, "2026-09-01T10:00:00Z");
    await expect(cargar(r2.id, b.id, "2026-09-02T10:00:00Z")).rejects.toThrow(/ya lleva otro lote/);
    await prisma.dryingRunTray.updateMany({ where: { dryingRunId: r1.id }, data: { hasta: new Date("2026-09-02T09:00:00Z") } });
    expect((await cargar(r2.id, b.id, "2026-09-02T10:00:00Z")).equipmentId).toBe(b.id); // control positivo
  });

  it("rechaza un intervalo cerrado que se solapa con otro de la misma bandeja", async () => {
    const b = await equipo("vessel", "solape");
    const [r1, r2] = [await corrida(), await corrida()];
    await cargar(r1.id, b.id, "2026-09-01T10:00:00Z", "2026-09-05T10:00:00Z");
    await expect(cargar(r2.id, b.id, "2026-09-03T10:00:00Z", "2026-09-06T10:00:00Z")).rejects.toThrow(/ya lleva otro lote/);
    // Control positivo: pegado al final del anterior no se solapa.
    expect((await cargar(r2.id, b.id, "2026-09-05T10:00:00Z", "2026-09-06T10:00:00Z")).id).toBeTruthy();
  });
});

describe("la bandeja es un recipiente", () => {
  it("rechaza un instrumento y acepta un recipiente", async () => {
    const r = await corrida();
    await expect(cargar(r.id, (await equipo("instrument", "no-recipiente")).id, "2026-09-01T10:00:00Z")).rejects.toThrow(/tipo recipiente/);
    expect((await cargar(r.id, (await equipo("vessel", "recipiente")).id, "2026-09-01T10:00:00Z")).id).toBeTruthy();
  });
});

describe("la bandeja es un recipiente numerado", () => {
  // D4 (ajustes.md): un recipiente sin tipo ni número no es una bandeja, aunque
  // sea `kind: vessel` — el CHECK de equipment ya permite esa combinación
  // (fermentadores, baldes), así que la regla vive aquí, no en una constraint.
  it("rechaza un recipiente vessel sin tipo ni numero; acepta uno numerado", async () => {
    const r = await corrida();
    const sinNumero = await prisma.equipment.create({ data: {
      name: `TEST Bandeja sin-numero (${RUN_ID})`, kind: "vessel", format: "other",
      organizationId, provenanceClass: "original_record",
    } });
    equipos.push(sinNumero.id);
    await expect(cargar(r.id, sinNumero.id, "2026-09-01T10:00:00Z")).rejects.toThrow(/tipo y numero/);
    // Control positivo: uno numerado sí entra.
    expect((await cargar(r.id, (await equipo("vessel", "numerada")).id, "2026-09-01T10:00:00Z")).id).toBeTruthy();
  });
});

describe("la bandeja es de la misma organizacion que el lote", () => {
  // D5 (ajustes.md): el lote se llega por lot_transformation, misma consulta
  // que `resolveRunSourceLot` (lib/traceability/drying.ts).
  it("rechaza una bandeja de otra organizacion que el lote; acepta una de la misma", async () => {
    const otraOrg = await createTestOrganization(`${RUN_ID}-otra`);
    const tipoOtra = await tipoDeBandeja(otraOrg, "otra-org");
    const lote = await prisma.lot.create({ data: { lotCode: `${RUN_ID}-lote-cruce`, lotType: "drying", organizationId } });
    lotes.push(lote.id);
    const r = await corrida();
    const transformacion = await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: new Date("2026-09-01T09:00:00Z"),
      provenanceClass: "original_record", dryingRunId: r.id,
      inputs: { create: [{ lotId: lote.id }] },
    } });
    transformaciones.push(transformacion.id);

    const ajena = await prisma.equipment.create({ data: {
      name: `TEST Bandeja ajena (${RUN_ID})`, kind: "vessel", format: "other",
      organizationId: otraOrg, provenanceClass: "original_record",
      trayTypeId: tipoOtra, trayNumber: ++trayCounter,
    } });
    equipos.push(ajena.id);
    await expect(cargar(r.id, ajena.id, "2026-09-01T10:00:00Z")).rejects.toThrow(/otra organizacion/);
    // Control positivo: una bandeja de la MISMA organizacion que el lote sí entra.
    expect((await cargar(r.id, (await equipo("vessel", "misma-org")).id, "2026-09-01T10:00:00Z")).id).toBeTruthy();
  });

  it("deja pasar una corrida huerfana, sin transformacion todavia (nada con que comparar)", async () => {
    // Control: `topologiaDeSecado.test.ts` ya crea corridas sin transformación
    // ninguna. Sin este caso, la comprobación de arriba podría estar exigiendo
    // un lote que no siempre existe y rompiendo ese uso legítimo en silencio.
    const r = await corrida();
    expect((await cargar(r.id, (await equipo("vessel", "huerfana")).id, "2026-09-01T10:00:00Z")).id).toBeTruthy();
  });
});

describe("un equipo con bandejas cargadas no cambia de organizacion", () => {
  it("rechaza cambiar la organizacion de un equipo con filas de drying_run_tray; acepta uno que nunca las tuvo", async () => {
    const b = await equipo("vessel", "quieta");
    await cargar((await corrida()).id, b.id, "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z");
    const otraOrg = await createTestOrganization(`${RUN_ID}-otra2`);
    const tipoEnOtra = await tipoDeBandeja(otraOrg, "destino-quieta");
    // Se cambia tray_type_id A LA VEZ para que el único motivo de rechazo sea
    // la guarda nueva, no `exigir_tipo_de_bandeja_propio` (tipo de otra org).
    await expect(
      prisma.equipment.update({ where: { id: b.id }, data: { organizationId: otraOrg, trayTypeId: tipoEnOtra } }),
    ).rejects.toThrow(/no cambia de organizacion/);
    // Control positivo: un recipiente que nunca fue cargado sí puede cambiar
    // de organizacion (sin tipo, para no chocar con esa otra regla).
    const libre = await prisma.equipment.create({ data: {
      name: `TEST Bandeja libre (${RUN_ID})`, kind: "vessel", format: "other",
      organizationId, provenanceClass: "original_record",
    } });
    equipos.push(libre.id);
    expect((await prisma.equipment.update({ where: { id: libre.id }, data: { organizationId: otraOrg } })).organizationId).toBe(otraOrg);
  });
});

describe("un lote con bandejas de secado no cambia de organizacion", () => {
  // Ronda 1 de revisión (hallazgo del coordinador): la comprobación de D5 en
  // `exigir_bandeja_valida` sólo protege el momento de CARGAR una bandeja; el
  // `FOR SHARE` que toma sobre el lote demora un UPDATE concurrente, no lo
  // prohíbe para siempre. Esta es la guarda del otro padre: el lote mismo, una
  // vez que tiene bandejas, no cambia de organización. Camino real:
  // lot_transformation_input → lot_transformation → drying_run_tray.
  it("rechaza cambiar la organizacion de un lote con bandejas cargadas; acepta uno sin bandejas", async () => {
    const lote = await prisma.lot.create({ data: { lotCode: `${RUN_ID}-lote-quieto`, lotType: "drying", organizationId } });
    lotes.push(lote.id);
    const r = await corrida();
    const transformacion = await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: new Date("2026-09-01T09:00:00Z"),
      provenanceClass: "original_record", dryingRunId: r.id,
      inputs: { create: [{ lotId: lote.id }] },
    } });
    transformaciones.push(transformacion.id);
    await cargar(r.id, (await equipo("vessel", "lote-quieto")).id, "2026-09-01T10:00:00Z");

    const otraOrg = await createTestOrganization(`${RUN_ID}-otra3`);
    await expect(prisma.lot.update({ where: { id: lote.id }, data: { organizationId: otraOrg } })).rejects.toThrow(/no cambia de organizacion/);

    // Control positivo: un lote SIN bandejas de secado sí puede cambiar de organizacion.
    const loteLibre = await prisma.lot.create({ data: { lotCode: `${RUN_ID}-lote-libre`, lotType: "drying", organizationId } });
    lotes.push(loteLibre.id);
    expect((await prisma.lot.update({ where: { id: loteLibre.id }, data: { organizationId: otraOrg } })).organizationId).toBe(otraOrg);
  });
});

describe("una corrida dice una sola verdad sobre dónde está el lote", () => {
  it("rechaza bandejas en una corrida con cama, y cama en una corrida con bandejas", async () => {
    const sitio = await prisma.location.create({ data: { name: `TEST Sitio (${RUN_ID})`, locationType: "site", organizationId, classification: "internal" } });
    const inv = await prisma.location.create({ data: { name: `TEST Inv (${RUN_ID})`, locationType: "drying_facility", parentLocationId: sitio.id } });
    const cama = await prisma.location.create({ data: { name: `TEST Cama (${RUN_ID})`, locationType: "drying_bed", parentLocationId: inv.id } });
    ubicaciones.unshift(cama.id, inv.id, sitio.id); // hijos antes que padres

    const conCama = await corrida(cama.id);
    await expect(cargar(conCama.id, (await equipo("vessel", "en-cama")).id, "2026-09-01T10:00:00Z")).rejects.toThrow(/con cama no lleva bandejas/);

    const conBandeja = await corrida();
    await cargar(conBandeja.id, (await equipo("vessel", "con-bandeja")).id, "2026-09-01T10:00:00Z");
    await expect(prisma.dryingRun.update({ where: { id: conBandeja.id }, data: { dryingBedLocationId: cama.id } })).rejects.toThrow(/con bandejas no lleva cama/);

    // Control positivo: una corrida sin bandejas sí acepta su cama.
    const sola = await corrida();
    expect((await prisma.dryingRun.update({ where: { id: sola.id }, data: { dryingBedLocationId: cama.id } })).dryingBedLocationId).toBe(cama.id);
  });
});

describe("el secado termina bandeja a bandeja", () => {
  it("no se cierra con una bandeja sin bajar; sí cuando bajó la última", async () => {
    const r = await corrida();
    await cargar(r.id, (await equipo("vessel", "cierre-1")).id, "2026-09-01T10:00:00Z", "2026-09-04T10:00:00Z");
    await cargar(r.id, (await equipo("vessel", "cierre-2")).id, "2026-09-01T10:00:00Z");
    await expect(prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-05T10:00:00Z") } })).rejects.toThrow(/bandejas sin bajar/);
    await prisma.dryingRunTray.updateMany({ where: { dryingRunId: r.id, hasta: null }, data: { hasta: new Date("2026-09-05T09:00:00Z") } });
    expect((await prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-05T10:00:00Z") } })).endedAt).toBeTruthy();
  });

  it("no se carga una bandeja en un secado cerrado", async () => {
    const r = await corrida();
    await prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-02T10:00:00Z") } });
    await expect(cargar(r.id, (await equipo("vessel", "tarde")).id, "2026-09-03T10:00:00Z")).rejects.toThrow(/ya esta cerrado/);
  });

  it("rechaza bajar antes de cargar —también con historial previo de la bandeja—; acepta bajar después", async () => {
    const r = await corrida();
    await expect(cargar(r.id, (await equipo("vessel", "reves")).id, "2026-09-03T10:00:00Z", "2026-09-02T10:00:00Z"))
      .rejects.toThrow(/drying_run_tray_hasta_despues_de_desde/);
    // Con historial: el disparador NO debe construir un tsrange al revés antes del CHECK.
    const conHistoria = await equipo("vessel", "con-historia");
    await cargar(r.id, conHistoria.id, "2026-09-01T10:00:00Z", "2026-09-01T12:00:00Z");
    await expect(cargar((await corrida()).id, conHistoria.id, "2026-09-05T10:00:00Z", "2026-09-04T10:00:00Z"))
      .rejects.toThrow(/drying_run_tray_hasta_despues_de_desde/);
    expect((await cargar(r.id, (await equipo("vessel", "derecho")).id, "2026-09-02T10:00:00Z", "2026-09-03T10:00:00Z")).id).toBeTruthy();
  });

  it("no se reabre una bandeja de un secado cerrado, ni se mueve una abierta a uno cerrado", async () => {
    const r = await corrida();
    const t = await cargar(r.id, (await equipo("vessel", "reabrir")).id, "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z");
    await prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-03T10:00:00Z") } });
    await expect(prisma.dryingRunTray.update({ where: { id: t.id }, data: { hasta: null } })).rejects.toThrow(/ya esta cerrado/);
    // Control positivo: corregir el `hasta` de una fila cerrada sigue permitido.
    expect((await prisma.dryingRunTray.update({ where: { id: t.id }, data: { hasta: new Date("2026-09-02T11:00:00Z") } })).hasta).toBeTruthy();

    const abierta = await cargar((await corrida()).id, (await equipo("vessel", "mudanza")).id, "2026-09-01T10:00:00Z");
    await expect(prisma.dryingRunTray.update({ where: { id: abierta.id }, data: { dryingRunId: r.id } })).rejects.toThrow(/ya esta cerrado/);
  });
});

describe("el equipo que fue bandeja sigue siendo recipiente", () => {
  it("rechaza cambiar a instrumento un recipiente con bandejas; acepta uno que nunca lo fue", async () => {
    const b = await equipo("vessel", "cambia-tipo");
    await cargar((await corrida()).id, b.id, "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z");
    await expect(prisma.equipment.update({ where: { id: b.id }, data: { kind: "instrument", format: null } })).rejects.toThrow(/tipo recipiente/);
    // Control positivo: SIN tray_type_id (D4 obliga a numerar toda bandeja
    // cargable, y el CHECK `equipment_bandeja_solo_recipiente` ya exige
    // tray_type_id nulo para volverse instrumento — nada que ver con la regla
    // de aquí). Un `equipo("vessel", …)` nace numerado y chocaría con ese
    // CHECK por un motivo ajeno al que esta prueba mide.
    const nunca = await prisma.equipment.create({ data: {
      name: `TEST Bandeja nunca-bandeja (${RUN_ID})`, kind: "vessel", format: "other",
      organizationId, provenanceClass: "original_record",
    } });
    equipos.push(nunca.id);
    expect((await prisma.equipment.update({ where: { id: nunca.id }, data: { kind: "instrument", format: null } })).kind).toBe("instrument");
  });
});

describe("cargar y cerrar a la vez no dejan una corrida incoherente", () => {
  // Dos transacciones de verdad, en los dos órdenes. La primera retiene su
  // bloqueo 1,5 s; la segunda arranca a los 300 ms y tiene que esperar y perder.
  //
  // OJO: una consulta de Prisma es PEREZOSA —no sale hasta que alguien hace
  // `await` o `.then`—. Por eso cada operación se arranca con `resultado()`, que
  // llama a `.then` en el acto. Sin eso, la «segunda» corre después de que la
  // primera confirme, no hay carrera, y la prueba pasa sin medir nada.
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const resultado = (p: PromiseLike<unknown>) => Promise.resolve(p).then(() => null, (e: unknown) => e as Error);

  // Los controles de que HUBO carrera, que la segunda pasada de Codex exigió:
  //  (a) la primera ya tenía su bloqueo —su sentencia terminó— ANTES de que
  //      arrancara la segunda (`bloqueadoEn < arranca`);
  //  (b) la SEGUNDA tardó ella misma casi lo que faltaba del bloqueo. Medir desde
  //      t0 no vale: eso pasa aunque la segunda no haya esperado nada.
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

  it("carga primero: el cierre espera y lo rechaza", async () => {
    const r = await corrida();
    const b = await equipo("vessel", "carrera-1");
    const error = await carrera(
      (tx) => tx.dryingRunTray.create({ data: { dryingRunId: r.id, equipmentId: b.id, desde: new Date("2026-09-01T10:00:00Z"), provenanceClass: "original_record" } }),
      () => prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-02T10:00:00Z") } }),
    );
    expect(String(error)).toMatch(/bandejas sin bajar/);
  });

  it("cierra primero: la carga espera y la rechaza", async () => {
    const r = await corrida();
    const b = await equipo("vessel", "carrera-2");
    const error = await carrera(
      (tx) => tx.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-02T10:00:00Z") } }),
      () => cargar(r.id, b.id, "2026-09-01T10:00:00Z"),
    );
    expect(String(error)).toMatch(/ya esta cerrado/);
  });
});
