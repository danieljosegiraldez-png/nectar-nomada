/**
 * Un formulario no debe ofrecer lo que el servicio va a negar.
 *
 * **El defecto (sexta revisión, 2026-09-05).** `getManageableContext` devolvía
 * las tres listas vacías tanto para «no hay dónde registrar» como para «tu
 * cuenta no puede registrar en ningún sitio», y las páginas pintaban los
 * formularios igual. En `/lots/new`, `organizationId` y `locationId` son
 * `<select required>` **sin opción de marcador**: con cero opciones el
 * formulario no se puede enviar y nada dice por qué. Lo mismo en
 * `/lots/[id]/storage/new`, que además se alcanza legítimamente —su guardia de
 * entrada, `getLotSummary`, pregunta por *ver*, no por *gestionar*—.
 *
 * No era un agujero: SECURITY.md §2 dice que la UI oculta por UX y que la
 * escritura se re-comprueba en el servidor, y así es. Era una pantalla
 * afirmando una oferta falsa.
 *
 * La cuenta que lo demuestra es `soloVer`: un `Project Viewer` con acceso real
 * al lote. Que `getLotList` le responda `sinAmbito: false` es el control
 * positivo —esta cuenta sí ve la superficie de lotes— y hace que el
 * `sinAmbito: true` de `getManageableContext` signifique «no puedes gestionar»
 * y no «esta cuenta no tiene nada».
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { getLotList, getManageableContext, puedeGestionarLote } from "../../lib/traceability/lots";
import { puedeGestionarAtributosDeUbicacion } from "../../lib/traceability/locations";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `formulario-${Date.now()}`;
let organizationId: string;
let plotId: string;
let sinAsignaciones: string;
let soloVer: string;
let gestiona: string;
let scopeId: string;
let loteId: string;

async function cuenta(label: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  return (await prisma.userAccount.create({
    data: { personId: p.id, authProvider: "credentials", status: "active" },
  })).id;
}

// El ámbito es único por (tipo, referencia): las dos cuentas comparten el
// mismo, y lo que las diferencia es el perfil, que es justo la variable bajo
// prueba.
async function asignar(userAccountId: string, perfil: string) {
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: rp.id, scopeId } });
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" } });
  organizationId = org.id;
  plotId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" } })).id;

  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;

  sinAsignaciones = await cuenta("SinAsignaciones");
  soloVer = await cuenta("SoloVer");
  gestiona = await cuenta("Gestiona");

  // `Project Viewer` concede `lot:view` y NO `lot:manage`; `Farm Operator`
  // concede los dos. Comprobado contra la base, no supuesto.
  await asignar(soloVer, "Project Viewer");
  await asignar(gestiona, "Farm Operator");

  loteId = (await prisma.lot.create({
    data: { lotCode: `TEST-${RUN_ID}`, lotType: "cherry", organizationId, locationId: plotId, createdBy: gestiona },
  })).id;
});

afterAll(async () => {
  const ids = [sinAsignaciones, soloVer, gestiona];
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: loteId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: plotId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("el contexto de registro dice si la cuenta puede registrar", () => {
  it("sin asignaciones: listas vacías Y marcadas como falta de ámbito", async () => {
    const context = await getManageableContext(sinAsignaciones);
    expect(context.organizations).toEqual([]);
    expect(context.plotLocations).toEqual([]);
    expect(context.sinAmbito, "la página necesita poder decir «no puedes registrar»").toBe(true);
  });

  /**
   * **El caso que hace que la bandera signifique algo.** Esta cuenta ve el
   * lote —el control positivo lo demuestra— y aun así no puede registrar nada.
   * Es quien llega a `/lots/[id]/storage/new` desde el botón «Mover
   * almacenamiento» y se encontraba un desplegable vacío.
   */
  it("puede VER el lote pero no gestionarlo: sin ámbito de registro", async () => {
    const lots = await getLotList(soloVer);
    expect(lots.sinAmbito, "control positivo: esta cuenta sí ve la superficie de lotes").toBe(false);

    const context = await getManageableContext(soloVer);
    expect(context.sinAmbito, "ve, pero no gestiona: el formulario no se le puede ofrecer").toBe(true);
    expect(context.locations, "las opciones del <select required> que quedaba vacío").toEqual([]);
    expect(context.organizations).toEqual([]);
  });

  it("con permiso de gestión: hay dónde registrar, y NO falta ámbito", async () => {
    const context = await getManageableContext(gestiona);
    expect(context.sinAmbito, "tiene permisos: el formulario sí se le puede ofrecer").toBe(false);
    expect(context.plotLocations.length, "y con opciones de verdad, no un desplegable vacío").toBeGreaterThan(0);
    expect(context.organizations.length).toBeGreaterThan(0);
  });
});

/**
 * Los dos ayudantes que la pantalla usa para decidir si ofrece un formulario.
 * Preguntan al MISMO guardia que la escritura: si divergieran, volvería el
 * defecto —una pantalla que ofrece lo que el servicio niega— por la puerta de
 * atrás, con la regla duplicada en dos sitios.
 */
describe("la pantalla pregunta al mismo guardia que la escritura", () => {
  it("quien sólo ve el lote no puede registrar en él", async () => {
    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: loteId } });
    expect(await puedeGestionarLote(soloVer, lot), "los 15 formularios de `lot:manage` no se le pueden ofrecer").toBe(false);
  });

  it("quien lo gestiona, sí — control positivo sobre el MISMO lote", async () => {
    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: loteId } });
    expect(await puedeGestionarLote(gestiona, lot), "si esto fuera false, el ayudante escondería la página a todo el mundo").toBe(true);
  });

  it("los atributos de ubicación son OTRO permiso, y por eso son otra pregunta", async () => {
    // `HarvestSourcesForm` exige `location:manage_attributes`, no `lot:manage`.
    // Colapsar las dos preguntas escondería el formulario a quien sí puede
    // usarlo, que es el defecto inverso al que arregla esta lente.
    expect(await puedeGestionarAtributosDeUbicacion(soloVer, plotId)).toBe(false);

    // Control positivo, sin el cual el `false` de arriba no prueba nada: podría
    // venir de que la ubicación no se encuentra y no de que falte el permiso.
    // `Farm Operator` SÍ concede `location:manage_attributes` —comprobado
    // contra la base—, y sobre la misma ubicación responde que sí.
    expect(await puedeGestionarAtributosDeUbicacion(gestiona, plotId)).toBe(true);
  });
});
