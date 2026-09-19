import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { actualizarUbicacionDeSecado, crearUbicacionDeSecado, detalleInstalacion } from "../../lib/traceability/instalaciones";
import { ampliarEstante, crearEstante, EstanteError, MAX_NIVELES, MAX_PUESTOS } from "../../lib/traceability/estantes";
import { opcionesParaInspeccion } from "../../lib/traceability/samplingEvents";

// Mismo montaje que tests/traceability/instalaciones.test.ts: `sitio()`,
// `cuenta()`, `nombre()` y su limpieza, copiados de allí y ampliados con el
// borrado de posiciones y estantes — primero las posiciones, después los
// estantes, antes de la instalación y del sitio.
const names: string[] = [];
const accountIds: string[] = [];
const personIds: string[] = [];
const scopeIds: string[] = [];
// `crearEstante` recibe SU PROPIO nombre de estante ("Estante 1", "E"…), que no
// pasa por `nombre()` — y las posiciones que genera solo ("N4 · P3") tampoco.
// Ninguno de los dos queda atrapado por el filtro `name: { in: names }` de
// abajo, así que los estantes creados por el servicio se rastrean por id.
const rackIds: string[] = [];
function nombre() { const n = `TEST-EST-${randomUUID()}`; names.push(n); return n; }
function id(ids: string[]) { const value = randomUUID(); ids.push(value); return value; }
async function sitio() {
  return prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal" } });
}
async function cuenta(locationId?: string, perfil: "Farm Manager" | "Farm Operator" = "Farm Manager") {
  const personId = id(personIds);
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "Estantes", displayName: personId } });
  const userAccountId = id(accountIds);
  await prisma.userAccount.create({ data: { id: userAccountId, personId, status: "active", authProvider: "credentials" } });
  if (locationId) {
    const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
    const scopeId = existente?.id ?? id(scopeIds);
    if (!existente) {
      await prisma.scope.create({ data: { id: scopeId, scopeType: "location", scopeRefId: locationId } });
    }
    await prisma.assignment.create({ data: { userAccountId, scopeId, roleProfileId: profile.id } });
  }
  return userAccountId;
}
/** El caso «sin edit_beneficio»: Farm Operator tiene `manage_attributes` pero
 *  no `edit_beneficio` (tests/traceability/editarBeneficio.test.ts línea 27-35).
 *  `instalaciones.test.ts` no tiene una ayuda con este nombre — usa `cuenta(id,
 *  "Farm Operator")` directamente —, así que aquí se escribe con el mismo
 *  montaje, sin ninguna concesión adicional. */
async function cuentaSinConcesion(locationId: string) {
  return cuenta(locationId, "Farm Operator");
}
afterEach(async () => {
  const where = { name: { in: names } };
  const rows = await prisma.location.findMany({ where, select: { id: true } });
  const auditWhere = { entityType: "location", entityId: { in: [...rows.map((r) => r.id), ...rackIds] } };
  await prisma.auditEvent.deleteMany({ where: auditWhere });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  // Primero las POSICIONES de los estantes rastreados por id (sus nombres no
  // pasan por `nombre()`, así que `where` no las ve), después esos estantes.
  if (rackIds.length) await prisma.location.deleteMany({ where: { parentLocationId: { in: rackIds } } });
  if (rackIds.length) await prisma.location.deleteMany({ where: { id: { in: rackIds } } });
  // Hijos antes que padres para lo rastreado por nombre: las POSICIONES
  // (drying_bed hijas de un estante) antes que los ESTANTES, antes que la
  // instalación, antes que el sitio.
  for (const locationType of ["drying_bed", "drying_rack", "drying_facility", "site"] as const) {
    await prisma.location.deleteMany({ where: { ...where, locationType } });
  }
  expect(await prisma.location.count({ where })).toBe(0);
  expect(await prisma.location.count({ where: { id: { in: rackIds } } })).toBe(0);
  expect(await prisma.auditEvent.count({ where: auditWhere })).toBe(0);
  expect(await prisma.userAccount.count({ where: { id: { in: accountIds } } })).toBe(0);
  expect(await prisma.person.count({ where: { id: { in: personIds } } })).toBe(0);
  expect(await prisma.scope.count({ where: { id: { in: scopeIds } } })).toBe(0);
  for (const ids of [names, accountIds, personIds, scopeIds, rackIds]) ids.length = 0;
});

describe("estantes", () => {
  it("crear un estante de 6 niveles × 6 puestos crea sus 36 posiciones, como un estante del cuarto oscuro I", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility", dryingEnvironment: "dark_room_climate_controlled" });
    const { id, creadas } = await crearEstante(actor, { facilityId: cuarto.id, nombre: "Estante 1", niveles: 6, puestos: 6 });
    rackIds.push(id);
    expect(creadas).toBe(36);
    const pos = await prisma.location.findMany({ where: { parentLocationId: id } });
    expect(pos).toHaveLength(36);
    expect(pos.every((p) => p.locationType === "drying_bed" && p.organizationId === cuarto.organizationId)).toBe(true);
    expect(pos.find((p) => p.rackLevel === 4 && p.rackSlot === 3)?.name).toBe("N4 · P3");
    const detalle = await detalleInstalacion(actor, cuarto.id);
    expect(detalle.estantes).toEqual([expect.objectContaining({ id, niveles: 6, puestos: 6 })]);
    expect(detalle.camas).toEqual([]); // las posiciones NO salen como camas sueltas
  });

  it("ampliar crea sólo lo que falta; reducir se rechaza; nada se borra", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    const { id } = await crearEstante(actor, { facilityId: cuarto.id, nombre: "Estante 1", niveles: 2, puestos: 3 });
    rackIds.push(id);
    expect((await ampliarEstante(actor, { rackId: id, niveles: 3, puestos: 4 })).creadas).toBe(12 - 6);
    expect(await prisma.location.count({ where: { parentLocationId: id } })).toBe(12);
    await expect(ampliarEstante(actor, { rackId: id, niveles: 2, puestos: 4 })).rejects.toThrow("estante_no_se_reduce");
    expect(await prisma.location.count({ where: { parentLocationId: id } })).toBe(12);
  });

  it("valida sus números, cada rechazo al lado de uno que entra", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    const invalidos: [number, number][] = [[0, 1], [1, 0], [1.5, 2], [MAX_NIVELES + 1, 1], [1, MAX_PUESTOS + 1]];
    for (const [niveles, puestos] of invalidos) {
      await expect(crearEstante(actor, { facilityId: cuarto.id, nombre: "E", niveles, puestos })).rejects.toThrow("datos_invalidos");
    }
    await expect(crearEstante(actor, { facilityId: cuarto.id, nombre: "  ", niveles: 1, puestos: 1 })).rejects.toThrow("datos_invalidos");
    await expect(crearEstante(actor, { facilityId: parent.id, nombre: "E", niveles: 1, puestos: 1 })).rejects.toThrow("tipo_invalido"); // un sitio no lleva estantes
    const exitoso = await crearEstante(actor, { facilityId: cuarto.id, nombre: "E", niveles: MAX_NIVELES, puestos: 1 });
    rackIds.push(exitoso.id);
    expect(exitoso.creadas).toBe(MAX_NIVELES);
  });

  it("sin edit_beneficio no se crea ni se amplía", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    const { id } = await crearEstante(actor, { facilityId: cuarto.id, nombre: "E", niveles: 1, puestos: 1 });
    rackIds.push(id);
    const ajeno = await cuentaSinConcesion(parent.id); // la de instalaciones.test.ts: manage_attributes sin edit_beneficio
    await expect(crearEstante(ajeno, { facilityId: cuarto.id, nombre: "E2", niveles: 1, puestos: 1 })).rejects.toThrow();
    await expect(ampliarEstante(ajeno, { rackId: id, niveles: 2, puestos: 1 })).rejects.toThrow();
  });
});

describe("ruling 2: la visibilidad de un estante es POR ESTANTE, no por instalación (flip 14)", () => {
  it("en una instalación interna, un Farm Operator ve el estante interno con sus posiciones y no ve el confidencial", async () => {
    const parent = await sitio();
    const dueño = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(dueño, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    expect(cuarto.classification).toBe("internal");
    const { id: interno } = await crearEstante(dueño, { facilityId: cuarto.id, nombre: "Interno", niveles: 2, puestos: 2 });
    const { id: confidencial } = await crearEstante(dueño, { facilityId: cuarto.id, nombre: "Confidencial", niveles: 2, puestos: 2 });
    rackIds.push(interno, confidencial);
    // Farm Operator tiene `classification:clear_internal` pero no
    // `clear_confidential` (lib/rbac/catalog.ts) — así que este estante, y sólo
    // él, se le esconde sin tocar el permiso de la instalación que lo contiene.
    await prisma.location.update({ where: { id: confidencial }, data: { classification: "confidential" } });

    const operador = await cuenta(parent.id, "Farm Operator");
    const detalle = await detalleInstalacion(operador, cuarto.id);

    // Control positivo: sin este estante en la lista, `estantes: []` habría
    // pasado la aserción de abajo igual de bien y no habría probado nada.
    const visto = detalle.estantes.find((e) => e.id === interno);
    expect(visto).toBeDefined();
    expect(visto?.posiciones).toHaveLength(4);
    expect(detalle.estantes.find((e) => e.id === confidencial)).toBeUndefined();
  });
});

describe("la sombra de una posición conserva su nivel y su puesto", () => {
  it("actualizarUbicacionDeSecado ignora lo que traiga el formulario y conserva rackLevel/rackSlot", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    const { id } = await crearEstante(actor, { facilityId: cuarto.id, nombre: "E", niveles: 2, puestos: 2 });
    rackIds.push(id);
    const posicion = await prisma.location.findFirstOrThrow({ where: { parentLocationId: id, rackLevel: 2, rackSlot: 1 } });
    const actualizada = await actualizarUbicacionDeSecado(actor, {
      locationId: posicion.id, name: posicion.name,
      // Un `rackLevel` distinto en el formulario no debe moverse a la base:
      // la posición lo conserva del ANTES, no del formulario.
      rackLevel: 1, shadePercentage: "pct_50", shadeDescription: "Bajo el techo del secador",
    });
    expect(actualizada).toMatchObject({ rackLevel: 2, rackSlot: 1, shadePercentage: "pct_50", shadeDescription: "Bajo el techo del secador" });
  });
});

describe("reglas del estante en la base", () => {
  it("un estante sólo cuelga de una instalación; una posición de estante lleva nivel y puesto y no se repite", async () => {
    const s = await sitio();
    const inv = await prisma.location.create({ data: { name: nombre(), locationType: "drying_facility", parentLocationId: s.id } });
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_rack", parentLocationId: s.id } })).rejects.toThrow(/estante debe colgar de una instalacion/);
    const rack = await prisma.location.create({ data: { name: nombre(), locationType: "drying_rack", parentLocationId: inv.id } }); // control
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: rack.id, rackLevel: 1 } })).rejects.toThrow(/nivel y puesto/);
    await prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: rack.id, rackLevel: 1, rackSlot: 1 } }); // control
    // Prisma envuelve la violación del índice parcial en un P2002 y reescribe
    // el mensaje con las COLUMNAS (del DETAIL de Postgres), no con el nombre
    // del índice — `location_posicion_unica` no aparece nunca en el texto que
    // llega aquí. Mismo patrón que ya usa `tests/equipos/marcasDeRevision.test.ts`
    // para el mismo código.
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: rack.id, rackLevel: 1, rackSlot: 1 } }))
      .rejects.toMatchObject({ code: "P2002" });
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: rack.id, rackLevel: 1, rackSlot: 0 } })).rejects.toThrow(/location_rack_slot_positivo/);
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: inv.id, rackSlot: 2 } })).rejects.toThrow(/puesto solo en una posicion de estante/);
  });

  it("del lado del padre: una instalación con estantes y un estante con posiciones no cambian de tipo; sin hijos, sí", async () => {
    const s = await sitio();
    const inv = await prisma.location.create({ data: { name: nombre(), locationType: "drying_facility", parentLocationId: s.id } });
    const rack = await prisma.location.create({ data: { name: nombre(), locationType: "drying_rack", parentLocationId: inv.id } });
    await prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: rack.id, rackLevel: 1, rackSlot: 1 } });
    await expect(prisma.location.update({ where: { id: inv.id }, data: { locationType: "site" } })).rejects.toThrow(/instalacion con estantes no cambia de tipo/);
    await expect(prisma.location.update({ where: { id: rack.id }, data: { locationType: "drying_facility" } })).rejects.toThrow(/estante con posiciones no cambia de tipo/);
    // Control: una instalación SIN estantes sí puede cambiar (lo que el árbol ya permitía).
    const sola = await prisma.location.create({ data: { name: nombre(), locationType: "drying_facility", parentLocationId: s.id } });
    expect((await prisma.location.update({ where: { id: sola.id }, data: { locationType: "site" } })).locationType).toBe("site");
  });
});

describe("la inspección de hoy no ofrece posiciones de estante", () => {
  it("opcionesParaInspeccion lista las camas sueltas y no las 36 posiciones", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const patio = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    const cama = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: patio.id, locationType: "drying_bed" });
    const { id } = await crearEstante(actor, { facilityId: patio.id, nombre: "E", niveles: 6, puestos: 6 });
    rackIds.push(id);
    const ids = (await opcionesParaInspeccion(actor)).camas.map((c) => c.id);
    expect(ids).toContain(cama.id); // control positivo
    const posiciones = (await prisma.location.findMany({ where: { parentLocationId: id } })).map((p) => p.id);
    expect(ids.filter((x) => posiciones.includes(x))).toEqual([]);
  });
});
