import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { createMicrolot } from "../../lib/traceability/locations";
import { getPlotDetail } from "../../lib/traceability/plantingCohorts";
import { listPlantSpecimens } from "../../lib/traceability/specimens";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";

/**
 * **ADR-196 — una selección no resta.** El lote responde por lo que ocurre en sus
 * selecciones, y el enrollado va hacia los DESCENDIENTES: una ficha de
 * microparcela que mostrara las cosechas de su madre contaría dos veces el mismo
 * café. Tarea 3 del plan
 * `docs/superpowers/plans/2026-10-05-el-enrollado-de-la-seleccion.md`.
 *
 * La microparcela se crea con `createMicrolot`, que es como la hace producción —un
 * `plot` hijo de otro `plot`, decisión de Daniel del 2026-09-19— y NO fabricando
 * una `Location` a mano: el valor `micro_plot` del enum existe y nada lo produce.
 *
 * El usuario viene de `crearUsuarioConAcceso`, que reutiliza el ámbito de
 * plataforma COMPARTIDO. Este archivo no toca `scope`, `userAccount` ni `person`,
 * porque borrarlos se lo quita a los archivos que corren en paralelo.
 */

let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let madre: Awaited<ReturnType<typeof crearParcela>>;
let hija: Awaited<ReturnType<typeof createMicrolot>>;
let loteId: string | undefined;

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  madre = await crearParcela();
  hija = await createMicrolot(usuario.userAccountId, {
    name: `TEST Micro del enrollado (${Date.now()})`,
    parentLocationId: madre.id,
    // Obligatorio en `CreateMicrolotInput`. `other` porque a este guardia el
    // motivo le da igual: lo que mide es el enrollado, no por qué se seleccionó.
    subdivisionReason: "other",
  });
}, 30000);

afterAll(async () => {
  // Lo propio primero, y por `locationId` de las DOS: un `deleteMany` por id de
  // fila dejaría fuera lo que cree un caso nuevo. Las ubicaciones al final,
  // porque las cohortes y los eventos cuelgan de ellas.
  const ubicaciones = [hija?.id, madre?.id].filter(Boolean) as string[];
  if (ubicaciones.length === 0) return;
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  await prisma.harvestEventSource.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  await prisma.plantingEvent.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  // El lote va DESPUÉS de la cosecha —`resultingLotId` cuelga de él— y antes que
  // las ubicaciones.
  if (loteId) await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: loteId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) });
}, 30000);

describe("cohortes y eventos de producción enrollan (ADR-196)", () => {
  it("una cohorte sembrada en la microparcela aparece en la ficha de su madre", async () => {
    const cohorte = await prisma.plantingCohort.create({
      data: { locationId: hija.id, provenanceClass: "original_record" },
    });

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(ficha.cohorts.map((c) => c.id)).toContain(cohorte.id);
  });

  it("y la ficha de la HIJA no muestra las cohortes de su madre", async () => {
    const deLaMadre = await prisma.plantingCohort.create({
      data: { locationId: madre.id, provenanceClass: "original_record" },
    });

    const deLaHija = await getPlotDetail(usuario.userAccountId, hija.id);
    expect(deLaHija.cohorts.map((c) => c.id)).not.toContain(deLaMadre.id);

    // **CONTROL POSITIVO, y es lo que hace que la aserción de arriba mida.** Una
    // prueba que sólo comprueba que algo NO aparece pasa igual si la ficha
    // devuelve siempre una lista vacía. La misma cohorte SÍ sale en su madre.
    const deLaMadreOtraVez = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(deLaMadreOtraVez.cohorts.map((c) => c.id)).toContain(deLaMadre.id);
  });

  it("un evento «entró en producción» de la microparcela aparece en su madre", async () => {
    const cohorte = await prisma.plantingCohort.create({
      data: { locationId: hija.id, provenanceClass: "original_record" },
    });
    const evento = await prisma.plantingEvent.create({
      data: {
        locationId: hija.id,
        plantingCohortId: cohorte.id,
        eventType: "entered_production",
        occurredAt: new Date("2026-09-01"),
        provenanceClass: "original_record",
      },
    });

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(ficha.eventosDeProduccion.map((e) => e.id)).toContain(evento.id);
  });
});

describe("el rendimiento (ADR-196 §2.1: las áreas no se suman)", () => {
  it("una cosecha de la microparcela cuenta en la madre, y el divisor es el área de la MADRE", async () => {
    // Dos áreas distintas y a propósito: 2 en la madre, 1 en la hija. Si alguien
    // las sumara, el divisor sería 3 y la cifra cambiaría — eso es lo que esta
    // prueba existe para cazar. `areaHectares` NO se copia al crear el microlote,
    // así que cada una se pone aquí.
    await prisma.location.update({ where: { id: madre.id }, data: { areaHectares: 2 } });
    await prisma.location.update({ where: { id: hija.id }, data: { areaHectares: 1 } });

    // `Location.organizationId` es anulable y `Lot`/`HarvestEvent` la exigen. Se
    // afirma como precondición del montaje en vez de con un `!`: si el ayudante
    // cambiara y dejara de poner organización, esto lo dice por su nombre.
    const organizationId = madre.organizationId;
    if (organizationId == null) throw new Error("la parcela de prueba salió sin organización");

    const lote = await prisma.lot.create({
      data: {
        lotCode: `TEST-ENROLL-${Date.now()}`,
        lotType: "cherry",
        organizationId,
        locationId: madre.id,
      },
    });
    loteId = lote.id;
    // UNA cosecha con DOS aportes: uno de la madre y uno de la hija. El
    // rendimiento se lee por `HarvestEventSource` y no por `HarvestEvent.locationId`,
    // porque el segundo es el lote principal y una cosecha de varios bloques sólo
    // nombra uno ahí.
    const cosecha = await prisma.harvestEvent.create({
      data: {
        resultingLotId: lote.id,
        locationId: madre.id,
        organizationId,
        harvestedAt: new Date("2026-08-01T12:00:00Z"),
        provenanceClass: "original_record",
      },
    });
    await prisma.harvestEventSource.create({
      data: { harvestEventId: cosecha.id, locationId: madre.id, cherryWeightKg: 100 },
    });
    await prisma.harvestEventSource.create({
      data: { harvestEventId: cosecha.id, locationId: hija.id, cherryWeightKg: 40 },
    });

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    if (ficha.yield.status !== "ok") throw new Error(`se esperaba status ok, salió ${ficha.yield.status}`);

    // **El divisor: 2, el de la madre. Nunca 2+1.** La microparcela está DENTRO,
    // no al lado; sumarlas sería tratarla como una parte.
    expect(ficha.yield.hectares).toBe(2);
    // Y el numerador sí crece: los 140 kg de los dos aportes.
    expect(ficha.yield.years.find((y) => y.year === 2026)?.weighedKg).toBe(140);
    // §4: el mismo total, desarmable por origen.
    expect(ficha.rendimientoPorSeleccion.propio).toBe(100);
    expect(ficha.rendimientoPorSeleccion.porSeleccion).toEqual([
      { locationId: hija.id, nombre: hija.name, cherryWeightKg: 40 },
    ]);
  });
});

describe("especímenes: trampas y plantas enrollan (ADR-196)", () => {
  it("una trampa de la microparcela aparece en la ficha de su madre", async () => {
    const trampa = await prisma.specimen.create({
      data: {
        locationId: hija.id,
        specimenType: "trap",
        commonName: "TEST Trampa del enrollado",
        trapNumber: 7,
        provenanceClass: "original_record",
      },
    });

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(ficha.trampas.map((t) => t.id)).toContain(trampa.id);
  });

  it("una planta de la microparcela sale al pedir las plantas de su madre", async () => {
    const deLaHija = await prisma.specimen.create({
      data: {
        locationId: hija.id,
        specimenType: "plant",
        commonName: "TEST Caturra de la hija",
        status: "active",
        provenanceClass: "original_record",
      },
    });

    const desdeLaMadre = await listPlantSpecimens(usuario.userAccountId, madre.id);
    expect(desdeLaMadre.map((p) => p.id)).toContain(deLaHija.id);

    // **CONTROL POSITIVO, y es lo que hace que la aserción de arriba mida.** Una
    // planta de la MADRE no debe salir al pedir las de su HIJA: si saliera, el
    // enrollado iría en las dos direcciones y la aserción de arriba pasaría por
    // devolverlo todo, no por enrollar hacia abajo.
    const deLaMadre = await prisma.specimen.create({
      data: {
        locationId: madre.id,
        specimenType: "plant",
        commonName: "TEST Caturra de la madre",
        status: "active",
        provenanceClass: "original_record",
      },
    });
    const desdeLaHija = await listPlantSpecimens(usuario.userAccountId, hija.id);
    expect(desdeLaHija.map((p) => p.id)).toContain(deLaHija.id);
    expect(desdeLaHija.map((p) => p.id)).not.toContain(deLaMadre.id);
  });
});
