/**
 * Convertir una Libre en receta — Parte 2a, tarea 11 (diseño §5.3 y §8, fila «§5.3 convertir»). Quién convierte: el registro del plan
 * decía `edit_beneficio` (2026-10-03) y lo cambia la decisión de Daniel V16 (2026-10-04, Ruling A): la autoría de recetas es el
 * permiso del Coffee Process Manager, y convertir una Libre es autoría. Y la adjudicación C8 (2026-10-04) fija el otro lado: convertir
 * lee el proceso de un lote y deja en él el vínculo `origenDeRecetaVersionId`, pero no es trabajo de campo, así que pide VER el lote
 * (`view`), no gestionarlo (`manage`): el Coffee Process Manager que ve el lote convierte; el que no lo ve, no; y un Farm Operator con
 * `lot:manage` sin el perfil, tampoco.
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md
 *
 * A: la copia y el origen. B: los fines, SÓLO desde lecturas MARCADAS, con la dirección medida. D: quién y cuándo. E: dos
 * conversiones a la vez. **R (revisión adversaria, 2026-10-05):** R3, que lo que aporta es el HILO del proceso y no todo lo unido a un
 * paso de la versión, y que hay que VER el lote de cada registro que aporta; R4, que el fin sale de la lectura VIGENTE de la marca
 * aunque se corrigiera después de marcarla; R16, que ver el lote en una organización y escribir recetas sólo en otra no basta; R24 (la
 * verificación de la tarde), que la receta nueva nace con la clasificación de su Libre —la del lote— y no con la de por omisión, porque
 * la intención cruda de ese lote viaja en su `description`.
 *
 * **La Libre y su proceso se arman CRUDOS**, con `prisma`: una receta `esLibre` con su versión publicada y sus pasos, y un proceso
 * con esa versión. No pasan por la puerta de abrir con Libre (tarea 10): lo que se mide es convertir, y un fixture que dependiera de
 * cómo esa puerta abre caería por otra cosa el día que cambie. Lo que SÍ es real es todo lo que ocurre después: las corridas y el
 * manejo se registran por sus servicios con su paso (tareas 7 y 8), las lecturas de cierre se marcan por las puertas (parte A de esta
 * tarea) y el proceso se cierra con `cerrarProceso`.
 *
 * **La dirección de un fin se mide, no se declara.** Una lectura no dice si el paso termina «al bajar a» o «al subir a» su valor; se
 * lee de la serie de la propia corrida (la primera lectura VIGENTE de esa variable contra la marcada: una lectura corregida cuenta
 * por su corrección). Un manejo no tiene serie: su lectura marcada no propone fin y se devuelve en `sinDireccion`. Las pruebas B fijan
 * las cuatro cosas: baja (`lte`), sube (`gte`), sin serie, y la serie con una lectura corregida.
 *
 * **Cuentas** (con ámbito de la parcela del archivo, salvo la que dice otra; ningún Platform Admin: no se cuenta nada global). `gestor`
 * es Farm Operator: ve y gestiona lotes y NO escribe recetas. `jefe` es Farm Manager: gestiona lotes y lleva `edit_beneficio` —lo que
 * hasta V16 bastaba— y TAMPOCO escribe recetas. `soloAutor` es Coffee Process Manager y nada más: escribe recetas y NO ve el lote (el
 * perfil no lleva `lot:view`: V13 y V16). `lector` es Coffee Process Manager + Project Viewer: escribe recetas y VE el lote sin
 * gestionarlo, que es justo lo que pide convertir (C8). `encargado` lleva Farm Operator + Coffee Process Manager (V14: la misma persona
 * opera y aprueba): ve, gestiona y escribe, y también convierte. `lectorDeOtraParcela` es un `lector` con su ámbito en OTRA parcela de la
 * misma organización: tiene la autoría de la organización y no ve ESTE lote (un hermano no se alcanza). `encargadoDeAmbas` es un
 * `encargado` que además gestiona la parcela hermana: ve, gestiona y escribe recetas en las dos. `cruzada` VE el lote (Project Viewer en
 * su parcela) y escribe recetas sólo en OTRA organización (Coffee Process Manager en un lugar de ella): R16. `confidencial` es un
 * `encargado` que además lleva Research Lead, un perfil de la casa que da `classification:clear_confidential` (el Farm Operator, el Farm
 * Manager y el Coffee Process Manager no lo llevan; el otro que sí, el Research Compliance Reviewer, es de revisión y no gestiona lotes):
 * es la única cuenta del archivo que alcanza un lote confidencial (R24). Y `ajeno`
 * no tiene ninguna asignación.
 *
 * **Lo que crea cada `it` se borra en `afterEach`**, nunca debajo de las aserciones, en orden de clave ajena: las marcas, los manejos
 * con su evento, los procesos (que sostienen la versión de la Libre, la de la receta nueva y la medición de cierre), las corridas
 * (que sostienen sus pasos), las recetas (cuyos fines sostienen las lecturas), las lecturas y los lotes. Lo del `beforeAll` va en
 * `afterAll`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import type { ClassificationLevel, LotType, Prisma } from "../../generated/prisma/client";
import { puedeAutoriaDeReceta } from "../../lib/recetas/autoria";
import { convertirLibre, puedeConvertirLibre } from "../../lib/recetas/convertir";
import { RecipeError } from "../../lib/recetas/errorDeReceta";
import { publicarVersion } from "../../lib/recetas/pasos";
import { endDryingRun, startDryingRun } from "../../lib/traceability/drying";
import { endFermentationRun, startFermentationRun } from "../../lib/traceability/fermentation";
import { puedeEditarBeneficioEnOrganizacion } from "../../lib/traceability/locations";
import { cerrarProceso, registrarIntervencion } from "../../lib/traceability/lotProcess";
import { puedeGestionarLote, requireLotAccess, TraceabilityAccessError } from "../../lib/traceability/lots";
import { correctMeasurement } from "../../lib/traceability/measurements";
import { listRecipeVersionsForLot } from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";

const RUN = `convertir-${Date.now()}`;
/** Un instante de marzo de 2026: `T("02T08:00:00")`. */
const T = (s: string) => new Date(`2026-03-${s}Z`);
type Tipo = "prefermentacion" | "washing" | "fermentation" | "drying";

let orgId: string;
let plotId: string;
let scopeId: string;
/** Otra parcela de la MISMA organización, con su propio ámbito: lo que `lectorDeOtraParcela` alcanza y `lector` no. */
let otraParcelaId: string;
let otroScopeId: string;
/** R16: otra ORGANIZACIÓN, con un lugar suyo y su ámbito. */
let otraOrgId: string;
let otraOrgLugarId: string;
let otraOrgScopeId: string;
let gestor: string;
let jefe: string;
let soloAutor: string;
let lector: string;
let encargado: string;
let lectorDeOtraParcela: string;
let encargadoDeAmbas: string;
let cruzada: string;
/** R24: la única cuenta que alcanza un lote confidencial. */
let confidencial: string;
let ajeno: string;
let grado: string;
let cereza: string;
let sustrato: string;
let capacidad: string;
const tipo = {} as Record<Tipo, string>;
const fijo = { personIds: [] as string[], cuentaIds: [] as string[] };
/** Las lecturas que crea cada `it`; las vacía el `afterEach`. */
const mediciones: string[] = [];

async function valor(catalogo: string, v?: string): Promise<string> {
  return (
    await prisma.variableCatalogValue.findFirstOrThrow({
      where: v === undefined ? { catalog: { key: catalogo } } : { value: v, catalog: { key: catalogo } },
      orderBy: { displayOrder: "asc" },
      select: { id: true },
    })
  ).id;
}

type Perfil = "Farm Operator" | "Farm Manager" | "Coffee Process Manager" | "Project Viewer" | "Research Lead";

/** Un perfil más para una cuenta, en el ámbito que se diga. */
async function asignar(cuentaId: string, perfil: Perfil, ambito: string): Promise<void> {
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  await prisma.assignment.create({ data: { userAccountId: cuentaId, roleProfileId: rp.id, scopeId: ambito } });
}

/** Una cuenta con los perfiles que se digan, todos en el ámbito de la parcela del archivo —o en `ambito`, si se dice— (ninguno, si la lista es vacía). */
async function cuenta(label: string, perfiles: readonly Perfil[], ambito?: string): Promise<string> {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  fijo.personIds.push(p.id);
  const id = (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
  fijo.cuentaIds.push(id);
  for (const perfil of perfiles) await asignar(id, perfil, ambito ?? scopeId);
  return id;
}

/**
 * Un lote de la parcela del archivo, o de la que se diga, `internal` salvo que se diga otra clasificación (R24). Todo lote lleva `RUN` en
 * su código: el `afterEach` los encuentra por él.
 */
async function lote(codigo: string, lotType: LotType = "cherry", locationId: string = plotId, classification: ClassificationLevel = "internal") {
  return (
    await prisma.lot.create({
      data: { lotCode: `${codigo}-${RUN}`, lotType, organizationId: orgId, locationId, status: "approved", classification, createdBy: gestor },
    })
  ).id;
}

/** Una lectura cruda. Con `fermentationRunId` o `dryingRunId` es de esa corrida. */
async function lectura(o: {
  lotId: string;
  value: number;
  occurredAt: Date;
  variable?: string;
  unit?: string;
  fermentationRunId?: string;
  dryingRunId?: string;
}) {
  const id = (
    await prisma.measurement.create({
      data: {
        variable: o.variable ?? "moisture",
        value: o.value,
        unit: o.unit ?? "%",
        occurredAt: o.occurredAt,
        lotId: o.lotId,
        fermentationRunId: o.fermentationRunId ?? null,
        dryingRunId: o.dryingRunId ?? null,
        provenanceClass: "measured_fact",
        createdBy: gestor,
      },
    })
  ).id;
  mediciones.push(id);
  return id;
}

type DatosDelPaso = Omit<Prisma.ProcessRecipeStepUncheckedCreateInput, "recipeVersionId" | "seq" | "stepTypeValueId">;
const DATOS_DEL_PASO: Record<Tipo, DatosDelPaso> = {
  prefermentacion: { intencion: "TEST fiebre en sacos", horasMin: 12, horasSugeridas: 24, horasMax: 36 },
  washing: { intencion: "TEST lavado con agua limpia", mucilagoObjetivo: 0 },
  fermentation: { intencion: "TEST fermentación en tanque", temperaturaMinC: 18, temperaturaMaxC: 22, finPorTiempo: true, reglaDeFin: "all" },
  drying: { intencion: "TEST secado en cama", modoSecado: "african_bed_outdoor", volteoCadaHoras: 2, humedadMinPct: 10, humedadMaxPct: 12 },
};

/**
 * Una Libre de la organización: receta `esLibre`, su v1 en borrador, un paso por tipo en orden, y publicada (el orden que la tarea
 * 3 hace cumplir). Con `completa`, además las cuatro colecciones —una adición, un fin PLANEADO, un requisito y tres metas, dos de
 * paso con la MISMA variable y momento en pasos distintos (§3.2)—; pide los cuatro tipos. **Como la Libre real (tarea 10, R8)**, la receta
 * lleva la clasificación de su lote —`internal` salvo que se diga otra— y su intención cruda en la `description` (R24).
 */
async function libre(etiqueta: string, tipos: readonly Tipo[], completa = false, clasificacion: ClassificationLevel = "internal") {
  const receta = await prisma.processRecipe.create({
    data: {
      name: `TEST Libre ${etiqueta} ${RUN}`,
      description: `TEST intención ${etiqueta} ${RUN}`,
      organizationId: orgId,
      status: "approved",
      classification: clasificacion,
      esLibre: true,
      createdBy: gestor,
    },
  });
  const version = await prisma.processRecipeVersion.create({
    data: { recipeId: receta.id, version: 1, status: "draft", expectedHours: completa ? 300 : null, createdBy: gestor },
  });
  const pasos = {} as Record<Tipo, string>;
  for (const [i, t] of tipos.entries()) {
    pasos[t] = (await prisma.processRecipeStep.create({ data: { recipeVersionId: version.id, seq: i + 1, stepTypeValueId: tipo[t], ...DATOS_DEL_PASO[t] } })).id;
  }
  if (completa) {
    await prisma.processRecipeStepAddition.create({ data: { stepId: pasos.fermentation, categoriaValueId: sustrato, cantidad: 2.5, unidad: "L", momento: "pre_green" } });
    await prisma.processRecipeStepEnd.create({ data: { stepId: pasos.fermentation, variable: "ph", operador: "lte", valor: 4.2, unidad: "pH" } });
    await prisma.processRecipeStepRequirement.create({ data: { stepId: pasos.fermentation, capacidadValueId: capacidad } });
    await prisma.processTarget.create({ data: { recipeVersionId: version.id, variable: "moisture", moment: "final", phase: "drying", unit: "%", minValue: 10, maxValue: 12, displayOrder: 0 } });
    await prisma.processTarget.create({ data: { recipeVersionId: version.id, recipeStepId: pasos.prefermentacion, variable: "ph", moment: "initial", phase: "fermentation", unit: "pH", targetValue: 5.2, displayOrder: 1 } });
    await prisma.processTarget.create({ data: { recipeVersionId: version.id, recipeStepId: pasos.fermentation, variable: "ph", moment: "initial", phase: "fermentation", unit: "pH", targetValue: 4.9, displayOrder: 2 } });
  }
  await prisma.processRecipeVersion.update({ where: { id: version.id }, data: { status: "approved" } });
  return { recipeId: receta.id, versionId: version.id, pasos };
}

/** Una receta común (no Libre), publicada y sin pasos: lo que un proceso «normal» sigue. */
async function recetaComun(etiqueta: string): Promise<string> {
  const r = await prisma.processRecipe.create({ data: { name: `TEST Común ${etiqueta} ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor } });
  return (await prisma.processRecipeVersion.create({ data: { recipeId: r.id, version: 1, status: "approved", createdBy: gestor } })).id;
}

/**
 * Un proceso ABIERTO con esa versión, crudo: así existe desde que la apertura con Libre (tarea 10) lo deja hecho. Con `derivedFrom`, es
 * una parte de una división o la continuación de una devolución a secado: nace derivado de ese proceso, que es lo que dice el hilo.
 */
async function procesoConReceta(lotId: string, versionId: string, extra: { derivedFrom?: string; startedAt?: Date } = {}) {
  return prisma.lotProcess.create({
    data: {
      lotId,
      sequenceOrder: 1,
      intent: `TEST Libre ${RUN}`,
      targetMoisturePct: 11.5,
      startedAt: extra.startedAt ?? T("01T12:00:00"),
      derivedFromLotProcessId: extra.derivedFrom ?? null,
      provenanceClass: "original_record",
      processGradeValueId: grado,
      cherryStateValueId: cereza,
      processRecipeVersionId: versionId,
      createdBy: gestor,
    },
  });
}

/**
 * Lo cierra por humedad POR EL SERVICIO (el cierre real), con una lectura de humedad dada o una nueva del lote del proceso, el 9 o cuando se
 * diga, y por `gestor` salvo que se diga otra cuenta (R24: el lote confidencial sólo lo gestiona quien alcanza lo confidencial).
 */
async function cerrar(procesoId: string, lotId: string, humedadId?: string, cuando: Date = T("09T12:00:00"), quien: string = gestor) {
  const humedad = humedadId ?? (await lectura({ lotId, value: 11, occurredAt: T("09T09:00:00") }));
  await cerrarProceso(quien, { lotProcessId: procesoId, endedAt: cuando, closingMoistureMeasurementId: humedad });
}

/** Una transformación cruda que hace de `hijos` descendientes de `padres` (como las de `lecturasDeCierre.test.ts`). */
async function enlazar(padres: string[], hijos: string[]) {
  await prisma.lotTransformation.create({
    data: {
      transformationType: "stage_change",
      occurredAt: T("01T09:00:00"),
      provenanceClass: "original_record",
      createdBy: gestor,
      inputs: { create: padres.map((lotId) => ({ lotId })) },
      outputs: { create: hijos.map((lotId) => ({ lotId })) },
    },
  });
}

/**
 * Cierra por DIVISIÓN el proceso de `lotePadre`, crudo —el cierre por división todavía no tiene un servicio que una prueba pueda
 * llamar sin armar la partición entera—: una transformación `split` del lote a sus partes, que el CHECK de la base exige.
 */
async function cerrarPorDivision(procesoId: string, lotePadre: string, partes: string[]) {
  const t = await prisma.lotTransformation.create({
    data: {
      transformationType: "split",
      occurredAt: T("05T12:00:00"),
      provenanceClass: "original_record",
      createdBy: gestor,
      inputs: { create: [{ lotId: lotePadre }] },
      outputs: { create: partes.map((lotId) => ({ lotId })) },
    },
  });
  await prisma.lotProcess.update({
    where: { id: procesoId },
    data: { endedAt: T("05T12:00:00"), closureKind: "divided", dividedByTransformationId: t.id },
  });
}

/** Lo que cuelga de una versión, leído por las claves escalares. */
async function contenido(versionId: string) {
  const pasos = await prisma.processRecipeStep.findMany({ where: { recipeVersionId: versionId }, orderBy: { seq: "asc" } });
  const ids = pasos.map((p) => p.id);
  const adiciones = await prisma.processRecipeStepAddition.findMany({ where: { stepId: { in: ids } } });
  const fines = await prisma.processRecipeStepEnd.findMany({ where: { stepId: { in: ids } } });
  const requisitos = await prisma.processRecipeStepRequirement.findMany({ where: { stepId: { in: ids } } });
  const metas = await prisma.processTarget.findMany({ where: { recipeVersionId: versionId }, orderBy: { displayOrder: "asc" } });
  const fases = await prisma.processRecipePhase.findMany({ where: { recipeVersionId: versionId } });
  return { pasos, adiciones, fines, requisitos, metas, fases, seqDe: new Map(pasos.map((p) => [p.id, p.seq])) };
}
type Contenido = Awaited<ReturnType<typeof contenido>>;
const n = (d: { toString(): string } | null) => (d === null ? null : d.toString());
/** Cada paso por su orden y sus ejes: lo que la copia tiene que conservar. Los ids NO, a propósito. */
const forma = (c: Contenido) =>
  c.pasos.map((p) => [
    p.seq, p.stepTypeValueId, p.intencion, p.opcional, p.horasMin, p.horasSugeridas, p.horasMax, p.mucilagoObjetivo,
    n(p.temperaturaMinC), n(p.temperaturaMaxC), p.modoSecado, p.volteoCadaHoras, n(p.humedadMinPct), n(p.humedadMaxPct),
    p.finPorTiempo, p.reglaDeFin,
  ]);
/** Lo que cuelga de un paso, nombrado por el `seq` de SU paso en ESTA versión (un `stepId` ajeno sale `undefined` y la comparación cae). */
const colgantes = (c: Contenido) => ({
  adiciones: c.adiciones.map((a) => JSON.stringify([c.seqDe.get(a.stepId), a.categoriaValueId, n(a.cantidad), a.unidad, a.momento])).sort(),
  fines: c.fines.map((f) => JSON.stringify([c.seqDe.get(f.stepId), f.variable, f.operador, n(f.valor), f.unidad])).sort(),
  requisitos: c.requisitos.map((r) => JSON.stringify([c.seqDe.get(r.stepId), r.capacidadValueId])).sort(),
  metasDePaso: c.metas
    .filter((m) => m.recipeStepId !== null)
    .map((m) => JSON.stringify([c.seqDe.get(m.recipeStepId!), m.variable, m.moment, m.phase, n(m.targetValue)]))
    .sort(),
  metasDeVersion: c.metas
    .filter((m) => m.recipeStepId === null)
    .map((m) => JSON.stringify([m.variable, m.moment, m.phase, n(m.minValue), n(m.maxValue)]))
    .sort(),
});

/** Los pasos de una versión por tipo: el id de cada uno (una Libre de estas pruebas tiene a lo sumo un paso por tipo). */
async function pasosDe(versionId: string): Promise<Partial<Record<Tipo, string>>> {
  const pasos = await prisma.processRecipeStep.findMany({ where: { recipeVersionId: versionId }, select: { id: true, stepTypeValueId: true } });
  const nombreDe = new Map((Object.entries(tipo) as [Tipo, string][]).map(([nombre, id]) => [id, nombre]));
  return Object.fromEntries(pasos.map((p) => [nombreDe.get(p.stepTypeValueId)!, p.id]));
}
/** Los fines de cada paso de una versión, por tipo: `[variable, operador, valor, unidad, desdeLecturaId]`. */
async function finesDe(versionId: string) {
  const salida: Record<string, (string | null)[][]> = {};
  for (const [nombre, stepId] of Object.entries(await pasosDe(versionId))) {
    const fines = await prisma.processRecipeStepEnd.findMany({ where: { stepId }, orderBy: { variable: "asc" } });
    salida[nombre] = fines.map((f) => [f.variable, f.operador, f.valor.toString(), f.unidad, f.desdeLecturaId]);
  }
  return salida;
}

/** El resultado de una promesa sin que llegue a rechazarse nunca (copiado de `corridaConProceso.test.ts`). */
type Resultado<V> = { ok: true; valor: V } | { ok: false; error: unknown };
const resultadoDe = <V>(p: Promise<V>): Promise<Resultado<V>> =>
  p.then((v) => ({ ok: true as const, valor: v }), (error: unknown) => ({ ok: false as const, error }));

/**
 * Una transacción AJENA que hace `trabajo` y se queda abierta hasta que se la suelte (copiado de `corridaConProceso.test.ts`).
 * `pid` es su proceso en la base. **Hay que llamar siempre a `soltar()`, también si la prueba falla (en un `finally`)**.
 */
function retener(trabajo: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let soltar!: () => void;
  const suelta = new Promise<void>((resolver) => { soltar = resolver; });
  let tomado!: (pid: number) => void;
  let fallo!: (error: unknown) => void;
  const pid = new Promise<number>((resolver, rechazar) => { tomado = resolver; fallo = rechazar; });
  const hecho = prisma.$transaction(async (tx) => {
    try {
      await trabajo(tx);
      const [fila] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      tomado(fila!.pid);
    } catch (error) {
      fallo(error);
      throw error;
    }
    await suelta;
  }, { timeout: 30000, maxWait: 10000 });
  hecho.catch(() => undefined);
  return { pid, soltar, hecho };
}

/** Se OBSERVA en la base que alguien espera a la sesión `pid`, en vez de inferirlo de que algo tarda. */
async function esperarQueAlguienEspere(pid: number, mensaje: string) {
  let esperando = 0;
  for (let intento = 0; intento < 100 && esperando === 0; intento++) {
    const [fila] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
    esperando = fila!.n;
    if (esperando === 0) await new Promise((r) => setTimeout(r, 50));
  }
  expect(esperando, mensaje).toBeGreaterThan(0);
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (
    await prisma.location.create({
      data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
    })
  ).id;
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  otraParcelaId = (
    await prisma.location.create({
      data: { locationType: "plot", name: `TEST otra parcela ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
    })
  ).id;
  otroScopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: otraParcelaId } })).id;
  gestor = await cuenta("Gestor", ["Farm Operator"]);
  jefe = await cuenta("Jefe", ["Farm Manager"]);
  soloAutor = await cuenta("Autor", ["Coffee Process Manager"]);
  lector = await cuenta("Lector", ["Coffee Process Manager", "Project Viewer"]);
  encargado = await cuenta("Encargado", ["Farm Operator", "Coffee Process Manager"]);
  lectorDeOtraParcela = await cuenta("LectorDeOtraParcela", ["Coffee Process Manager", "Project Viewer"], otroScopeId);
  encargadoDeAmbas = await cuenta("EncargadoDeAmbas", ["Farm Operator", "Coffee Process Manager"]);
  await asignar(encargadoDeAmbas, "Farm Operator", otroScopeId);
  otraOrgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST otra org ${RUN}`, status: "approved", classification: "internal" } })).id;
  otraOrgLugarId = (
    await prisma.location.create({
      data: { locationType: "plot", name: `TEST lugar de otra org ${RUN}`, organizationId: otraOrgId, status: "approved", classification: "internal" },
    })
  ).id;
  otraOrgScopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: otraOrgLugarId } })).id;
  cruzada = await cuenta("Cruzada", ["Project Viewer"]);
  await asignar(cruzada, "Coffee Process Manager", otraOrgScopeId);
  confidencial = await cuenta("Confidencial", ["Farm Operator", "Coffee Process Manager", "Research Lead"]);
  ajeno = await cuenta("Ajeno", []);
  grado = await valor("grado_proceso", "Washed");
  cereza = await valor("estado_cereza", "despulpada");
  sustrato = await valor("sustrato_anadido", "doble_mosto");
  capacidad = await valor("capacidad");
  for (const t of ["prefermentacion", "washing", "fermentation", "drying"] as const) tipo[t] = await valor("tipo_paso", t);
}, 60000);

/**
 * Las cuentas del RUN, descubiertas por su persona: no se heredan de las variables del `beforeAll`. Si éste muere a mitad, esas
 * variables siguen sin definir, `assertDefinedWhere` lanza y la limpieza abandona las filas que quedan (CLAUDE.md del repositorio,
 * «Una limpieza que se apoya en una variable del fixture no corre si el `beforeAll` muere antes»).
 */
async function cuentasDelRun(): Promise<string[]> {
  const personas = await prisma.person.findMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }), select: { id: true } });
  return (
    await prisma.userAccount.findMany({ where: assertDefinedWhere({ personId: { in: personas.map((p) => p.id) } }), select: { id: true } })
  ).map((c) => c.id);
}

/** Las dos organizaciones del RUN, por su nombre (`TEST <RUN>` y `TEST otra org <RUN>`). */
async function organizacionesDelRun(): Promise<string[]> {
  return (await prisma.organization.findMany({ where: assertDefinedWhere({ name: { contains: RUN } }), select: { id: true } })).map((o) => o.id);
}

/**
 * Todo lo que un `it` crea y que NO es del fixture, descubierto por el RUN y por la organización: lotes, sus corridas, manejos, procesos,
 * lecturas, marcas, las recetas (la Libre del `it` y la que convierte) y la auditoría de las cuentas. En orden de clave ajena. La llama
 * `afterEach` tras cada prueba (falle o no) y `afterAll` una última vez.
 */
async function limpiarLoDelRun() {
  const organizaciones = await organizacionesDelRun();
  const todos = (
    await prisma.lot.findMany({
      where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { lotCode: { contains: RUN } }] }),
      select: { id: true },
    })
  ).map((l) => l.id);
  const trans = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: todos } } } }, { outputs: { some: { lotId: { in: todos } } } }] }),
    select: { id: true, fermentationRunId: true, dryingRunId: true },
  });
  const tIds = trans.map((t) => t.id);
  const ferm = trans.map((t) => t.fermentationRunId).filter((x): x is string => x !== null);
  const sec = trans.map((t) => t.dryingRunId).filter((x): x is string => x !== null);
  // Las lecturas: las apuntadas por los `it` y todas las de los lotes del RUN (una que un `it` creó y murió antes de apuntar).
  const lecturas = [
    ...new Set([
      ...mediciones,
      ...(await prisma.measurement.findMany({ where: assertDefinedWhere({ lotId: { in: todos } }), select: { id: true } })).map((m) => m.id),
    ]),
  ];
  // Las marcas, antes que las lecturas que sostienen (RESTRICT).
  await prisma.processStepClosingReading.deleteMany({ where: assertDefinedWhere({ measurementId: { in: lecturas } }) });
  // Los manejos del proceso, con su evento: sostienen el paso de la Libre (RESTRICT).
  const manejos = (
    await prisma.lotProcessIntervention.findMany({ where: assertDefinedWhere({ lotProcess: { lotId: { in: todos } } }), select: { id: true } })
  ).map((m) => m.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "lot_process_intervention", entityId: { in: manejos } }) });
  await prisma.lotProcessIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: manejos } }) });
  // Los procesos: sostienen la versión de la Libre, la de la receta nueva (`origen_de_receta_version_id`) y su medición de cierre.
  await borrarProcesosDeLotesDonde({ id: { in: todos } });
  // Las corridas: sostienen los pasos (`recipe_step_id` es RESTRICT).
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: todos } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: tIds } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: ferm } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: sec } }) });
  // Las recetas, con sus versiones, pasos, fines y metas (en cascada): sus fines sostienen las lecturas (RESTRICT). Por organización y por
  // nombre: `process_recipe.organization_id` es RESTRICT y una receta viva impide borrar la organización.
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: lecturas } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: todos } }) });
  // Lo que escribieron las cuentas del RUN y no colgaba de nada de arriba. Antes de borrarlas: el actor es SET NULL.
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: await cuentasDelRun() } }) });
  mediciones.length = 0;
}

afterEach(limpiarLoDelRun);

afterAll(async () => {
  // La limpieza DESCUBRE lo que borra, no lo hereda del `beforeAll`: si éste muere antes de asignar `orgId`, `plotId`, `gestor`…
  // (o a mitad de `cuenta`, con la persona creada y la cuenta no), esas variables siguen `undefined`. Todo sale de la marca del RUN: las
  // organizaciones por su nombre y de ellas sus ubicaciones; las personas por su `displayName` y de ellas las cuentas; de las ubicaciones,
  // los ámbitos.
  const ids = <T extends { id: string }>(filas: T[]) => filas.map((f) => f.id);
  await limpiarLoDelRun();
  const organizaciones = await organizacionesDelRun();
  const ubicaciones = ids(
    await prisma.location.findMany({
      where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }),
      select: { id: true },
    }),
  );
  const personas = ids(await prisma.person.findMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }), select: { id: true } }));
  const cuentas = await cuentasDelRun();
  // Lo que cuelga de las cuentas se cuenta ANTES de borrarlas: `created_by` y el actor son SET NULL, y después ya no se encontraría.
  const deLasCuentas: [string, number][] = [
    ["auditEvent", await prisma.auditEvent.count({ where: { actorUserAccountId: { in: cuentas } } })],
    ["measurement", await prisma.measurement.count({ where: { createdBy: { in: cuentas } } })],
    ["lotTransformation", await prisma.lotTransformation.count({ where: { createdBy: { in: cuentas } } })],
    ["fermentationRun", await prisma.fermentationRun.count({ where: { createdBy: { in: cuentas } } })],
    ["dryingRun", await prisma.dryingRun.count({ where: { createdBy: { in: cuentas } } })],
    ["processStepClosingReading", await prisma.processStepClosingReading.count({ where: { createdBy: { in: cuentas } } })],
  ];
  const ambitos = ids(
    await prisma.scope.findMany({ where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: ubicaciones } }), select: { id: true } }),
  );
  // En orden de clave ajena: asignaciones y ámbitos, cuentas y personas, las ubicaciones y, la última, las organizaciones.
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });
  // Contar lo que queda del RUN: «limpió» y «pasó» no son lo mismo, y un borrado que no llegó se leería como un verde. Si algo
  // sobra, el archivo FALLA aquí, con la tabla y la cuenta.
  const restos: [string, number][] = [
    ["organization", await prisma.organization.count({ where: { OR: [{ id: { in: organizaciones } }, { name: { contains: RUN } }] } })],
    ["location", await prisma.location.count({ where: { OR: [{ id: { in: ubicaciones } }, { name: { contains: RUN } }] } })],
    ["scope", await prisma.scope.count({ where: { id: { in: ambitos } } })],
    ["person", await prisma.person.count({ where: { OR: [{ id: { in: personas } }, { displayName: { contains: RUN } }] } })],
    ["userAccount", await prisma.userAccount.count({ where: { id: { in: cuentas } } })],
    ["assignment", await prisma.assignment.count({ where: { OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] } })],
    ["processRecipe", await prisma.processRecipe.count({ where: { name: { contains: RUN } } })],
    ["lot", await prisma.lot.count({ where: { lotCode: { contains: RUN } } })],
  ];
  const sobran = [...deLasCuentas, ...restos].filter(([, n]) => n > 0);
  if (sobran.length > 0) throw new Error(`convertir.test: la limpieza dejó filas del RUN ${RUN}: ${sobran.map(([tabla, n]) => `${tabla}=${n}`).join(", ")}`);
}, 60000);

describe("§5.3 convertir — la Libre pasa a receta de la organización, en borrador", () => {
  it("copia lo planeado con ids nuevos, en borrador, y el proceso gana el origen; la Libre queda como estaba", async () => {
    const l = await libre("A1", ["prefermentacion", "washing", "fermentation", "drying"], true);
    const loteA = await lote("A1");
    const p = await procesoConReceta(loteA, l.versionId);
    await cerrar(p.id, loteA);
    const antes = await contenido(l.versionId);
    // Fila patrón: la Libre tiene de verdad las cuatro colecciones (y requisitos). Sin esto, «la copia trae lo mismo» pasaría
    // comparando dos vacíos.
    expect([antes.pasos.length, antes.adiciones.length, antes.fines.length, antes.requisitos.length, antes.metas.length]).toEqual([4, 1, 1, 1, 3]);

    const nombre = `TEST Convertida A1 ${RUN}`;
    const r = await convertirLibre(encargado, { lotProcessId: p.id, nombre });
    expect([r.pasos, r.finesPropuestos, r.sinDireccion]).toEqual([4, 0, []]);

    const receta = await prisma.processRecipe.findUniqueOrThrow({ where: { id: r.recipeId } });
    expect([receta.name, receta.organizationId, receta.esLibre, receta.status, receta.derivadaDeVersionId, receta.parecidaAVersionId, receta.motivoDeLibre]).toEqual([
      nombre, orgId, false, "approved", null, null, null,
    ]);
    const version = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: r.versionId } });
    expect([version.recipeId, version.version, version.status, version.expectedHours]).toEqual([r.recipeId, 1, "draft", 300]);

    const despues = await contenido(r.versionId);
    const idsDeLaLibre = new Set(antes.pasos.map((x) => x.id));
    expect(despues.pasos.filter((x) => idsDeLaLibre.has(x.id))).toEqual([]);
    expect(forma(despues)).toEqual(forma(antes));
    expect(colgantes(despues)).toEqual(colgantes(antes));
    const idsNuevos = new Set(despues.pasos.map((x) => x.id));
    const metasDePaso = despues.metas.filter((m) => m.recipeStepId !== null);
    expect(metasDePaso).toHaveLength(2);
    for (const m of metasDePaso) expect(idsNuevos.has(m.recipeStepId!), `meta ${m.variable} → ${m.recipeStepId}`).toBe(true);

    // La Libre queda como estaba: publicada, con sus pasos, y es lo que ocurrió.
    expect((await contenido(l.versionId)).pasos.map((x) => x.id)).toEqual(antes.pasos.map((x) => x.id));
    expect((await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: l.versionId } })).status).toBe("approved");
    expect((await prisma.processRecipe.findUniqueOrThrow({ where: { id: l.recipeId } })).esLibre).toBe(true);

    // El proceso conserva su Libre y gana el origen; sigue cerrado.
    const proceso = await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } });
    expect([proceso.processRecipeVersionId, proceso.origenDeRecetaVersionId, proceso.endedAt !== null]).toEqual([l.versionId, r.versionId, true]);

    // Dos eventos: la receta nueva, con de dónde salió, y la conversión en el proceso.
    const creada = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "process_recipe", entityId: r.recipeId, operation: "process_recipe.create" } });
    expect([creada.actorUserAccountId, creada.reason]).toEqual([encargado, `convertida_de_libre_version_${l.versionId}`]);
    const convertida = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "lot_process", entityId: p.id, operation: "lot_process.convert_to_recipe" } });
    expect(convertida.actorUserAccountId).toBe(encargado);
  }, 30000);

  it("publicada, la receta convertida se ofrece al abrir procesos y la Libre de la que salió no", async () => {
    const l = await libre("A2", ["washing", "drying"]);
    const loteA = await lote("A2");
    const p = await procesoConReceta(loteA, l.versionId);
    await cerrar(p.id, loteA);
    const r = await convertirLibre(encargado, { lotProcessId: p.id, nombre: `TEST Convertida A2 ${RUN}` });
    const otro = await lote("A2-otro");
    const ofrecidas = async () => (await listRecipeVersionsForLot(gestor, otro)).map((v) => v.id);
    // En borrador no se ofrece nada de esto, y la Libre nunca.
    expect(await ofrecidas()).not.toContain(r.versionId);
    expect(await ofrecidas()).not.toContain(l.versionId);
    await publicarVersion(encargado, r.versionId);
    expect((await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: r.versionId } })).status).toBe("approved");
    // Control: publicada, la nueva SÍ se ofrece; la Libre, no.
    expect(await ofrecidas()).toContain(r.versionId);
    expect(await ofrecidas()).not.toContain(l.versionId);
  }, 30000);
});

describe("los fines salen sólo de lecturas MARCADAS (§5.3: «nunca deduce un umbral de una lectura que nadie marcó»)", () => {
  it("con lecturas marcadas, cada paso propone SU fin con la dirección medida; las lecturas sin marcar no proponen ninguno", async () => {
    const l = await libre("B1", ["prefermentacion", "washing", "fermentation", "drying"]);
    const cereza1 = await lote("B1");
    const p = await procesoConReceta(cereza1, l.versionId);

    // El lavado, un manejo del proceso: UNA lectura marcada, en dos manejos del mismo paso. Sin serie propia no hay dirección.
    const lavado = await lectura({ lotId: cereza1, value: 21, occurredAt: T("01T13:00:00"), variable: "temperature", unit: "C" });
    for (const hora of ["14", "15"]) {
      await registrarIntervencion(gestor, {
        lotProcessId: p.id,
        recipeStepId: l.pasos.washing,
        occurredAt: T(`01T${hora}:00:00`),
        lecturasDeCierre: [lavado],
      });
    }

    // La fermentación: una temperatura que SUBE (la última se marca) y un pH que baja (ninguna se marca).
    const f = await startFermentationRun(gestor, {
      lotId: cereza1,
      startedAt: T("02T08:00:00"),
      provenanceClass: "original_record",
      recipeStepId: l.pasos.fermentation,
      vesselNote: `TEST tanque (${RUN})`, // desde la 2c (#717) toda fermentación lleva un tanque o su nombre
    });
    const deLaFermentacion = (value: number, hora: string, variable = "temperature", unit = "C") =>
      lectura({ lotId: cereza1, value, occurredAt: T(hora), variable, unit, fermentationRunId: f.run.id });
    await deLaFermentacion(18, "02T09:00:00");
    await deLaFermentacion(22, "03T09:00:00");
    const temperaturaFinal = await deLaFermentacion(26, "03T20:00:00");
    await deLaFermentacion(5.4, "02T09:30:00", "ph", "pH");
    await deLaFermentacion(4.8, "03T09:30:00", "ph", "pH");
    const { outputLot } = await endFermentationRun(gestor, {
      fermentationRunId: f.run.id,
      endedAt: T("04T08:00:00"),
      outputLotCode: `B1-ferm-${RUN}`,
      outputLotType: "drying",
      provenanceClass: "original_record",
      lecturasDeCierre: [temperaturaFinal],
    });

    // El secado, sobre el lote que salió de la fermentación: una humedad que BAJA, y la última se marca.
    const s = await startDryingRun(gestor, {
      lotId: outputLot.id,
      startedAt: T("04T09:00:00"),
      provenanceClass: "original_record",
      recipeStepId: l.pasos.drying,
    });
    const deElSecado = (value: number, hora: string) => lectura({ lotId: outputLot.id, value, occurredAt: T(hora), dryingRunId: s.run.id });
    await deElSecado(45, "04T10:00:00");
    await deElSecado(30, "06T10:00:00");
    const humedadFinal = await deElSecado(11.2, "08T10:00:00");
    await endDryingRun(gestor, {
      dryingRunId: s.run.id,
      endedAt: T("08T11:00:00"),
      outputLotCode: `B1-perg-${RUN}`,
      outputLotType: "parchment",
      provenanceClass: "original_record",
      lecturasDeCierre: [humedadFinal],
    });
    await cerrar(p.id, cereza1, humedadFinal);

    // Fila patrón: nueve lecturas, tres marcadas (la del lavado en dos manejos: cuatro marcas). Sin esto, «las sin marcar no
    // proponen ninguno» pasaría sobre un mundo donde todas están marcadas.
    expect(mediciones).toHaveLength(9);
    expect(await prisma.processStepClosingReading.count({ where: { measurementId: { in: [lavado, temperaturaFinal, humedadFinal] } } })).toBe(4);

    const r = await convertirLibre(encargado, { lotProcessId: p.id, nombre: `TEST Convertida B1 ${RUN}` });
    const nuevos = await pasosDe(r.versionId);
    expect(r.finesPropuestos).toBe(2);
    // El lavado no tiene de dónde medir la dirección: no propone, y lo dice —una sola vez, aunque la lectura se marcó en dos manejos—.
    expect(r.sinDireccion).toEqual([{ stepId: nuevos.washing, measurementId: lavado }]);
    expect(await finesDe(r.versionId)).toEqual({
      prefermentacion: [],
      washing: [],
      fermentation: [["temperature", "gte", "26", "C", temperaturaFinal]],
      drying: [["moisture", "lte", "11.2", "%", humedadFinal]],
    });
  }, 90000);

  it("sin ninguna lectura marcada no se propone ningún fin, aunque el secado tenga lecturas", async () => {
    const l = await libre("B2", ["drying"]);
    const seco = await lote("B2", "drying");
    const p = await procesoConReceta(seco, l.versionId);
    const s = await startDryingRun(gestor, {
      lotId: seco,
      startedAt: T("02T08:00:00"),
      provenanceClass: "original_record",
      recipeStepId: l.pasos.drying,
    });
    const deElSecado = (value: number, hora: string) => lectura({ lotId: seco, value, occurredAt: T(hora), dryingRunId: s.run.id });
    await deElSecado(45, "02T10:00:00");
    await deElSecado(30, "04T10:00:00");
    const ultima = await deElSecado(11.2, "06T10:00:00");
    // Se termina SIN marcar ninguna.
    await endDryingRun(gestor, {
      dryingRunId: s.run.id,
      endedAt: T("06T11:00:00"),
      outputLotCode: `B2-perg-${RUN}`,
      outputLotType: "parchment",
      provenanceClass: "original_record",
    });
    await cerrar(p.id, seco, ultima);
    // Fila patrón: tres lecturas en el secado y cero marcas.
    expect([mediciones.length, await prisma.processStepClosingReading.count({ where: { measurementId: { in: mediciones } } })]).toEqual([3, 0]);

    const r = await convertirLibre(encargado, { lotProcessId: p.id, nombre: `TEST Convertida B2 ${RUN}` });
    expect([r.finesPropuestos, r.sinDireccion]).toEqual([0, []]);
    expect(await finesDe(r.versionId)).toEqual({ drying: [] });
    // Control: la receta SÍ se creó, con su paso.
    expect(Object.keys(await pasosDe(r.versionId))).toEqual(["drying"]);
  }, 60000);
  it("la dirección se mide con las lecturas VIGENTES: una lectura corregida cuenta por su corrección, no por lo que se tecleó mal", async () => {
    const l = await libre("B3", ["drying"]);
    const seco = await lote("B3", "drying");
    const p = await procesoConReceta(seco, l.versionId);
    const s = await startDryingRun(gestor, {
      lotId: seco,
      startedAt: T("02T08:00:00"),
      provenanceClass: "original_record",
      recipeStepId: l.pasos.drying,
    });
    const deElSecado = (value: number, hora: string) => lectura({ lotId: seco, value, occurredAt: T(hora), dryingRunId: s.run.id });
    // La primera lectura se tecleó mal —8 %, cuando eran 45 %— y se corrigió cinco minutos después: la serie de verdad es 45 → 30 → 11,2.
    const mala = await deElSecado(8, "02T10:00:00");
    await deElSecado(30, "04T10:00:00");
    const ultima = await deElSecado(11.2, "06T10:00:00");
    const buena = (
      await correctMeasurement(gestor, {
        measurementId: mala,
        value: 45,
        unit: "%",
        occurredAt: T("02T10:05:00"),
        reason: `TEST corrección (${RUN})`,
        provenanceClass: "original_record",
      })
    ).id;
    mediciones.push(buena);
    await endDryingRun(gestor, {
      dryingRunId: s.run.id,
      endedAt: T("06T11:00:00"),
      outputLotCode: `B3-perg-${RUN}`,
      outputLotType: "parchment",
      provenanceClass: "original_record",
      lecturasDeCierre: [ultima],
    });
    await cerrar(p.id, seco, ultima);
    // Fila patrón: la serie CRUDA de la corrida (sin mirar correcciones) subiría de 8 a 11,2; la VIGENTE baja de 45 a 11,2. Si el
    // fin saliera de la cruda, el operador sería `gte`.
    expect((await prisma.measurement.findUniqueOrThrow({ where: { id: buena } })).dryingRunId, "control: la corrección no lleva la corrida").toBeNull();

    const r = await convertirLibre(encargado, { lotProcessId: p.id, nombre: `TEST Convertida B3 ${RUN}` });
    expect([r.finesPropuestos, r.sinDireccion]).toEqual([1, []]);
    expect(await finesDe(r.versionId)).toEqual({ drying: [["moisture", "lte", "11.2", "%", ultima]] });
  }, 60000);

  it("la dirección se mide contra la serie de la MISMA variable: la primera lectura de la corrida, si es de otra variable, no cuenta", async () => {
    // Una corrida con DOS variables cuyas magnitudes no se parecen: la primera lectura es una conductividad (2,0 mS/cm) y las dos
    // siguientes son pH (5,4 y, la marcada, 4,8). El pH BAJÓ, así que el paso termina al llegar a 4,8 o por debajo (`lte`). Si la
    // serie no se filtrara por variable, «la primera lectura» sería la conductividad y 4,8 contra 2,0 sería una SUBIDA (`gte`): un
    // fin que no dice lo contrario de lo medido sino otra cosa. (B1 tiene temperatura y pH en la misma corrida, pero marca la
    // temperatura y su primera lectura también es temperatura: no distingue.)
    //
    // **Qué entra en la serie y qué no**: el OPERADOR se mide con las lecturas vigentes de la corrida que NADIE marcó (el pH 5,4 de
    // arriba no está marcado y es justo contra lo que se compara), pero el UMBRAL sale siempre de una MARCADA (4,8). Una lectura sin
    // marcar nunca produce un fin ni da su valor (§5.3); sólo ayuda a saber hacia dónde iba la variable.
    const l = await libre("B4", ["fermentation"]);
    const cereza4 = await lote("B4");
    const p = await procesoConReceta(cereza4, l.versionId);
    const f = await startFermentationRun(gestor, {
      lotId: cereza4,
      startedAt: T("02T08:00:00"),
      provenanceClass: "original_record",
      recipeStepId: l.pasos.fermentation,
      vesselNote: `TEST tanque (${RUN})`, // desde la 2c (#717) toda fermentación lleva un tanque o su nombre
    });
    const deLaFermentacion = (value: number, hora: string, variable: string, unit: string) =>
      lectura({ lotId: cereza4, value, occurredAt: T(hora), variable, unit, fermentationRunId: f.run.id });
    await deLaFermentacion(2, "02T09:00:00", "ec", "mS/cm");
    await deLaFermentacion(5.4, "02T09:30:00", "ph", "pH");
    const phFinal = await deLaFermentacion(4.8, "03T09:30:00", "ph", "pH");
    await endFermentationRun(gestor, {
      fermentationRunId: f.run.id,
      endedAt: T("04T08:00:00"),
      outputLotCode: `B4-ferm-${RUN}`,
      outputLotType: "drying",
      provenanceClass: "original_record",
      lecturasDeCierre: [phFinal],
    });
    await cerrar(p.id, cereza4);

    // Fila patrón: la PRIMERA lectura de la corrida por fecha es la conductividad (la que un filtro por variable ignora), hay tres
    // lecturas y sólo la última está marcada. Sin esto, «la dirección es lte» pasaría en una corrida donde la primera ya fuera pH.
    const serie = await prisma.measurement.findMany({ where: { fermentationRunId: f.run.id }, orderBy: { occurredAt: "asc" }, select: { id: true, variable: true } });
    expect(serie.map((m) => m.variable), "control: la primera lectura de la corrida es de otra variable").toEqual(["ec", "ph", "ph"]);
    expect((await prisma.processStepClosingReading.findMany({ where: { measurementId: { in: serie.map((m) => m.id) } } })).map((m) => m.measurementId)).toEqual([phFinal]);

    const r = await convertirLibre(encargado, { lotProcessId: p.id, nombre: `TEST Convertida B4 ${RUN}` });
    expect([r.finesPropuestos, r.sinDireccion]).toEqual([1, []]);
    // Un solo fin, del pH marcado (4,8), con la dirección de la serie de pH: baja, `lte`. Ni la conductividad ni el pH 5,4 dan fin propio.
    expect(await finesDe(r.versionId)).toEqual({ fermentation: [["ph", "lte", "4.8", "pH", phFinal]] });
  }, 90000);
});

describe("quién y cuándo se convierte", () => {
  it("convierte quien escribe recetas Y ve el lote, lo gestione o no: el operario, el Farm Manager (con edit_beneficio), quien escribe recetas y no ve este lote y quien no tiene nada se rechazan, y el predicado no se los ofrece", async () => {
    const l = await libre("D1", ["washing"]);
    const loteD = await lote("D1");
    const p = await procesoConReceta(loteD, l.versionId);
    await cerrar(p.id, loteD);
    const nombre = `TEST Convertida D1 ${RUN}`;
    const filaDelLote = await prisma.lot.findUniqueOrThrow({ where: { id: loteD } });
    // Controles de las cuentas, ANTES de los rechazos: sin ellos, un rechazo de abajo podría ser de otra cosa (una cuenta mal armada).
    // Control de la regla de ayer: el Farm Manager SÍ tiene `edit_beneficio`, que hasta V16 bastaba. Su rechazo de abajo es de la regla
    // de hoy (la autoría) y no el de una cuenta sin acceso a nada.
    expect(await puedeEditarBeneficioEnOrganizacion(jefe, orgId), "control: el Farm Manager sí tiene edit_beneficio").toBe(true);
    // Control: quien sólo escribe recetas, y quien las escribe con su ámbito en otra parcela, SÍ tienen la autoría de la organización.
    expect(await puedeAutoriaDeReceta(soloAutor, orgId), "control: el Coffee Process Manager sin perfil de lectura sí tiene la autoría").toBe(true);
    expect(await puedeAutoriaDeReceta(lectorDeOtraParcela, orgId), "control: el lector de otra parcela sí tiene la autoría").toBe(true);
    // Control del lado de `view`: `lector` ve el lote y NO lo gestiona (es lo que distingue `view` de `manage`); `soloAutor` y
    // `lectorDeOtraParcela` no lo ven.
    expect(await puedeGestionarLote(lector, filaDelLote), "control: el lector no gestiona el lote").toBe(false);
    await expect(requireLotAccess(lector, "view", [filaDelLote]), "control: el lector sí ve el lote").resolves.toBeUndefined();
    await expect(requireLotAccess(soloAutor, "view", [filaDelLote])).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(requireLotAccess(lectorDeOtraParcela, "view", [filaDelLote])).rejects.toBeInstanceOf(TraceabilityAccessError);
    // El operario y el Farm Manager ven y gestionan el lote y no tienen la autoría: salen con la frase de la autoría.
    await expect(convertirLibre(gestor, { lotProcessId: p.id, nombre })).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    await expect(convertirLibre(jefe, { lotProcessId: p.id, nombre })).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    // Quien escribe recetas y no ve ESTE lote (sin perfil de lectura, o con su ámbito en otra parcela) sale con el rechazo de acceso;
    // `ajeno` no tiene nada.
    await expect(convertirLibre(soloAutor, { lotProcessId: p.id, nombre })).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(convertirLibre(lectorDeOtraParcela, { lotProcessId: p.id, nombre })).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(convertirLibre(ajeno, { lotProcessId: p.id, nombre })).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "un rechazo dejó una receta").toBe(0);
    for (const quien of [gestor, jefe, soloAutor, lectorDeOtraParcela, ajeno]) expect(await puedeConvertirLibre(quien, p.id)).toBe(false);
    // Control: quien escribe recetas y VE el lote, lo gestione o no, sí (C8): el lector (sólo ve) y el encargado (V14: ve, gestiona y escribe).
    expect(await puedeConvertirLibre(lector, p.id)).toBe(true);
    expect(await puedeConvertirLibre(encargado, p.id)).toBe(true);
    await expect(convertirLibre(lector, { lotProcessId: p.id, nombre })).resolves.toBeDefined();
    expect(await puedeConvertirLibre(lector, p.id)).toBe(false); // ya convertida
    expect(await puedeConvertirLibre(encargado, p.id)).toBe(false);
  }, 40000);

  it("un proceso abierto, uno cerrado por división, uno que no es Libre, uno que no existe y uno ya convertido se rechazan, cada uno con su código", async () => {
    const l = await libre("D2", ["washing"]);
    const nombre = (c: string) => `TEST Convertida D2-${c} ${RUN}`;
    // Abierto: el proceso de una Libre que todavía no termina.
    const loteAbierto = await lote("D2-abierto");
    const abierto = await procesoConReceta(loteAbierto, l.versionId);
    await expect(convertirLibre(encargado, { lotProcessId: abierto.id, nombre: nombre("a") })).rejects.toThrow(new RecipeError("proceso_sin_cerrar_por_humedad"));
    expect(await puedeConvertirLibre(encargado, abierto.id)).toBe(false);
    // Cerrado por DIVISIÓN (no por humedad): §5.3 sólo ofrece convertir «al cerrar por humedad». Es el único proceso del archivo que tiene
    // `endedAt` y NO tiene `closureKind = "moisture"`; con él, la mitad `closureKind` de la comprobación cae sola (un proceso abierto, o
    // el de una receta común, no la ejercen: el abierto ya cae por `endedAt`). Si convirtiera, quedaría escrito el origen del proceso
    // dividido y la conversión posterior de su hijo daría `ya_convertida`.
    const loteDividido = await lote("D2-dividido");
    const parteDelDividido = await lote("D2-parte", "drying");
    const dividido = await procesoConReceta(loteDividido, l.versionId);
    await cerrarPorDivision(dividido.id, loteDividido, [parteDelDividido]);
    // Fila patrón: está TERMINADO (con fecha), es de la MISMA Libre y no tiene origen; lo único que lo distingue del que sí convierte (más
    // abajo, `ok`) es cómo se cerró. Sin esto, el rechazo de abajo podría ser de un proceso abierto o de otra cosa.
    const filaDelDividido = await prisma.lotProcess.findUniqueOrThrow({ where: { id: dividido.id } });
    expect([filaDelDividido.endedAt !== null, filaDelDividido.closureKind, filaDelDividido.processRecipeVersionId, filaDelDividido.origenDeRecetaVersionId]).toEqual([
      true, "divided", l.versionId, null,
    ]);
    await expect(convertirLibre(encargado, { lotProcessId: dividido.id, nombre: nombre("div") })).rejects.toThrow(new RecipeError("proceso_sin_cerrar_por_humedad"));
    expect(await puedeConvertirLibre(encargado, dividido.id), "el predicado ofreció convertir un proceso cerrado por división").toBe(false);
    expect(await prisma.processRecipe.count({ where: { name: nombre("div") } }), "el rechazo dejó una receta").toBe(0);
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: dividido.id } })).origenDeRecetaVersionId, "el rechazo dejó un origen en el proceso dividido").toBeNull();
    // Terminado por humedad, pero con una receta común: no hay Libre que convertir.
    const loteComun = await lote("D2-comun");
    const delComun = await procesoConReceta(loteComun, await recetaComun("D2"));
    await cerrar(delComun.id, loteComun);
    await expect(convertirLibre(encargado, { lotProcessId: delComun.id, nombre: nombre("b") })).rejects.toThrow(new RecipeError("no_es_libre"));
    expect(await puedeConvertirLibre(encargado, delComun.id)).toBe(false);
    // Un proceso que no existe.
    await expect(convertirLibre(encargado, { lotProcessId: randomUUID(), nombre: nombre("c") })).rejects.toThrow(new RecipeError("proceso_no_encontrado"));
    expect(await puedeConvertirLibre(encargado, randomUUID())).toBe(false);
    // Control: terminado y Libre, convierte; y una segunda vez, no.
    const loteOk = await lote("D2-ok");
    const ok = await procesoConReceta(loteOk, l.versionId);
    await cerrar(ok.id, loteOk);
    expect(await puedeConvertirLibre(encargado, ok.id)).toBe(true);
    await expect(convertirLibre(encargado, { lotProcessId: ok.id, nombre: nombre("d") })).resolves.toBeDefined();
    await expect(convertirLibre(encargado, { lotProcessId: ok.id, nombre: nombre("e") })).rejects.toThrow(new RecipeError("ya_convertida"));
    expect(await prisma.processRecipe.count({ where: { name: nombre("e") } })).toBe(0);
    expect(await puedeConvertirLibre(encargado, ok.id)).toBe(false);
  }, 40000);

  it("el nombre es obligatorio y no se repite en la organización", async () => {
    const l = await libre("D3", ["washing"]);
    const loteA = await lote("D3-A");
    const loteB = await lote("D3-B");
    const pA = await procesoConReceta(loteA, l.versionId);
    const pB = await procesoConReceta(loteB, l.versionId);
    await cerrar(pA.id, loteA);
    await cerrar(pB.id, loteB);
    await expect(convertirLibre(encargado, { lotProcessId: pA.id, nombre: "   " })).rejects.toThrow(new RecipeError("nombre_requerido"));
    const nombre = `TEST Convertida D3 ${RUN}`;
    // Control: el primero con ese nombre sale; el segundo choca con `@@unique([organizationId, name])` y sale con nombre.
    await expect(convertirLibre(encargado, { lotProcessId: pA.id, nombre })).resolves.toBeDefined();
    await expect(convertirLibre(encargado, { lotProcessId: pB.id, nombre })).rejects.toThrow(new RecipeError("nombre_repetido"));
    expect(await prisma.processRecipe.count({ where: { name: nombre } })).toBe(1);
    // Y la conversión rechazada no dejó nada a medias: el proceso B sigue sin origen.
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: pB.id } })).origenDeRecetaVersionId).toBeNull();
  }, 40000);
});

describe("dos conversiones a la vez", () => {
  it("decide DESPUÉS de tener el linaje: si otra conversión gana la espera, ésta se rechaza «ya_convertida» y no crea nada", async () => {
    const l = await libre("E1", ["washing"]);
    const loteE = await lote("E1");
    const p = await procesoConReceta(loteE, l.versionId);
    await cerrar(p.id, loteE);
    const nombre = `TEST Convertida E1 ${RUN}`;

    // Otra transacción toma la fila del LOTE (la que `bloquearLinaje` necesita) y, dentro de ella, hace lo que haría una conversión
    // que ya ganó: pone el origen en el proceso. Todavía sin confirmar: quien lea ahora el proceso lo ve sin origen. Sin el
    // bloqueo, la conversión no espera a nadie y termina creando la receta.
    const gana = retener(async (tx) => {
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${loteE}::uuid FOR UPDATE`;
      await tx.lotProcess.update({ where: { id: p.id }, data: { origenDeRecetaVersionId: l.versionId } });
    });
    let conversion: Promise<Resultado<unknown>> | undefined;
    try {
      const pid = await gana.pid;
      conversion = resultadoDe(convertirLibre(encargado, { lotProcessId: p.id, nombre }));
      await esperarQueAlguienEspere(pid, "la conversión no esperó la fila del lote: no bloqueó el linaje");
      gana.soltar();
      await gana.hecho; // COMMIT: el proceso queda con su origen
      const v = await conversion;
      expect(v.ok, "la conversión creó una receta sobre un proceso que otra ya había convertido mientras esperaba").toBe(false);
      if (!v.ok) {
        expect(v.error).toBeInstanceOf(RecipeError);
        expect((v.error as Error).message).toBe("ya_convertida");
      }
      // Control: la otra transacción sí dejó el origen; sin esto, «rechazó» podría ser cualquier otra razón.
      expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).origenDeRecetaVersionId).toBe(l.versionId);
      expect(await prisma.processRecipe.count({ where: { name: nombre } })).toBe(0);
    } finally {
      gana.soltar();
      await gana.hecho.catch(() => undefined);
      await conversion;
    }
  }, 40000);
});

describe("R3 — lo que aporta es el HILO del proceso que se convierte, no todo lo unido a un paso de su versión", () => {
  it("dividido en B y C, convertir B trae lo suyo y lo del proceso que se dividió, y NO lo de su hermana C; C, con lo suyo y lo mismo de arriba", async () => {
    const l = await libre("R3A", ["fermentation", "drying"]);
    const loteA = await lote("R3A-A");
    const loteB = await lote("R3A-B", "drying");
    const loteC = await lote("R3A-C", "drying");
    const p0 = await procesoConReceta(loteA, l.versionId);

    // P0, el que se divide: una fermentación con su lectura de cierre (el pH baja de 5,4 a 4,8).
    const f = await startFermentationRun(gestor, {
      lotId: loteA,
      startedAt: T("02T08:00:00"),
      provenanceClass: "original_record",
      recipeStepId: l.pasos.fermentation,
      vesselNote: `TEST tanque (${RUN})`, // desde la 2c (#717) toda fermentación lleva un tanque o su nombre
    });
    const deLaFermentacion = (value: number, hora: string) =>
      lectura({ lotId: loteA, value, occurredAt: T(hora), variable: "ph", unit: "pH", fermentationRunId: f.run.id });
    await deLaFermentacion(5.4, "02T09:00:00");
    const ph = await deLaFermentacion(4.8, "03T09:00:00");
    await endFermentationRun(gestor, {
      fermentationRunId: f.run.id,
      endedAt: T("04T08:00:00"),
      outputLotCode: `R3A-F-${RUN}`,
      outputLotType: "drying",
      provenanceClass: "original_record",
      lecturasDeCierre: [ph],
    });
    await cerrarPorDivision(p0.id, loteA, [loteB, loteC]);

    // Las dos partes: cada una deriva de P0, comparte su versión, seca su lote, marca SU humedad y se cierra por humedad.
    const parte = async (lotId: string, medidas: [number, string][], marcada: number) => {
      const proceso = await procesoConReceta(lotId, l.versionId, { derivedFrom: p0.id, startedAt: T("05T12:00:00") });
      const s = await startDryingRun(gestor, {
        lotId,
        startedAt: T("05T13:00:00"),
        provenanceClass: "original_record",
        recipeStepId: l.pasos.drying,
      });
      const deElSecado = (value: number, hora: string) => lectura({ lotId, value, occurredAt: T(hora), dryingRunId: s.run.id });
      for (const [value, hora] of medidas) await deElSecado(value, hora);
      const cierre = await deElSecado(marcada, "08T10:00:00");
      await endDryingRun(gestor, {
        dryingRunId: s.run.id,
        endedAt: T("08T11:00:00"),
        outputLotCode: `R3A-perg-${lotId.slice(0, 8)}-${RUN}`,
        outputLotType: "parchment",
        provenanceClass: "original_record",
        lecturasDeCierre: [cierre],
      });
      await cerrar(proceso.id, lotId, cierre);
      return { proceso, cierre };
    };
    const b = await parte(loteB, [[45, "05T14:00:00"], [30, "06T10:00:00"]], 11.2);
    const c = await parte(loteC, [[45, "05T14:00:00"], [38, "06T10:00:00"]], 12.4);

    // Fila patrón: tres lecturas marcadas, y las tres de la MISMA versión de la Libre; B y C comparten el paso del secado. Sin esto,
    // «la de C no llega a B» pasaría sobre un mundo donde C no tiene nada.
    expect(await prisma.processStepClosingReading.count({ where: { measurementId: { in: [ph, b.cierre, c.cierre] } } })).toBe(3);
    expect((await prisma.dryingRun.findMany({ where: { recipeStepId: l.pasos.drying }, select: { id: true } })).length).toBe(2);

    const deB = await convertirLibre(encargado, { lotProcessId: b.proceso.id, nombre: `TEST Convertida R3A-B ${RUN}` });
    expect([deB.finesPropuestos, deB.sinDireccion]).toEqual([2, []]);
    expect(await finesDe(deB.versionId)).toEqual({
      fermentation: [["ph", "lte", "4.8", "pH", ph]],
      drying: [["moisture", "lte", "11.2", "%", b.cierre]],
    });
    // Control: la hermana, con lo suyo (12,4) y lo mismo de arriba, sin lo de B.
    const deC = await convertirLibre(encargado, { lotProcessId: c.proceso.id, nombre: `TEST Convertida R3A-C ${RUN}` });
    expect(await finesDe(deC.versionId)).toEqual({
      fermentation: [["ph", "lte", "4.8", "pH", ph]],
      drying: [["moisture", "lte", "12.4", "%", c.cierre]],
    });
  }, 120000);

  it("una continuación trae lo de su proceso cerrado: dos fines del mismo paso, uno de cada secado", async () => {
    const l = await libre("R3B", ["drying"]);
    const loteA = await lote("R3B-A", "drying");
    const p0 = await procesoConReceta(loteA, l.versionId);
    const secar = async (lotId: string, medidas: [number, string][], marcada: number, dia: string, codigo: string) => {
      const s = await startDryingRun(gestor, {
        lotId,
        startedAt: T(`${dia}T08:00:00`),
        provenanceClass: "original_record",
        recipeStepId: l.pasos.drying,
      });
      const deElSecado = (value: number, hora: string) => lectura({ lotId, value, occurredAt: T(`${dia}T${hora}`), dryingRunId: s.run.id });
      for (const [value, hora] of medidas) await deElSecado(value, hora);
      const cierre = await deElSecado(marcada, "20:00:00");
      const { outputLot } = await endDryingRun(gestor, {
        dryingRunId: s.run.id,
        endedAt: T(`${dia}T21:00:00`),
        outputLotCode: `R3B-${codigo}-${RUN}`,
        outputLotType: "parchment",
        provenanceClass: "original_record",
        lecturasDeCierre: [cierre],
      });
      return { cierre, salida: outputLot.id };
    };
    // El primer secado cierra el proceso a 13,5 % —demasiado húmedo—, y el lote vuelve a secado: la continuación deriva de ese proceso.
    const primero = await secar(loteA, [[45, "10:00:00"], [30, "14:00:00"]], 13.5, "02", "uno");
    await cerrar(p0.id, loteA, primero.cierre, T("03T09:00:00"));
    const continuacion = await procesoConReceta(primero.salida, l.versionId, { derivedFrom: p0.id, startedAt: T("04T12:00:00") });
    const segundo = await secar(primero.salida, [[13.5, "10:00:00"], [12.4, "14:00:00"]], 11.2, "05", "dos");
    await cerrar(continuacion.id, primero.salida, segundo.cierre);

    // Fila patrón: son dos secados distintos del mismo paso, cada uno con su marca, en dos procesos distintos.
    expect(await prisma.processStepClosingReading.count({ where: { measurementId: { in: [primero.cierre, segundo.cierre] } } })).toBe(2);
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: continuacion.id } })).derivedFromLotProcessId).toBe(p0.id);

    const r = await convertirLibre(encargado, { lotProcessId: continuacion.id, nombre: `TEST Convertida R3B ${RUN}` });
    expect([r.finesPropuestos, r.sinDireccion]).toEqual([2, []]);
    const { drying } = await finesDe(r.versionId);
    expect(drying!.map((f) => [f[0], f[1], f[2], f[4]]).sort()).toEqual(
      [
        ["moisture", "lte", "11.2", segundo.cierre],
        ["moisture", "lte", "13.5", primero.cierre],
      ].sort(),
    );
  }, 90000);

  it("si el hilo pasa por un lote que quien convierte NO ve, no convierte —ni se le ofrece—; quien ve todos los lotes del hilo, sí", async () => {
    const l = await libre("R3C", ["drying"]);
    // El proceso que se dividió vive en la parcela hermana; su parte, en la del archivo.
    const loteA = await lote("R3C-A", "drying", otraParcelaId);
    const loteB = await lote("R3C-B", "drying");
    const p0 = await procesoConReceta(loteA, l.versionId);
    const s = await startDryingRun(encargadoDeAmbas, {
      lotId: loteA,
      startedAt: T("02T08:00:00"),
      provenanceClass: "original_record",
      recipeStepId: l.pasos.drying,
    });
    const deElSecado = (value: number, hora: string) => lectura({ lotId: loteA, value, occurredAt: T(hora), dryingRunId: s.run.id });
    await deElSecado(45, "02T10:00:00");
    const marcada = await deElSecado(11.8, "04T10:00:00");
    await endDryingRun(encargadoDeAmbas, {
      dryingRunId: s.run.id,
      endedAt: T("04T11:00:00"),
      outputLotCode: `R3C-perg-${RUN}`,
      outputLotType: "parchment",
      provenanceClass: "original_record",
      lecturasDeCierre: [marcada],
    });
    await cerrarPorDivision(p0.id, loteA, [loteB]);
    const p1 = await procesoConReceta(loteB, l.versionId, { derivedFrom: p0.id, startedAt: T("05T12:00:00") });
    await cerrar(p1.id, loteB);
    const nombre = `TEST Convertida R3C ${RUN}`;

    // Controles de las cuentas, ANTES del rechazo: `lector` ve el lote del proceso (B) y escribe recetas en la organización —así que
    // lo único que le falta es el lote A del hilo—, y `encargadoDeAmbas` ve los dos.
    const filaDeB = await prisma.lot.findUniqueOrThrow({ where: { id: loteB } });
    const filaDeA = await prisma.lot.findUniqueOrThrow({ where: { id: loteA } });
    await expect(requireLotAccess(lector, "view", [filaDeB]), "control: el lector ve el lote del proceso").resolves.toBeUndefined();
    expect(await puedeAutoriaDeReceta(lector, orgId), "control: el lector escribe recetas en la organización").toBe(true);
    await expect(requireLotAccess(lector, "view", [filaDeA]), "control: el lector no ve el lote del hilo").rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(requireLotAccess(encargadoDeAmbas, "view", [filaDeA]), "control: encargadoDeAmbas sí").resolves.toBeUndefined();
    expect(await prisma.processStepClosingReading.count({ where: { measurementId: marcada } }), "control: el hilo tiene de verdad una marca en A").toBe(1);

    await expect(convertirLibre(lector, { lotProcessId: p1.id, nombre })).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await puedeConvertirLibre(lector, p1.id)).toBe(false);
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "el rechazo dejó una receta").toBe(0);
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p1.id } })).origenDeRecetaVersionId, "el rechazo dejó un origen").toBeNull();

    // Control: quien ve los dos lotes convierte, y su predicado lo ofrece.
    expect(await puedeConvertirLibre(encargadoDeAmbas, p1.id)).toBe(true);
    const r = await convertirLibre(encargadoDeAmbas, { lotProcessId: p1.id, nombre });
    expect(await finesDe(r.versionId)).toEqual({ drying: [["moisture", "lte", "11.8", "%", marcada]] });
  }, 120000);
});

describe("R3 — el lote del proceso de un manejo del hilo también se ve", () => {
  it("un manejo de un proceso del hilo que vive en un lote oculto no se aporta aunque su lectura sea de un lote que se ve; quien ve los dos, sí", async () => {
    const l = await libre("R3D", ["washing"]);
    // El proceso que se dividió vive en la parcela hermana, pero la lectura que su manejo marcó es de un descendiente de la del archivo.
    const loteA = await lote("R3D-A", "cherry", otraParcelaId);
    const hijoVisible = await lote("R3D-H");
    const loteB = await lote("R3D-B", "drying");
    await enlazar([loteA], [hijoVisible]);
    const p0 = await procesoConReceta(loteA, l.versionId);
    const lectura0 = await lectura({ lotId: hijoVisible, value: 21, occurredAt: T("01T13:00:00"), variable: "temperature", unit: "C" });
    await registrarIntervencion(encargadoDeAmbas, {
      lotProcessId: p0.id,
      recipeStepId: l.pasos.washing,
      occurredAt: T("01T14:00:00"),
      lecturasDeCierre: [lectura0],
    });
    await cerrarPorDivision(p0.id, loteA, [loteB]);
    const p1 = await procesoConReceta(loteB, l.versionId, { derivedFrom: p0.id, startedAt: T("05T12:00:00") });
    await cerrar(p1.id, loteB);
    const nombre = `TEST Convertida R3D ${RUN}`;

    // Controles: la lectura ES de un lote que `lector` ve, y lo único que no ve es el lote donde vive el proceso del manejo.
    const filaDelHijo = await prisma.lot.findUniqueOrThrow({ where: { id: hijoVisible } });
    const filaDeA = await prisma.lot.findUniqueOrThrow({ where: { id: loteA } });
    await expect(requireLotAccess(lector, "view", [filaDelHijo]), "control: el lector ve el lote de la lectura").resolves.toBeUndefined();
    await expect(requireLotAccess(lector, "view", [filaDeA]), "control: el lector no ve el lote del proceso del manejo").rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await prisma.processStepClosingReading.count({ where: { measurementId: lectura0 } }), "control: el hilo tiene una marca de un manejo").toBe(1);

    await expect(convertirLibre(lector, { lotProcessId: p1.id, nombre })).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await puedeConvertirLibre(lector, p1.id)).toBe(false);
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "el rechazo dejó una receta").toBe(0);
    // Control: quien ve los dos lotes convierte; un manejo no tiene serie, así que su lectura vuelve en `sinDireccion`.
    expect(await puedeConvertirLibre(encargadoDeAmbas, p1.id)).toBe(true);
    const r = await convertirLibre(encargadoDeAmbas, { lotProcessId: p1.id, nombre });
    // El paso NUEVO tiene que existir: con `undefined` a los dos lados (la receta sin copiar sus pasos) la igualdad pasaría vacía.
    const lavadoNuevo = (await pasosDe(r.versionId)).washing;
    expect(lavadoNuevo, "control: la receta nueva trae el paso de lavado copiado").toBeDefined();
    expect([r.finesPropuestos, r.sinDireccion]).toEqual([0, [{ stepId: lavadoNuevo, measurementId: lectura0 }]]);
  }, 90000);
});

describe("R4 — el fin sale de la lectura VIGENTE de la marca, aunque se corrigiera después de marcarla", () => {
  it("marcar, corregir DESPUÉS y convertir: el fin lleva la corrección —su valor, su unidad, su fecha y su id—; la marca sigue siendo la que se hizo", async () => {
    const l = await libre("R4", ["drying"]);
    const seco = await lote("R4", "drying");
    const p = await procesoConReceta(seco, l.versionId);
    const s = await startDryingRun(gestor, {
      lotId: seco,
      startedAt: T("02T08:00:00"),
      provenanceClass: "original_record",
      recipeStepId: l.pasos.drying,
    });
    const deElSecado = (value: number, hora: string) => lectura({ lotId: seco, value, occurredAt: T(hora), dryingRunId: s.run.id });
    await deElSecado(45, "02T10:00:00");
    await deElSecado(30, "04T10:00:00");
    const marcada = await deElSecado(11.2, "06T10:00:00");
    await endDryingRun(gestor, {
      dryingRunId: s.run.id,
      endedAt: T("06T11:00:00"),
      outputLotCode: `R4-perg-${RUN}`,
      outputLotType: "parchment",
      provenanceClass: "original_record",
      lecturasDeCierre: [marcada],
    });
    await cerrar(p.id, seco, marcada);
    // El martes se corrige: se tecleó 11,2 y era 10,9. La corrección no toca la marca.
    const buena = (
      await correctMeasurement(gestor, {
        measurementId: marcada,
        value: 10.9,
        unit: "%",
        occurredAt: T("06T10:05:00"),
        reason: `TEST corrección (${RUN})`,
        provenanceClass: "original_record",
      })
    ).id;
    mediciones.push(buena);
    // Fila patrón: la marca sigue apuntando a la lectura cruda, y la corrección no está marcada en ningún sitio.
    expect((await prisma.processStepClosingReading.findMany({ where: { measurementId: { in: [marcada, buena] } } })).map((m) => m.measurementId)).toEqual([marcada]);

    const r = await convertirLibre(encargado, { lotProcessId: p.id, nombre: `TEST Convertida R4 ${RUN}` });
    expect([r.finesPropuestos, r.sinDireccion]).toEqual([1, []]);
    expect(await finesDe(r.versionId)).toEqual({ drying: [["moisture", "lte", "10.9", "%", buena]] });
  }, 60000);

  it("una lectura marcada y su corrección marcada son una sola condición: las dos marcas llevan a la misma vigente", async () => {
    const l = await libre("R4D", ["washing"]);
    const lotA = await lote("R4D");
    const p = await procesoConReceta(lotA, l.versionId);
    const manejo = (hora: string, lecturasDeCierre: string[]) =>
      registrarIntervencion(gestor, { lotProcessId: p.id, recipeStepId: l.pasos.washing, occurredAt: T(`01T${hora}:00:00`), lecturasDeCierre });
    // Se marca la lectura, se corrige, y el manejo siguiente marca la corrección (que ya es la vigente): dos marcas, dos ids distintos.
    const cruda = await lectura({ lotId: lotA, value: 21, occurredAt: T("01T13:00:00"), variable: "temperature", unit: "C" });
    await manejo("14", [cruda]);
    const buena = (
      await correctMeasurement(gestor, {
        measurementId: cruda,
        value: 22,
        unit: "C",
        occurredAt: T("01T13:05:00"),
        reason: `TEST corrección (${RUN})`,
        provenanceClass: "original_record",
      })
    ).id;
    mediciones.push(buena);
    await manejo("15", [buena]);
    await cerrar(p.id, lotA);
    // Fila patrón: dos marcas, de dos lecturas distintas.
    expect((await prisma.processStepClosingReading.findMany({ where: { measurementId: { in: [cruda, buena] } } })).map((m) => m.measurementId).sort()).toEqual([cruda, buena].sort());

    const r = await convertirLibre(encargado, { lotProcessId: p.id, nombre: `TEST Convertida R4D ${RUN}` });
    // Un manejo no tiene serie: sin dirección, y UNA sola vez, con la id de la corrección.
    // El paso NUEVO tiene que existir: con `undefined` a los dos lados (la receta sin copiar sus pasos) la igualdad pasaría vacía.
    const lavadoNuevo = (await pasosDe(r.versionId)).washing;
    expect(lavadoNuevo, "control: la receta nueva trae el paso de lavado copiado").toBeDefined();
    expect([r.finesPropuestos, r.sinDireccion]).toEqual([0, [{ stepId: lavadoNuevo, measurementId: buena }]]);
  }, 60000);
});

describe("R16 — ver el lote en una organización y escribir recetas sólo en OTRA no basta para convertir", () => {
  it("sale con la frase de la autoría, el predicado no lo ofrece y no queda ninguna receta, ni en la organización del lote ni en la otra", async () => {
    const l = await libre("R16", ["washing"]);
    const loteR = await lote("R16");
    const p = await procesoConReceta(loteR, l.versionId);
    await cerrar(p.id, loteR);
    const nombre = `TEST Convertida R16 ${RUN}`;
    const filaDelLote = await prisma.lot.findUniqueOrThrow({ where: { id: loteR } });
    // Controles de la cuenta, ANTES del rechazo: VE el lote, y SÍ escribe recetas —en la otra organización—. Lo único que le falta es la
    // autoría de la organización DEL LOTE.
    await expect(requireLotAccess(cruzada, "view", [filaDelLote]), "control: ve el lote").resolves.toBeUndefined();
    expect(await puedeAutoriaDeReceta(cruzada, otraOrgId), "control: escribe recetas en la otra organización").toBe(true);
    expect(await puedeAutoriaDeReceta(cruzada, orgId), "control: no en la del lote").toBe(false);

    await expect(convertirLibre(cruzada, { lotProcessId: p.id, nombre })).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    expect(await puedeConvertirLibre(cruzada, p.id)).toBe(false);
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "el rechazo dejó una receta en la organización del lote").toBe(0);
    expect(await prisma.processRecipe.count({ where: { organizationId: otraOrgId } }), "el rechazo dejó una receta en la otra organización").toBe(0);
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).origenDeRecetaVersionId).toBeNull();
    // Control: quien escribe en la organización del lote y lo ve, convierte —y la receta es de ESA organización—.
    expect(await puedeConvertirLibre(encargado, p.id)).toBe(true);
    const r = await convertirLibre(encargado, { lotProcessId: p.id, nombre });
    expect((await prisma.processRecipe.findUniqueOrThrow({ where: { id: r.recipeId } })).organizationId).toBe(orgId);
  }, 40000);
});

describe("R24 — la receta convertida hereda la clasificación de su Libre, y con ella viaja su intención", () => {
  // La Libre real hereda la clasificación del lote (tarea 10, R8) y guarda la intención cruda en su `description`; `convertirLibre` copia
  // ese texto a la receta nueva, y tiene que copiar también el nivel que lo protege: sin él nace `internal`, y una intención confidencial
  // queda a la vista de quien alcanza lo interno. Cada caso arma el lote, la Libre y el proceso con LA MISMA clasificación y lo cierra con
  // `confidencial`, la única cuenta de las del archivo que alcanza lo confidencial.
  const armar = async (etiqueta: string, clasificacion: ClassificationLevel) => {
    const l = await libre(etiqueta, ["washing"], false, clasificacion);
    const loteR = await lote(etiqueta, "cherry", plotId, clasificacion);
    const p = await procesoConReceta(loteR, l.versionId);
    await cerrar(p.id, loteR, undefined, undefined, confidencial);
    return { l, loteR, p };
  };

  it("R24a: un lote confidencial da una receta confidencial, con su intención; quien no alcanza lo confidencial no convierte ni se le ofrece", async () => {
    const { l, loteR, p } = await armar("R24a", "confidential");
    const nombre = `TEST Convertida R24a ${RUN}`;
    const filaDelLote = await prisma.lot.findUniqueOrThrow({ where: { id: loteR } });
    // Fila patrón: el lote y la Libre SON confidenciales. Si el fixture no lo dejara así, el fallo de abajo sería del fixture y no de la conversión.
    expect([filaDelLote.classification, (await prisma.processRecipe.findUniqueOrThrow({ where: { id: l.recipeId } })).classification]).toEqual([
      "confidential",
      "confidential",
    ]);
    // Control de las cuentas, ANTES de los rechazos: `encargado` escribe recetas y gestiona lotes internal, pero ni el Farm Operator ni el Coffee
    // Process Manager llevan `classification:clear_confidential` (lo lleva el Research Lead), así que NO ve este lote —lo confidencial muerde de
    // verdad—; `confidencial` sí.
    await expect(requireLotAccess(encargado, "view", [filaDelLote]), "control: encargado no alcanza lo confidencial").rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(requireLotAccess(confidencial, "view", [filaDelLote]), "control: confidencial sí lo ve").resolves.toBeUndefined();
    await expect(convertirLibre(encargado, { lotProcessId: p.id, nombre })).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await puedeConvertirLibre(encargado, p.id)).toBe(false);
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "un rechazo dejó una receta").toBe(0);
    // Control: quien sí lo alcanza lo ve y convierte, y la receta sale con el nivel y la intención de su Libre.
    expect(await puedeConvertirLibre(confidencial, p.id)).toBe(true);
    const r = await convertirLibre(confidencial, { lotProcessId: p.id, nombre });
    const receta = await prisma.processRecipe.findUniqueOrThrow({ where: { id: r.recipeId } });
    expect([receta.classification, receta.description]).toEqual(["confidential", `TEST intención R24a ${RUN}`]);
  }, 40000);

  it("R24b, control: un lote internal da una receta internal —la clasificación se hereda, no es un valor fijo—", async () => {
    const { p } = await armar("R24b", "internal");
    const r = await convertirLibre(confidencial, { lotProcessId: p.id, nombre: `TEST Convertida R24b ${RUN}` });
    const receta = await prisma.processRecipe.findUniqueOrThrow({ where: { id: r.recipeId } });
    expect([receta.classification, receta.description]).toEqual(["internal", `TEST intención R24b ${RUN}`]);
  }, 40000);
});
