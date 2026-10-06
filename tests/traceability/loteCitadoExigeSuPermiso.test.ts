/**
 * **El lote que una operación CITA exige su propio permiso.**
 * `PENDING_IMPLEMENTATIONS/005` — defecto confirmado por Daniel el 2026-10-04.
 *
 * **Qué pasaba.** `completeExternalCoffeeOrigin` autorizaba `sample:manage` sobre
 * el ámbito de la **muestra** y después leía el lote de `linkToLotId` **sólo para
 * comprobar que existe** —el valor se descartaba—. Con eso, quien puede gestionar
 * su propia muestra podía atarla a **cualquier lote de la base**, incluido uno de
 * otro proyecto que no puede ver. No filtraba datos del lote; lo que hacía era
 * **escribir el enlace** en el grafo de ese lote, sin que su dueño lo autorizara.
 *
 * Lo encontró la compuerta de la 005 cruzando, **por símbolo**, el permiso que
 * exige cada operación contra los modelos que toca: `completeExternalCoffeeOrigin`
 * tocaba `lot` exigiendo sólo `sample`.
 *
 * **Por qué este archivo y no `s1.test.ts`, donde viven las demás pruebas de esta
 * operación.** `s1.test.ts` está en el grupo `datos-reales` de
 * `scripts/pruebas-por-compuerta.txt`, y **CI no corre ese grupo** —necesita el
 * backup restaurado—. Una prueba escrita ahí no se ejecutaría nunca: un guardia
 * que nadie ejerce. Esto va al grupo `base-sembrada`, que sí corre.
 *
 * Y el actor tiene que ser un Farm Operator **acotado a un proyecto**: el de
 * `ro1.test.ts` está en ámbito de PLATAFORMA y ve todos los proyectos, así que
 * rechazaría nada y la prueba pasaría por el motivo equivocado.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { recordExternalCoffeeSample, completeExternalCoffeeOrigin } from "../../lib/traceability/samples";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `LCEP-${Date.now()}`;

/** Local, como en `ro1.test.ts`: no hay helper compartido para esto. */
async function crearCuenta(etiqueta: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
  });
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  personas.push(persona.id);
  return cuenta.id;
}

let organizationId: string;
let otraOrganizacionId: string;
let proyectoId: string;
let otroProyectoId: string;
let operarioId: string;
const muestras: string[] = [];
const lotes: string[] = [];
const ambitos: string[] = [];
const personas: string[] = [];

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const otra = await prisma.organization.create({
    data: {
      organizationType: "farm",
      name: `TEST LCEP Otra Finca (${RUN_ID})`,
      status: "approved",
      classification: "internal",
    },
  });
  otraOrganizacionId = otra.id;

  const proyecto = await prisma.project.create({
    data: { name: `TEST LCEP Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  proyectoId = proyecto.id;
  const otroProyecto = await prisma.project.create({
    data: { name: `TEST LCEP Otro Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  otroProyectoId = otroProyecto.id;

  // Farm Operator ACOTADO al primer proyecto: tiene `lot:view` y `sample:manage`,
  // pero sólo ahí. Es el actor que hace significativa la prueba.
  operarioId = await crearCuenta("Operario");
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const ambito = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: proyectoId } });
  ambitos.push(ambito.id);
  await prisma.assignment.create({
    data: { userAccountId: operarioId, roleProfileId: perfil.id, scopeId: ambito.id },
  });
});

afterAll(async () => {
  await prisma.externalCoffeeOrigin.deleteMany({ where: assertDefinedWhere({ sampleId: { in: muestras } }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: { in: muestras } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: operarioId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: operarioId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [proyectoId, otroProyectoId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: otraOrganizacionId }) });
  await deleteTestOrganizations(RUN_ID);
});

async function muestraPropia(sufijo: string) {
  const { sample } = await recordExternalCoffeeSample(operarioId, {
    sampleCode: `${RUN_ID}-${sufijo}`,
    sampleType: "green_coffee",
    projectId: proyectoId,
    producerOrganizationId: otraOrganizacionId,
    declaredProvenanceClass: "manufacturer_specification",
  });
  muestras.push(sample.id);
  return sample;
}

describe("completeExternalCoffeeOrigin y el lote que cita", () => {
  it("no ata la muestra a un lote de OTRO proyecto, que el operario no puede ver", async () => {
    const sample = await muestraPropia("ajeno");
    const ajeno = await prisma.lot.create({
      data: {
        lotCode: `${RUN_ID}-ajeno`,
        lotType: "green",
        organizationId: otraOrganizacionId,
        projectId: otroProyectoId,
      },
    });
    lotes.push(ajeno.id);

    await expect(
      completeExternalCoffeeOrigin(operarioId, { sampleId: sample.id, linkToLotId: ajeno.id }),
    ).rejects.toThrow(TraceabilityAccessError);

    // No basta con que lance: el enlace no puede haber quedado escrito.
    const intacta = await prisma.sample.findUniqueOrThrow({ where: { id: sample.id } });
    expect(intacta.sourceLotId, "la muestra no puede quedar atada al lote ajeno").toBeNull();
  });

  /**
   * **El control, y sin él lo de arriba no mide nada.** Un rechazo puede venir de
   * que el operario no pueda citar NINGÚN lote. Con un lote de su propio proyecto
   * el enlace tiene que funcionar.
   */
  it("y sí la ata a un lote de SU proyecto", async () => {
    const sample = await muestraPropia("propio");
    const propio = await prisma.lot.create({
      data: { lotCode: `${RUN_ID}-propio`, lotType: "green", organizationId, projectId: proyectoId },
    });
    lotes.push(propio.id);

    await completeExternalCoffeeOrigin(operarioId, { sampleId: sample.id, linkToLotId: propio.id });

    const atada = await prisma.sample.findUniqueOrThrow({ where: { id: sample.id } });
    expect(atada.sourceLotId).toBe(propio.id);
  });
});
