/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 1–4). El
 * lote de biochar. Postgres real, sin mocks, como el resto de la suite.
 *
 * RBAC: `location:manage_attributes` contra la Location donde el lote se
 * PRODUJO, concedido por una Assignment de Farm Operator con ámbito de
 * location — el mismo patrón de F1 y de las cohortes de siembra.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { LocationAccessError } from "../../lib/traceability/locations";
import {
  BiocharBatchValidationError,
  computeBatchAgingDays,
  createBiocharBatch,
  getBiocharBatch,
  listBiocharBatchesForLocation,
  updateBiocharBatch,
} from "../../lib/traceability/biocharBatches";
import {
  correctMeasurement,
  MeasurementValidationError,
  recordMeasurement,
} from "../../lib/traceability/measurements";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `biochar-${Date.now()}`;

let organizationId: string;
let locationId: string;
let otherLocationId: string;
let authorizedUserAccountId: string;
let wrongLocationUserAccountId: string;
let batchId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, locationRefId: string) {
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationRefId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const site = await prisma.location.create({
    data: { locationType: "site", name: `TEST Beneficio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = site.id;

  const other = await prisma.location.create({
    data: { locationType: "site", name: `TEST Otro sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otherLocationId = other.id;

  authorizedUserAccountId = await createTestUserAccount("BiocharOperator");
  await assignFarmOperator(authorizedUserAccountId, locationId);

  wrongLocationUserAccountId = await createTestUserAccount("BiocharWrongSite");
  await assignFarmOperator(wrongLocationUserAccountId, otherLocationId);
});

afterAll(async () => {
  // Las mediciones primero: apuntan al lote, y borrar el lote antes dejaría
  // el FK colgando (ON DELETE SET NULL) y filas TEST sin sujeto en la base.
  const lotes = await prisma.biocharBatch.findMany({
    where: assertDefinedWhere({ producedAtLocationId: { in: [locationId, otherLocationId] } }),
    select: { id: true },
  });
  await prisma.measurement.deleteMany({
    where: assertDefinedWhere({ biocharBatchId: { in: lotes.map((l) => l.id) } }),
  });
  await prisma.biocharBatch.deleteMany({
    where: assertDefinedWhere({ producedAtLocationId: { in: [locationId, otherLocationId] } }),
  });
  const userAccountIds = [authorizedUserAccountId, wrongLocationUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [locationId, otherLocationId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [locationId, otherLocationId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("createBiocharBatch", () => {
  it("rechaza a quien no tiene acceso al sitio de producción", async () => {
    // La frontera es el servicio, no el formulario (SECURITY.md §2): este
    // llamador no pasa por ninguna pantalla y aun así debe ser rechazado.
    await expect(
      createBiocharBatch(wrongLocationUserAccountId, {
        batchCode: "LN-BC-2026-999",
        organizationId,
        producedAtLocationId: locationId,
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rechaza un código vacío o de sólo espacios", async () => {
    await expect(
      createBiocharBatch(authorizedUserAccountId, {
        batchCode: "   ",
        organizationId,
        producedAtLocationId: locationId,
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(BiocharBatchValidationError);
  });

  it("rechaza un tiempo a pico mayor que la quema entera", async () => {
    await expect(
      createBiocharBatch(authorizedUserAccountId, {
        batchCode: "LN-BC-2026-998",
        organizationId,
        producedAtLocationId: locationId,
        provenanceClass: "original_record",
        burnDurationMinutes: 120,
        timeAtPeakMinutes: 200,
      }),
    ).rejects.toThrow(BiocharBatchValidationError);
  });

  it("registra la quema completa de la Tabla 6 — el camino bueno", async () => {
    const lote = await createBiocharBatch(authorizedUserAccountId, {
      batchCode: "  LN-BC-2026-001  ",
      organizationId,
      producedAtLocationId: locationId,
      producedAt: new Date("2026-03-10T00:00:00Z"),
      feedstock: "Poda de guaba, 70%; cascarilla de café, 30%",
      feedstockSource: "Sombra del Lote 3",
      moistureCondition: "air_dried",
      kilnDesign: "Retorte de dos barriles, tiro lateral",
      peakTemperatureC: 520,
      temperatureMethod: "Termopar tipo K en la pared del barril",
      burnDurationMinutes: 240,
      timeAtPeakMinutes: 45,
      oxygenManagement: "Entrada de aire cerrada al ver humo blanco",
      cooling: "sealed_cooling",
      particleSize: "Cribado a menos de 10 mm",
      chargingMaterial: "Lixiviado de lombricompost",
      chargingRatio: "1:1 en volumen",
      coComposted: true,
      chargingDurationDays: 21,
      analysisLaboratory: "IDIAP Clayton",
      provenanceClass: "original_record",
      dataQuality: "provisional",
    });
    batchId = lote.id;

    // El código se guarda recortado: " LN-BC-2026-001 " y "LN-BC-2026-001" son
    // el mismo lote, y sin recortar el índice único no lo vería así.
    expect(lote.batchCode).toBe("LN-BC-2026-001");
    expect(lote.peakTemperatureC).toBe(520);
    expect(lote.moistureCondition).toBe("air_dried");
    expect(lote.cooling).toBe("sealed_cooling");
    expect(lote.coComposted).toBe(true);
    expect(lote.provenanceClass).toBe("original_record");
  });

  it("acepta una temperatura alta en vez de rechazarla — es una advertencia, no un límite", async () => {
    // §9.2 del marco: por encima de 750 °C sube la suma de los 16 HAP del US
    // EPA. Eso hace que un 800 sea preocupante, no falso. Rechazar un hecho
    // registrado porque incomoda es cómo un sistema empieza a mentir.
    const lote = await createBiocharBatch(authorizedUserAccountId, {
      batchCode: "LN-BC-2026-002",
      organizationId,
      producedAtLocationId: locationId,
      peakTemperatureC: 810,
      provenanceClass: "direct_observation",
    });
    expect(lote.peakTemperatureC).toBe(810);
  });

  it("deja en null todo lo que nadie registró — nunca en cero", async () => {
    // ADR-080: «sin medir» y «midió cero» son hechos distintos. Un lote del
    // que sólo se sabe que existió es un registro legítimo y frecuente: el
    // Paso 2 documenta lo que Bob YA hace, no le obliga a medir de nuevo.
    const lote = await createBiocharBatch(authorizedUserAccountId, {
      batchCode: "LN-BC-2026-003",
      organizationId,
      producedAtLocationId: locationId,
      provenanceClass: "original_record",
    });
    expect(lote.peakTemperatureC).toBeNull();
    expect(lote.burnDurationMinutes).toBeNull();
    expect(lote.feedstock).toBeNull();
    expect(lote.coComposted).toBeNull();
    expect(lote.producedAt).toBeNull();
    expect(lote.dataQuality).toBeNull();
  });

  it("escribe el AuditEvent en la misma transacción que el lote", async () => {
    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityType: "biochar_batch", entityId: batchId, operation: "biochar_batch.create" }),
    });
    expect(evento).not.toBeNull();
    expect(evento?.actorUserAccountId).toBe(authorizedUserAccountId);
  });
});

describe("updateBiocharBatch", () => {
  it("rechaza a quien no tiene acceso al sitio de producción", async () => {
    await expect(
      updateBiocharBatch(wrongLocationUserAccountId, { biocharBatchId: batchId, particleSize: "cualquier cosa" }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("es un PATCH — corregir un campo deja los demás intactos", async () => {
    const corregido = await updateBiocharBatch(authorizedUserAccountId, {
      biocharBatchId: batchId,
      // Bob anotó 520 y el termopar decía 500: error de transcripción, no un
      // hecho nuevo. Por eso es edición y no una fila que sucede a la anterior.
      peakTemperatureC: 500,
    });
    expect(corregido.peakTemperatureC).toBe(500);
    expect(corregido.feedstockSource).toBe("Sombra del Lote 3");
    expect(corregido.chargingDurationDays).toBe(21);
  });

  it("guarda el ANTES de la corrección en el audit", async () => {
    // La corrección no deja fila nueva, así que el audit es el único sitio
    // donde vive el 520 original. Si esto se rompe, la corrección borra.
    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityType: "biochar_batch", entityId: batchId, operation: "biochar_batch.update" }),
      orderBy: { occurredAt: "desc" },
    });
    expect(evento).not.toBeNull();
    expect((evento?.before as { peakTemperatureC?: number } | null)?.peakTemperatureC).toBe(520);
  });

  it("valida el tiempo a pico contra el valor que QUEDARÁ, no contra el que llega", async () => {
    // Sólo se manda `timeAtPeakMinutes`; la duración guardada es 240. Comparar
    // contra el campo ausente no diría nada, así que la regla mira lo que la
    // fila tendrá después.
    await expect(
      updateBiocharBatch(authorizedUserAccountId, { biocharBatchId: batchId, timeAtPeakMinutes: 300 }),
    ).rejects.toThrow(BiocharBatchValidationError);
  });

  it("permite borrar un valor mandando null", async () => {
    const corregido = await updateBiocharBatch(authorizedUserAccountId, {
      biocharBatchId: batchId,
      analysisLaboratory: null,
    });
    expect(corregido.analysisLaboratory).toBeNull();
  });
});

describe("lectura", () => {
  it("getBiocharBatch exige acceso al sitio de producción", async () => {
    await expect(getBiocharBatch(wrongLocationUserAccountId, batchId)).rejects.toThrow(LocationAccessError);
  });

  it("listBiocharBatchesForLocation sólo devuelve los de ese sitio", async () => {
    const lotes = await listBiocharBatchesForLocation(authorizedUserAccountId, locationId);
    expect(lotes.length).toBeGreaterThanOrEqual(3);
    expect(lotes.every((l) => l.producedAtLocationId === locationId)).toBe(true);
  });

  it("listBiocharBatchesForLocation rechaza un sitio ajeno", async () => {
    await expect(listBiocharBatchesForLocation(wrongLocationUserAccountId, locationId)).rejects.toThrow(
      LocationAccessError,
    );
  });
});

describe("computeBatchAgingDays", () => {
  it("cuenta los días entre la quema y la fecha dada", () => {
    expect(computeBatchAgingDays(new Date("2026-03-10T00:00:00Z"), new Date("2026-04-09T00:00:00Z"))).toBe(30);
  });

  it("sin fecha de producción devuelve null, no cero", () => {
    // Un lote cuya fecha nadie anotó no es un lote recién hecho. Un `0` aquí
    // se leería como «hecho hoy», que es una afirmación que nadie hizo.
    expect(computeBatchAgingDays(null, new Date("2026-04-09T00:00:00Z"))).toBeNull();
  });

  it("una fecha futura devuelve null, no un negativo", () => {
    expect(computeBatchAgingDays(new Date("2026-05-01T00:00:00Z"), new Date("2026-04-09T00:00:00Z"))).toBeNull();
  });
});

/**
 * S1 §2 — la Tabla 7 sobre un lote de biochar: el primer sujeto de
 * `Measurement` que no es café, y con él una segunda ruta de autorización.
 */
describe("Measurement con un sujeto que no es café", () => {
  let medicionId: string;

  it("rechaza a quien no alcanza el sitio donde el lote se produjo", async () => {
    // El punto entero de la rama: este usuario es Farm Operator con ámbito en
    // OTRO sitio. Si la autorización se hubiera acumulado con la de café en
    // vez de ramificarse, el permiso más laxo habría abierto esto.
    await expect(
      recordMeasurement(wrongLocationUserAccountId, {
        biocharBatchId: batchId,
        variable: "ph",
        value: 9.4,
        unit: "pH",
        occurredAt: new Date("2026-04-01T00:00:00Z"),
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow();
  });

  it("el sujeto es exclusivo: café o biochar, nunca los dos", async () => {
    await expect(
      recordMeasurement(authorizedUserAccountId, {
        biocharBatchId: batchId,
        // Un lotId cualquiera basta: la exclusividad se comprueba ANTES de
        // resolver nada, justamente para no tener dos ámbitos que reconciliar.
        lotId: "00000000-0000-0000-0000-000000000000",
        variable: "ph",
        value: 9.4,
        unit: "pH",
        occurredAt: new Date("2026-04-01T00:00:00Z"),
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });

  it("sigue exigiendo un sujeto cuando no llega ninguno", async () => {
    await expect(
      recordMeasurement(authorizedUserAccountId, {
        variable: "ph",
        value: 9.4,
        unit: "pH",
        occurredAt: new Date("2026-04-01T00:00:00Z"),
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });

  it("registra un pH de la Tabla 7 contra el lote — el camino bueno", async () => {
    const m = await recordMeasurement(authorizedUserAccountId, {
      biocharBatchId: batchId,
      variable: "ph",
      value: 9.4,
      unit: "pH",
      occurredAt: new Date("2026-04-01T00:00:00Z"),
      provenanceClass: "measured_fact",
      sourceReference: "IDIAP informe 2026-0412",
    });
    medicionId = m.id;
    expect(m.biocharBatchId).toBe(batchId);
    expect(m.lotId).toBeNull();
    expect(m.sampleId).toBeNull();
    expect(Number(m.value)).toBe(9.4);
  });

  it("convierte la unidad del informe a la canónica", async () => {
    // 0,35 % de fósforo son 3.500 mg/kg. Que lo haga el sistema es lo que
    // evita el error de dos órdenes de magnitud al teclear.
    const m = await recordMeasurement(authorizedUserAccountId, {
      biocharBatchId: batchId,
      variable: "phosphorus",
      value: 0.35,
      unit: "%",
      occurredAt: new Date("2026-04-01T00:00:00Z"),
      provenanceClass: "measured_fact",
    });
    expect(Number(m.value)).toBe(3500);
    expect(m.unit).toBe("mg/kg");
  });

  it("rechaza un valor fuera de los límites físicos del parámetro", async () => {
    await expect(
      recordMeasurement(authorizedUserAccountId, {
        biocharBatchId: batchId,
        variable: "ph",
        value: 15,
        unit: "pH",
        occurredAt: new Date("2026-04-01T00:00:00Z"),
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow();
  });

  it("la corrección conserva el sujeto — sin esto quedaría huérfana", async () => {
    const correccion = await correctMeasurement(authorizedUserAccountId, {
      measurementId: medicionId,
      value: 9.1,
      unit: "pH",
      occurredAt: new Date("2026-04-01T00:00:00Z"),
      reason: "El informe decía 9,1; se transcribió 9,4",
      provenanceClass: "measured_fact",
    });
    expect(correccion.biocharBatchId).toBe(batchId);
    expect(correccion.correctsId).toBe(medicionId);

    // Y la original sigue ahí, con su 9,4: corregir no reescribe.
    const original = await prisma.measurement.findUnique({ where: { id: medicionId } });
    expect(Number(original?.value)).toBe(9.4);
  });

  it("corregir también exige alcanzar el sitio del lote", async () => {
    await expect(
      correctMeasurement(wrongLocationUserAccountId, {
        measurementId: medicionId,
        value: 9.2,
        unit: "pH",
        occurredAt: new Date("2026-04-01T00:00:00Z"),
        reason: "intento sin permiso",
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow();
  });

  it("las mediciones salen en la ficha del lote", async () => {
    const lote = await getBiocharBatch(authorizedUserAccountId, batchId);
    expect(lote.measurements.length).toBeGreaterThanOrEqual(3);
    expect(lote.measurements.some((m) => m.correctsId != null)).toBe(true);
  });
});
