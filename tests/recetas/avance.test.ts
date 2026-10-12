/**
 * Parte 2a, §4.3 — el avance de un proceso sobre los pasos de su receta se calcula sobre el HILO que da el resolvedor, no sobre
 * el proceso vigente solo. docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md (y su §12).
 *
 * Los procesos se abren, se dividen, se cierran y se devuelven a secado por los SERVICIOS: el hilo que `avanceDelProceso`
 * recorre es el que ellos escriben (`derivedFromLotProcessId`, y la devolución que abrió una continuación).
 *
 * Los registros que cumplen un paso se insertan CRUDOS, con `recipeStepId` y `stepTypeValueId` puestos a mano: el guardián que
 * los une a su paso al registrar es de las tareas 7 y 8, y aquí se prueba la lectura. Van sin transformaciones, así que no
 * tocan el libro de masa ni el linaje y no estorban a la división. Las recetas también se insertan crudas, como en
 * `divisionBajoProceso.test.ts`: su autoría por pasos es de la tarea 3. Se crean en BORRADOR, se les ponen los pasos y después
 * se publican, para no depender de si la base deja añadir pasos a una versión publicada.
 *
 * Usuario con ámbito acotado (Farm Operator de su parcela), no Platform Admin: nada de aquí cuenta filas de toda la base, y así
 * no puede empezar a hacerlo sin que se note (CLAUDE.md del repositorio, «Un admin de plataforma ve la base compartida entera»).
 *
 * **La autorización** (Ruling INV): `avanceDelProceso` NO autoriza —la firma del esqueleto no lleva principal, igual que
 * `procesoQueCubre`, y la pantalla que la llame (tarea 13) autoriza el lote antes—, así que no hay en ella una cuenta que
 * rechazar. Lo que esta tarea sí cambia en una frontera con permisos es la cadena del resolvedor, que ahora lleva la versión de
 * receta de cada proceso; la puerta con permisos que la presenta es `coberturaDelLote`, y su última prueba comprueba que quien
 * no ve el lote dueño de un proceso del hilo no recibe esa versión, con su control (quien ve los dos lotes, sí).
 *
 * El catálogo `tipo_paso` es el REAL de la base sembrada (tarea 2). Si la base no se resembró después de la tarea 2, cada
 * prueba cae con un mensaje que lo dice, en vez de caer por otra cosa.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { recordTransformation, TraceabilityAccessError } from "../../lib/traceability/lots";
import { cerrarProceso, coberturaDelLote, devolverASecado, CATALOGO_MOTIVO_DEVOLUCION } from "../../lib/traceability/lotProcess";
import { procesoQueCubre } from "../../lib/traceability/procesoDelLinaje";
import { avanceDelProceso } from "../../lib/recetas/avance";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `avance-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string;
/** Para la última prueba: una segunda parcela, quien sólo la ve a ella y quien ve las dos. */
let plotB: string, scopeB: string, soloB: string, ambos: string;
let gradoId: string, cerezaId: string, motivoId: string;
/** `value` → `id` del catálogo `tipo_paso`. */
const tipoDePaso = new Map<string, string>();
const lotes: string[] = [];
const transformaciones: string[] = [];
/** Humedades de cierre: se borran DESPUÉS de los procesos que las nombran (`closing_moisture_measurement_id` es RESTRICT). */
const mediciones: string[] = [];
/** Corridas crudas. Su `recipe_step_id` es RESTRICT (tarea 1): se borran ANTES que las recetas. */
const fermentaciones: string[] = [];
const secados: string[] = [];
/** Manejos dentro de una fermentación: antes que su fermentación (`fermentation_run_id` es RESTRICT) y que las recetas. */
const manejos: string[] = [];

/** El 2026-03-`d`, a mediodía UTC. */
const dia = (d: number) => new Date(Date.UTC(2026, 2, d, 12));
const HORA = 3_600_000;

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function valor(catalogo: string, v: string): Promise<string> {
  return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: v, catalog: { key: catalogo } }, select: { id: true } })).id;
}
function idDelTipo(tipo: string): string {
  const id = tipoDePaso.get(tipo);
  if (id === undefined) throw new Error(`el catálogo tipo_paso no tiene «${tipo}»: ¿se resembró la base propia después de la tarea 2?`);
  return id;
}
async function lote(codigo: string, enLaParcela: string = plotId) {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType: "cherry", organizationId: orgId, locationId: enLaParcela, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  lotes.push(id);
  return id;
}
/** Le da al lote un libro de masa con `kg`: la división de R6 lo exige entero en sus partes. */
async function conSaldo(lotId: string, kg: number) {
  await prisma.quantityEvent.create({ data: { lotId, eventType: "process_output", quantity: kg, unit: "kg", occurredAt: dia(1), provenanceClass: "measured_fact" } });
}
/** Divide el lote ENTERO (`kg`) en `partes` por el servicio, que cierra su proceso y da a cada parte una copia. Ids de las partes. */
let divisiones = 0;
async function dividir(lotId: string, kg: number, partes: number[], occurredAt: Date): Promise<string[]> {
  const n = ++divisiones;
  const r = await recordTransformation(gestor, {
    transformationType: "split", occurredAt, provenanceClass: "original_record",
    inputs: [{ lotId, quantity: kg, unit: "kg" }],
    outputs: partes.map((p, i) => ({ lotCode: `AV${n}${String.fromCharCode(65 + i)}-${RUN}`, lotType: "processing", quantity: p, unit: "kg" })),
  });
  transformaciones.push(r.transformation.id);
  const ids = r.outputLots.map((l) => l.id);
  lotes.push(...ids);
  return ids;
}
async function humedad(lotId: string, occurredAt: Date) {
  const id = (await prisma.measurement.create({ data: { variable: "moisture", value: 11, unit: "%", occurredAt, lotId, provenanceClass: "measured_fact", createdBy: gestor } })).id;
  mediciones.push(id);
  return id;
}

/**
 * Una versión PUBLICADA de una receta de la organización, con un paso por tipo en ese orden (`seq` desde 1); los `seq` de
 * `opcionales` van marcados. Devuelve el id de la versión y los ids de sus pasos, SIEMPRE por `seq`.
 *
 * `altaEn` es el orden en que se dan de alta las filas, por `seq` (por omisión 1, 2, 3…): con otro, el orden físico de la tabla
 * deja de ser el de `seq`, como queda cuando el editor de la tarea 3 renumera o mueve pasos con UPDATE.
 */
async function version(nombre: string, tipos: readonly string[], opcionales: readonly number[] = [], altaEn?: readonly number[]) {
  const receta = await prisma.processRecipe.create({ data: { name: `TEST ${nombre} ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor } });
  const v = await prisma.processRecipeVersion.create({ data: { recipeId: receta.id, version: 1, status: "draft", createdBy: gestor } });
  const idDelSeq = new Map<number, string>();
  for (const seq of altaEn ?? tipos.map((_, i) => i + 1)) {
    idDelSeq.set(seq, (await prisma.processRecipeStep.create({ data: {
      recipeVersionId: v.id, seq, stepTypeValueId: idDelTipo(tipos[seq - 1]!), opcional: opcionales.includes(seq),
    } })).id);
  }
  await prisma.processRecipeVersion.update({ where: { id: v.id }, data: { status: "approved" } });
  return { id: v.id, pasos: tipos.map((_, i) => idDelSeq.get(i + 1)!) };
}

/** El tipo del paso, que el registro copia (§4.2; con `recipe_step_id`, el CHECK de la tarea 1 exige `step_type_value_id`). */
async function tipoDelPaso(stepId: string): Promise<string> {
  return (await prisma.processRecipeStep.findUniqueOrThrow({ where: { id: stepId }, select: { stepTypeValueId: true } })).stepTypeValueId;
}
/** Una intervención del proceso que cumple `stepId`. Se borra con su proceso (`lot_process_id` es CASCADE). Con `id`, ése: para fijar el desempate. */
async function intervencion(lotProcessId: string, stepId: string, occurredAt: Date, id?: string) {
  return (await prisma.lotProcessIntervention.create({ data: {
    ...(id === undefined ? {} : { id }), lotProcessId, occurredAt, recipeStepId: stepId, stepTypeValueId: await tipoDelPaso(stepId), notes: `TEST ${RUN}`,
  } })).id;
}
/** Una fermentación TERMINADA (dos días) que cumple `stepId`. Terminada: una abierta impediría dividir y cerrar (R5). */
async function fermentacion(lotProcessId: string, stepId: string, startedAt: Date) {
  const id = (await prisma.fermentationRun.create({ data: {
    lotProcessId, startedAt, endedAt: new Date(startedAt.getTime() + 48 * HORA), recipeStepId: stepId, stepTypeValueId: await tipoDelPaso(stepId), vesselNote: `TEST ${RUN}`,
  } })).id;
  fermentaciones.push(id);
  return id;
}
/** Un secado TERMINADO (un día) que cumple `stepId`. */
async function secado(lotProcessId: string, stepId: string, startedAt: Date) {
  const id = (await prisma.dryingRun.create({ data: {
    lotProcessId, startedAt, endedAt: new Date(startedAt.getTime() + 24 * HORA), recipeStepId: stepId, stepTypeValueId: await tipoDelPaso(stepId), method: `TEST ${RUN}`,
  } })).id;
  secados.push(id);
  return id;
}
/** Una adición DENTRO de la fermentación `fermentationRunId` que cumple `stepId`. Con `id`, ése: para fijar el desempate. */
async function manejo(fermentationRunId: string, stepId: string, occurredAt: Date, id?: string) {
  const creado = (await prisma.fermentationIntervention.create({ data: {
    ...(id === undefined ? {} : { id }), fermentationRunId, interventionType: "addition", occurredAt, recipeStepId: stepId, stepTypeValueId: await tipoDelPaso(stepId), notes: `TEST ${RUN}`,
  } })).id;
  manejos.push(creado);
  return creado;
}
/** Un proceso de la versión `v` sobre un lote nuevo, con sus dos primeros pasos hechos, y CERRADO por humedad el día 6. */
async function cerradoConDosPasos(codigo: string, v: { id: string; pasos: readonly string[] }) {
  const lotId = await lote(codigo);
  const p = await abrirProcesoDePrueba(gestor, lotId, { processRecipeVersionId: v.id });
  await intervencion(p.id, v.pasos[0]!, dia(2));
  await fermentacion(p.id, v.pasos[1]!, dia(3));
  await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: dia(6), closingMoistureMeasurementId: await humedad(lotId, dia(6)) });
  return { lotId, procesoId: p.id };
}
/** Un enlace de linaje crudo (cereza → pergamino), como en `bodegaConProceso.test.ts`: lo que se prueba no es la transformación. */
async function enlazar(padre: string, hijo: string) {
  const t = await prisma.lotTransformation.create({ data: {
    transformationType: "stage_change", occurredAt: dia(5), provenanceClass: "original_record", createdBy: gestor,
    inputs: { create: [{ lotId: padre }] }, outputs: { create: [{ lotId: hijo }] },
  } });
  transformaciones.push(t.id);
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  plotB = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot B ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  soloB = await cuenta("SoloB");
  ambos = await cuenta("Ambos");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  scopeB = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotB } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  await prisma.assignment.create({ data: { userAccountId: soloB, roleProfileId: farm.id, scopeId: scopeB } });
  await prisma.assignment.create({ data: { userAccountId: ambos, roleProfileId: farm.id, scopeId } });
  await prisma.assignment.create({ data: { userAccountId: ambos, roleProfileId: farm.id, scopeId: scopeB } });
  gradoId = await valor("grado_proceso", "Washed");
  cerezaId = await valor("estado_cereza", "despulpada");
  motivoId = await valor(CATALOGO_MOTIVO_DEVOLUCION, "error_de_medicion");
  for (const v of await prisma.variableCatalogValue.findMany({ where: { catalog: { key: "tipo_paso" } }, select: { id: true, value: true } })) {
    tipoDePaso.set(v.value, v.id);
  }
}, 60000);

afterAll(async () => {
  // Todos los lotes de la organización, no sólo los apuntados: una división que sale bien sin esperarlo (en rojo, o con una
  // mutación del flip) crea lotes que ninguna lista conoce, y `lot_organization_id_fkey` es RESTRICT (la misma razón que en
  // `divisionBajoProceso.test.ts`).
  const deLaOrganizacion = await prisma.lot.findMany({ where: assertDefinedWhere({ organizationId: orgId }), select: { id: true } });
  const todos = [...new Set([...lotes, ...deLaOrganizacion.map((l) => l.id)])];
  const ts = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: todos } } } }, { outputs: { some: { lotId: { in: todos } } } }] }),
    select: { id: true },
  });
  const idsT = [...new Set([...transformaciones, ...ts.map((t) => t.id)])];
  // 1. Los manejos: antes que su fermentación y que las recetas (los dos RESTRICT). Por id y por la marca del RUN: uno creado
  //    cuando la prueba cayó antes de apuntarlo también se va.
  await prisma.fermentationIntervention.deleteMany({ where: assertDefinedWhere({ OR: [{ id: { in: manejos } }, { notes: { contains: RUN } }] }) });
  // 2. Los procesos, con su auditoría y sus devoluciones; sus intervenciones se van con ellos (CASCADE). Antes que las
  //    transformaciones (`divided_by_transformation_id`) y que las humedades de cierre, que son RESTRICT.
  await borrarProcesosDeLotesDonde({ id: { in: todos } });
  // 3. Las corridas crudas (su `lot_process_id` es SET NULL), antes que las recetas.
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ OR: [{ id: { in: fermentaciones } }, { vesselNote: { contains: RUN } }] }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ OR: [{ id: { in: secados } }, { method: { contains: RUN } }] }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ OR: [{ id: { in: mediciones } }, { lotId: { in: todos } }] }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: todos } }) });
  await prisma.deviation.deleteMany({ where: assertDefinedWhere({ lotTransformationId: { in: idsT } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: idsT } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: idsT } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: idsT } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: todos } }) });
  // 4. Las recetas de la organización, con sus versiones y sus pasos (CASCADE). Por organización y no por nombre: con
  //    `process_recipe.organization_id` en RESTRICT (tarea 1; antes SET NULL, y la receta que sobrevivía a su organización se volvía
  //    una plantilla de todas), una receta viva haría FALLAR el borrado de la organización, un poco más abajo.
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ organizationId: orgId }) });
  // 5. Lo que firmaron las cuentas y nadie borró arriba (la auditoría de las transformaciones): antes que las cuentas, porque el
  //    actor es SET NULL y después ya no se encontraría.
  const cuentas = [gestor, soloB, ambos];
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId: { in: [scopeId, scopeB] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: [scopeId, scopeB] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [plotId, plotB] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("Parte 2a, §4.3 — el avance se calcula sobre el hilo del resolvedor", () => {
  it("tras dividir un proceso con dos pasos hechos, la parte propone el tercero", async () => {
    const v = await version("CADENA", ["pulping", "fermentation", "drying"]);
    const a = await lote("C1");
    await conSaldo(a, 100);
    const p0 = await abrirProcesoDePrueba(gestor, a, { processRecipeVersionId: v.id });
    const despulpado = await intervencion(p0.id, v.pasos[0]!, dia(2));
    const ferm = await fermentacion(p0.id, v.pasos[1]!, dia(3));
    // Control: antes de dividir, sobre su propio proceso, los dos registros cuentan y propone el tercero.
    expect((await avanceDelProceso(prisma, a))?.siguiente?.stepId).toBe(v.pasos[2]);

    const [b, c] = await dividir(a, 100, [60, 40], dia(8));
    // La parte es un proceso NUEVO, sin registros propios; lo hecho vive en P0, que la cadena trae con su versión.
    const cob = await procesoQueCubre(prisma, b!);
    expect(cob.vigente?.id).not.toBe(p0.id);
    expect(cob.vigente?.derivedFromLotProcessId).toBe(p0.id);
    expect(cob.vigente?.processRecipeVersionId).toBe(v.id);
    expect(cob.cadena.find((p) => p.id === p0.id)?.processRecipeVersionId).toBe(v.id);

    const avance = await avanceDelProceso(prisma, b!);
    expect(avance?.recipeVersionId).toBe(v.id);
    expect(avance?.pasos.map((p) => p.registros.map((r) => [r.tabla, r.id]))).toEqual([
      [["lotProcessIntervention", despulpado]],
      [["fermentationRun", ferm]],
      [],
    ]);
    expect(avance?.siguiente).toMatchObject({ stepId: v.pasos[2], seq: 3, tipo: "drying", opcional: false });
    // La otra parte hereda lo mismo, y con el cliente de una transacción da lo mismo que con el global.
    expect((await avanceDelProceso(prisma, c!))?.siguiente?.stepId).toBe(v.pasos[2]);
    expect((await prisma.$transaction((tx) => avanceDelProceso(tx, b!)))?.siguiente?.stepId).toBe(v.pasos[2]);
  });

  it("una continuación de devolver a secado hereda lo hecho en el proceso cerrado", async () => {
    const v = await version("CONTINUACION", ["pulping", "fermentation", "drying"]);
    const { lotId, procesoId } = await cerradoConDosPasos("D1", v);
    const { continuacion } = await devolverASecado(gestor, { lotId, motivoValueId: motivoId, ocurrioEn: dia(7) });
    const cob = await procesoQueCubre(prisma, lotId);
    expect(cob.vigente?.id).toBe(continuacion.id);
    expect(cob.vigente?.origen).toBe("continuacion");
    expect(cob.vigente?.derivedFromLotProcessId).toBe(procesoId);
    expect((await avanceDelProceso(prisma, lotId))?.siguiente?.stepId).toBe(v.pasos[2]);
  });

  it("un reproceso con la MISMA receta empieza por el primer paso: no hereda lo hecho en el cerrado de arriba", async () => {
    const v = await version("REPROCESO", ["pulping", "fermentation", "drying"]);
    const { lotId, procesoId } = await cerradoConDosPasos("R1", v);
    // Control: cerrado, el lote sigue enseñando lo que hizo su proceso.
    expect((await avanceDelProceso(prisma, lotId))?.siguiente?.stepId).toBe(v.pasos[2]);

    const p2 = await abrirProcesoDePrueba(gestor, lotId, { processRecipeVersionId: v.id, startedAt: dia(7) });
    const cob = await procesoQueCubre(prisma, lotId);
    expect(cob.vigente?.id).toBe(p2.id);
    expect(cob.vigente?.origen).toBe("original");
    // El cerrado está en la cadena y con la MISMA versión: lo único que lo deja fuera del hilo es cómo se abrió el vigente.
    expect(cob.cadena.find((p) => p.id === procesoId)?.processRecipeVersionId).toBe(v.id);

    const avance = await avanceDelProceso(prisma, lotId);
    expect(avance?.siguiente?.stepId).toBe(v.pasos[0]);
    expect(avance?.pasos.every((p) => p.registros.length === 0)).toBe(true);
  });

  it("un proceso de OTRA versión en el hilo lo corta, aunque más arriba vuelva la versión del vigente", async () => {
    const v = await version("CORTE-V", ["pulping", "fermentation", "drying"]);
    const w = await version("CORTE-W", ["pulping", "fermentation", "drying"]);
    const x1 = await lote("K1");
    await conSaldo(x1, 100);
    const p0 = await abrirProcesoDePrueba(gestor, x1, { processRecipeVersionId: v.id });
    await intervencion(p0.id, v.pasos[0]!, dia(2));
    await fermentacion(p0.id, v.pasos[1]!, dia(3));
    // Los servicios copian siempre la versión a la parte (`dividirProcesoEnTx`): otra versión en medio del hilo sólo llega por un
    // import o una reparación, y así se simula, a mano sobre la fila. El hilo queda P2 (V) ← P1 (W) ← P0 (V).
    const [x2] = await dividir(x1, 100, [100], dia(8));
    const p1 = (await procesoQueCubre(prisma, x2!)).vigente!;
    await prisma.lotProcess.update({ where: { id: p1.id }, data: { processRecipeVersionId: w.id } });
    const [x3] = await dividir(x2!, 100, [100], dia(9));
    const p2 = (await procesoQueCubre(prisma, x3!)).vigente!;
    await prisma.lotProcess.update({ where: { id: p2.id }, data: { processRecipeVersionId: v.id } });

    // Control: la cadena trae los tres, cada uno con su versión, y la derivación los une.
    const cob = await procesoQueCubre(prisma, x3!);
    const versionDe = (id: string) => cob.cadena.find((p) => p.id === id)?.processRecipeVersionId;
    expect([versionDe(p2.id), versionDe(p1.id), versionDe(p0.id)]).toEqual([v.id, w.id, v.id]);
    expect(p2.derivedFromLotProcessId).toBe(p1.id);
    expect(p1.derivedFromLotProcessId).toBe(p0.id);

    const avance = await avanceDelProceso(prisma, x3!);
    expect(avance?.recipeVersionId).toBe(v.id);
    expect(avance?.siguiente?.stepId).toBe(v.pasos[0]);
  });

  it("lee las cuatro tablas, sólo del hilo, y ordena los registros de cada paso por su inicio", async () => {
    const v = await version("CUATRO", ["pulping", "fermentation", "addition", "drying"]);
    const a = await lote("Q1");
    const p = await abrirProcesoDePrueba(gestor, a, { processRecipeVersionId: v.id });
    const despulpado = await intervencion(p.id, v.pasos[0]!, dia(2));
    // Una desviación (§4.4): del MISMO tipo que el paso 1, sin paso y con motivo. Se une por `recipeStepId`, nunca por tipo, así
    // que no cumple nada. Es una RED, no un guardia: ninguna línea de `avance.ts` la atiende aparte, y por eso no tiene flip;
    // si alguien empareja por tipo, cae aquí.
    await prisma.lotProcessIntervention.create({ data: {
      lotProcessId: p.id, occurredAt: dia(2), stepTypeValueId: idDelTipo("pulping"), motivoDesviacion: `TEST desviación ${RUN}`,
    } });
    const ferm = await fermentacion(p.id, v.pasos[1]!, dia(3));
    // La adición se cumple dos veces y por dos tablas. La de DESPUÉS se inserta PRIMERO, y por la tabla que `avance.ts` lee antes
    // (las intervenciones del proceso van antes que los manejos): sin ordenar por inicio, saldría delante.
    const tarde = await intervencion(p.id, v.pasos[2]!, dia(6));
    const temprano = await manejo(ferm, v.pasos[2]!, new Date(dia(3).getTime() + 2 * HORA));
    const sec = await secado(p.id, v.pasos[3]!, dia(7));

    // Otro café con la MISMA versión y un registro en cada una de las cuatro tablas: no es de este hilo.
    const z = await lote("Q2");
    const pz = await abrirProcesoDePrueba(gestor, z, { processRecipeVersionId: v.id });
    await intervencion(pz.id, v.pasos[0]!, dia(2));
    const fz = await fermentacion(pz.id, v.pasos[1]!, dia(3));
    await manejo(fz, v.pasos[2]!, new Date(dia(3).getTime() + HORA));
    await secado(pz.id, v.pasos[3]!, dia(7));
    // Control: a Z sí le cuenta lo suyo, una vez por paso.
    expect((await avanceDelProceso(prisma, z))?.pasos.map((x) => x.registros.length)).toEqual([1, 1, 1, 1]);

    const avance = await avanceDelProceso(prisma, a);
    expect(avance?.pasos.map((x) => x.tipo)).toEqual(["pulping", "fermentation", "addition", "drying"]);
    expect(avance?.pasos.map((x) => x.registros)).toEqual([
      [{ tabla: "lotProcessIntervention", id: despulpado, inicio: dia(2) }],
      [{ tabla: "fermentationRun", id: ferm, inicio: dia(3) }],
      [
        { tabla: "fermentationIntervention", id: temprano, inicio: new Date(dia(3).getTime() + 2 * HORA) },
        { tabla: "lotProcessIntervention", id: tarde, inicio: dia(6) },
      ],
      [{ tabla: "dryingRun", id: sec, inicio: dia(7) }],
    ]);
    expect(avance?.siguiente).toBeNull();
  });

  it("los pasos salen por seq aunque la base los guarde en otro orden: ni `pasos` ni «el siguiente» dependen del orden físico de las filas", async () => {
    // El editor de la tarea 3 renumera y mueve pasos con UPDATE, y entonces el orden físico deja de ser el de `seq`. Aquí se llega
    // al mismo estado dando de alta los pasos en el orden 3, 1, 2. «El siguiente» es un `find` sobre la lista: si la lista no
    // sale por seq, propone el tercero (el primero que la base devuelve) en vez del primero.
    const v = await version("FUERA-DE-ORDEN", ["pulping", "fermentation", "drying"], [], [3, 1, 2]);
    // Control: el orden físico de las filas (`ctid` es su posición en la tabla) NO es el de seq. Sin esto, el orden de abajo se
    // leería igual con una base que ya las guardara ordenadas.
    const fisico = await prisma.$queryRaw<{ seq: number }[]>`select seq from traceability.process_recipe_step where recipe_version_id = ${v.id}::uuid order by ctid`;
    expect(fisico.map((f) => f.seq)).toEqual([3, 1, 2]);
    const a = await lote("O1");
    const p = await abrirProcesoDePrueba(gestor, a, { processRecipeVersionId: v.id });

    // Aserciones BLANDAS: cada una se evalúa aunque otra falle, así que con la mutación puesta se ve cuál de las cuatro cae.
    const inicio = await avanceDelProceso(prisma, a);
    expect.soft(inicio?.pasos.map((x) => [x.seq, x.stepId])).toEqual([[1, v.pasos[0]], [2, v.pasos[1]], [3, v.pasos[2]]]);
    expect.soft(inicio?.siguiente).toMatchObject({ stepId: v.pasos[0], seq: 1, tipo: "pulping" });
    // Con el primero hecho, el siguiente es el 2: no el 3, que es el que la base devolvería primero.
    await intervencion(p.id, v.pasos[0]!, dia(2));
    const tras = await avanceDelProceso(prisma, a);
    expect.soft(tras?.pasos.map((x) => x.seq)).toEqual([1, 2, 3]);
    expect.soft(tras?.siguiente).toMatchObject({ stepId: v.pasos[1], seq: 2, tipo: "fermentation" });
  });

  it("con el MISMO inicio, los registros de un paso salen por id: no por la tabla de la que se leyeron ni por el orden en que la base los devuelva", async () => {
    const v = await version("EMPATE", ["fermentation", "addition", "pulping"]);
    const a = await lote("E1");
    const p = await abrirProcesoDePrueba(gestor, a, { processRecipeVersionId: v.id });
    const ferm = await fermentacion(p.id, v.pasos[0]!, dia(3));
    const empate = new Date(dia(3).getTime() + 2 * HORA);
    // Cuatro ids, de dos en dos, con el MENOR primero. Paso 2 (`addition`), entre DOS tablas: el manejo lleva el id menor y la
    // intervención el mayor, y `avance.ts` anota las intervenciones antes que los manejos; sin desempate por id saldría primero la
    // intervención. Paso 3 (`pulping`), en UNA tabla: el id mayor se da de alta primero, y sin desempate quedaría como la base lo
    // devuelve, el mayor delante.
    const par = (): [string, string] => { const [x, y] = [randomUUID(), randomUUID()].sort(); return [x!, y!]; };
    const [idManejo, idIntervencion] = par();
    const [idMenor, idMayor] = par();
    expect(idManejo < idIntervencion).toBe(true);
    expect(idMenor < idMayor).toBe(true);
    await manejo(ferm, v.pasos[1]!, empate, idManejo);
    await intervencion(p.id, v.pasos[1]!, empate, idIntervencion);
    await intervencion(p.id, v.pasos[2]!, empate, idMayor);
    await intervencion(p.id, v.pasos[2]!, empate, idMenor);

    // Control: los inicios de cada par son IGUALES —los cuatro, el del empate—, leídos de la base y no de lo que se escribió.
    const iniciosDe = async (ids: string[]) => (await prisma.lotProcessIntervention.findMany({ where: { id: { in: ids } }, select: { occurredAt: true } })).map((r) => r.occurredAt.getTime());
    expect([
      (await prisma.fermentationIntervention.findUniqueOrThrow({ where: { id: idManejo }, select: { occurredAt: true } })).occurredAt.getTime(),
      ...(await iniciosDe([idIntervencion, idMayor, idMenor])),
    ]).toEqual([empate.getTime(), empate.getTime(), empate.getTime(), empate.getTime()]);
    // Control: la base guarda el par de una sola tabla en el orden CONTRARIO al de id (mayor, menor): el desempate no lo hace ella.
    const fisico = await prisma.$queryRaw<{ id: string }[]>`select id::text as id from traceability.lot_process_intervention where id in (${idMayor}::uuid, ${idMenor}::uuid) order by ctid`;
    expect(fisico.map((f) => f.id)).toEqual([idMayor, idMenor]);

    // Blandas, para que cada par se compruebe aunque el otro falle.
    const avance = await avanceDelProceso(prisma, a);
    expect.soft(avance?.pasos[1]?.registros.map((r) => [r.tabla, r.id])).toEqual([["fermentationIntervention", idManejo], ["lotProcessIntervention", idIntervencion]]);
    expect.soft(avance?.pasos[2]?.registros.map((r) => [r.tabla, r.id])).toEqual([["lotProcessIntervention", idMenor], ["lotProcessIntervention", idMayor]]);
  });

  it("propone el primer paso que un registro puede cumplir después del último hecho: ni la recepción, ni un opcional saltado, ni el almacenamiento", async () => {
    // reception (1) no la cumple ningún registro (§4.5); inoculation (3) es opcional; storage (6) no tiene registro (§4.6).
    const v = await version("SIGUIENTE", ["reception", "pulping", "inoculation", "fermentation", "drying", "storage"], [3]);
    const a = await lote("S1");
    const p = await abrirProcesoDePrueba(gestor, a, { processRecipeVersionId: v.id });
    const siguiente = async () => (await avanceDelProceso(prisma, a))?.siguiente?.seq ?? null;

    const inicio = await avanceDelProceso(prisma, a);
    expect(inicio?.pasos.map((x) => [x.seq, x.tipo, x.opcional])).toEqual([
      [1, "reception", false], [2, "pulping", false], [3, "inoculation", true],
      [4, "fermentation", false], [5, "drying", false], [6, "storage", false],
    ]);
    expect(inicio?.siguiente?.seq).toBe(2); // no la recepción
    await intervencion(p.id, v.pasos[1]!, dia(2));
    expect(await siguiente()).toBe(3); // el opcional se propone: el operario puede saltarlo...
    await fermentacion(p.id, v.pasos[3]!, dia(3)); // ...y lo salta
    expect(await siguiente()).toBe(5); // no vuelve al opcional saltado
    await secado(p.id, v.pasos[4]!, dia(6));
    expect(await siguiente()).toBeNull(); // ni el almacenamiento
  });

  it("sin proceso no hay avance; un proceso sin receta y una receta sin pasos no proponen nada", async () => {
    expect(await avanceDelProceso(prisma, await lote("N1"))).toBeNull();
    // R9: un proceso de antes de la receta obligatoria, crudo (desde la tarea 5b, `abrirProceso` ya no abre sin receta).
    const viejo = await lote("N2");
    await prisma.lotProcess.create({ data: {
      lotId: viejo, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11.5, startedAt: dia(1),
      provenanceClass: "original_record", processGradeValueId: gradoId, cherryStateValueId: cerezaId,
    } });
    expect((await procesoQueCubre(prisma, viejo)).vigente?.processRecipeVersionId).toBeNull();
    expect(await avanceDelProceso(prisma, viejo)).toEqual({ recipeVersionId: null, pasos: [], siguiente: null });
    const sinPasos = await version("SIN-PASOS", []);
    const l = await lote("N3");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: sinPasos.id });
    expect(await avanceDelProceso(prisma, l)).toEqual({ recipeVersionId: sinPasos.id, pasos: [], siguiente: null });
  });

  it("una mezcla de dos procesos no tiene avance —no se toma el del primer padre—; cada padre, por separado, sí (R16)", async () => {
    const v = await version("MEZCLA", ["pulping", "fermentation", "drying"]);
    const a = await lote("M1");
    const b = await lote("M2");
    const pa = await abrirProcesoDePrueba(gestor, a, { processRecipeVersionId: v.id });
    const pb = await abrirProcesoDePrueba(gestor, b, { processRecipeVersionId: v.id });
    // Los dos padres siguen la MISMA receta y van por pasos DISTINTOS: a ya despulpó, b ya fermentó. Así, devolver el avance de
    // cualquiera de los dos —lo que haría quien se quedara con el primero que encuentra— se distingue de no devolver ninguno.
    await intervencion(pa.id, v.pasos[0]!, dia(2));
    await fermentacion(pb.id, v.pasos[1]!, dia(3));
    // Control: cada padre, por separado, tiene su avance, y es el suyo.
    expect((await avanceDelProceso(prisma, a))?.siguiente?.stepId).toBe(v.pasos[1]);
    expect((await avanceDelProceso(prisma, b))?.siguiente?.stepId).toBe(v.pasos[2]);
    // La fusión, enlazada cruda como en `procesoDelLinaje.test.ts`: ningún servicio junta dos procesos abiertos en un lote.
    const m = await lote("M3");
    const t = await prisma.lotTransformation.create({ data: {
      transformationType: "merge", occurredAt: dia(8), provenanceClass: "original_record",
      inputs: { create: [{ lotId: a }, { lotId: b }] }, outputs: { create: [{ lotId: m }] },
    } });
    transformaciones.push(t.id);
    // Control: el resolvedor ve una MEZCLA, no «sin proceso». Sin esto, el `null` de abajo se leería igual con las dos respuestas.
    expect((await procesoQueCubre(prisma, m)).estado).toBe("mezcla");
    expect(await avanceDelProceso(prisma, m)).toBeNull();
  });
});

describe("Parte 2a, §4.3 — la versión que la cadena trae no sale por la puerta con permisos para quien no ve el lote (Ruling INV)", () => {
  it("quien ve sólo el pergamino (parcela B) no recibe la versión de receta del proceso que vive en la cereza (parcela A); quien ve las dos, sí", async () => {
    const v = await version("PERMISOS", ["pulping", "fermentation", "drying"]);
    const cereza = await lote("P1-C"); // parcela A
    const pergamino = await lote("P1-P", plotB);
    await enlazar(cereza, pergamino);
    const proceso = await abrirProcesoDePrueba(gestor, cereza, { processRecipeVersionId: v.id });
    // Control del resolvedor: la cadena SÍ trae la versión, así que lo que sigue no es un campo que nunca llegó a existir.
    expect((await procesoQueCubre(prisma, pergamino)).vigente?.processRecipeVersionId).toBe(v.id);
    // Control de los permisos: `soloB` ve el pergamino y NO la cereza; sin esto, «oculto» podría ser cualquier otra cosa.
    await expect(coberturaDelLote(soloB, cereza)).rejects.toThrow(TraceabilityAccessError);

    const deSoloB = await coberturaDelLote(soloB, pergamino);
    expect(deSoloB.estado).toBe("abierto");
    expect(deSoloB.vigente).toMatchObject({ oculto: true });
    const devuelto = JSON.stringify({ vigente: deSoloB.vigente, cadena: deSoloB.cadena, composicion: deSoloB.composicion });
    expect(devuelto).not.toContain(v.id);
    expect(devuelto).not.toContain(proceso.id);

    // Control: quien ve las DOS parcelas recibe el proceso entero, con la misma versión que la cadena trae.
    const deAmbos = await coberturaDelLote(ambos, pergamino);
    expect(deAmbos.vigente).toMatchObject({ oculto: false, id: proceso.id, processRecipeVersionId: v.id });
  });
});
