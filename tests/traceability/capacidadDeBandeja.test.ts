import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearTipoDeBandeja } from "../../lib/equipos/bandejas";
import { createLot } from "../../lib/traceability/lots";
import { PesajeError, capacidadDeTipo, pesajesDeTipo, registrarPesaje } from "../../lib/traceability/capacidadDeBandeja";

/**
 * `.rejects.toThrow("datos_invalidos")` es un `.includes()` sobre el mensaje.
 * Descubierto en esta ronda (F3): un `PesajeError` que SÍ se lanza a mano
 * tiene ese mensaje exacto y lo casa de verdad, pero un error de PRISMA trae
 * un fragmento del código fuente alrededor de la línea que falló — y esta
 * misma función tiene, dos líneas más arriba de la que revienta contra un
 * `CHECK`, un `throw new PesajeError("datos_invalidos")` de otra rama. El
 * fragmento cita esa línea, así que el `toThrow` de cadena la encuentra
 * IGUAL, aunque el error de verdad sea un `CHECK` de la base — el flip-test de
 * F3 pasaba en verde con la regla mutada por esto exacto. Se afirma el TIPO y
 * el mensaje EXACTO, que ningún fragmento de código ajeno puede imitar.
 */
async function rechazaConDatosInvalidos(promesa: Promise<unknown>) {
  await expect(promesa).rejects.toBeInstanceOf(PesajeError);
  try {
    await promesa;
    throw new Error("se esperaba que rechazara");
  } catch (error) {
    expect(error).toBeInstanceOf(PesajeError);
    expect((error as PesajeError).message).toBe("datos_invalidos");
  }
}
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/**
 * Tarea 4 del plan 2a de secado: el pesaje de bandeja cargada y la capacidad
 * por estado. El montaje sigue la forma de `tests/equipos/bandejas.test.ts`
 * (una organización de prueba con Farm Manager/Farm Operator), extendida con
 * dos sitios y una segunda organización (brief, paso 1):
 *
 * - `org`, con dos sitios A y B;
 * - `gerente`, Farm Manager en A (para crear el tipo de bandeja);
 * - `operario`, Farm Operator en A, dueño de `lotId` (creado con `createLot` en A);
 * - `vecino`, Farm Operator en B, dueño de `loteB`: misma organización, otro ámbito;
 * - `otraOrg`, con su propio lote `loteDeOtraOrg`.
 *
 * **Aislamiento por prueba**: `tipo4x2` se crea de nuevo en cada `it` (vía
 * `beforeEach`), porque la capacidad cuenta TODOS los pesajes vigentes del
 * tipo y un pesaje que sobreviviera de una prueba cambiaría la siguiente
 * (revisión de Codex del plan 2a).
 */

function nombre(etiqueta: string) {
  return `TEST ${etiqueta}-${randomUUID().slice(0, 8)}`;
}

const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = [];
const lotIds: string[] = [];
// Un tipo de bandeja nuevo por `it` (ver `beforeEach` abajo); se acumulan aquí
// para que el `afterAll` los limpie a todos, junto con sus pesajes.
const tipos: string[] = [];

async function cuenta(etiqueta: string) {
  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) } });
  personIds.push(person.id);
  const account = await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } });
  accountIds.push(account.id);
  return account.id;
}

/** `Scope` es único por (tipo, referencia): se reutiliza si otra cuenta de esta
 *  prueba ya lo creó sobre el mismo lugar (gerente y operario comparten sitio A). */
async function asignar(userAccountId: string, perfil: "Farm Manager" | "Farm Operator", locationId: string) {
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!existente) scopeIds.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
}

async function sitioDe(organizationId: string, etiqueta: string) {
  const sitio = await prisma.location.create({
    data: { locationType: "site", name: nombre(etiqueta), organizationId, status: "approved", classification: "internal" },
  });
  locationIds.push(sitio.id);
  return sitio.id;
}

let org: string;
let sitioA: string;
let sitioB: string;
let gerente: string;
let operario: string;
let vecino: string;
let lotId: string;
let loteB: string;
let otraOrg: string;
let loteDeOtraOrg: string;

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("org"), status: "approved", classification: "internal" },
  });
  org = organization.id;
  orgIds.push(org);
  sitioA = await sitioDe(org, "sitio-a");
  sitioB = await sitioDe(org, "sitio-b");

  gerente = await cuenta("gerente");
  await asignar(gerente, "Farm Manager", sitioA);
  operario = await cuenta("operario");
  await asignar(operario, "Farm Operator", sitioA);
  vecino = await cuenta("vecino");
  await asignar(vecino, "Farm Operator", sitioB);

  const lot = await createLot(operario, { lotCode: nombre("lote-a"), lotType: "drying", organizationId: org, locationId: sitioA });
  lotId = lot.id;
  lotIds.push(lotId);
  const lotB = await createLot(vecino, { lotCode: nombre("lote-b"), lotType: "drying", organizationId: org, locationId: sitioB });
  loteB = lotB.id;
  lotIds.push(loteB);

  const otra = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("otra-org"), status: "approved", classification: "internal" },
  });
  otraOrg = otra.id;
  orgIds.push(otraOrg);
  const sitioOtra = await sitioDe(otraOrg, "sitio-otra");
  const operarioDeOtra = await cuenta("operario-otra");
  await asignar(operarioDeOtra, "Farm Operator", sitioOtra);
  const lotOtra = await createLot(operarioDeOtra, { lotCode: nombre("lote-otra"), lotType: "drying", organizationId: otraOrg, locationId: sitioOtra });
  loteDeOtraOrg = lotOtra.id;
  lotIds.push(loteDeOtraOrg);
});

let tipo4x2: string;
beforeEach(async () => {
  tipo4x2 = (await crearTipoDeBandeja(gerente, { organizationId: org, nombre: `4×2 ${randomUUID()}`, ancho: 4, largo: 2, unidad: "ft" })).id;
  tipos.push(tipo4x2);
});

afterAll(async () => {
  // Primero los pesajes: la única puerta de borrado en las pruebas (paso 3 del brief).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL nn.limpieza_de_pruebas = 'on'`;
    await tx.dryingTrayWeighing.deleteMany({ where: assertDefinedWhere({ trayTypeId: { in: tipos } }) });
  });
  await prisma.dryingTrayType.deleteMany({ where: assertDefinedWhere({ id: { in: tipos } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: accountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: accountIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: accountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgIds } }) });
});

describe("capacidad", () => {
  it("sin pesajes: cereza sale ESTIMADA con la fuente del plan de secado (≈ 8,3 kg en 4×2); mucílago y lavado, SIN MEDIR y sin número", async () => {
    const cap = await capacidadDeTipo(operario, tipo4x2);
    const por = (e: string) => cap.estados.find((x) => x.estado === e)!;
    // Control del área (revisión de fix round 1): (1) el área de lo GUARDADO,
    // exacta — 121,9 × 61,0 cm / 10.000 = 0,74359 m² (bandeja 4×2 pies, redondeada
    // a un decimal por `crearTipoDeBandeja`); (2) contra la fuente independiente,
    // el plan de secado §6 dice «0,743 m²», con la tolerancia de su redondeo a tres
    // decimales. Mismo par de comprobaciones que `tests/equipos/bandejas.test.ts`.
    expect(cap.areaM2).toBeCloseTo(0.74359, 5);
    expect(Math.abs(cap.areaM2 - 0.743)).toBeLessThan(0.001);
    // Control contra la fuente independiente: el plan de secado §6 dice 8,3 kg por
    // bandeja 4×2 a 2,8 cm y 400 kg/m³.
    expect(por("CHERRY")).toMatchObject({ fuente: "estimado", pesajes: 0, densidadKgM3: 400, profundidadCm: 2.8 });
    expect(por("CHERRY").capacidadKg!).toBeCloseTo(8.3, 1);
    expect(por("CHERRY").fuenteDelEstimado).toMatch(/Drying Plan 2026-27/);
    for (const e of ["MUCILAGE_HONEY", "PARCHMENT"]) {
      expect(por(e)).toMatchObject({ fuente: "sin_medir", pesajes: 0, densidadKgM3: null, capacidadKg: null });
    }
  });

  it("con pesajes: la densidad sale de ellos y reemplaza al estimado; sólo en su estado", async () => {
    // Área GUARDADA: 121,9 × 61,0 cm = 0,74359 m² (no la 0,7432 exacta: se guarda a un decimal).
    // 0,74359 × 0,030 m = 0,0223077 m³; 9,0 kg / 0,0223077 = 403,45 kg/m³
    const p = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 9, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const cap = await capacidadDeTipo(operario, tipo4x2);
    const cereza = cap.estados.find((x) => x.estado === "CHERRY")!;
    expect(cereza).toMatchObject({ fuente: "medido", pesajes: 1, pesajeIds: [p.id], fuenteDelEstimado: null });
    expect(cereza.densidadKgM3!).toBeCloseTo(403.45, 1);
    expect(cereza.capacidadKg!).toBeCloseTo(9, 1); // a su propia profundidad medida
    expect(cap.estados.find((x) => x.estado === "PARCHMENT")!.fuente).toBe("sin_medir"); // no contagia a otro estado
  });

  it("una corrección supersede: el original deja de contar pero sigue existiendo", async () => {
    const malo = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "PARCHMENT", netKg: 99, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "PARCHMENT", netKg: 6, profundidadesCm: [3, 3, 3], occurredAt: new Date(), supersedesId: malo.id, correctionReason: "Se tecleó 99 por 9,9" });
    const lavado = (await capacidadDeTipo(operario, tipo4x2)).estados.find((x) => x.estado === "PARCHMENT")!;
    expect(lavado.pesajes).toBe(1);
    expect(lavado.capacidadKg!).toBeCloseTo(6, 1);
    expect((await prisma.dryingTrayWeighing.findUniqueOrThrow({ where: { id: malo.id } })).supersededAt).not.toBeNull();
  });

  it("rechaza datos inválidos, cada rechazo al lado de uno que entra", async () => {
    const base = { trayTypeId: tipo4x2, lotId, materialState: "CHERRY" as const, netKg: 8, profundidadesCm: [2.8, 2.8, 2.8], occurredAt: new Date() };
    for (const mal of [{ netKg: 0 }, { netKg: -1 }, { profundidadesCm: [3, 3] }, { profundidadesCm: [3, 3, 3, 3, 3] }, { profundidadesCm: [3, 0, 3] }, { materialState: "GREEN" as never }]) {
      await expect(registrarPesaje(operario, { ...base, ...mal })).rejects.toThrow(/datos_invalidos|estado_invalido/);
    }
    // Corrección sin razón, sobre un pesaje QUE EXISTE: con un id inventado, `updateMany`
    // daría 0 y lanzaría lo mismo aunque faltara la validación de la razón (Codex).
    const original = await registrarPesaje(operario, base); // también es el control de que `base` es válido
    await expect(registrarPesaje(operario, { ...base, supersedesId: original.id })).rejects.toThrow("datos_invalidos");
    expect((await prisma.dryingTrayWeighing.findUniqueOrThrow({ where: { id: original.id } })).supersededAt).toBeNull(); // sigue vigente
    expect((await registrarPesaje(operario, { ...base, supersedesId: original.id, correctionReason: "Profundidad mal leída" })).id).toBeTruthy();
  });

  it("A7: rechaza un redondeo silencioso de un HECHO medido — más decimales de los que la columna guarda", async () => {
    const base = { trayTypeId: tipo4x2, lotId, materialState: "CHERRY" as const, occurredAt: new Date() };
    // Profundidad: DECIMAL(5,1) — un decimal cabe, dos no. 2,85 truncaría en
    // silencio a 2,8 o 2,9 sin que nadie lo supiera; 0,04 (dos decimales) igual.
    await rechazaConDatosInvalidos(registrarPesaje(operario, { ...base, netKg: 8, profundidadesCm: [2.85, 2.8, 2.8] }));
    await rechazaConDatosInvalidos(registrarPesaje(operario, { ...base, netKg: 8, profundidadesCm: [0.04, 2.8, 2.8] }));
    // Control: 2,8 (un decimal) sí entra.
    expect((await registrarPesaje(operario, { ...base, netKg: 8, profundidadesCm: [2.8, 2.8, 2.8] })).id).toBeTruthy();
    // netKg: DECIMAL(10,3) — tres decimales caben, cuatro no.
    await rechazaConDatosInvalidos(registrarPesaje(operario, { ...base, netKg: 8.1234, profundidadesCm: [2.8, 2.8, 2.8] }));
    expect((await registrarPesaje(operario, { ...base, netKg: 8.123, profundidadesCm: [2.8, 2.8, 2.8] })).id).toBeTruthy(); // control
    // Rangos: DECIMAL(5,1) tope < 1000; DECIMAL(10,3) tope < 10^7.
    await rechazaConDatosInvalidos(registrarPesaje(operario, { ...base, netKg: 8, profundidadesCm: [1000, 2.8, 2.8] }));
    await rechazaConDatosInvalidos(registrarPesaje(operario, { ...base, netKg: 10_000_000, profundidadesCm: [2.8, 2.8, 2.8] }));
  });

  it("F3: la notación exponencial no engaña al contador de decimales", async () => {
    const base = { trayTypeId: tipo4x2, lotId, materialState: "CHERRY" as const, occurredAt: new Date() };
    // (5e-7).toString() es "5e-7" — sin punto, así que un contador de
    // caracteres tras el punto leía CERO decimales y dejaba pasar un número
    // muchísimo más fino que lo que DECIMAL(10,3)/(5,1) guardan.
    //
    // **`rechazaConDatosInvalidos`, no `.rejects.toThrow("datos_invalidos")`.**
    // Con la regla rota, esta llamada no la rechaza el guardia sino un CHECK de
    // la base (`drying_tray_weighing_peso_positivo`) — y el error de Prisma
    // imprime un fragmento del código fuente que, dos líneas antes de la que
    // revienta, tiene un `throw new PesajeError("datos_invalidos")` de OTRA
    // rama. `.toThrow("datos_invalidos")` es un `.includes()`: encontraba esa
    // cita y pasaba en verde con la regla mutada. Comprobado en esta misma
    // ronda: el flip de F3 no hacía caer esta prueba hasta este cambio.
    await rechazaConDatosInvalidos(registrarPesaje(operario, { ...base, netKg: 5e-7, profundidadesCm: [2.8, 2.8, 2.8] }));
    await rechazaConDatosInvalidos(registrarPesaje(operario, { ...base, netKg: 8, profundidadesCm: [1e-7, 2.8, 2.8] }));
    // Control: los valores que ya se aceptaban siguen aceptándose.
    expect((await registrarPesaje(operario, { ...base, netKg: 8.123, profundidadesCm: [2.8, 2.8, 2.8] })).id).toBeTruthy();
  });

  it("quien no gestiona el lote no pesa, ni corrige el pesaje de un lote que no gestiona", async () => {
    // B4 (revisión final del plan 2a): el error concreto, no un
    // `.rejects.toThrow()` desnudo — que pasaría igual con cualquier rechazo,
    // incluido uno por una razón completamente distinta.
    await expect(registrarPesaje(vecino, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() }))
      .rejects.toThrow(/no_lot_access/);
    // El vecino pesa SU lote; el operario intenta supersederlo presentando el suyo.
    const delVecino = await registrarPesaje(vecino, { trayTypeId: tipo4x2, lotId: loteB, materialState: "CHERRY", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    await expect(registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 7, profundidadesCm: [3, 3, 3], occurredAt: new Date(), supersedesId: delVecino.id, correctionReason: "x" }))
      .rejects.toThrow(/no_lot_access/);
    expect((await prisma.dryingTrayWeighing.findUniqueOrThrow({ where: { id: delVecino.id } })).supersededAt).toBeNull();
  });

  it("cada capacidad medida lleva a sus pesajes, y cada pesaje dice su lote sólo a quien lo ve", async () => {
    const mio = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const suyo = await registrarPesaje(vecino, { trayTypeId: tipo4x2, lotId: loteB, materialState: "CHERRY", netKg: 8.4, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const { visibles, ocultos } = await pesajesDeTipo(operario, tipo4x2, "CHERRY");
    expect(visibles.map((x) => x.id)).toEqual([mio.id]); // el suyo no sale: ni peso ni profundidades
    expect(visibles[0]!.lote).not.toBeNull();
    expect(ocultos).toBe(1); // pero cuenta, y la pantalla lo dice
    expect(suyo.id).toBeTruthy();
    // RULING A2 (revisión final del plan 2a): la capacidad se agrega SÓLO de lo
    // visible. Antes esta prueba esperaba `pesajes: 2` — contando el oculto en
    // la media —, que es justo la fuga que la revisión encontró: con UNA sola
    // lectura oculta, la "capacidad" salía igual a su `netKg` exacto.
    const cereza = (await capacidadDeTipo(operario, tipo4x2)).estados.find((x) => x.estado === "CHERRY")!;
    expect(cereza).toMatchObject({ fuente: "medido", pesajes: 1, pesajeIds: [mio.id], ocultos: 1 });
    expect(cereza.capacidadKg!).toBeCloseTo(8, 1); // el del operario, no la media con el del vecino
  });

  it("RULING A2: un único pesaje oculto no da número — sin_acceso, no medido", async () => {
    const suyo = await registrarPesaje(vecino, { trayTypeId: tipo4x2, lotId: loteB, materialState: "PARCHMENT", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const lavado = (await capacidadDeTipo(operario, tipo4x2)).estados.find((x) => x.estado === "PARCHMENT")!;
    expect(lavado).toMatchObject({ fuente: "sin_acceso", pesajes: 0, pesajeIds: [], capacidadKg: null, densidadKgM3: null, ocultos: 1 });
    expect(suyo.id).toBeTruthy();
  });

  it("F6b: el mismo caso con CHERRY — sin_acceso NUNCA cede el paso al estimado, aunque cereza sea el único estado con uno", async () => {
    // C-14/O-3: PARCHMENT no tiene estimado, así que la prueba de arriba pasaría
    // igual si `capacidadDeTipo` comprobara el estimado ANTES que `ocultos` —
    // el orden sólo se ve con CHERRY, que sí tiene uno.
    const suyo = await registrarPesaje(vecino, { trayTypeId: tipo4x2, lotId: loteB, materialState: "CHERRY", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const cereza = (await capacidadDeTipo(operario, tipo4x2)).estados.find((x) => x.estado === "CHERRY")!;
    expect(cereza).toMatchObject({ fuente: "sin_acceso", pesajes: 0, pesajeIds: [], capacidadKg: null, densidadKgM3: null, fuenteDelEstimado: null, ocultos: 1 });
    expect(suyo.id).toBeTruthy();
  });

  it("RULING A2 + B2: un visible y un oculto — la capacidad es la del visible, numéricamente, no una cuenta de dos", async () => {
    const mio = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "MUCILAGE_HONEY", netKg: 7.5, profundidadesCm: [4, 4, 4], occurredAt: new Date() });
    await registrarPesaje(vecino, { trayTypeId: tipo4x2, lotId: loteB, materialState: "MUCILAGE_HONEY", netKg: 99, profundidadesCm: [4, 4, 4], occurredAt: new Date() });
    const miel = (await capacidadDeTipo(operario, tipo4x2)).estados.find((x) => x.estado === "MUCILAGE_HONEY")!;
    expect(miel).toMatchObject({ fuente: "medido", pesajes: 1, pesajeIds: [mio.id], ocultos: 1 });
    // Si el oculto contaminara la media, 99 kg la dispararía muy por encima de 7,5.
    expect(miel.capacidadKg!).toBeCloseTo(7.5, 1);
  });

  it("B2: capacidad con dos pesajes visibles de peso y profundidad distintos — el número de la fórmula, no sólo el contador", async () => {
    // 0,74359 m² de área guardada (control ya usado arriba).
    const a = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const b = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 10, profundidadesCm: [4, 4, 4], occurredAt: new Date() });
    const cereza = (await capacidadDeTipo(operario, tipo4x2)).estados.find((x) => x.estado === "CHERRY")!;
    expect(cereza.pesajes).toBe(2);
    expect(new Set(cereza.pesajeIds)).toEqual(new Set([a.id, b.id]));
    // Densidad de cada uno: 8/(0.74359*0.03)=358.62..; 10/(0.74359*0.04)=336.24..
    // Densidad media = 347.43..; profundidad media = 3.5 cm.
    // capacidadKg = area * (profundidadMedia/100) * densidadMedia.
    const area = 0.74359;
    const densidadEsperada = (8 / (area * 0.03) + 10 / (area * 0.04)) / 2;
    const esperado = area * (3.5 / 100) * densidadEsperada;
    expect(cereza.densidadKgM3!).toBeCloseTo(densidadEsperada, 1);
    expect(cereza.profundidadCm!).toBeCloseTo(3.5, 5);
    expect(cereza.capacidadKg!).toBeCloseTo(esperado, 3);
    // Control: una implementación que sólo mirara la PRIMERA lectura como la
    // media daría 8, no el número de la fórmula — que aquí es distinto.
    expect(cereza.capacidadKg!).not.toBeCloseTo(8, 1);
  });
});

describe("reglas del pesaje en la base", () => {
  it("rechaza estado fuera del secado, 2 o 5 profundidades, profundidad 0, y editar el peso; acepta marcarlo superseded", async () => {
    const d = { trayTypeId: tipo4x2, lotId, netKg: 8, occurredAt: new Date(), provenanceClass: "measured_fact" as const };
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "GREEN", depthPointsCm: [3, 3, 3] } })).rejects.toThrow(/drying_tray_weighing_estado_de_secado/);
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "CHERRY", depthPointsCm: [3, 3] } })).rejects.toThrow(/drying_tray_weighing_tres_o_cuatro_puntos/);
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "CHERRY", depthPointsCm: [3, 0, 3] } })).rejects.toThrow(/drying_tray_weighing_profundidad_positiva/);
    const ok = await prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "CHERRY", depthPointsCm: [3, 3, 3] } }); // control
    await expect(prisma.dryingTrayWeighing.update({ where: { id: ok.id }, data: { netKg: 9 } })).rejects.toThrow(/pesaje no se edita/);
    expect((await prisma.dryingTrayWeighing.update({ where: { id: ok.id }, data: { supersededAt: new Date() } })).supersededAt).toBeTruthy();
  });

  it("B1: la única transición permitida es marcar superseded UNA vez, sola — no junto a otro cambio, no dos veces, no deshecha", async () => {
    const d = { trayTypeId: tipo4x2, lotId, materialState: "CHERRY" as const, netKg: 8, depthPointsCm: [3, 3, 3], occurredAt: new Date(), provenanceClass: "measured_fact" as const };
    // C-8 (revisión final del plan 2a): quitar la comparación `to_jsonb` de
    // `pesaje_inmutable` seguiría rechazando "sólo el peso" y aceptando "sólo
    // supersededAt" — hacía falta la combinación de los dos para distinguirlo.
    const junto = await prisma.dryingTrayWeighing.create({ data: d });
    await expect(prisma.dryingTrayWeighing.update({ where: { id: junto.id }, data: { netKg: 9, supersededAt: new Date() } })).rejects.toThrow(/pesaje no se edita/);
    expect((await prisma.dryingTrayWeighing.findUniqueOrThrow({ where: { id: junto.id } })).supersededAt).toBeNull(); // sigue vigente

    // Volver a marcar un pesaje YA superseded: rechazado.
    const dosVeces = await prisma.dryingTrayWeighing.create({ data: d });
    await prisma.dryingTrayWeighing.update({ where: { id: dosVeces.id }, data: { supersededAt: new Date() } }); // control: la primera vez sí entra
    await expect(prisma.dryingTrayWeighing.update({ where: { id: dosVeces.id }, data: { supersededAt: new Date() } })).rejects.toThrow(/pesaje no se edita/);

    // Deshacer un superseded (volver a NULL): rechazado.
    const deshacer = await prisma.dryingTrayWeighing.create({ data: d });
    await prisma.dryingTrayWeighing.update({ where: { id: deshacer.id }, data: { supersededAt: new Date() } });
    await expect(prisma.dryingTrayWeighing.update({ where: { id: deshacer.id }, data: { supersededAt: null } })).rejects.toThrow(/pesaje no se edita/);
  });

  it("los CHECK no dejan pasar un NULL: profundidad nula y corrección sin razón", async () => {
    // Por SQL directo: el cliente tipado no deja escribir un NULL dentro del array.
    const insertar = (profundidades: string, supersedes: string | null, razon: string | null) => prisma.$executeRawUnsafe(
      `INSERT INTO "traceability"."drying_tray_weighing" ("tray_type_id","lot_id","material_state","net_kg","depth_points_cm","occurred_at","provenance_class","supersedes_id","correction_reason")
       VALUES ($1::uuid,$2::uuid,'CHERRY',8,${profundidades},now(),'measured_fact',$3::uuid,$4)`,
      tipo4x2, lotId, supersedes, razon);
    await expect(insertar("ARRAY[3,NULL,3]::numeric[]", null, null)).rejects.toThrow(/tres_o_cuatro_puntos/);
    await expect(insertar("ARRAY[[3,3],[3,3]]::numeric[]", null, null)).rejects.toThrow(/tres_o_cuatro_puntos/);
    const base = await prisma.dryingTrayWeighing.create({ data: { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 8, depthPointsCm: [3, 3, 3], occurredAt: new Date(), provenanceClass: "measured_fact" } });
    await expect(insertar("ARRAY[3,3,3]::numeric[]", base.id, null)).rejects.toThrow(/correccion_con_razon/);
    expect(await insertar("ARRAY[3,3,3]::numeric[]", base.id, "control con razón")).toBe(1); // control positivo
  });

  it("sólo measured_fact, una organización, y no se borra; los padres no se mudan", async () => {
    const d = { trayTypeId: tipo4x2, lotId, materialState: "CHERRY" as const, netKg: 8, depthPointsCm: [3, 3, 3], occurredAt: new Date() };
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, provenanceClass: "original_record" } })).rejects.toThrow(/drying_tray_weighing_medido/);
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, lotId: loteDeOtraOrg, provenanceClass: "measured_fact" } })).rejects.toThrow(/mezcla organizaciones/);
    const p = await prisma.dryingTrayWeighing.create({ data: { ...d, provenanceClass: "measured_fact" } }); // control
    await expect(prisma.dryingTrayWeighing.delete({ where: { id: p.id } })).rejects.toThrow(/pesaje no se borra/);
    await expect(prisma.dryingTrayType.update({ where: { id: tipo4x2 }, data: { organizationId: otraOrg } })).rejects.toThrow(/no cambia de organizacion/);
    await expect(prisma.lot.update({ where: { id: lotId }, data: { organizationId: otraOrg } })).rejects.toThrow(/lote con pesajes de bandeja no cambia/);

    // Control positivo (revisión de fix round 1): un tipo y un lote SIN pesajes SÍ
    // se mudan de organización. Sin este control, un disparador que rechazara
    // SIEMPRE —tuviera pesajes el padre o no— pasaría las dos comprobaciones de
    // arriba igual de verde. Los ids se registran para la limpieza ANTES de la
    // mutación, así que quedan cubiertos por el `afterAll` aunque una aserción de
    // aquí abajo fallara.
    const tipoSinPesajes = (await crearTipoDeBandeja(gerente, { organizationId: org, nombre: `sin-pesajes ${randomUUID()}`, ancho: 1, largo: 1, unidad: "ft" })).id;
    tipos.push(tipoSinPesajes);
    const loteSinPesajes = (await createLot(operario, { lotCode: nombre("lote-sin-pesajes"), lotType: "drying", organizationId: org, locationId: sitioA })).id;
    lotIds.push(loteSinPesajes);
    expect((await prisma.dryingTrayType.update({ where: { id: tipoSinPesajes }, data: { organizationId: otraOrg } })).organizationId).toBe(otraOrg);
    expect((await prisma.lot.update({ where: { id: loteSinPesajes }, data: { organizationId: otraOrg } })).organizationId).toBe(otraOrg);
  });

  it("A8: un original se supersede a lo sumo una vez, y la corrección debe ser del mismo tipo de bandeja", async () => {
    const original = await prisma.dryingTrayWeighing.create({
      data: { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 8, depthPointsCm: [3, 3, 3], occurredAt: new Date(), provenanceClass: "measured_fact" },
    });
    const primeraCorreccion = await prisma.dryingTrayWeighing.create({
      data: { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 7.9, depthPointsCm: [3, 3, 3], occurredAt: new Date(), provenanceClass: "measured_fact", supersedesId: original.id, correctionReason: "control" },
    });
    expect(primeraCorreccion.id).toBeTruthy();
    // Índice único: un segundo sustituto del MISMO original se rechaza.
    await expect(prisma.dryingTrayWeighing.create({
      data: { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 7.8, depthPointsCm: [3, 3, 3], occurredAt: new Date(), provenanceClass: "measured_fact", supersedesId: original.id, correctionReason: "segunda" },
    })).rejects.toThrow(/Unique constraint failed|drying_tray_weighing_supersedes_unico/);

    // La corrección debe ser del MISMO tipo que el original que dice suplantar.
    const otroTipo = (await crearTipoDeBandeja(gerente, { organizationId: org, nombre: `otro-tipo ${randomUUID()}`, ancho: 1, largo: 1, unidad: "ft" })).id;
    tipos.push(otroTipo);
    const original2 = await prisma.dryingTrayWeighing.create({
      data: { trayTypeId: tipo4x2, lotId, materialState: "PARCHMENT", netKg: 8, depthPointsCm: [3, 3, 3], occurredAt: new Date(), provenanceClass: "measured_fact" },
    });
    await expect(prisma.dryingTrayWeighing.create({
      data: { trayTypeId: otroTipo, lotId, materialState: "PARCHMENT", netKg: 8, depthPointsCm: [3, 3, 3], occurredAt: new Date(), provenanceClass: "measured_fact", supersedesId: original2.id, correctionReason: "de otro tipo" },
    })).rejects.toThrow(/mismo tipo de bandeja/);
    // Control: del MISMO tipo, entra.
    expect((await prisma.dryingTrayWeighing.create({
      data: { trayTypeId: tipo4x2, lotId, materialState: "PARCHMENT", netKg: 7.9, depthPointsCm: [3, 3, 3], occurredAt: new Date(), provenanceClass: "measured_fact", supersedesId: original2.id, correctionReason: "del mismo tipo" },
    })).id).toBeTruthy();
  });
});
