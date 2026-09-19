import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  MAX_TANDA,
  areaM2,
  bandejasDeLaFinca,
  crearTipoDeBandeja,
  registrarBandejas,
  tiposDeBandeja,
} from "../../lib/equipos/bandejas";
import { puedeVerEquipo } from "../../lib/equipos/equipos";

/**
 * Tipos de bandeja y bandejas numeradas por finca (spec §4.2; Daniel,
 * 2026-09-18). El montaje es una organización de prueba con un sitio y dos
 * cuentas —Farm Manager, que tiene `edit_beneficio`, y Farm Operator, que no—,
 * siguiendo la forma de `tests/traceability/editarBeneficio.test.ts`.
 *
 * **La prueba de números exactos exige que sea la PRIMERA tanda de esa
 * organización.** Por eso cada `describe` que registra bandejas usa su propia
 * organización fresca, y la carrera usa otra más: si compartieran, el orden de
 * ejecución cambiaría los números esperados.
 */

const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = [];

// Corto a propósito: `crearTipoDeBandeja` rechaza un nombre de más de 60
// caracteres, y `TEST ${etiqueta} ${RUN} ${randomUUID()}` completo lo superaba.
function nombre(etiqueta: string) {
  return `TEST ${etiqueta}-${randomUUID().slice(0, 8)}`;
}

async function cuenta(etiqueta: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) },
  });
  personIds.push(person.id);
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  accountIds.push(account.id);
  return account.id;
}

/** `Scope` es único por (tipo, referencia): se reutiliza si otra cuenta de esta
 *  prueba ya lo creó sobre el mismo lugar, y sólo se borra el que creó esta corrida. */
async function asignar(userAccountId: string, perfil: "Farm Manager" | "Farm Operator", locationId: string) {
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!existente) scopeIds.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
}

/** Una organización de prueba fresca, con su sitio, un Farm Manager (edit_beneficio) y un Farm Operator (sin él). */
async function finca(etiqueta: string) {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre(`org-${etiqueta}`), status: "approved", classification: "internal" },
  });
  orgIds.push(org.id);
  const sitio = await prisma.location.create({
    data: { locationType: "site", name: nombre(`sitio-${etiqueta}`), organizationId: org.id, status: "approved", classification: "internal" },
  });
  locationIds.push(sitio.id);
  const gerente = await cuenta(`gerente-${etiqueta}`);
  const operario = await cuenta(`operario-${etiqueta}`);
  await asignar(gerente, "Farm Manager", sitio.id);
  await asignar(operario, "Farm Operator", sitio.id);
  return { org: org.id, sitio: sitio.id, gerente, operario };
}

/** El afterAll borra en el orden que exigen los FK RESTRICT: traslados, equipos, tipos, asignaciones y ámbitos, cuentas y personas, ubicaciones, organizaciones. */
afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { actorUserAccountId: { in: accountIds } } });
  const equipos = await prisma.equipment.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } });
  const equipoIds = equipos.map((e) => e.id);
  await prisma.equipmentTransfer.deleteMany({ where: { equipmentId: { in: equipoIds } } });
  await prisma.equipment.deleteMany({ where: { id: { in: equipoIds } } });
  await prisma.dryingTrayType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

// Compartidas por varios describes que sólo necesitan un tipo válido y uno
// «de otra organización» — ninguno de los dos llama a `registrarBandejas` con
// éxito, así que no les importa el orden de ejecución sobre la numeración.
let principal: Awaited<ReturnType<typeof finca>>;
let otra: Awaited<ReturnType<typeof finca>>;
beforeAll(async () => {
  principal = await finca("principal");
  otra = await finca("otra");
});

describe("tipos de bandeja", () => {
  it("4×2 pies se guarda en cm y da el área del plan de secado (0,743 m²); 2×2 da 0,372 m²", async () => {
    const { org, gerente } = principal;
    const t = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre("4x2"), ancho: 4, largo: 2, unidad: "ft" });
    const fila = await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: t.id } });
    expect(Number(fila.widthCm)).toBe(121.9); // 4 × 30,48 = 121,92 → un decimal
    expect(Number(fila.lengthCm)).toBe(61); // 2 × 30,48 = 60,96 → 61,0
    expect(fila.entryUnit).toBe("ft");
    // Dos comprobaciones distintas, que Codex separó:
    // (1) el área de lo GUARDADO, exacta: 121,9 × 61,0 / 10.000 = 0,74359 m²;
    expect(areaM2(fila)).toBeCloseTo(0.74359, 5);
    // (2) el control contra la fuente independiente (plan de secado §6, «0.743 m²»),
    //     con la tolerancia de su redondeo: el plan da tres decimales.
    expect(Math.abs(areaM2(fila) - 0.743)).toBeLessThan(0.001);
    const dos = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre("2x2"), ancho: 2, largo: 2, unidad: "ft" });
    const fila2 = await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: dos.id } });
    expect(areaM2(fila2)).toBeCloseTo(0.3721, 4); // 61,0 × 61,0
    expect(Math.abs(areaM2(fila2) - 0.372)).toBeLessThan(0.001); // plan de secado §6
  });

  it("rechaza medidas inválidas, nombre repetido y a quien no configura el beneficio", async () => {
    const { org, gerente, operario } = principal;
    for (const [ancho, largo] of [[0, 2], [2, -1], [Number.NaN, 2]] as const) {
      await expect(
        crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre(`x${ancho}`), ancho, largo, unidad: "ft" }),
      ).rejects.toThrow("datos_invalidos");
    }
    const repetido = nombre("Repetida");
    await crearTipoDeBandeja(gerente, { organizationId: org, nombre: repetido, ancho: 1, largo: 1, unidad: "ft" });
    await expect(
      crearTipoDeBandeja(gerente, { organizationId: org, nombre: repetido, ancho: 1, largo: 1, unidad: "ft" }),
    ).rejects.toThrow("nombre_repetido");
    await expect(
      crearTipoDeBandeja(operario, { organizationId: org, nombre: nombre("Del operario"), ancho: 1, largo: 1, unidad: "ft" }),
    ).rejects.toThrow();
  });
});

describe("bandejas numeradas por finca", () => {
  it("registrar en tanda da números consecutivos que siguen al último, con su alta en el sitio", async () => {
    const { org, sitio, gerente } = await finca("secuencia");
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre("Tanda"), ancho: 4, largo: 2, unidad: "ft" });
    const a = await registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 3 });
    const b = await registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 2 });
    // La organización de prueba es nueva: su primera bandeja es la 1.
    expect([...a.numeros, ...b.numeros]).toEqual(["B-001", "B-002", "B-003", "B-004", "B-005"]);
    const eq = await prisma.equipment.findMany({ where: { organizationId: org, trayNumber: { not: null } }, include: { transfers: true } });
    expect(eq.every((e) => e.kind === "vessel" && e.trayTypeId === tipo.id && e.transfers.length === 1 && e.transfers[0]!.toLocationId === sitio)).toBe(true);
  });

  it("dos tandas a la vez no repiten número", async () => {
    const { org, sitio, gerente } = await finca("carrera");
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre("Carrera"), ancho: 2, largo: 2, unidad: "ft" });
    const [x, y] = await Promise.all([
      registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 5 }),
      registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 5 }),
    ]);
    const todos = [...x.numeros, ...y.numeros];
    expect(new Set(todos).size).toBe(10);
  });

  it("rechaza tipo de otra organización, cantidad fuera de rango y a quien no configura", async () => {
    const { sitio, gerente, operario } = principal;
    const { org: otraOrg, gerente: gerenteDeOtra } = otra;
    const ajeno = await crearTipoDeBandeja(gerenteDeOtra, { organizationId: otraOrg, nombre: nombre("Ajeno"), ancho: 1, largo: 1, unidad: "ft" });
    await expect(registrarBandejas(gerente, { siteId: sitio, trayTypeId: ajeno.id, cantidad: 1 })).rejects.toThrow("tipo_de_otra_organizacion");
    const { org } = principal;
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre("Rangos"), ancho: 1, largo: 1, unidad: "ft" });
    for (const cantidad of [0, 1.5, MAX_TANDA + 1]) {
      await expect(registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad })).rejects.toThrow("datos_invalidos");
    }
    await expect(registrarBandejas(operario, { siteId: sitio, trayTypeId: tipo.id, cantidad: 1 })).rejects.toThrow("sin_acceso");
  });
});

describe("reglas de la bandeja en la base", () => {
  it("número y tipo sólo en recipientes, los dos juntos, el número único en la finca y > 0", async () => {
    const { org, gerente } = principal;
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre("Base"), ancho: 1, largo: 1, unidad: "ft" });
    const base = { organizationId: org, provenanceClass: "original_record" as const };
    await expect(prisma.equipment.create({ data: { ...base, name: "i", kind: "instrument", trayTypeId: tipo.id, trayNumber: 900 } })).rejects.toThrow(/equipment_bandeja_solo_recipiente/);
    await expect(prisma.equipment.create({ data: { ...base, name: "s", kind: "vessel", trayNumber: 901 } })).rejects.toThrow(/equipment_bandeja_tipo_y_numero/);
    await expect(prisma.equipment.create({ data: { ...base, name: "c", kind: "vessel", trayTypeId: tipo.id, trayNumber: 0 } })).rejects.toThrow(/equipment_tray_number_positivo/);
    await prisma.equipment.create({ data: { ...base, name: "ok", kind: "vessel", trayTypeId: tipo.id, trayNumber: 902 } }); // control
    // El índice es `equipment_numero_de_bandeja_unico`, pero Prisma normaliza un
    // P2002 a «Unique constraint failed on the fields: (...)» y NO conserva el
    // nombre del índice — a diferencia de los CHECK de arriba, cuyo mensaje crudo
    // de Postgres sí lo trae. Medido corriendo esta prueba: el brief asumía el
    // nombre del índice; se afirma sobre los campos, que es lo que Prisma expone.
    await expect(prisma.equipment.create({ data: { ...base, name: "dup", kind: "vessel", trayTypeId: tipo.id, trayNumber: 902 } })).rejects.toThrow(
      /Unique constraint failed.*organization_id.*tray_number/s,
    );
    const { org: otraOrg, gerente: gerenteDeOtra } = otra;
    const deOtra = await crearTipoDeBandeja(gerenteDeOtra, { organizationId: otraOrg, nombre: nombre("Otra"), ancho: 1, largo: 1, unidad: "ft" });
    await expect(prisma.equipment.create({ data: { ...base, name: "x", kind: "vessel", trayTypeId: deOtra.id, trayNumber: 903 } })).rejects.toThrow(/tipo de bandeja es de otra organizacion/);
    // Del lado del tipo: con bandejas no se muda de organización; sin ellas, sí.
    await expect(prisma.dryingTrayType.update({ where: { id: tipo.id }, data: { organizationId: otraOrg } })).rejects.toThrow(/con bandejas no cambia de organizacion/);
    const vacio = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre("Vacío"), ancho: 1, largo: 1, unidad: "ft" });
    expect((await prisma.dryingTrayType.update({ where: { id: vacio.id }, data: { organizationId: otraOrg } })).organizationId).toBe(otraOrg);
  });
});

/**
 * Hallazgo de la revisión del controlador: `bandejasDeLaFinca` no tenía
 * prueba propia. Cubre lo que hace por construcción —el `where` de
 * `bandejasVisibles` filtra `trayNumber: { not: null }`, así que una vasija
 * sin número queda fuera antes de llegar a `puedeVerEquipo`— y lo que decide
 * `puedeVerEquipo` en cada fila: el número, el tipo, y el lugar del ÚLTIMO
 * traslado (el sitio al registrarla; el nuevo lugar tras moverla).
 */
describe("bandejasDeLaFinca", () => {
  it("número, tipo y dónde está (el sitio; tras un traslado, el nuevo lugar); descarta lo que no es bandeja", async () => {
    const { org, sitio, gerente } = await finca("lista");
    const nombreTipo = nombre("Lista");
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombreTipo, ancho: 1, largo: 1, unidad: "ft" });
    const { numeros } = await registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 2 });

    // Un segundo sitio, con el mismo gerente asignado ahí también: sin esto,
    // `can()` no lo dejaría ver una bandeja movida fuera de su lugar de
    // siempre (el ámbito de un ROLE de location es de identidad exacta, no
    // hereda del árbol).
    const otroSitio = await prisma.location.create({
      data: { locationType: "site", name: nombre("otro-sitio-lista"), organizationId: org, status: "approved", classification: "internal" },
    });
    locationIds.push(otroSitio.id);
    await asignar(gerente, "Farm Manager", otroSitio.id);

    const segunda = await prisma.equipment.findFirstOrThrow({ where: { organizationId: org, name: numeros[1] } });
    await prisma.equipmentTransfer.create({
      data: { equipmentId: segunda.id, fromLocationId: sitio, toLocationId: otroSitio.id, occurredAt: new Date(), createdBy: gerente },
    });

    // Una vasija de la misma organización, sin tipo ni número: no es una
    // bandeja. `bandejasVisibles` la descarta por construcción (su `where`
    // exige `trayNumber: { not: null }`), no por visibilidad.
    const vasija = await prisma.equipment.create({
      data: { organizationId: org, name: nombre("Vasija"), kind: "vessel", classification: "internal", provenanceClass: "original_record" },
    });

    const [sitioRow, otroSitioRow] = await Promise.all([
      prisma.location.findUniqueOrThrow({ where: { id: sitio }, select: { name: true } }),
      prisma.location.findUniqueOrThrow({ where: { id: otroSitio.id }, select: { name: true } }),
    ]);

    const lista = await bandejasDeLaFinca(gerente, org);
    expect(lista.map((b) => b.id)).not.toContain(vasija.id);

    const primera = lista.find((b) => b.numero === numeros[0]);
    const segundaFila = lista.find((b) => b.numero === numeros[1]);
    expect(primera).toBeDefined();
    expect(segundaFila).toBeDefined();
    expect(primera!.tipo).toBe(nombreTipo);
    expect(segundaFila!.tipo).toBe(nombreTipo);
    // El primero se quedó en el sitio donde se registró; el segundo está donde
    // lo movió el traslado, no donde nació.
    expect(primera).toMatchObject({ dondeId: sitio, donde: sitioRow.name });
    expect(segundaFila).toMatchObject({ dondeId: otroSitio.id, donde: otroSitioRow.name });
    // En orden: B-001 antes que B-002, que es el orden por trayNumber que usa el servicio.
    expect(lista.map((b) => b.numero)).toEqual(numeros);
  });

  it("una bandeja `trade_secret` no aparece para un Farm Operator; el control es la que sí ve", async () => {
    const { org, sitio, gerente, operario } = await finca("visibilidad");
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: nombre("Visible"), ancho: 1, largo: 1, unidad: "ft" });
    const { numeros } = await registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 2 });

    const secreta = await prisma.equipment.findFirstOrThrow({ where: { organizationId: org, name: numeros[0] } });
    await prisma.equipment.update({ where: { id: secreta.id }, data: { classification: "trade_secret" } });
    const secretaActualizada = await prisma.equipment.findUniqueOrThrow({ where: { id: secreta.id } });

    // Primero, que el caso sea real: Farm Operator no tiene `classification:clear_trade_secret`.
    expect(await puedeVerEquipo(operario, secretaActualizada)).toBe(false);
    // Control positivo del mismo hecho: el mismo operario SÍ puede ver la otra
    // bandeja (internal, en su propio sitio).
    const visible = await prisma.equipment.findFirstOrThrow({ where: { organizationId: org, name: numeros[1] } });
    expect(await puedeVerEquipo(operario, visible)).toBe(true);

    const listaDelOperario = await bandejasDeLaFinca(operario, org);
    expect(listaDelOperario.map((b) => b.numero)).not.toContain(numeros[0]);
    expect(listaDelOperario.map((b) => b.numero)).toContain(numeros[1]);
  });
});

/**
 * Ruling 2 del controlador: el flip futuro 15. `tiposDeBandeja` tiene que
 * mirar `lugaresDeOrganizacion` —las propias de la organización MÁS sus
 * descendientes con `organizationId` nulo, que lo heredan— y no sólo las
 * propias. Si usara sólo las propias, un operario asignado justo en el hijo
 * sin organización no vería nada: éste es el caso que lo demuestra.
 */
describe("tiposDeBandeja hereda organización de un lugar hijo sin organización propia", () => {
  it("un operario asignado en el hijo ve los tipos; control: uno asignado en el sitio también", async () => {
    const org = await prisma.organization.create({
      data: { organizationType: "farm", name: nombre("org-herencia"), status: "approved", classification: "internal" },
    });
    orgIds.push(org.id);
    const sitio = await prisma.location.create({
      data: { locationType: "site", name: nombre("sitio-herencia"), organizationId: org.id, status: "approved", classification: "internal" },
    });
    locationIds.push(sitio.id);
    const hijo = await prisma.location.create({
      data: { locationType: "plot", name: nombre("hijo-herencia"), parentLocationId: sitio.id, organizationId: null, classification: "internal" },
    });
    locationIds.push(hijo.id);

    const gerente = await cuenta("gerente-herencia");
    await asignar(gerente, "Farm Manager", sitio.id);
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org.id, nombre: nombre("Herencia"), ancho: 1, largo: 1, unidad: "ft" });

    const operarioDelHijo = await cuenta("operario-hijo-herencia");
    await asignar(operarioDelHijo, "Farm Operator", hijo.id);
    expect((await tiposDeBandeja(operarioDelHijo, org.id)).map((t) => t.id)).toContain(tipo.id);

    // Control positivo: un operario asignado en el propio sitio (organización
    // propia, no heredada) también los ve. Sin este control, el paso de arriba
    // se cumpliría igual con una función que no ve nada para nadie.
    const operarioDelSitio = await cuenta("operario-sitio-herencia");
    await asignar(operarioDelSitio, "Farm Operator", sitio.id);
    expect((await tiposDeBandeja(operarioDelSitio, org.id)).map((t) => t.id)).toContain(tipo.id);
  });
});
