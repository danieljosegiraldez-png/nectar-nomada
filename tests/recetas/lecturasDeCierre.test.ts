/**
 * Las lecturas de cierre — Parte 2a, tarea 11 (diseño §5.3; registro del plan, 2026-10-03: «`lecturasDeCierre` entra por las
 * TRES puertas que terminan una corrida», más el manejo del proceso).
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md
 *
 * Mide, por cada puerta, que las lecturas que se le pasan quedan MARCADAS (`process_step_closing_reading`) con quién las marcó,
 * que sin ellas no se marca ninguna, y que una lectura que no es del registro rechaza el cierre ENTERO
 * (`lectura_de_cierre_ajena`) sin dejar nada a medias. Y, desde la adjudicación I4 del 2026-10-04, que **lo que se marca es la lectura
 * VIGENTE**: una lectura corregida se marca por su corrección (que NO lleva la corrida: `correctMeasurement` no copia
 * `fermentationRunId` ni `dryingRunId`), y la original reemplazada se rechaza con su propio código (`lectura_reemplazada`), que
 * no se confunde con una ajena. Las cuatro llamadas: `endFermentationRun`, `endDryingRun`, bajar la
 * última bandeja (`bajarBandeja`; las dos últimas cierran por `cerrarCorridaEnTransaccion`) y `registrarIntervencion` del proceso.
 *
 * **Cada rechazo lleva su control al lado**: la misma puerta, sobre el mismo registro, con la lectura que SÍ es suya. Sin él, un
 * rechazo por otra causa (un lote mal armado, un proceso cerrado) se leería como la guardia.
 *
 * **R5 (revisión adversaria, 2026-10-05): de qué lote es cada lectura y quién puede citarla.** Una lectura «es de la corrida» si lleva
 * su id Y es del lote que entró en ella —`recordMeasurement` ata una cosa y la otra por separado, sin comprobar que la corrida sea de
 * ese lote—, y marcar una lectura exige VER su lote, no sólo gestionar el del registro: un manejo del proceso admite lecturas de un
 * descendiente, que puede estar en una parcela que quien marca no ve. Cuatro pruebas: la lectura de OTRA corrida del mismo lote,
 * el lote de la corrida (con permisos de sobra, para que el rechazo sea sólo del lote), el descendiente oculto contra quien sí lo ve, y
 * una cuenta que sólo gestiona la parcela HERMANA, por las cuatro puertas. Y `vigenteDe` (R4), que lleva cualquier eslabón de una
 * cadena de correcciones a su vigente, también si la cadena se bifurca.
 *
 * **Las lecturas se escriben con `prisma` directo**, no con `recordMeasurement`: lo que se mide es el marcado, y las reglas de una
 * lectura (variable, unidad, rango) no cambian nada de lo que decide. **Salvo las que atan una lectura a la corrida de OTRO lote**
 * (R5), que van por el servicio para que la prueba enseñe que lo ACEPTA: ese es el hueco que `lecturasCandidatasDeCierre` cierra, y
 * si algún día `recordMeasurement` lo cerrara, esas pruebas caerían en su fila patrón y dirían que ya no hace falta. **Las
 * correcciones también van por el servicio real** (`correctMeasurement`, que esta tarea no toca): lo que importa es la forma exacta
 * de la fila que deja.
 *
 * **Los procesos se abren con `abrirProcesoDePrueba`** (tarea 5): bajo su receta de prueba, que no tiene pasos, ningún registro
 * es desviación (§4.4), así que ninguna corrida de este archivo necesita paso ni motivo.
 *
 * **Usuario con ámbito acotado** (Farm Operator de su parcela), no Platform Admin: ve sólo lo del archivo, y nada aquí cuenta filas
 * de toda la base. Para R5 hay una parcela hermana de la MISMA organización y tres cuentas más: `gestorDeAmbas` (Farm Operator en las
 * dos parcelas: ve y gestiona el descendiente que `gestor` no ve), `veLaOtra` (Farm Operator en la del archivo y sólo Project Viewer en
 * la hermana: ve el descendiente sin gestionarlo) y `gestorDeOtra` (Farm Operator sólo en la hermana: gestiona lo suyo y no ve nada de
 * la parcela del archivo). Que un hermano queda fuera de un ámbito de ubicación lo dice `conAncestros` en `lib/rbac/service.ts`
 * («Un HERMANO sigue fuera»); las pruebas lo comprueban antes de apoyarse en ello.
 *
 * **Lo que crea cada `it` se borra en `afterEach`**, nunca debajo de las aserciones, en orden de clave ajena: las marcas antes que
 * las lecturas (RESTRICT; caen también con su registro), las intervenciones y sus eventos, las bandejas, los procesos, las
 * lecturas, las transformaciones y las corridas —también las crudas que crea una prueba—, los lotes y los equipos. Lo del
 * `beforeAll` va en `afterAll`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { lecturasCandidatasDeCierre, vigenteDe } from "../../lib/recetas/lecturasDeCierre";
import { bajarBandeja } from "../../lib/traceability/bandejasDelSecado";
import { endDryingRun, startDryingRun } from "../../lib/traceability/drying";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { endFermentationRun, startFermentationRun } from "../../lib/traceability/fermentation";
import { registrarIntervencion } from "../../lib/traceability/lotProcess";
import { puedeGestionarLote, requireLotAccess, TraceabilityAccessError } from "../../lib/traceability/lots";
import { correctMeasurement, recordMeasurement } from "../../lib/traceability/measurements";
import type { LotType } from "../../generated/prisma/client";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";

const RUN = `lecturas-${Date.now()}`;
/** Un instante de marzo de 2026: `T("02T08:00:00")`. */
const T = (s: string) => new Date(`2026-03-${s}Z`);

let orgId: string;
let plotId: string;
let scopeId: string;
let gestor: string;
/** R5: otra parcela de la MISMA organización, con su ámbito, y las tres cuentas que la distinguen. */
let otraParcelaId: string;
let otroScopeId: string;
let gestorDeAmbas: string;
let gestorDeOtra: string;
let veLaOtra: string;
let tipoDeBandeja: string;
let aguaLimpia: string;
let bandejaN = 0;
/** Lo que crea cada `it`; lo vacía el `afterEach`. */
const mediciones: string[] = [];
const equipos: string[] = [];
/** Corridas CRUDAS (sin transformación ni lote de entrada: sólo importa su id) que crea un `it`; las borra el `afterEach`. */
const corridasCrudas = { fermentacion: [] as string[], secado: [] as string[] };

/** Un lote de la parcela del archivo, o de la que se diga. Todo lote lleva `RUN` en su código: el `afterEach` los encuentra por él. */
async function lote(codigo: string, lotType: LotType = "cherry", locationId: string = plotId) {
  return (
    await prisma.lot.create({
      data: {
        lotCode: `${codigo}-${RUN}`,
        lotType,
        organizationId: orgId,
        locationId,
        status: "approved",
        classification: "internal",
        createdBy: gestor,
      },
    })
  ).id;
}

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

/** Una lectura cruda. Con `fermentationRunId` o `dryingRunId` es de esa corrida (el formulario de la ficha manda la clave). */
async function lectura(o: {
  lotId: string;
  value: number;
  occurredAt: Date;
  variable?: string;
  unit?: string;
  fermentationRunId?: string;
  dryingRunId?: string;
  /** Una corrección CRUDA de esta lectura (sólo para armar lo que el servicio no deja: dos correcciones de la misma). */
  correctsId?: string;
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
        correctsId: o.correctsId ?? null,
        reason: o.correctsId === undefined ? null : `TEST corrección cruda (${RUN})`,
        provenanceClass: "measured_fact",
        createdBy: gestor,
      },
    })
  ).id;
  mediciones.push(id);
  return id;
}

/**
 * Una lectura por el SERVICIO real (`recordMeasurement`, como la manda el formulario de la ficha): sólo para lo que hay que probar que
 * el servicio ACEPTA —atarle a una lectura el id de una corrida de OTRO lote—. Las demás se escriben crudas.
 */
async function lecturaPorElServicio(o: {
  lotId: string;
  value: number;
  occurredAt: Date;
  variable: "ph" | "moisture";
  unit: string;
  fermentationRunId?: string;
  dryingRunId?: string;
}) {
  const m = await recordMeasurement(gestor, { ...o, provenanceClass: "measured_fact" });
  mediciones.push(m.id);
  return m.id;
}

/** Un lote con proceso abierto y una fermentación empezada, por `quien` y en la parcela `donde`. */
async function fermentacion(codigo: string, quien: string = gestor, donde: string = plotId) {
  const lotId = await lote(codigo, "cherry", donde);
  await abrirProcesoDePrueba(quien, lotId);
  // Desde la 2c «tanques» (#717) toda fermentación lleva un tanque registrado o el nombre escrito de uno (`recipiente_o_nota_obligatorio`).
  const { run } = await startFermentationRun(quien, {
    lotId,
    startedAt: T("02T08:00:00"),
    provenanceClass: "original_record",
    vesselNote: `TEST tanque (${RUN})`,
  });
  return { lotId, runId: run.id };
}
const terminarFermentacion = (runId: string, codigo: string, lecturasDeCierre?: string[], quien: string = gestor) =>
  endFermentationRun(quien, {
    fermentationRunId: runId,
    endedAt: T("04T08:00:00"),
    outputLotCode: `${codigo}-${RUN}`,
    outputLotType: "drying",
    provenanceClass: "original_record",
    lecturasDeCierre,
  });

/** Un lote con proceso abierto y un secado empezado, por `quien` y en la parcela `donde`. */
async function secado(codigo: string, quien: string = gestor, donde: string = plotId) {
  const lotId = await lote(codigo, "drying", donde);
  await abrirProcesoDePrueba(quien, lotId);
  const { run } = await startDryingRun(quien, { lotId, startedAt: T("02T08:00:00"), provenanceClass: "original_record" });
  return { lotId, runId: run.id };
}
const terminarSecado = (runId: string, codigo: string, lecturasDeCierre?: string[], quien: string = gestor) =>
  endDryingRun(quien, {
    dryingRunId: runId,
    endedAt: T("06T08:00:00"),
    outputLotCode: `${codigo}-${RUN}`,
    outputLotType: "parchment",
    provenanceClass: "original_record",
    lecturasDeCierre,
  });

/** Una bandeja cargada con el secado: la fila cruda, con su equipo (la base exige un recipiente numerado de su organización). */
async function cargarBandeja(runId: string) {
  const n = ++bandejaN;
  const e = await prisma.equipment.create({
    data: {
      name: `TEST Bandeja ${n} (${RUN})`,
      kind: "vessel",
      format: "other",
      organizationId: orgId,
      provenanceClass: "original_record",
      trayTypeId: tipoDeBandeja,
      trayNumber: n,
    },
  });
  equipos.push(e.id);
  return (
    await prisma.dryingRunTray.create({
      data: { dryingRunId: runId, equipmentId: e.id, desde: T("02T09:00:00"), provenanceClass: "original_record", createdBy: gestor },
    })
  ).id;
}
const bajarLaUltima = (dryingRunTrayId: string, codigo: string, lecturasDeCierre?: string[], quien: string = gestor) =>
  bajarBandeja(quien, {
    dryingRunTrayId,
    hasta: T("06T08:00:00"),
    cierre: { outputLotCode: `${codigo}-${RUN}`, outputLotType: "parchment", provenanceClass: "original_record", lecturasDeCierre },
  });

/** Una cuenta con un perfil en cada ámbito que se diga: `[perfil, ámbito]`. */
async function cuentaCon(etiqueta: string, asignaciones: readonly (readonly ["Farm Operator" | "Project Viewer", string])[]): Promise<string> {
  const persona = await prisma.person.create({ data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN})`, locale: "es" } });
  const id = (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  for (const [perfil, ambito] of asignaciones) {
    const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    await prisma.assignment.create({ data: { userAccountId: id, roleProfileId: rp.id, scopeId: ambito } });
  }
  return id;
}

const marcasDe = (donde: { fermentationRunId?: string; dryingRunId?: string; lotProcessInterventionId?: string }) =>
  prisma.processStepClosingReading.findMany({ where: assertDefinedWhere(donde), orderBy: { createdAt: "asc" } });
const fermentacionTerminada = async (id: string) => (await prisma.fermentationRun.findUniqueOrThrow({ where: { id } })).endedAt;
const secadoTerminado = async (id: string) => (await prisma.dryingRun.findUniqueOrThrow({ where: { id } })).endedAt;
const ajena = new LotProcessError("lectura_de_cierre_ajena");
const reemplazada = new LotProcessError("lectura_reemplazada");

/** Corrige una lectura POR EL SERVICIO REAL y apunta la corrección para limpiarla: devuelve su id. */
async function corregir(measurementId: string, value: number, unit: string, occurredAt: Date) {
  const c = await correctMeasurement(gestor, {
    measurementId,
    value,
    unit,
    occurredAt,
    reason: `TEST corrección (${RUN})`,
    provenanceClass: "original_record",
  });
  mediciones.push(c.id);
  return c.id;
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })
  ).id;
  plotId = (
    await prisma.location.create({
      data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
    })
  ).id;
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Gestor", displayName: `TEST Gestor (${RUN})`, locale: "es" },
  });
  gestor = (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  aguaLimpia = (
    await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: "agua_limpia", catalog: { key: "medio_lavado" } },
      select: { id: true },
    })
  ).id;
  tipoDeBandeja = (
    await prisma.dryingTrayType.create({
      data: { organizationId: orgId, name: `TEST tipo ${RUN}`, widthCm: 100, lengthCm: 60, entryUnit: "cm" },
    })
  ).id;
  otraParcelaId = (
    await prisma.location.create({
      data: { locationType: "plot", name: `TEST otra parcela ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
    })
  ).id;
  otroScopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: otraParcelaId } })).id;
  gestorDeAmbas = await cuentaCon("GestorDeAmbas", [["Farm Operator", scopeId], ["Farm Operator", otroScopeId]]);
  gestorDeOtra = await cuentaCon("GestorDeOtra", [["Farm Operator", otroScopeId]]);
  veLaOtra = await cuentaCon("VeLaOtra", [["Farm Operator", scopeId], ["Project Viewer", otroScopeId]]);
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

/** Las organizaciones del RUN, por su nombre. */
async function organizacionesDelRun(): Promise<string[]> {
  return (await prisma.organization.findMany({ where: assertDefinedWhere({ name: { startsWith: `TEST ${RUN}` } }), select: { id: true } })).map((o) => o.id);
}

/**
 * Todo lo que un `it` crea y que NO es del fixture, descubierto por el RUN y por la organización: lotes (los de la organización y los
 * que llevan el RUN en su código), sus corridas, bandejas, manejos, procesos, lecturas, marcas y la auditoría de las cuentas. En orden de
 * clave ajena. La llama `afterEach` tras cada prueba (falle o no) y `afterAll` una última vez.
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
  // Las marcas, antes que las lecturas que sostienen (RESTRICT). Caen también con su registro, pero no se cuenta con eso.
  await prisma.processStepClosingReading.deleteMany({ where: assertDefinedWhere({ measurementId: { in: lecturas } }) });
  // Los manejos del proceso, con su evento (cuelga de ellos por su `entityId`).
  const manejos = (
    await prisma.lotProcessIntervention.findMany({
      where: assertDefinedWhere({ lotProcess: { lotId: { in: todos } } }),
      select: { id: true },
    })
  ).map((m) => m.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "lot_process_intervention", entityId: { in: manejos } }) });
  await prisma.lotProcessIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: manejos } }) });
  // Las bandejas, antes que su corrida y que su equipo (RESTRICT): las de los secados del RUN y las de los equipos del RUN.
  const equiposDelRun = [
    ...new Set([
      ...equipos,
      ...(
        await prisma.equipment.findMany({
          where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }),
          select: { id: true },
        })
      ).map((e) => e.id),
    ]),
  ];
  await prisma.dryingRunTray.deleteMany({ where: assertDefinedWhere({ OR: [{ dryingRunId: { in: sec } }, { equipmentId: { in: equiposDelRun } }] }) });
  // Los procesos (y la receta de prueba de la organización), antes que sus lotes y sus mediciones de cierre.
  await borrarProcesosDeLotesDonde({ id: { in: todos } });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: lecturas } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: todos } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: tIds } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: [...ferm, ...corridasCrudas.fermentacion] } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: [...sec, ...corridasCrudas.secado] } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: todos } }) });
  await prisma.equipment.deleteMany({ where: assertDefinedWhere({ id: { in: equiposDelRun } }) });
  // Todo lo que escribieron las cuentas del RUN y no colgaba de nada de arriba (`fermentation_run.start`, `drying_run.start`,
  // `drying_run_tray.bajar`, `lot_transformation.create`). Antes de borrar su cuenta: el actor es SET NULL y después no se encontrarían.
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: await cuentasDelRun() } }) });
  mediciones.length = 0;
  equipos.length = 0;
  corridasCrudas.fermentacion.length = 0;
  corridasCrudas.secado.length = 0;
}

afterEach(limpiarLoDelRun);

afterAll(async () => {
  // La limpieza DESCUBRE lo que borra, no lo hereda del `beforeAll`: si éste muere antes de asignar `orgId`, `plotId`, `gestor`…
  // (o a mitad de `cuentaCon`, con la persona creada y la cuenta no), esas variables siguen `undefined`. Todo sale de la marca del
  // RUN: la organización por su nombre y de ella sus ubicaciones; las personas por su `displayName` y de ellas las cuentas; de las
  // ubicaciones, los ámbitos.
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
  // En orden de clave ajena: asignaciones y ámbitos, cuentas y personas, el tipo de bandeja (cuelga de la organización), las ubicaciones
  // y, la última, la organización.
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.dryingTrayType.deleteMany({ where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }) });
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
    ["dryingTrayType", await prisma.dryingTrayType.count({ where: { name: { contains: RUN } } })],
    ["equipment", await prisma.equipment.count({ where: { name: { contains: RUN } } })],
    ["lot", await prisma.lot.count({ where: { lotCode: { contains: RUN } } })],
    ["person (nombre)", await prisma.person.count({ where: { displayName: { contains: RUN } } })],
  ];
  const sobran = [...deLasCuentas, ...restos].filter(([, n]) => n > 0);
  if (sobran.length > 0) throw new Error(`lecturasDeCierre.test: la limpieza dejó filas del RUN ${RUN}: ${sobran.map(([tabla, n]) => `${tabla}=${n}`).join(", ")}`);
}, 60000);

describe("cada puerta que cierra un registro marca las lecturas que se le pasan, con quién las marcó", () => {
  it("endFermentationRun marca las de su corrida; las que no se pasan no se marcan, y sin ninguna no se marca nada", async () => {
    const a = await fermentacion("F1");
    const m1 = await lectura({ lotId: a.lotId, value: 5.4, occurredAt: T("02T10:00:00"), variable: "ph", unit: "pH", fermentationRunId: a.runId });
    const m2 = await lectura({ lotId: a.lotId, value: 4.3, occurredAt: T("04T07:00:00"), variable: "ph", unit: "pH", fermentationRunId: a.runId });
    await terminarFermentacion(a.runId, "F1-fin", [m2]);
    const marcadas = await marcasDe({ fermentationRunId: a.runId });
    expect(marcadas.map((x) => x.measurementId)).toEqual([m2]);
    expect(marcadas[0]!.createdBy).toBe(gestor);
    expect([marcadas[0]!.dryingRunId, marcadas[0]!.lotProcessInterventionId]).toEqual([null, null]);
    // Fila patrón: la corrida tiene DOS lecturas, y la otra no se marcó.
    expect(await prisma.measurement.count({ where: { fermentationRunId: a.runId } })).toBe(2);
    expect(m1).not.toBe(m2);

    // Control: la misma puerta, sin lecturas de cierre, termina la corrida y no marca nada.
    const b = await fermentacion("F2");
    await terminarFermentacion(b.runId, "F2-fin");
    expect(await fermentacionTerminada(b.runId)).not.toBeNull();
    expect(await marcasDe({ fermentationRunId: b.runId })).toEqual([]);
  }, 30000);

  it("endDryingRun marca las de su corrida, con quién las marcó; sin ninguna no se marca nada", async () => {
    const a = await secado("S1");
    const m1 = await lectura({ lotId: a.lotId, value: 45, occurredAt: T("02T10:00:00"), dryingRunId: a.runId });
    const m2 = await lectura({ lotId: a.lotId, value: 11.2, occurredAt: T("06T07:00:00"), dryingRunId: a.runId });
    await terminarSecado(a.runId, "S1-fin", [m2]);
    const marcadas = await marcasDe({ dryingRunId: a.runId });
    expect(marcadas.map((x) => x.measurementId)).toEqual([m2]);
    expect(marcadas[0]!.createdBy).toBe(gestor);
    expect([marcadas[0]!.fermentationRunId, marcadas[0]!.lotProcessInterventionId]).toEqual([null, null]);
    expect(await prisma.measurement.count({ where: { dryingRunId: a.runId } })).toBe(2);
    expect(m1).not.toBe(m2);

    const b = await secado("S2");
    await terminarSecado(b.runId, "S2-fin");
    expect(await secadoTerminado(b.runId)).not.toBeNull();
    expect(await marcasDe({ dryingRunId: b.runId })).toEqual([]);
  }, 30000);

  it("bajarBandeja, al bajar la última, cierra el secado y marca las lecturas del cierre", async () => {
    const a = await secado("B1");
    const bandejaA = await cargarBandeja(a.runId);
    const mA = await lectura({ lotId: a.lotId, value: 11.2, occurredAt: T("06T07:00:00"), dryingRunId: a.runId });
    expect(await bajarLaUltima(bandejaA, "B1-fin", [mA])).toEqual({ id: bandejaA, cerro: true });
    expect(await secadoTerminado(a.runId)).not.toBeNull();
    const marcadas = await marcasDe({ dryingRunId: a.runId });
    expect(marcadas.map((x) => x.measurementId)).toEqual([mA]);
    expect(marcadas[0]!.createdBy).toBe(gestor);

    // Control: la misma baja, sin lecturas de cierre, cierra y no marca nada.
    const b = await secado("B2");
    const bandejaB = await cargarBandeja(b.runId);
    expect(await bajarLaUltima(bandejaB, "B2-fin")).toEqual({ id: bandejaB, cerro: true });
    expect(await secadoTerminado(b.runId)).not.toBeNull();
    expect(await marcasDe({ dryingRunId: b.runId })).toEqual([]);
  }, 30000);

  it("registrarIntervencion marca lecturas del lote del proceso y de un descendiente, desde que el proceso empezó; sin ellas no marca nada", async () => {
    const cereza = await lote("I1");
    const hijo = await lote("I1-H");
    await enlazar([cereza], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, cereza); // empieza el 2020-01-01
    const m1 = await lectura({ lotId: cereza, value: 21, occurredAt: T("01T10:00:00"), variable: "temperature", unit: "C" });
    const m2 = await lectura({ lotId: hijo, value: 20, occurredAt: T("01T11:00:00"), variable: "temperature", unit: "C" });
    const i = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      catalogValueId: aguaLimpia,
      occurredAt: T("01T12:00:00"),
      lecturasDeCierre: [m1, m2],
    });
    const marcadas = await marcasDe({ lotProcessInterventionId: i.id });
    expect(marcadas.map((x) => x.measurementId).sort()).toEqual([m1, m2].sort());
    expect(marcadas.every((x) => x.createdBy === gestor)).toBe(true);
    expect([marcadas[0]!.fermentationRunId, marcadas[0]!.dryingRunId]).toEqual([null, null]);

    // Control: el mismo manejo, sin lecturas de cierre, se registra y no marca nada.
    const j = await registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: T("01T13:00:00") });
    expect(await marcasDe({ lotProcessInterventionId: j.id })).toEqual([]);
  }, 30000);
});

describe("sólo se marca lo que es del registro, y todo o nada", () => {
  it("una lectura de otra corrida, o tomada sin corrida, rechaza «lectura_de_cierre_ajena» y la fermentación no termina; con la suya, termina", async () => {
    const a = await fermentacion("R1-A");
    const b = await fermentacion("R1-B");
    const deB = await lectura({ lotId: b.lotId, value: 4.3, occurredAt: T("03T10:00:00"), variable: "ph", unit: "pH", fermentationRunId: b.runId });
    const sinCorrida = await lectura({ lotId: a.lotId, value: 4.4, occurredAt: T("03T11:00:00"), variable: "ph", unit: "pH" });
    const deA = await lectura({ lotId: a.lotId, value: 4.2, occurredAt: T("03T12:00:00"), variable: "ph", unit: "pH", fermentationRunId: a.runId });
    // Una sola ajena, una sin corrida, y una buena MEZCLADA con una ajena: la ajena rechaza todo el cierre.
    for (const lista of [[deB], [sinCorrida], [deA, deB]]) {
      await expect(terminarFermentacion(a.runId, "R1-fin", lista)).rejects.toThrow(ajena);
    }
    expect(await fermentacionTerminada(a.runId)).toBeNull();
    expect(await marcasDe({ fermentationRunId: a.runId })).toEqual([]);
    expect(await prisma.lotTransformation.count({ where: { fermentationRunId: a.runId } })).toBe(1); // sólo la de empezar
    // Control: con la suya, termina y marca.
    await terminarFermentacion(a.runId, "R1-fin", [deA]);
    expect(await fermentacionTerminada(a.runId)).not.toBeNull();
    expect((await marcasDe({ fermentationRunId: a.runId })).map((x) => x.measurementId)).toEqual([deA]);
  }, 40000);

  it("lo mismo en el secado: una lectura de otro secado, o sin corrida, rechaza el cierre y el secado sigue abierto; con la suya, cierra", async () => {
    const a = await secado("R2-A");
    const b = await secado("R2-B");
    const deB = await lectura({ lotId: b.lotId, value: 11, occurredAt: T("05T10:00:00"), dryingRunId: b.runId });
    const sinCorrida = await lectura({ lotId: a.lotId, value: 11.4, occurredAt: T("05T11:00:00") });
    const deA = await lectura({ lotId: a.lotId, value: 11.2, occurredAt: T("05T12:00:00"), dryingRunId: a.runId });
    for (const lista of [[deB], [sinCorrida], [deA, deB]]) {
      await expect(terminarSecado(a.runId, "R2-fin", lista)).rejects.toThrow(ajena);
    }
    expect(await secadoTerminado(a.runId)).toBeNull();
    expect(await marcasDe({ dryingRunId: a.runId })).toEqual([]);
    expect(await prisma.lotTransformation.count({ where: { dryingRunId: a.runId } })).toBe(1);
    await terminarSecado(a.runId, "R2-fin", [deA]);
    expect(await secadoTerminado(a.runId)).not.toBeNull();
    expect((await marcasDe({ dryingRunId: a.runId })).map((x) => x.measurementId)).toEqual([deA]);
  }, 40000);

  it("al bajar la última bandeja, una lectura ajena deshace la baja y el cierre; con la suya, cierra", async () => {
    const a = await secado("R3-A");
    const b = await secado("R3-B");
    const bandejaA = await cargarBandeja(a.runId);
    const deB = await lectura({ lotId: b.lotId, value: 11, occurredAt: T("05T10:00:00"), dryingRunId: b.runId });
    const deA = await lectura({ lotId: a.lotId, value: 11.2, occurredAt: T("05T11:00:00"), dryingRunId: a.runId });
    await expect(bajarLaUltima(bandejaA, "R3-fin", [deB])).rejects.toThrow(ajena);
    expect((await prisma.dryingRunTray.findUniqueOrThrow({ where: { id: bandejaA } })).hasta).toBeNull(); // la baja se deshizo
    expect(await secadoTerminado(a.runId)).toBeNull();
    expect(await marcasDe({ dryingRunId: a.runId })).toEqual([]);
    await expect(bajarLaUltima(bandejaA, "R3-fin", [deA])).resolves.toEqual({ id: bandejaA, cerro: true });
    expect((await marcasDe({ dryingRunId: a.runId })).map((x) => x.measurementId)).toEqual([deA]);
  }, 40000);

  it("una intervención rechaza la lectura de otro lote y la anterior al proceso, sin escribir la intervención; con una buena, entra —también la tomada justo cuando empezó el proceso—", async () => {
    const cereza = await lote("R4");
    const otro = await lote("R4-otro");
    const p = await abrirProcesoDePrueba(gestor, cereza); // empieza el 2020-01-01
    const deOtro = await lectura({ lotId: otro, value: 20, occurredAt: T("01T10:00:00"), variable: "temperature", unit: "C" });
    const anterior = await lectura({ lotId: cereza, value: 20, occurredAt: new Date("2019-12-31T12:00:00Z"), variable: "temperature", unit: "C" });
    const buena = await lectura({ lotId: cereza, value: 21, occurredAt: T("01T11:00:00"), variable: "temperature", unit: "C" });
    for (const lista of [[deOtro], [anterior], [buena, deOtro]]) {
      await expect(
        registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: T("01T12:00:00"), lecturasDeCierre: lista }),
      ).rejects.toThrow(ajena);
    }
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
    const i = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      catalogValueId: aguaLimpia,
      occurredAt: T("01T12:00:00"),
      lecturasDeCierre: [buena],
    });
    expect((await marcasDe({ lotProcessInterventionId: i.id })).map((x) => x.measurementId)).toEqual([buena]);

    // La frontera: «desde que el proceso empezó» incluye el instante exacto en que empezó (`gte`, no `gt`). Una lectura tomada AHÍ es
    // suya; una un milisegundo antes, no. Sin la primera mitad, un `gt` rechazaría la lectura que se tomó al abrir el proceso.
    const inicio = (await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).startedAt;
    const justoAlEmpezar = await lectura({ lotId: cereza, value: 20.5, occurredAt: inicio, variable: "temperature", unit: "C" });
    const unMsAntes = await lectura({ lotId: cereza, value: 20.4, occurredAt: new Date(inicio.getTime() - 1), variable: "temperature", unit: "C" });
    // Fila patrón: la primera está en el instante EXACTO del inicio del proceso, la otra un milisegundo antes (leído de la base, no de la
    // constante del ayudante que abre el proceso).
    const enLaBase = await prisma.measurement.findMany({ where: { id: { in: [justoAlEmpezar, unMsAntes] } }, select: { id: true, occurredAt: true } });
    expect(enLaBase.find((m) => m.id === justoAlEmpezar)!.occurredAt.getTime(), "control: la lectura está en el instante exacto del inicio").toBe(inicio.getTime());
    expect(enLaBase.find((m) => m.id === unMsAntes)!.occurredAt.getTime(), "control: la otra está un milisegundo antes").toBe(inicio.getTime() - 1);
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: T("01T13:00:00"), lecturasDeCierre: [unMsAntes] }),
      "un milisegundo antes del inicio entró",
    ).rejects.toThrow(ajena);
    const j = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      catalogValueId: aguaLimpia,
      occurredAt: T("01T13:00:00"),
      lecturasDeCierre: [justoAlEmpezar],
    });
    expect((await marcasDe({ lotProcessInterventionId: j.id })).map((x) => x.measurementId), "la lectura del instante exacto del inicio no se marcó").toEqual([justoAlEmpezar]);
  }, 40000);

  it("un id que no existe o que no es un uuid se rechaza como ajeno; en mayúsculas, con espacios y repetido, se marca una vez; una cadena vacía o en blanco es «no viene»", async () => {
    const a = await fermentacion("U1");
    const deA = await lectura({ lotId: a.lotId, value: 4.2, occurredAt: T("03T12:00:00"), variable: "ph", unit: "pH", fermentationRunId: a.runId });
    for (const lista of [[randomUUID()], ["esto-no-es-un-uuid"], [deA, randomUUID()]]) {
      await expect(terminarFermentacion(a.runId, "U1-fin", lista)).rejects.toThrow(ajena);
    }
    expect(await fermentacionTerminada(a.runId)).toBeNull();
    // Control: la misma lectura dos veces, una en mayúsculas, termina y se marca UNA vez.
    await terminarFermentacion(a.runId, "U1-fin", [deA, deA.toUpperCase()]);
    expect(await fermentacionTerminada(a.runId)).not.toBeNull();
    expect((await marcasDe({ fermentationRunId: a.runId })).map((x) => x.measurementId)).toEqual([deA]);

    // La normalización de la lista, una a una: `marcarLecturasDeCierre` dice que una cadena vacía es «no viene» (un formulario que manda
    // `""` cuando no se marcó nada —la tarea 13 puede mandarlo—) y que un id con espacios es el mismo id. Cada caso en SU corrida, porque
    // una fermentación termina una vez, y cada uno aísla una de las tres operaciones de la normalización:
    //  - `[""]` sólo lo resuelve el filtro de vacíos (quitarlo deja un id "" que no es de nadie: «ajena» y la corrida sin terminar);
    //  - `[" " + id + " "]` sólo lo resuelve el `trim` (sin él el id con espacios no es de nadie);
    //  - `[" "]` necesita las dos: el `trim` lo deja vacío y el filtro lo quita.
    const vacia = await fermentacion("U1-vacia");
    await expect(terminarFermentacion(vacia.runId, "U1-vacia-fin", [""]), "una cadena vacía se leyó como un id y rechazó el cierre").resolves.toBeDefined();
    expect(await fermentacionTerminada(vacia.runId)).not.toBeNull();
    expect(await marcasDe({ fermentationRunId: vacia.runId }), "una cadena vacía marcó algo").toEqual([]);

    const conEspacios = await fermentacion("U1-espacios");
    const deLaDeEspacios = await lectura({
      lotId: conEspacios.lotId,
      value: 4.1,
      occurredAt: T("03T12:00:00"),
      variable: "ph",
      unit: "pH",
      fermentationRunId: conEspacios.runId,
    });
    await expect(
      terminarFermentacion(conEspacios.runId, "U1-espacios-fin", [` ${deLaDeEspacios} `]),
      "un id con espacios alrededor no se leyó como el mismo id y rechazó el cierre",
    ).resolves.toBeDefined();
    expect(await fermentacionTerminada(conEspacios.runId)).not.toBeNull();
    expect((await marcasDe({ fermentationRunId: conEspacios.runId })).map((x) => x.measurementId), "el id con espacios no se marcó como la lectura que es").toEqual([deLaDeEspacios]);

    const enBlanco = await fermentacion("U1-blanco");
    await expect(terminarFermentacion(enBlanco.runId, "U1-blanco-fin", [" ", "  "]), "una cadena en blanco se leyó como un id y rechazó el cierre").resolves.toBeDefined();
    expect(await fermentacionTerminada(enBlanco.runId)).not.toBeNull();
    expect(await marcasDe({ fermentationRunId: enBlanco.runId }), "una cadena en blanco marcó algo").toEqual([]);
  }, 60000);

  it("la lectura de OTRA corrida no es de ésta aunque se tomara en el mismo lote: la fermentación y el secado la rechazan «ajena»; la de su corrida entra", async () => {
    const f = await fermentacion("U2-F");
    const s = await secado("U2-S");
    // Otra corrida de cada clase, CRUDA y sin lote de entrada propio: de ella sólo importa su id, que es lo que lleva la lectura.
    const otraF = (await prisma.fermentationRun.create({ data: { startedAt: T("02T07:00:00"), createdBy: gestor } })).id;
    const otraS = (await prisma.dryingRun.create({ data: { startedAt: T("02T07:00:00"), createdBy: gestor } })).id;
    corridasCrudas.fermentacion.push(otraF);
    corridasCrudas.secado.push(otraS);
    const deOtraF = await lectura({ lotId: f.lotId, value: 4.4, occurredAt: T("03T11:00:00"), variable: "ph", unit: "pH", fermentationRunId: otraF });
    const deF = await lectura({ lotId: f.lotId, value: 4.2, occurredAt: T("03T12:00:00"), variable: "ph", unit: "pH", fermentationRunId: f.runId });
    const deOtraS = await lectura({ lotId: s.lotId, value: 11.4, occurredAt: T("05T11:00:00"), dryingRunId: otraS });
    const deS = await lectura({ lotId: s.lotId, value: 11.2, occurredAt: T("05T12:00:00"), dryingRunId: s.runId });
    // Fila patrón: las ajenas son del MISMO lote que las buenas, así que el lote no las distingue: sólo la corrida.
    expect((await prisma.measurement.findMany({ where: { id: { in: [deOtraF, deF] } }, select: { lotId: true } })).map((x) => x.lotId)).toEqual([f.lotId, f.lotId]);
    expect((await prisma.measurement.findMany({ where: { id: { in: [deOtraS, deS] } }, select: { lotId: true } })).map((x) => x.lotId)).toEqual([s.lotId, s.lotId]);

    for (const lista of [[deOtraF], [deF, deOtraF]]) await expect(terminarFermentacion(f.runId, "U2-F-fin", lista)).rejects.toThrow(ajena);
    for (const lista of [[deOtraS], [deS, deOtraS]]) await expect(terminarSecado(s.runId, "U2-S-fin", lista)).rejects.toThrow(ajena);
    expect([await fermentacionTerminada(f.runId), await secadoTerminado(s.runId)]).toEqual([null, null]);
    expect([await marcasDe({ fermentationRunId: f.runId }), await marcasDe({ dryingRunId: s.runId })]).toEqual([[], []]);
    await terminarFermentacion(f.runId, "U2-F-fin", [deF]);
    await terminarSecado(s.runId, "U2-S-fin", [deS]);
    expect((await marcasDe({ fermentationRunId: f.runId })).map((x) => x.measurementId)).toEqual([deF]);
    expect((await marcasDe({ dryingRunId: s.runId })).map((x) => x.measurementId)).toEqual([deS]);
  }, 60000);
});

describe("lo que se marca es la lectura VIGENTE: una lectura corregida se marca por su corrección (adjudicación I4)", () => {
  it("fermentación: la corrección de una lectura de la corrida se marca; la original y la corrección reemplazada, `lectura_reemplazada`; las de otra corrida, `ajena`", async () => {
    const a = await fermentacion("C1-A");
    const b = await fermentacion("C1-B");
    const m1 = await lectura({ lotId: a.lotId, value: 5.4, occurredAt: T("02T10:00:00"), variable: "ph", unit: "pH", fermentationRunId: a.runId });
    const m2 = await lectura({ lotId: a.lotId, value: 4.3, occurredAt: T("03T10:00:00"), variable: "ph", unit: "pH", fermentationRunId: a.runId });
    // Una cadena de dos correcciones: m1 → c1 → c2. La vigente es c2.
    const c1 = await corregir(m1, 5.5, "pH", T("02T10:05:00"));
    const c2 = await corregir(c1, 5.45, "pH", T("02T10:10:00"));
    // Otra corrida, con su lectura corregida: no es de ésta, ni su original ni su corrección.
    const deB = await lectura({ lotId: b.lotId, value: 4.6, occurredAt: T("03T11:00:00"), variable: "ph", unit: "pH", fermentationRunId: b.runId });
    const cB = await corregir(deB, 4.7, "pH", T("03T11:05:00"));
    // Fila patrón: la corrección NO lleva la corrida. Por eso la cadena se decide por su raíz: sin ella, c2 sería «ajena».
    const fila = await prisma.measurement.findUniqueOrThrow({ where: { id: c2 }, select: { fermentationRunId: true, correctsId: true, lotId: true } });
    expect([fila.fermentationRunId, fila.correctsId, fila.lotId]).toEqual([null, c1, a.lotId]);

    // La definición única: las vigentes de las cadenas de esta corrida, en orden de fecha, y las reemplazadas aparte.
    const { candidatas, reemplazadas } = await lecturasCandidatasDeCierre(prisma, { registro: "fermentationRun", registroId: a.runId, loteDeLaCorrida: a.lotId });
    expect(candidatas.map((l) => l.id)).toEqual([c2, m2]);
    expect([...reemplazadas].sort()).toEqual([m1, c1].sort());

    for (const lista of [[m1], [c1], [m2, m1]]) {
      await expect(terminarFermentacion(a.runId, "C1-fin", lista)).rejects.toThrow(reemplazada);
    }
    for (const lista of [[deB], [cB], [c2, cB]]) {
      await expect(terminarFermentacion(a.runId, "C1-fin", lista)).rejects.toThrow(ajena);
    }
    expect(await fermentacionTerminada(a.runId)).toBeNull();
    expect(await marcasDe({ fermentationRunId: a.runId })).toEqual([]);
    // Control: la corrección vigente, junto a una lectura que nadie corrigió, termina la corrida y se marca.
    await terminarFermentacion(a.runId, "C1-fin", [c2, m2]);
    expect(await fermentacionTerminada(a.runId)).not.toBeNull();
    expect((await marcasDe({ fermentationRunId: a.runId })).map((x) => x.measurementId).sort()).toEqual([c2, m2].sort());
  }, 60000);

  it("secado: la corrección vigente se marca por `endDryingRun` y por la última bandeja; la original reemplazada se rechaza «lectura_reemplazada»", async () => {
    const a = await secado("C2-A");
    const m1 = await lectura({ lotId: a.lotId, value: 11.2, occurredAt: T("06T07:00:00"), dryingRunId: a.runId });
    const c1 = await corregir(m1, 11.4, "%", T("06T07:05:00"));
    await expect(terminarSecado(a.runId, "C2-fin", [m1])).rejects.toThrow(reemplazada);
    expect(await secadoTerminado(a.runId)).toBeNull();
    // Por la otra puerta, la de la última bandeja: lo mismo, y la baja se deshace.
    const bandeja = await cargarBandeja(a.runId);
    await expect(bajarLaUltima(bandeja, "C2-fin", [m1])).rejects.toThrow(reemplazada);
    expect((await prisma.dryingRunTray.findUniqueOrThrow({ where: { id: bandeja } })).hasta).toBeNull();
    expect(await marcasDe({ dryingRunId: a.runId })).toEqual([]);
    // Control: la corrección, por la misma puerta, cierra y se marca.
    await expect(bajarLaUltima(bandeja, "C2-fin", [c1])).resolves.toEqual({ id: bandeja, cerro: true });
    expect((await marcasDe({ dryingRunId: a.runId })).map((x) => x.measurementId)).toEqual([c1]);
  }, 60000);

  it("manejo del proceso: la corrección de una lectura del lote se marca; la original reemplazada se rechaza «lectura_reemplazada» y no se escribe la intervención", async () => {
    const cereza = await lote("C3");
    const p = await abrirProcesoDePrueba(gestor, cereza); // empieza el 2020-01-01
    const m1 = await lectura({ lotId: cereza, value: 21, occurredAt: T("01T10:00:00"), variable: "temperature", unit: "C" });
    const c1 = await corregir(m1, 22, "C", T("01T10:05:00"));
    const manejo = (lecturasDeCierre: string[]) =>
      registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: T("01T12:00:00"), lecturasDeCierre });
    await expect(manejo([m1])).rejects.toThrow(reemplazada);
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } }), "el rechazo dejó una intervención").toBe(0);
    // Control: la corrección vigente entra, y se marca para ESA intervención.
    const i = await manejo([c1]);
    expect((await marcasDe({ lotProcessInterventionId: i.id })).map((x) => x.measurementId)).toEqual([c1]);
  }, 40000);
});

describe("R5: de qué lote es cada lectura, y quién puede citarla", () => {
  it("una lectura que lleva el id de la corrida pero es de OTRO lote no es de la corrida: las tres puertas de corrida la rechazan «ajena»; la del lote de la corrida entra", async () => {
    const f = await fermentacion("L1-F");
    const s = await secado("L1-S");
    const b = await secado("L1-B");
    const bandeja = await cargarBandeja(b.runId);
    // Otro lote de la misma parcela: `gestor` lo gestiona, así que ningún rechazo de abajo es de permisos.
    const otro = await lote("L1-otro");
    const deFOtro = await lecturaPorElServicio({ lotId: otro, value: 4.4, occurredAt: T("03T11:00:00"), variable: "ph", unit: "pH", fermentationRunId: f.runId });
    const deF = await lectura({ lotId: f.lotId, value: 4.2, occurredAt: T("03T12:00:00"), variable: "ph", unit: "pH", fermentationRunId: f.runId });
    const deSOtro = await lecturaPorElServicio({ lotId: otro, value: 11.4, occurredAt: T("05T11:00:00"), variable: "moisture", unit: "%", dryingRunId: s.runId });
    const deS = await lectura({ lotId: s.lotId, value: 11.2, occurredAt: T("05T12:00:00"), dryingRunId: s.runId });
    const deBOtro = await lecturaPorElServicio({ lotId: otro, value: 11.3, occurredAt: T("05T11:30:00"), variable: "moisture", unit: "%", dryingRunId: b.runId });
    const deB = await lectura({ lotId: b.lotId, value: 11.1, occurredAt: T("05T12:30:00"), dryingRunId: b.runId });
    // Fila patrón: el servicio real ACEPTÓ atar esas tres lecturas a una corrida de otro lote —ése es el hueco—, y las tres LLEVAN el id de su
    // corrida (sin esto, «se rechaza» sería «no lleva la corrida», que ya vale desde antes).
    const llevanLaCorrida = await prisma.measurement.count({
      where: { id: { in: [deFOtro, deSOtro, deBOtro] }, OR: [{ fermentationRunId: f.runId }, { dryingRunId: { in: [s.runId, b.runId] } }] },
    });
    expect(llevanLaCorrida).toBe(3);

    for (const lista of [[deFOtro], [deF, deFOtro]]) await expect(terminarFermentacion(f.runId, "L1-F-fin", lista)).rejects.toThrow(ajena);
    expect(await fermentacionTerminada(f.runId)).toBeNull();
    expect(await marcasDe({ fermentationRunId: f.runId })).toEqual([]);
    await terminarFermentacion(f.runId, "L1-F-fin", [deF]); // control: la del lote de la corrida
    expect((await marcasDe({ fermentationRunId: f.runId })).map((x) => x.measurementId)).toEqual([deF]);

    for (const lista of [[deSOtro], [deS, deSOtro]]) await expect(terminarSecado(s.runId, "L1-S-fin", lista)).rejects.toThrow(ajena);
    expect(await secadoTerminado(s.runId)).toBeNull();
    expect(await marcasDe({ dryingRunId: s.runId })).toEqual([]);
    await terminarSecado(s.runId, "L1-S-fin", [deS]);
    expect((await marcasDe({ dryingRunId: s.runId })).map((x) => x.measurementId)).toEqual([deS]);

    for (const lista of [[deBOtro], [deB, deBOtro]]) await expect(bajarLaUltima(bandeja, "L1-B-fin", lista)).rejects.toThrow(ajena);
    expect((await prisma.dryingRunTray.findUniqueOrThrow({ where: { id: bandeja } })).hasta).toBeNull(); // la baja se deshizo
    expect(await secadoTerminado(b.runId)).toBeNull();
    expect(await marcasDe({ dryingRunId: b.runId })).toEqual([]);
    await expect(bajarLaUltima(bandeja, "L1-B-fin", [deB])).resolves.toEqual({ id: bandeja, cerro: true });
    expect((await marcasDe({ dryingRunId: b.runId })).map((x) => x.measurementId)).toEqual([deB]);
  }, 90000);

  it("un manejo rechaza la lectura de un descendiente que quien marca NO ve, sin escribir nada; quien ve los dos lotes marca la misma", async () => {
    const cereza = await lote("L2");
    const hijoOculto = await lote("L2-H", "cherry", otraParcelaId);
    await enlazar([cereza], [hijoOculto]);
    const p = await abrirProcesoDePrueba(gestor, cereza);
    const deLaCereza = await lectura({ lotId: cereza, value: 21, occurredAt: T("01T10:00:00"), variable: "temperature", unit: "C" });
    const deHijo = await lectura({ lotId: hijoOculto, value: 20, occurredAt: T("01T11:00:00"), variable: "temperature", unit: "C" });
    const manejo = (quien: string, lecturasDeCierre: string[]) =>
      registrarIntervencion(quien, { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: T("01T12:00:00"), lecturasDeCierre });
    // Controles de la prueba, ANTES de los rechazos: `gestor` no ve el lote del hijo y `gestorDeAmbas` sí; y la definición de qué se puede
    // marcar SÍ incluye la lectura del hijo: la quita la autorización, no la fuente.
    const filaDelHijo = await prisma.lot.findUniqueOrThrow({ where: { id: hijoOculto } });
    await expect(requireLotAccess(gestor, "view", [filaDelHijo]), "control: gestor no ve la parcela hermana").rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(requireLotAccess(gestorDeAmbas, "view", [filaDelHijo]), "control: gestorDeAmbas sí").resolves.toBeUndefined();
    const { candidatas } = await lecturasCandidatasDeCierre(prisma, { registro: "lotProcessIntervention", registroId: "", loteDelProceso: cereza, desde: p.startedAt });
    expect(candidatas.map((l) => l.id).sort()).toEqual([deLaCereza, deHijo].sort());

    // El descendiente oculto, solo y mezclado con una lectura buena: todo o nada, y nada se escribió.
    for (const lista of [[deHijo], [deLaCereza, deHijo]]) {
      await expect(manejo(gestor, lista)).rejects.toBeInstanceOf(TraceabilityAccessError);
    }
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } }), "el rechazo dejó una intervención").toBe(0);
    expect(await prisma.processStepClosingReading.count({ where: { measurementId: { in: [deLaCereza, deHijo] } } }), "el rechazo dejó una marca").toBe(0);
    // Control: quien ve los dos lotes marca las mismas dos lecturas, y la marca lleva su nombre.
    const i = await manejo(gestorDeAmbas, [deLaCereza, deHijo]);
    const marcadas = await marcasDe({ lotProcessInterventionId: i.id });
    expect(marcadas.map((x) => x.measurementId).sort()).toEqual([deLaCereza, deHijo].sort());
    expect(marcadas.every((x) => x.createdBy === gestorDeAmbas)).toBe(true);
    // Y quien sólo VE el lote del descendiente, sin gestionarlo, también: citar una lectura pide `view`, no `manage`.
    await expect(puedeGestionarLote(veLaOtra, filaDelHijo), "control: veLaOtra no gestiona la parcela hermana").resolves.toBe(false);
    await expect(requireLotAccess(veLaOtra, "view", [filaDelHijo]), "control: veLaOtra sí la ve").resolves.toBeUndefined();
    const j = await manejo(veLaOtra, [deLaCereza, deHijo]);
    expect((await marcasDe({ lotProcessInterventionId: j.id })).map((x) => x.measurementId).sort()).toEqual([deLaCereza, deHijo].sort());
  }, 60000);

  it("una cuenta que sólo gestiona la parcela HERMANA no marca nada de la nuestra por ninguna de las cuatro puertas; con lo de su parcela, cada puerta marca", async () => {
    const quien = gestorDeOtra;
    const enA = await lote("L3-A"); // un lote de la parcela del archivo, que `quien` no ve
    const filaEnA = await prisma.lot.findUniqueOrThrow({ where: { id: enA } });
    await expect(requireLotAccess(quien, "view", [filaEnA]), "control: no ve la parcela del archivo").rejects.toBeInstanceOf(TraceabilityAccessError);

    // Fermentación y secado: la lectura de `enA` —que toma quien gestiona la parcela del archivo, por el servicio real— lleva el id de la
    // corrida de la hermana. Se rechaza «ajena» —no es del lote de la corrida—.
    const f = await fermentacion("L3-F", quien, otraParcelaId);
    const s = await secado("L3-S", quien, otraParcelaId);
    const b = await secado("L3-B", quien, otraParcelaId);
    const bandeja = await cargarBandeja(b.runId);
    const filaDeF = await prisma.lot.findUniqueOrThrow({ where: { id: f.lotId } });
    await expect(requireLotAccess(quien, "manage", [filaDeF]), "control: gestiona lo suyo").resolves.toBeUndefined();
    const fuera = {
      f: await lecturaPorElServicio({ lotId: enA, value: 4.4, occurredAt: T("03T11:00:00"), variable: "ph", unit: "pH", fermentationRunId: f.runId }),
      s: await lecturaPorElServicio({ lotId: enA, value: 11.4, occurredAt: T("05T11:00:00"), variable: "moisture", unit: "%", dryingRunId: s.runId }),
      b: await lecturaPorElServicio({ lotId: enA, value: 11.3, occurredAt: T("05T11:30:00"), variable: "moisture", unit: "%", dryingRunId: b.runId }),
    };
    const propias = {
      f: await lectura({ lotId: f.lotId, value: 4.2, occurredAt: T("03T12:00:00"), variable: "ph", unit: "pH", fermentationRunId: f.runId }),
      s: await lectura({ lotId: s.lotId, value: 11.2, occurredAt: T("05T12:00:00"), dryingRunId: s.runId }),
      b: await lectura({ lotId: b.lotId, value: 11.1, occurredAt: T("05T12:30:00"), dryingRunId: b.runId }),
    };
    await expect(terminarFermentacion(f.runId, "L3-F-fin", [fuera.f], quien)).rejects.toThrow(ajena);
    await expect(terminarSecado(s.runId, "L3-S-fin", [fuera.s], quien)).rejects.toThrow(ajena);
    await expect(bajarLaUltima(bandeja, "L3-B-fin", [fuera.b], quien)).rejects.toThrow(ajena);

    // Manejo: un descendiente del lote del proceso que vive en la parcela del archivo. Aquí no es «ajena» —es del lote del proceso o un
    // descendiente—, es que `quien` no la ve.
    const cereza = await lote("L3-M", "cherry", otraParcelaId);
    const hijoEnA = await lote("L3-M-H");
    await enlazar([cereza], [hijoEnA]);
    const p = await abrirProcesoDePrueba(quien, cereza);
    const deHijo = await lectura({ lotId: hijoEnA, value: 20, occurredAt: T("01T11:00:00"), variable: "temperature", unit: "C" });
    const deLaCereza = await lectura({ lotId: cereza, value: 21, occurredAt: T("01T10:00:00"), variable: "temperature", unit: "C" });
    const manejo = (lecturasDeCierre: string[]) =>
      registrarIntervencion(quien, { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: T("01T12:00:00"), lecturasDeCierre });
    await expect(manejo([deHijo])).rejects.toBeInstanceOf(TraceabilityAccessError);

    // Cero filas por las cuatro puertas, y nada terminó ni se escribió.
    expect(await prisma.processStepClosingReading.count({ where: { measurementId: { in: [...Object.values(fuera), deHijo] } } })).toBe(0);
    expect([await fermentacionTerminada(f.runId), await secadoTerminado(s.runId), await secadoTerminado(b.runId)]).toEqual([null, null, null]);
    expect((await prisma.dryingRunTray.findUniqueOrThrow({ where: { id: bandeja } })).hasta).toBeNull();
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);

    // Controles: la misma cuenta, por las mismas cuatro puertas, con lo de SU parcela.
    await terminarFermentacion(f.runId, "L3-F-fin", [propias.f], quien);
    await terminarSecado(s.runId, "L3-S-fin", [propias.s], quien);
    await expect(bajarLaUltima(bandeja, "L3-B-fin", [propias.b], quien)).resolves.toEqual({ id: bandeja, cerro: true });
    const i = await manejo([deLaCereza]);
    expect((await marcasDe({ fermentationRunId: f.runId })).map((x) => x.measurementId)).toEqual([propias.f]);
    expect((await marcasDe({ dryingRunId: s.runId })).map((x) => x.measurementId)).toEqual([propias.s]);
    expect((await marcasDe({ dryingRunId: b.runId })).map((x) => x.measurementId)).toEqual([propias.b]);
    expect((await marcasDe({ lotProcessInterventionId: i.id })).map((x) => x.measurementId)).toEqual([deLaCereza]);
  }, 90000);
});

describe("`vigenteDe` lleva cada eslabón de una cadena de correcciones a su vigente (R4)", () => {
  it("la raíz, un eslabón de en medio y la última dan la última; una lectura sin corrección, ella misma; un id que no es de nadie, nada", async () => {
    const suelto = await lote("V1");
    const m1 = await lectura({ lotId: suelto, value: 5.4, occurredAt: T("02T10:00:00"), variable: "ph", unit: "pH" });
    const c1 = await corregir(m1, 5.5, "pH", T("02T10:05:00"));
    const c2 = await corregir(c1, 5.45, "pH", T("02T10:10:00"));
    const sola = await lectura({ lotId: suelto, value: 4.3, occurredAt: T("03T10:00:00"), variable: "ph", unit: "pH" });
    const vigentes = await vigenteDe(prisma, [m1, c1, c2, sola, randomUUID()]);
    // Fila patrón: la cadena tiene de verdad tres eslabones (m1 → c1 → c2) y la última no apunta a la raíz.
    expect((await prisma.measurement.findUniqueOrThrow({ where: { id: c2 } })).correctsId).toBe(c1);
    expect([...vigentes.keys()].sort()).toEqual([m1, c1, c2, sola].sort());
    expect([m1, c1, c2, sola].map((id) => vigentes.get(id)!.id)).toEqual([c2, c2, c2, sola]);
    // Lo que se usa de la vigente: su valor, su unidad y su fecha, no los de la raíz.
    const v = vigentes.get(m1)!;
    expect([v.value.toString(), v.unit, v.occurredAt]).toEqual(["5.45", "pH", T("02T10:10:00")]);
    // Control: sin ids no hay nada que resolver.
    expect((await vigenteDe(prisma, [])).size).toBe(0);
  }, 40000);

  it("con la cadena bifurcada —dos correcciones de la misma lectura, la carrera que el servicio no cierra— gana la más reciente, la escriba antes o después", async () => {
    const suelto = await lote("V2");
    const cruda = (value: number, hora: string, correctsId?: string) =>
      lectura({ lotId: suelto, value, occurredAt: T(`02T${hora}`), variable: "ph", unit: "pH", ...(correctsId === undefined ? {} : { correctsId }) });
    // Dos bifurcaciones, una con la más reciente escrita PRIMERO y otra con ella escrita DESPUÉS: quien se quedara con la primera fila que
    // la consulta devuelve, o con la última, acertaría una y fallaría la otra; y quien eligiera la más antigua, fallaría las dos.
    const raizA = await cruda(5.4, "10:00:00");
    const tardeA = await cruda(5.6, "10:20:00", raizA);
    const deprisaA = await cruda(5.5, "10:05:00", raizA);
    const raizB = await cruda(4.2, "11:00:00");
    const deprisaB = await cruda(4.3, "11:05:00", raizB);
    const tardeB = await cruda(4.4, "11:20:00", raizB);
    // Fila patrón: cada raíz tiene DOS correcciones, y el servicio real se niega a hacer una tercera (es lo que este caso salta).
    expect([await prisma.measurement.count({ where: { correctsId: raizA } }), await prisma.measurement.count({ where: { correctsId: raizB } })]).toEqual([2, 2]);
    await expect(corregir(raizA, 5.7, "pH", T("02T10:30:00"))).rejects.toThrow("measurement_already_corrected");
    const vigentes = await vigenteDe(prisma, [raizA, raizB]);
    expect([vigentes.get(raizA)!.id, vigentes.get(raizB)!.id]).toEqual([tardeA, tardeB]);
    expect([vigentes.get(raizA)!.id, vigentes.get(raizB)!.id]).not.toContain(deprisaA);
    expect([vigentes.get(raizA)!.id, vigentes.get(raizB)!.id]).not.toContain(deprisaB);
  }, 40000);
});
