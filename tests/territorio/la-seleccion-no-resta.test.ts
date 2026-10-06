import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { createMicrolot } from "../../lib/traceability/locations";
import { getPlotDetail } from "../../lib/traceability/plantingCohorts";
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
  await prisma.plantingEvent.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
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
