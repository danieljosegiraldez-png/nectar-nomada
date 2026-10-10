/**
 * «Nueva receta» se ofrece sólo a quien puede escribir recetas — Parte 2a, tarea 14 (2026-10-04), Ruling A y V16.
 *
 * `puedeCrearRecetaEnAlguna` (`lib/traceability/processTargets.ts`) decide si `/recipes` pinta el enlace de «Nueva receta». Hasta esta tarea preguntaba por
 * `edit_beneficio`, y el Farm Manager —que lo lleva de serie— lo veía y el servidor (`crearRecetaEnBorrador`) lo rechazaba: ofrecer y luego negar. Ahora pregunta con
 * `puedeAutoriaDeReceta`, la gemela de la regla de los servicios. Cada «no» lleva al lado el «sí» que pasa, para que no pase vacío; y el control que importa más es el del
 * Farm Manager: su respuesta de ayer era «sí» (`puedeEditarBeneficioEnOrganizacion`), así que el «no» de hoy es del cambio y no de una cuenta sin acceso a nada.
 *
 * **Lo que NO prueba, y se dice:** que un Coffee Process Manager de una finca, SIN `lot:manage`, llegue a `/recipes`. Ese camino pasa por las tres lecturas de la pantalla, que
 * aceptan también la autoría (Ruling C4), y lo prueba `tests/recetas/lecturasDeRecetas.test.ts` (también `puedeCrearRecetaEnAlguna` para ese perfil). Aquí
 * se prueba el predicado con perfiles que no necesitan esa ampliación: el Process Manager de plataforma, la persona con los dos perfiles (V14), el Farm Manager y el capataz.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { puedeAutoriaDeReceta } from "../../lib/recetas/autoria";
import { puedeEditarBeneficioEnOrganizacion } from "../../lib/traceability/locations";
import { puedeCrearRecetaEnAlguna } from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";

const RUN = `puedecrear-${Date.now()}`;
const cuentas = fabricaDeCuentas("PuedeCrear");
/** Cada organización, apenas se crea (F2-4): el `afterAll` no puede heredar las variables de un `beforeAll` que pudo morir a medias. */
const organizaciones: string[] = [];

let orgId: string;
let lugarId: string;
let gestor: string;
let jefe: string;
let capataz: string;
let ambos: string;

beforeAll(async () => {
  const org = await prisma.organization.create({ data: { name: `PUEDECREAR Org ${RUN}`, organizationType: "farm" } });
  orgId = org.id;
  organizaciones.push(org.id);
  const lugar = await prisma.location.create({
    data: { name: `TEST-PUEDECREAR-${randomUUID()}`, locationType: "site", classification: "internal", organizationId: org.id },
  });
  lugarId = lugar.id;
  await prisma.lot.create({
    data: { lotCode: `PUEDECREAR-${RUN}`, lotType: "cherry", organizationId: org.id, locationId: lugar.id, classification: "internal" },
  });
  gestor = await cuentas.cuenta("Coffee Process Manager", "plataforma");
  jefe = await cuentas.cuenta("Farm Manager", { locationId: lugarId });
  capataz = await cuentas.cuenta("Farm Operator", { locationId: lugarId });
  // La misma persona opera y escribe recetas (V14): el perfil de operario y el del Process Manager, los dos en su finca.
  ambos = await cuentas.cuenta("Farm Operator", { locationId: lugarId });
  const ambito = await prisma.scope.findFirstOrThrow({ where: { scopeType: "location", scopeRefId: lugarId }, select: { id: true } });
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Coffee Process Manager" }, select: { id: true } });
  await prisma.assignment.create({ data: { userAccountId: ambos, scopeId: ambito.id, roleProfileId: perfil.id } });
});

afterAll(async () => {
  // Las cuentas (y sus asignaciones, también la que se añadió a mano: la fábrica borra por cuenta, y el ámbito de la finca que creó) antes que la finca.
  await cuentas.limpiar();
  // Todo lo demás se DESCUBRE —por las organizaciones registradas al crearlas y por el RUN—, no se hereda de las variables del `beforeAll` (F2-4): si éste moría después de crear
  // la organización o la ubicación y antes de asignar el lote, `assertDefinedWhere([loteId])` abortaba la limpieza entera y dejaba esas filas. En orden de claves ajenas: lotes,
  // ubicaciones, organizaciones.
  const delRun = (await prisma.organization.findMany({ where: assertDefinedWhere({ name: { contains: RUN } }), select: { id: true } })).map((o) => o.id);
  const orgs = [...new Set([...organizaciones, ...delRun])];
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ OR: [{ organizationId: { in: orgs } }, { lotCode: { contains: RUN } }] }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ organizationId: { in: orgs } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs } }) });
  // Lo que quede es basura de ESTA corrida: se cuenta por el RUN y por las organizaciones, las mismas dos vías con las que se descubrió.
  expect(await prisma.organization.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.lot.count({ where: { OR: [{ organizationId: { in: orgs } }, { lotCode: { contains: RUN } }] } })).toBe(0);
  expect(await prisma.location.count({ where: { organizationId: { in: orgs } } })).toBe(0);
});

describe("puedeCrearRecetaEnAlguna sigue al permiso de autoría de recetas (V16)", () => {
  it("el Coffee Process Manager de plataforma sí", async () => {
    expect(await puedeCrearRecetaEnAlguna(gestor)).toBe(true);
  });

  it("la persona con los dos perfiles (operario y Process Manager) en su finca sí", async () => {
    expect(await puedeAutoriaDeReceta(ambos, orgId), "control: puede escribir recetas de su organización").toBe(true);
    expect(await puedeCrearRecetaEnAlguna(ambos)).toBe(true);
  });

  it("el Farm Manager NO: lleva edit_beneficio y lot:manage de serie, y el enlace ya no se le ofrece", async () => {
    // Control: lo que decía la pregunta de ayer. Con él, el «no» de abajo es del cambio y no de una cuenta sin acceso.
    expect(await puedeEditarBeneficioEnOrganizacion(jefe, orgId)).toBe(true);
    expect(await puedeCrearRecetaEnAlguna(jefe)).toBe(false);
  });

  it("un capataz NO", async () => {
    expect(await puedeCrearRecetaEnAlguna(capataz)).toBe(false);
  });
});
