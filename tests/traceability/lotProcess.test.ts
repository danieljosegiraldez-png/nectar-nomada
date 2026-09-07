/**
 * El proceso de un lote: la cabecera que agrupa la secuencia.
 *
 * **Qué vigila esto y qué no.** Los bloques de servicio comprueban el servicio.
 * El último bloque va contra SQL crudo a propósito: las tres reglas del proceso
 * viven en `CHECK`s de la base, y probarlas sólo a través del servicio
 * comprobaría el servicio — una restricción que sólo existe en TypeScript se la
 * salta un importador, una reparación operativa o SQL directo, y en trazabilidad
 * eso es justo lo que no puede pasar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  abrirProceso,
  cambiarIntencion,
  cambiarObjetivoDeHumedad,
  cerrarProceso,
  colgarCorrida,
  listarProcesosDeLote,
  registrarIntervencion,
  CATALOGO_DE_INTERVENCIONES,
  LotProcessError,
  SIN_RECETA,
} from "../../lib/traceability/lotProcess";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `proc-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string;
let gestor: string, sinPermiso: string;
let loteA: string, loteB: string, loteC: string, loteD: string;
let recetaVersionId: string, recetaId: string;
let valorManejo: string, valorDeOtroCatalogo: string;
let catalogoId: string, otroCatalogoId: string;
let medicionDeA: string, medicionDeB: string, medicionBrixDeA: string;

async function cuenta(label: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" },
  });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } }))
    .id;
}

async function lote(codigo: string) {
  return (
    await prisma.lot.create({
      data: {
        lotCode: `${codigo}-${RUN}`,
        lotType: "cherry",
        organizationId: orgId,
        locationId: plotId,
        status: "approved",
        classification: "internal",
        createdBy: gestor,
      },
    })
  ).id;
}

async function medicion(lotId: string, variable: string, value: number) {
  return (
    await prisma.measurement.create({
      data: {
        variable,
        value,
        unit: variable === "moisture" ? "%" : "°Bx",
        occurredAt: new Date("2026-03-20T12:00:00Z"),
        lotId,
        provenanceClass: "measured_fact",
        createdBy: gestor,
      },
    })
  ).id;
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" },
    })
  ).id;
  plotId = (
    await prisma.location.create({
      data: {
        locationType: "plot",
        name: `TEST plot ${RUN}`,
        organizationId: orgId,
        status: "approved",
        classification: "internal",
      },
    })
  ).id;

  gestor = await cuenta("Gestor");
  sinPermiso = await cuenta("SinPermiso");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  // `sinPermiso` no recibe ninguna asignación: es el control del guardia.

  loteA = await lote("A");
  loteB = await lote("B");
  loteC = await lote("C");
  loteD = await lote("D");

  const receta = await prisma.processRecipe.create({
    data: { name: `TEST Honey 48h ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor },
  });
  recetaId = receta.id;
  recetaVersionId = (
    await prisma.processRecipeVersion.create({
      data: { recipeId: receta.id, version: 1, status: "approved", createdBy: gestor },
    })
  ).id;

  const catalogo = await prisma.variableCatalog.create({
    data: { key: CATALOGO_DE_INTERVENCIONES, name: "Intervención de proceso" },
  });
  catalogoId = catalogo.id;
  valorManejo = (
    await prisma.variableCatalogValue.create({ data: { catalogId: catalogo.id, value: `TEST flotado ${RUN}` } })
  ).id;

  const otro = await prisma.variableCatalog.create({ data: { key: `test_otro_${RUN}`, name: "Otro" } });
  otroCatalogoId = otro.id;
  valorDeOtroCatalogo = (
    await prisma.variableCatalogValue.create({ data: { catalogId: otro.id, value: `TEST agua ${RUN}` } })
  ).id;

  medicionDeA = await medicion(loteA, "moisture", 10.4);
  medicionDeB = await medicion(loteB, "moisture", 11.2);
  medicionBrixDeA = await medicion(loteA, "brix", 21);
});

afterAll(async () => {
  const lotes = [loteA, loteB, loteC, loteD];
  await prisma.lotProcessIntervention.deleteMany({
    where: assertDefinedWhere({ lotProcess: { lotId: { in: lotes } } }),
  });
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.processRecipeVersion.deleteMany({ where: assertDefinedWhere({ recipeId: recetaId }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: recetaId }) });
  await prisma.variableCatalogValue.deleteMany({
    where: assertDefinedWhere({ catalogId: { in: [catalogoId, otroCatalogoId] } }),
  });
  await prisma.variableCatalog.deleteMany({ where: assertDefinedWhere({ id: { in: [catalogoId, otroCatalogoId] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [gestor, sinPermiso] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [gestor, sinPermiso] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
});

const abrir = (lotId: string, extra: Record<string, unknown> = {}) => ({
  lotId,
  // La forma que describió el dueño: peso, estado del material, proceso, horas.
  intent: "40 kg whole cherries, natural anaeróbico 72 h",
  targetMoisturePct: 10.5,
  startedAt: new Date("2026-03-01T12:00:00Z"),
  provenanceClass: "original_record" as const,
  ...extra,
});

describe("abrir un proceso", () => {
  it("numera la secuencia solo, empezando en 1", async () => {
    const p = await abrirProceso(gestor, abrir(loteA, { processRecipeVersionId: recetaVersionId }));
    expect(p.sequenceOrder).toBe(1);
    expect(p.targetMoisturePct.toNumber()).toBe(10.5);
    expect(p.endedAt).toBeNull();
  });

  /** El guardia. Sin él, `lot:manage` no protegería el proceso de un lote. */
  it("sin acceso al lote no se puede abrir", async () => {
    await expect(abrirProceso(sinPermiso, abrir(loteB))).rejects.toThrow();
  });

  it("rechaza dos procesos abiertos sobre el mismo lote", async () => {
    // Si se permitiera, «el proceso actual de este lote» dejaría de tener
    // respuesta y el reporte tendría que elegir uno arbitrariamente.
    await expect(abrirProceso(gestor, abrir(loteA))).rejects.toThrow(new LotProcessError("process_already_open"));
  });

  it("rechaza un objetivo de humedad fuera de 0–100", async () => {
    await expect(abrirProceso(gestor, abrir(loteB, { targetMoisturePct: 105 }))).rejects.toThrow(
      /target_moisture_pct_out_of_range/,
    );
  });

  it("rechaza una receta que no existe", async () => {
    await expect(
      abrirProceso(gestor, abrir(loteB, { processRecipeVersionId: loteA })),
    ).rejects.toThrow(new LotProcessError("recipe_version_not_found"));
  });

  it("se puede abrir SIN receta, y el listado lo agrupa como «Sin receta»", async () => {
    await abrirProceso(gestor, abrir(loteC));
    const [p] = await listarProcesosDeLote(gestor, loteC);
    expect(p!.processRecipeVersionId).toBeNull();
    expect(p!.etiqueta).toBe(SIN_RECETA);
    // «Sin receta» NO es «sin nada declarado»: la intención de este batch sigue
    // ahí, que es la corrección del dueño del 2026-09-07.
    expect(p!.intent).toContain("natural anaeróbico");
  });

  /**
   * La regla que distingue este campo de la receta: no hace falta una receta
   * estandarizada, pero **sí** hace falta decir qué se pretende con este batch.
   */
  it("rechaza abrir sin intención declarada, aunque no haga falta receta", async () => {
    await expect(abrirProceso(gestor, abrir(loteB, { intent: "   " }))).rejects.toThrow(
      new LotProcessError("intent_required"),
    );
  });
});

describe("el objetivo de humedad se puede cambiar, y deja rastro", () => {
  it("cambia el valor y escribe su AuditEvent con el antes y el después", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteC);
    await cambiarObjetivoDeHumedad(gestor, p!.id, 11, "el varietal aguanta más");

    const despues = await prisma.lotProcess.findUniqueOrThrow({ where: { id: p!.id } });
    expect(despues.targetMoisturePct.toNumber()).toBe(11);

    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityId: p!.id, operation: "lot_process.change_moisture_target" }),
      orderBy: { occurredAt: "desc" },
    });
    expect(evento, "un cambio de intención sin rastro es lo que no puede pasar").not.toBeNull();
    expect(JSON.stringify(evento!.before)).toContain("10.5");
    expect(JSON.stringify(evento!.after)).toContain("11");
  });

  it("rechaza un objetivo fuera de rango", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteC);
    await expect(cambiarObjetivoDeHumedad(gestor, p!.id, 0)).rejects.toThrow(/out_of_range/);
  });
});

describe("la intención se puede modificar a mitad de proceso, y deja rastro", () => {
  it("cambia el texto y guarda el antes y el después", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteC);
    await cambiarIntencion(gestor, p!.id, "cambiado a honey por lluvia; 48 h en cama", "llovió el día 2");

    const despues = await prisma.lotProcess.findUniqueOrThrow({ where: { id: p!.id } });
    expect(despues.intent).toContain("honey");

    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityId: p!.id, operation: "lot_process.change_intent" }),
      orderBy: { occurredAt: "desc" },
    });
    // Lo que hace reproducible el lote no es la intención de ahora, sino poder
    // leer qué se pretendía en cada momento.
    expect(JSON.stringify(evento!.before)).toContain("natural anaeróbico");
    expect(JSON.stringify(evento!.after)).toContain("honey");
  });

  it("rechaza dejarla vacía", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteC);
    await expect(cambiarIntencion(gestor, p!.id, "  ")).rejects.toThrow(new LotProcessError("intent_required"));
  });
});

describe("intervenciones de manejo", () => {
  it("registra una del catálogo de intervenciones", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteC);
    const i = await registrarIntervencion(gestor, {
      lotProcessId: p!.id,
      catalogValueId: valorManejo,
      occurredAt: new Date("2026-03-02T12:00:00Z"),
    });
    expect(i.catalogValueId).toBe(valorManejo);
  });

  /**
   * La FK sola no basta: un valor de otro catálogo es una FK perfectamente
   * válida, y dejaría la lista de manejos contaminada con vocabulario ajeno.
   */
  it("rechaza un valor que es de OTRO catálogo, aunque la FK sea válida", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteC);
    await expect(
      registrarIntervencion(gestor, {
        lotProcessId: p!.id,
        catalogValueId: valorDeOtroCatalogo,
        occurredAt: new Date("2026-03-02T12:00:00Z"),
      }),
    ).rejects.toThrow(new LotProcessError("catalog_value_wrong_catalog"));
  });
});

describe("cerrar el proceso con su medición de humedad", () => {
  it("guarda el puntero a la medición y calcula la diferencia contra el objetivo", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteA);
    await cerrarProceso(gestor, {
      lotProcessId: p!.id,
      endedAt: new Date("2026-03-20T12:00:00Z"),
      closingMoistureMeasurementId: medicionDeA,
    });

    const [leido] = await listarProcesosDeLote(gestor, loteA);
    expect(leido!.closingMoistureMeasurementId).toBe(medicionDeA);
    expect(leido!.humedadDeCierre).toBe(10.4);
    // 10,4 medido contra 10,5 objetivo: cerró una décima por debajo.
    expect(leido!.diferenciaContraObjetivo).toBeCloseTo(-0.1, 5);
  });

  it("rechaza cerrar con una medición que no es de humedad", async () => {
    await abrirProceso(gestor, abrir(loteD));
    const [p] = await listarProcesosDeLote(gestor, loteD);
    await expect(
      cerrarProceso(gestor, {
        lotProcessId: p!.id,
        endedAt: new Date("2026-03-20T12:00:00Z"),
        closingMoistureMeasurementId: medicionBrixDeA,
      }),
    ).rejects.toThrow(new LotProcessError("measurement_is_not_moisture"));
  });

  /**
   * El caso que produce un dato plausible y falso: un proceso que parece
   * completo, cerrado con la humedad de OTRO café.
   */
  it("rechaza cerrar con la medición de otro lote", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteD);
    await expect(
      cerrarProceso(gestor, {
        lotProcessId: p!.id,
        endedAt: new Date("2026-03-20T12:00:00Z"),
        closingMoistureMeasurementId: medicionDeB,
      }),
    ).rejects.toThrow(new LotProcessError("measurement_belongs_to_another_lot"));
  });

  it("un proceso cerrado ya no acepta cambios ni intervenciones", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteA);
    await expect(cambiarObjetivoDeHumedad(gestor, p!.id, 11)).rejects.toThrow(
      new LotProcessError("process_already_closed"),
    );
    await expect(
      registrarIntervencion(gestor, {
        lotProcessId: p!.id,
        catalogValueId: valorManejo,
        occurredAt: new Date("2026-03-21T12:00:00Z"),
      }),
    ).rejects.toThrow(new LotProcessError("process_already_closed"));
  });

  it("cerrado el primero, el segundo proceso del mismo lote lleva secuencia 2", async () => {
    const p2 = await abrirProceso(gestor, abrir(loteA, { startedAt: new Date("2026-04-01T12:00:00Z") }));
    expect(p2.sequenceOrder).toBe(2);
  });
});

describe("colgar del proceso las corridas que ya existían", () => {
  it("una corrida de secado pasa a pertenecer al proceso", async () => {
    const [p] = await listarProcesosDeLote(gestor, loteC);
    const secado = await prisma.dryingRun.create({
      data: { method: "raised_bed", startedAt: new Date("2026-03-03T12:00:00Z"), createdBy: gestor },
    });

    await colgarCorrida(gestor, { lotProcessId: p!.id, tipo: "drying", runId: secado.id });

    const [leido] = await listarProcesosDeLote(gestor, loteC);
    expect(leido!.dryingRuns.map((d) => d.id)).toContain(secado.id);

    await prisma.dryingRun.delete({ where: { id: secado.id } });
  });
});

/**
 * **Las reglas, contra la base y no contra el servicio.** Estas escriben Prisma
 * directo a propósito: comprueban los `CHECK`, que es lo único que un importador
 * o una reparación operativa no se puede saltar.
 */
describe("los CHECK de `lot_process`", () => {
  const crudo = (extra: Record<string, unknown>) =>
    prisma.lotProcess.create({
      data: {
        lotId: loteB,
        sequenceOrder: 99,
        intent: "lo mínimo declarado",
        targetMoisturePct: 10.5,
        startedAt: new Date("2026-03-01T12:00:00Z"),
        provenanceClass: "original_record",
        ...extra,
      } as never,
    });

  it("rechaza una humedad objetivo por encima de 100", async () => {
    await expect(crudo({ targetMoisturePct: 105 })).rejects.toThrow(/lot_process_humedad_es_porcentaje/);
  });

  it("rechaza una humedad objetivo de 0 o negativa", async () => {
    await expect(crudo({ targetMoisturePct: 0 })).rejects.toThrow(/lot_process_humedad_es_porcentaje/);
  });

  it("rechaza un proceso que termina antes de empezar", async () => {
    await expect(crudo({ endedAt: new Date("2026-02-01T12:00:00Z") })).rejects.toThrow(
      /lot_process_termina_despues_de_empezar/,
    );
  });

  it("rechaza una intención vacía, que `NOT NULL` sola dejaría pasar", async () => {
    // En pantalla un `\'\'` se ve igual que «no se declaró», y haría falsa la
    // regla del dueño sin que nadie lo notara.
    await expect(crudo({ intent: "   " })).rejects.toThrow(/lot_process_intencion_no_vacia/);
  });

  it("rechaza una secuencia menor que 1", async () => {
    await expect(crudo({ sequenceOrder: 0 })).rejects.toThrow(/lot_process_orden_positivo/);
  });

  /**
   * **El control positivo de las cuatro de arriba.** Sin esto, unos `CHECK` que
   * rechazaran absolutamente todo las pasarían las cuatro.
   */
  it("y acepta un proceso bien formado", async () => {
    const creado = await crudo({});
    expect(creado.sequenceOrder).toBe(99);
    await prisma.lotProcess.delete({ where: { id: creado.id } });
  });
});
