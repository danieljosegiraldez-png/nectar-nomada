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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  abrirProceso,
  cambiarIntencion,
  devolverASecado,
  exigeSecadoTerminado,
  cambiarObjetivoDeHumedad,
  cerrarProceso,
  colgarCorrida,
  listarProcesosDeLote,
  opcionesParaProceso,
  registrarIntervencion,
  CATALOGO_ESTADO_CEREZA,
  CATALOGO_GRADO_PROCESO,
  CATALOGOS_DE_INTERVENCION,
  LotProcessError,
  SIN_RECETA,
} from "../../lib/traceability/lotProcess";
import { moveLotToStorage } from "../../lib/traceability/storage";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `proc-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string;
let gestor: string, sinPermiso: string;
let loteA: string, loteB: string, loteC: string, loteD: string, loteE: string;
// Para el cierre con la humedad de un descendiente (2026-09-27): loteF tiene el proceso, loteG sale
// de él por una transformación, y loteH es de otra rama.
let loteF: string, loteG: string, loteH: string, transformacionId: string;
let recetaVersionId: string, recetaId: string;
let valorManejo: string, valorDeOtroCatalogo: string;
let valorGrado: string, valorCereza: string;
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
  loteE = await lote("E");

  const receta = await prisma.processRecipe.create({
    data: { name: `TEST Honey 48h ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor },
  });
  recetaId = receta.id;
  recetaVersionId = (
    await prisma.processRecipeVersion.create({
      data: { recipeId: receta.id, version: 1, status: "approved", createdBy: gestor },
    })
  ).id;

  // El catálogo NO se crea: se usa uno de los que ya existen, que es la
  // corrección de Daniel («la lista ya está de antes»). `upsert` sólo por si la
  // base de pruebas de una sesión no lo tuviera todavía.
  const catalogo = await prisma.variableCatalog.upsert({
    where: { key: CATALOGOS_DE_INTERVENCION[0]! },
    update: {},
    create: { key: CATALOGOS_DE_INTERVENCION[0]!, name: "Condición de oxígeno" },
  });
  catalogoId = catalogo.id;
  valorManejo = (
    await prisma.variableCatalogValue.create({ data: { catalogId: catalogo.id, value: `TEST anaerobico ${RUN}` } })
  ).id;

  const otro = await prisma.variableCatalog.create({ data: { key: `test_otro_${RUN}`, name: "Otro" } });
  otroCatalogoId = otro.id;
  valorDeOtroCatalogo = (
    await prisma.variableCatalogValue.create({ data: { catalogId: otro.id, value: `TEST agua ${RUN}` } })
  ).id;

  // Los dos catálogos que describen el batch. `upsert` porque son reales y
  // pueden existir ya en la base compartida.
  const catGrado = await prisma.variableCatalog.upsert({
    where: { key: CATALOGO_GRADO_PROCESO },
    update: {},
    create: { key: CATALOGO_GRADO_PROCESO, name: "Grado de proceso" },
  });
  valorGrado = (
    await prisma.variableCatalogValue.create({ data: { catalogId: catGrado.id, value: `TEST Natural ${RUN}` } })
  ).id;
  const catCereza = await prisma.variableCatalog.upsert({
    where: { key: CATALOGO_ESTADO_CEREZA },
    update: {},
    create: { key: CATALOGO_ESTADO_CEREZA, name: "Estado de la cereza" },
  });
  valorCereza = (
    await prisma.variableCatalogValue.create({ data: { catalogId: catCereza.id, value: `TEST entera ${RUN}` } })
  ).id;

  medicionDeA = await medicion(loteA, "moisture", 10.4);
  medicionDeB = await medicion(loteB, "moisture", 11.2);
  medicionBrixDeA = await medicion(loteA, "brix", 21);

  loteF = await lote("LOTE-F");
  loteG = await lote("LOTE-G");
  loteH = await lote("LOTE-H");
  // loteG desciende de loteF. Es lo que hace la fermentación de verdad: un lote nuevo como salida,
  // con el de cereza como entrada.
  transformacionId = (
    await prisma.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt: new Date("2026-03-05T12:00:00Z"),
        provenanceClass: "original_record",
        createdBy: gestor,
        inputs: { create: [{ lotId: loteF, quantity: 40, unit: "kg" }] },
        outputs: { create: [{ lotId: loteG, quantity: 38, unit: "kg" }] },
      },
    })
  ).id;
});

afterAll(async () => {
  const lotes = [loteA, loteB, loteC, loteD, loteE, loteF, loteG, loteH];
  // Parte 1 (2026-10-01): los procesos van ANTES que la transformación, porque `divided_by_transformation_id`
  // es RESTRICT: un proceso cerrado por esa división impediría borrarla.
  await prisma.lotProcessIntervention.deleteMany({
    where: assertDefinedWhere({ lotProcess: { lotId: { in: lotes } } }),
  });
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  // Las transformaciones: sus filas de entrada y salida apuntan a los lotes.
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: transformacionId }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: transformacionId }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: transformacionId }) });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.processRecipeVersion.deleteMany({ where: assertDefinedWhere({ recipeId: recetaId }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: recetaId }) });
  // Sólo los valores de ESTA corrida: `catalogoId` es un catálogo real de la
  // base y borrar sus valores se llevaría por delante vocabulario de verdad.
  await prisma.variableCatalogValue.deleteMany({ where: assertDefinedWhere({ value: { contains: RUN } }) });
  await prisma.variableCatalog.deleteMany({ where: assertDefinedWhere({ id: otroCatalogoId }) });
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
  // Obligatorios desde el 2026-09-08 (Daniel, «hazlos obligatorios»): un café
  // es natural, lavado o honey; no es «ninguno». Van en el helper porque ya no
  // hay ninguna llamada legítima que los omita.
  processGradeValueId: valorGrado,
  cherryStateValueId: valorCereza,
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
  it("rechaza un valor de un catálogo que no describe manejos, aunque la FK sea válida", async () => {
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

  /**
   * El caso que dejaba un proceso abierto para siempre, medido el 2026-09-27: el proceso se abre
   * sobre la CEREZA y la humedad se mide sobre el pergamino que la fermentación creó. Exigir el
   * mismo lote hacía que el formulario de cierre no ofreciera ninguna opción — cero, medidas.
   */
  it("cierra con la humedad de un lote que desciende del suyo", async () => {
    await abrirProceso(gestor, abrir(loteF));
    const [p] = await listarProcesosDeLote(gestor, loteF);
    const humedadDelDescendiente = await medicion(loteG, "moisture", 11);

    const cerrado = await cerrarProceso(gestor, {
      lotProcessId: p!.id,
      endedAt: new Date("2026-03-20T12:00:00Z"),
      closingMoistureMeasurementId: humedadDelDescendiente,
    });

    expect(cerrado.endedAt).not.toBeNull();
    expect(cerrado.closingMoistureMeasurementId).toBe(humedadDelDescendiente);
  });

  /** Y la otra mitad: descendencia sí, otra rama no. Sin esto, lo de arriba abriría la puerta entera. */
  it("no cierra con la humedad de un lote que no desciende del suyo", async () => {
    await abrirProceso(gestor, abrir(loteH));
    const [p] = await listarProcesosDeLote(gestor, loteH);
    // Una humedad de loteG, que desciende de loteF y no de loteH.
    const ajena = await medicion(loteG, "moisture", 12);

    await expect(
      cerrarProceso(gestor, {
        lotProcessId: p!.id,
        endedAt: new Date("2026-03-20T12:00:00Z"),
        closingMoistureMeasurementId: ajena,
      }),
    ).rejects.toThrow(new LotProcessError("measurement_belongs_to_another_lot"));
  });

  /**
   * La pantalla tiene que OFRECERLA, no sólo aceptarla: un cierre que el servicio admite y el
   * formulario no lista sigue siendo un proceso que nadie puede cerrar. Y la etiqueta dice de qué
   * lote es, porque ofrecer una humedad de otro lote sin decir de cuál es pedir que se adivine.
   */
  it("ofrece la humedad del descendiente, diciendo de qué lote es", async () => {
    const humedad = await medicion(loteG, "moisture", 10);
    const { mediciones } = await opcionesParaProceso(gestor, loteF);

    const ofrecida = mediciones.find((m) => m.id === humedad);
    expect(ofrecida, "la humedad del descendiente no se ofrece").toBeDefined();
    expect(ofrecida!.label).toContain("LOTE-G");
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
 * **La compuerta de bodega.** Regla del dueño, literal: «bloquear, alertar,
 * acción para regresar a secado; no debe salir de secado antes bajo ninguna
 * circunstancia».
 *
 * El primer caso es el control positivo de todo el bloque: **un lote sin
 * proceso sigue pudiendo almacenarse**. Sin él, una compuerta que bloqueara
 * absolutamente todo pasaría los demás — y bloquearía los 45 lotes que hoy
 * tiene producción, ninguno con proceso, porque `LotProcess` nació hoy.
 */
describe("un lote no sale de secado antes de su objetivo", () => {
  it("un lote SIN proceso se puede almacenar: la regla no es retroactiva", async () => {
    const asignacion = await moveLotToStorage(gestor, {
      lotId: loteB,
      locationId: plotId,
      startedAt: new Date("2026-04-10T12:00:00Z"),
    });
    expect(asignacion.lotId).toBe(loteB);
  });

  it("con el proceso abierto, bodega se bloquea", async () => {
    // loteC tiene proceso abierto desde el bloque de arriba.
    await expect(
      moveLotToStorage(gestor, { lotId: loteC, locationId: plotId, startedAt: new Date("2026-04-10T12:00:00Z") }),
    ).rejects.toThrow(new LotProcessError("drying_not_finished"));
  });

  it("cerrado POR ENCIMA del objetivo, bodega sigue bloqueada", async () => {
    // El proceso 2 de loteA se cierra con 11,2 % contra un objetivo de 10,5 %.
    const procesos = await listarProcesosDeLote(gestor, loteA);
    const abierto = procesos.find((p) => p.endedAt === null)!;
    const alta = await prisma.measurement.create({
      data: {
        variable: "moisture",
        value: 11.2,
        unit: "%",
        occurredAt: new Date("2026-04-05T12:00:00Z"),
        lotId: loteA,
        provenanceClass: "measured_fact",
        createdBy: gestor,
      },
    });
    await cerrarProceso(gestor, {
      lotProcessId: abierto.id,
      endedAt: new Date("2026-04-05T12:00:00Z"),
      closingMoistureMeasurementId: alta.id,
    });

    await expect(exigeSecadoTerminado(loteA)).rejects.toThrow(new LotProcessError("moisture_above_target"));
  });

  it("`devolverASecado` reabre el proceso y exige un motivo", async () => {
    await expect(devolverASecado(gestor, { lotId: loteA, motivo: "  " })).rejects.toThrow(
      new LotProcessError("motivo_required"),
    );

    const reabierto = await devolverASecado(gestor, { lotId: loteA, motivo: "11,2 % sobre 10,5 %: vuelve a cama" });
    expect(reabierto.endedAt).toBeNull();
    expect(reabierto.closingMoistureMeasurementId).toBeNull();

    // Reabrir contradice «cerrado no se toca», así que el rastro dice qué se
    // deshizo y por qué.
    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityId: reabierto.id, operation: "lot_process.reopen_for_drying" }),
      orderBy: { occurredAt: "desc" },
    });
    expect(JSON.stringify(evento!.before)).toContain("11.2");
    expect(JSON.stringify(evento!.after)).toContain("vuelve a cama");
  });

  it("y la medición descartada NO se borra: es un hecho medido", async () => {
    const sigue = await prisma.measurement.findFirst({
      where: assertDefinedWhere({ lotId: loteA, variable: "moisture", value: 11.2 }),
    });
    expect(sigue, "soltar el puntero no puede borrar la medición").not.toBeNull();
  });

  it("cerrado POR DEBAJO del objetivo, bodega se abre", async () => {
    const procesos = await listarProcesosDeLote(gestor, loteA);
    const abierto = procesos.find((p) => p.endedAt === null)!;
    const buena = await prisma.measurement.create({
      data: {
        variable: "moisture",
        value: 10.2,
        unit: "%",
        occurredAt: new Date("2026-04-12T12:00:00Z"),
        lotId: loteA,
        provenanceClass: "measured_fact",
        createdBy: gestor,
      },
    });
    await cerrarProceso(gestor, {
      lotProcessId: abierto.id,
      endedAt: new Date("2026-04-12T12:00:00Z"),
      closingMoistureMeasurementId: buena.id,
    });

    const asignacion = await moveLotToStorage(gestor, {
      lotId: loteA,
      locationId: plotId,
      startedAt: new Date("2026-04-13T12:00:00Z"),
    });
    expect(asignacion.lotId).toBe(loteA);
  });
});


describe("grado de proceso y estado de la cereza", () => {
  it("se guardan como columnas, no como texto dentro de la intención", async () => {
    // Lote propio: `loteD` ya tiene un proceso abierto de otra prueba, y dos
    // abiertos sobre el mismo lote se rechazan a propósito.
    const p = await abrirProceso(gestor, abrir(loteE, {
      startedAt: new Date("2026-05-01T12:00:00Z"),
      processGradeValueId: valorGrado,
      cherryStateValueId: valorCereza,
    }));
    expect(p.processGradeValueId).toBe(valorGrado);
    expect(p.cherryStateValueId).toBe(valorCereza);

    const [leido] = (await listarProcesosDeLote(gestor, loteE)).filter((x) => x.id === p.id);
    expect(leido!.processGradeValue?.value).toContain("Natural");
    expect(leido!.cherryStateValue?.value).toContain("entera");
  });

  /**
   * La FK sola no basta: un valor de otro catálogo es una FK válida y dejaría
   * la columna contaminada con vocabulario ajeno sin que nada se queje. Es el
   * mismo error que ya se cazó en las intervenciones.
   */
  it("rechaza en el grado un valor que es de otro catálogo", async () => {
    await expect(
      abrirProceso(gestor, abrir(loteB, { processGradeValueId: valorDeOtroCatalogo })),
    ).rejects.toThrow(new LotProcessError("process_grade_wrong_catalog"));
  });

  it("rechaza en el estado de cereza un valor de otro catálogo", async () => {
    await expect(
      abrirProceso(gestor, abrir(loteB, { cherryStateValueId: valorGrado })),
    ).rejects.toThrow(new LotProcessError("cherry_state_wrong_catalog"));
  });

  it("rechaza abrir un proceso sin grado, con una frase y no con una FK rota", async () => {
    await expect(abrirProceso(gestor, abrir(loteB, { processGradeValueId: "" }))).rejects.toThrow(
      new LotProcessError("process_grade_required"),
    );
  });

  it("rechaza abrir un proceso sin estado de cereza", async () => {
    await expect(abrirProceso(gestor, abrir(loteB, { cherryStateValueId: "  " }))).rejects.toThrow(
      new LotProcessError("cherry_state_required"),
    );
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
        processGradeValueId: valorGrado,
        cherryStateValueId: valorCereza,
        ...extra,
      } as never,
    });

  /**
   * Parte 1 (2026-10-01): la limpieza de lo que crea un `it` va en un `afterEach`, que corre falle o no
   * la prueba, y no en la última línea del cuerpo: una aserción que falla se salta ese borrado, la fila
   * (seq 99 de `crudo`, 97 de la prueba del índice) se queda, y la prueba siguiente cae por unicidad en
   * vez de por lo suyo. Un guardia que falla tiene que fallar solo.
   */
  afterEach(async () => {
    await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lotId: loteB, sequenceOrder: { in: [97, 99] } }) });
  });

  it("rechaza una humedad objetivo por encima de 100", async () => {
    await expect(crudo({ targetMoisturePct: 105 })).rejects.toThrow(/lot_process_humedad_es_porcentaje/);
  });

  it("rechaza una humedad objetivo de 0 o negativa", async () => {
    await expect(crudo({ targetMoisturePct: 0 })).rejects.toThrow(/lot_process_humedad_es_porcentaje/);
  });

  it("rechaza un proceso que termina antes de empezar", async () => {
    // Parte 1 (2026-10-01): con el CHECK del tipo de cierre, una fila con `endedAt` y sin `closureKind`
    // violaría dos restricciones, y Postgres las comprueba en orden alfabético. Se le da el tipo y la
    // medición para que sólo falle la fecha, que es lo que esta prueba dice vigilar.
    await expect(
      crudo({ endedAt: new Date("2026-02-01T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: medicionDeB }),
    ).rejects.toThrow(/lot_process_termina_despues_de_empezar/);
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
   * **El grado y el estado de cereza, contra la base — y por SQL crudo.**
   *
   * El cliente de Prisma no sirve para medir esto: con la columna en `null`
   * rechaza la llamada él mismo («Argument `lot` is missing») sin llegar a
   * hablar con Postgres, así que el test habría pasado tanto con `NOT NULL`
   * como sin él. Lo que se quiere comprobar es lo que un importador o un
   * `psql` no se pueden saltar, y eso sólo lo dice un `INSERT` de verdad.
   */
  const insertaSql = (columnas: string, ...valores: string[]) =>
    prisma.$executeRawUnsafe(
      `insert into traceability.lot_process
         (lot_id, sequence_order, intent, target_moisture_pct, started_at, provenance_class, ${columnas})
       values ($1::uuid, 98, 'crudo por SQL', 10.5, now(), 'original_record'` +
        valores.map((_, i) => `, $${i + 2}::uuid`).join("") +
        ")",
      loteB,
      ...valores,
    );

  it("rechaza por `NOT NULL` un proceso sin grado, aunque el servicio no esté por medio", async () => {
    await expect(insertaSql("cherry_state_value_id", valorCereza)).rejects.toThrow(
      /null value in column "process_grade_value_id"/,
    );
  });

  it("rechaza por `NOT NULL` un proceso sin estado de cereza", async () => {
    await expect(insertaSql("process_grade_value_id", valorGrado)).rejects.toThrow(
      /null value in column "cherry_state_value_id"/,
    );
  });

  /**
   * **El control positivo de las dos de arriba.** Sin él, un `INSERT` mal
   * escrito —una columna que no existe, un tipo que no casa— fallaría por otra
   * razón y las dos pasarían igual, midiendo la errata en vez del `NOT NULL`.
   */
  it("y el mismo `INSERT` con las dos columnas entra", async () => {
    const filas = await insertaSql("process_grade_value_id, cherry_state_value_id", valorGrado, valorCereza);
    expect(filas).toBe(1);
    await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lotId: loteB, sequenceOrder: 98 }) });
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

  it("un proceso cerrado declara cómo se cerró (Parte 1, R5/R6)", async () => {
    // Cerrado sin tipo: la base lo rechaza, no sólo el servicio.
    await expect(
      crudo({ endedAt: new Date("2026-03-21T12:00:00Z"), closingMoistureMeasurementId: medicionDeB }),
    ).rejects.toThrow(/lot_process_cierre_sii_tipo/);
    // Por humedad sin medición: rechazado.
    await expect(
      crudo({ endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture" }),
    ).rejects.toThrow(/lot_process_cierre_por_humedad_lleva_medicion/);
    // Dividido con medición: rechazado.
    await expect(
      crudo({ endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "divided", closingMoistureMeasurementId: medicionDeB, dividedByTransformationId: transformacionId }),
    ).rejects.toThrow(/lot_process_division_sin_medicion_y_con_transformacion/);
    // Dividido sin medición pero SIN la transformación que lo dividió: rechazado. Es la otra mitad de la
    // misma restricción; sin esta aserción, quitarle `AND divided_by_transformation_id IS NOT NULL` no
    // hacía caer nada.
    await expect(
      crudo({ endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "divided" }),
    ).rejects.toThrow(/lot_process_division_sin_medicion_y_con_transformacion/);
    // Un ABIERTO no lleva medición de cierre. `closure_kind` es nulo, y con `=` en vez de IS NOT DISTINCT
    // FROM el CHECK valdría NULL —y un CHECK que da NULL pasa—, así que esta fila entraba.
    await expect(crudo({ closingMoistureMeasurementId: medicionDeB })).rejects.toThrow(
      /lot_process_medicion_solo_si_por_humedad/,
    );
    // Ni la transformación que lo dividió: eso sólo lo tiene un proceso cerrado como `divided`.
    await expect(crudo({ dividedByTransformationId: transformacionId })).rejects.toThrow(
      /lot_process_transformacion_solo_si_dividido/,
    );
    // Control positivo: el cierre bien formado SÍ entra, y se borra.
    const bien = await crudo({ endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: medicionDeB });
    await prisma.lotProcess.delete({ where: { id: bien.id } });
  });

  it("dos procesos abiertos en el mismo lote los rechaza la base (Parte 1, R2)", async () => {
    const primero = await crudo({});
    // El mensaje de Prisma NO trae el nombre del índice (está en `meta`): dice los campos. Medido el
    // 2026-10-01: este índice da «(`lot_id`)» y `UNIQUE(lot_id, sequence_order)` da «(`lot_id`, `sequence_order`)».
    // El regex casa sólo el primero, y además la secuencia es otra (97 contra 99), así que el segundo
    // no puede ser el que rechaza.
    await expect(
      prisma.lotProcess.create({ data: {
        lotId: loteB, sequenceOrder: 97, intent: "segundo abierto", targetMoisturePct: 10.5,
        startedAt: new Date("2026-03-01T12:00:00Z"), provenanceClass: "original_record",
        processGradeValueId: valorGrado, cherryStateValueId: valorCereza,
      } }),
    ).rejects.toThrow(/Unique constraint failed on the fields: \(`lot_id`\)/);
    await prisma.lotProcess.delete({ where: { id: primero.id } });
  });
});
