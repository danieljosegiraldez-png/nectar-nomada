/**
 * El «Historial» de la ficha del lote devuelve las filas de un lote REAL.
 *
 * **El defecto que lo motiva, medido el 2026-10-04 y vuelto a medir el
 * 2026-10-05** sobre una copia desechable de la base compartida
 * (`nectar_ci_historial`, 203 migraciones, 108 lotes, 6.484 filas de
 * `core.audit_event`). `getLotDetail` consultaba `entityId = lotId` para cinco
 * `entity_type` —`lot_transformation`, `measurement`, `lot_roast_profile`,
 * `quantity_event`, `harvest_event`— y **las cinco escrituras guardan el id del
 * PROPIO evento**: `transformation.id`, `creada.id`, `elegido.id`,
 * `quantityEvent.id`, `harvestEvent.id`. De las 1.792 filas de esos cinco
 * tipos, las que la ficha podía encontrar eran **0**. No «casi ninguna»: cero,
 * en los 108 lotes.
 *
 * **Y eran dos defectos complementarios, no uno.** El único `entity_type` que
 * sí se escribe con el id del lote —`"lot"`, que lleva `lot.release`,
 * `lot.assembled_from_receptions` y `lot.flag_conflicting_quantity`— **no se
 * consultaba**. Así que la liberación de un lote, que el comentario de
 * `liberarLote` llama «una autorización comercial sin rastro de quién la dio»,
 * tampoco salía en pantalla. Las 3 filas de la base cuyo `entity_id` es un lote
 * son exactamente ésas, y eran las que no se preguntaban.
 *
 * **Por qué este archivo y no ampliar el guardia que ya había.**
 * `tests/arquitectura/vocabulario-de-audit.test.ts` comprueba que todo
 * `entityType` que se lee lo escribe alguien, y pasaba — con razón: los cinco
 * tipos se escriben. Lo que no mira es el `entityId`, y **ninguna prueba hacía
 * que `getLotDetail().auditEvents` devolviera una sola fila**. Un guardia de
 * vocabulario no puede ver un id equivocado; éste llama a la función y cuenta
 * lo que vuelve.
 *
 * **Las cuatro mitades, y ninguna sobra:**
 *
 * 1. *Control positivo* — las filas existen en la tabla. Sin él, un `0` de
 *    `getLotDetail` se lee como «no se escribió nada» en vez de «la lectura no
 *    las encuentra», que es la confusión que dejó esto vivo meses.
 * 2. *El defecto* — `auditEvents` trae los dos hechos. Cae con el código de
 *    antes del 2026-10-05.
 * 3. *Aislamiento* — el historial de un lote **no** trae las filas de su
 *    hermano. Es la mitad que caza el arreglo perezoso: quitar el filtro de
 *    `entityId` y quedarse con el `entityType` pondría verdes la 1 y la 2 y
 *    convertiría el panel en el audit de toda la base.
 * 4. *Control negativo* — un lote sin hechos devuelve `[]`. Sin él, una lectura
 *    que devolviera todo pasaría la 2.
 *
 * Los dos hechos del fixture cubren las dos clases, no una por gusto: el evento
 * de cantidad es «tipo bueno, id del evento» y la liberación es «id del lote,
 * tipo que no se preguntaba».
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { createLot, getLotDetail, liberarLote } from "../../lib/traceability/lots";
import { recordQuantityEvent } from "../../lib/traceability/quantity";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `hist-${Date.now()}`;

let organizationId: string;
let projectId: string;
/**
 * `Farm Manager`, no `Platform Admin`, y no por comodidad: con ámbito de
 * plataforma `resolveLotVisibility` devuelve `mode: "all"` y los recuentos de
 * este archivo sumarían lo que otras suites tengan vivo en la base compartida
 * en ese instante. Es el defecto que `reporteDeProceso.test.ts` sufrió tres
 * veces. `Farm Manager` además es quien tiene `lot:release`, que `Farm
 * Operator` no tiene a propósito.
 */
let gerenteId: string;
/** El lote con hechos: un evento de cantidad y una liberación. */
let loteConHechos: string;
/** Su hermano, en el mismo proyecto y sin un solo hecho. */
let loteSinHechos: string;
/** El id del evento de cantidad — el que la escritura guarda como `entityId`. */
let eventoDeCantidadId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  projectId = (
    await prisma.project.create({
      data: { name: `TEST Historial (${RUN_ID})`, status: "approved", classification: "internal" },
    })
  ).id;

  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Gerente", displayName: `TEST Gerente (${RUN_ID})`, locale: "es" },
  });
  gerenteId = (
    await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })
  ).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } })) ??
    (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } }));
  await prisma.assignment.create({ data: { userAccountId: gerenteId, roleProfileId: perfil.id, scopeId: scope.id } });

  loteConHechos = (
    await createLot(gerenteId, { lotCode: `${RUN_ID}-con`, lotType: "green", organizationId, projectId })
  ).id;
  loteSinHechos = (
    await createLot(gerenteId, { lotCode: `${RUN_ID}-sin`, lotType: "green", organizationId, projectId })
  ).id;

  // Hecho 1 — la clase «tipo bueno, id del evento».
  eventoDeCantidadId = (
    await recordQuantityEvent(gerenteId, {
      provenanceClass: "measured_fact",
      lotId: loteConHechos,
      eventType: "received",
      quantity: 50,
      unit: "kg",
      occurredAt: new Date("2026-03-01"),
    })
  ).id;

  // Hecho 2 — la clase «id del lote, tipo que no se preguntaba».
  await liberarLote(gerenteId, loteConHechos);
}, 30000);

afterAll(async () => {
  const ids = [loteConHechos, loteSinHechos].filter(Boolean);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "lot", entityId: { in: ids } }) });
  await prisma.auditEvent.deleteMany({
    where: assertDefinedWhere({ entityType: "quantity_event", entityId: eventoDeCantidadId }),
  });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: ids } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: gerenteId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: gerenteId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

/** Las operaciones que `getLotDetail` devuelve para un lote, ordenadas. */
async function operacionesDelHistorial(lotId: string): Promise<string[]> {
  const detalle = (await getLotDetail(gerenteId, lotId)) as { auditEvents: Array<{ operation: string }> };
  return detalle.auditEvents.map((e) => e.operation).sort();
}

describe("el Historial de la ficha del lote", () => {
  /**
   * CONTROL POSITIVO. Mide la tabla directamente, sin pasar por la lectura bajo
   * prueba: si esto cae, el fixture no escribió y el resto del archivo no mide
   * nada. Va primero a propósito — es la fila patrón que se lee antes del
   * veredicto.
   */
  it("control positivo: los dos hechos SÍ dejaron su fila en core.audit_event", async () => {
    const porLaLiberacion = await prisma.auditEvent.count({
      where: { entityType: "lot", entityId: loteConHechos, operation: "lot.release" },
    });
    const porLaCantidad = await prisma.auditEvent.count({
      where: { entityType: "quantity_event", entityId: eventoDeCantidadId, operation: "quantity_event.create" },
    });
    expect(porLaLiberacion, "`liberarLote` no auditó: el fixture no está midiendo nada").toBe(1);
    expect(porLaCantidad, "`recordQuantityEvent` no auditó: el fixture no está midiendo nada").toBe(1);

    // Y la mitad que nombra el defecto: la fila del evento de cantidad NO está
    // guardada bajo el id del lote. Si algún día lo estuviera, esta línea lo
    // dice en vez de dejar que el arreglo de la lectura parezca innecesario.
    const bajoElIdDelLote = await prisma.auditEvent.count({
      where: { entityType: "quantity_event", entityId: loteConHechos },
    });
    expect(bajoElIdDelLote, "la escritura guarda el id del evento, no el del lote").toBe(0);
  }, 20000);

  /**
   * EL GUARDIA. Con el código de antes del 2026-10-05 esto devolvía `[]` y la
   * pantalla decía «este lote no tiene historial».
   */
  it("devuelve los hechos del lote: el evento de cantidad y la liberación", async () => {
    expect(await operacionesDelHistorial(loteConHechos)).toEqual(["lot.release", "quantity_event.create"]);
  }, 20000);

  /**
   * AISLAMIENTO. Ésta es la que caza el arreglo perezoso —quitar el filtro de
   * `entityId` y quedarse con el `entityType`—, que pondría verdes las dos de
   * arriba y convertiría el panel en el audit de la base entera.
   */
  it("y no trae las de otro lote: el hermano sin hechos devuelve nada", async () => {
    expect(await operacionesDelHistorial(loteSinHechos)).toEqual([]);
  }, 20000);

  /**
   * CONTROL NEGATIVO del aislamiento. El `[]` de arriba sólo significa algo si
   * la base tiene filas de esos mismos tipos que la consulta tuvo que
   * descartar. Sin esta línea, un `[]` se leería igual con una tabla vacía.
   */
  it("control negativo: la base sí tiene filas de esos tipos que la consulta descartó", async () => {
    const delMismoTipo = await prisma.auditEvent.count({
      where: { entityType: { in: ["lot", "quantity_event"] } },
    });
    expect(
      delMismoTipo,
      "sin filas de esos tipos en la base, el `[]` del hermano no demuestra aislamiento",
    ).toBeGreaterThan(2);
  }, 20000);
});
