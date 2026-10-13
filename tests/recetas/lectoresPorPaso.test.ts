/**
 * Los lectores leen el PASO de la corrida — Parte 2a, tarea 9 (2026-10-03).
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md: §3.1 (qué lee cada consumidor), §3.2 (las metas por
 * paso) y la fila «dos secados» de §8.
 *
 * Una receta con pasos no cabe en sus fases: `ProcessRecipePhase` es única por versión y fase, así que dos secados de volteo
 * distinto no se pueden representar ahí. Desde esta tarea, una corrida que cumple un paso (`recipeStepId`) lee sus horas, su
 * volteo, su banda y sus metas DE ESE PASO; las fases quedan para las corridas sin paso de una versión SIN pasos (las de antes de
 * la 2a y las de un proceso viejo). **Una corrida sin paso bajo una versión CON pasos es una desviación (§4.4) y NO lee la fase** (R9,
 * revisión adversaria del 2026-10-05): la fase de una versión con pasos es una derivación del primero de su tipo, y juzgar a una
 * desviación por ella es juzgarla por el ritmo de OTRO paso. Tres lectores: la cola de secado (`colaDeSecado`), el tablero
 * (`datosDelTablero`: la entrada de cada lote, la liberación de unidades y la curva) y la tabla «objetivo contra real»
 * (`compareRunToTargets`).
 *
 * **Cada rechazo lleva su control al lado.** Para que un lector que lee de la fase caiga, el paso de la corrida tiene que decir
 * algo DISTINTO de lo que dice la fase: la fase de una versión con pasos es la del primero de su tipo (`publicarVersion`, tarea 3),
 * así que la corrida del segundo paso es la que lo distingue; y la del primero es su control. **El control de «sin paso» vive en una
 * versión CON fases y SIN pasos** (`antesDeLa2a`, el mundo anterior a la 2a: su única diferencia con la versión de los pasos es que no
 * los tiene), porque es el único donde una corrida sin paso lee la fase; la misma corrida bajo una versión con pasos es la desviación
 * sin ritmo (R9).
 *
 * **Las recetas se arman CRUDAS** (como en `guardian.test.ts`): la versión, sus pasos con sus metas, y las fases tal como las
 * derivaría `publicarVersion` —el primer paso de cada fase—; no con `agregarPaso`/`publicarVersion`, que piden el permiso de autoría
 * de recetas (`exigeAutoriaDeReceta`, tarea 3: el del Coffee Process Manager) y no cambian nada de lo que estos lectores deciden.
 * Las corridas también van crudas, con su proceso (`prisma.lotProcess.create`):
 * lo que se prueba es qué lee el lector, no la puerta que escribe la corrida. **Una sola prueba usa la puerta de verdad**
 * (`startDryingRun` con `recipeStepId`, tarea 7): la que cierra el cableado de punta a punta.
 *
 * **Cada `describe` arma su propio mundo** (organización, sitio, operario Farm Operator de SU sitio): con ámbito acotado el
 * tablero y la cola sólo ven lo que el archivo creó, y la liberación —que mira todas las corridas visibles— no se contamina con
 * las de otro `describe`. Nunca Platform Admin donde se cuenta (CLAUDE.md del repositorio, «Un admin de plataforma ve la base
 * compartida entera»); sólo `compareRunToTargets`, que lee por el id de una corrida, usa el Platform Admin de la base sembrada.
 *
 * **Lo que NO prueba.** Las pantallas (`pantalla-del-tablero.test.ts` y `pagina-del-tablero.test.ts` simulan `datosDelTablero`);
 * que `fichaDeUnidad` pinte la banda del paso (lee `unidad.ritmo` de la cola, que sí se prueba aquí); y el rótulo de los selectores
 * de receta, que cuenta también las metas de los pasos (tareas 5 y 13). **Que una meta de un paso no cuente como de la versión** —el filtro
 * `recipeStepId: null` de los cuatro lectores, con `getPerfilDeTuesteElegido`— lo prueba la 9a (`metasDeLaVersion.test.ts`); aquí sólo se lee el paso.
 *
 * Grupo `base-sembrada`: necesita base y el catálogo `tipo_paso` sembrado por la tarea 2, así que va en
 * `scripts/pruebas-por-compuerta.txt`. **Limpieza** en `afterAll`: DESCUBRE lo que borra por el `RUN` y por la organización de la
 * corrida (no hereda variables de los `beforeAll`), en orden de claves ajenas, y cuenta al final lo que queda; nada se borra
 * debajo de las aserciones.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { colaDeSecado } from "../../lib/beneficio/colaDeSecado";
import { datosDelTablero } from "../../lib/beneficio/datosDelTablero";
import { startDryingRun } from "../../lib/traceability/drying";
import { compareRunToTargets } from "../../lib/traceability/processTargets";
import { FASE_DEL_TIPO, type TipoDePaso } from "../../lib/recetas/vocabulario";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `lpp-${Date.now()}`;
const nombre = (etiqueta: string) => `TEST ${etiqueta} (${RUN})`;

const HORA = 3_600_000;
let ahora: Date;
const haceHoras = (h: number) => new Date(ahora.getTime() - h * HORA);

/** «Su mundo» de un `describe`: una organización, su sitio, un cuarto de secado dentro y un operario de ese sitio. */
interface Mundo {
  orgId: string;
  finca: string;
  cuarto: string;
  operario: string;
}

async function mundo(etiqueta: string): Promise<Mundo> {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre(`Finca ${etiqueta}`), status: "approved", classification: "internal" },
  });
  const lugar = (rotulo: string, locationType: "site" | "drying_facility", extra: { organizationId?: string; parentLocationId?: string }) =>
    prisma.location.create({
      data: { name: nombre(`${rotulo} ${etiqueta}`), locationType, classification: "internal", status: "approved", ...extra },
    });
  const finca = await lugar("Sitio", "site", { organizationId: org.id });
  const cuarto = await lugar("Cuarto", "drying_facility", { parentLocationId: finca.id });
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(`Operario ${etiqueta}`) },
  });
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  // Farm Operator de SU sitio, no Platform Admin: con ámbito de plataforma la cola y el tablero verían la base entera.
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: finca.id } });
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: cuenta.id, scopeId: scope.id, roleProfileId: perfil.id } });
  return { orgId: org.id, finca: finca.id, cuarto: cuarto.id, operario: cuenta.id };
}

async function valor(catalogo: string, v: string): Promise<string> {
  return (
    await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: v, catalog: { key: catalogo } }, select: { id: true } })
  ).id;
}

/** Una meta de prueba: lo que `ProcessTarget` guarda, sin id, versión ni fase (la fase sale del tipo del paso, o se da aparte). */
interface MetaCruda {
  variable: string;
  moment: "initial" | "during" | "final";
  unit: string;
  minValue?: number;
  maxValue?: number;
  targetValue?: number;
  everyHours?: number;
}

/** Un paso de prueba: su tipo, sus valores por defecto y sus metas. `seq` es su lugar en la lista, desde 1. */
interface PasoCrudo {
  tipo: TipoDePaso;
  horasSugeridas?: number;
  volteoCadaHoras?: number;
  humedadMinPct?: number;
  humedadMaxPct?: number;
  metas?: MetaCruda[];
}

/**
 * Una fase SIN paso: lo que `ProcessRecipePhase` guardaba antes de la 2a. Sólo la lleva una versión SIN pasos (R9): la fase de una
 * versión con pasos la deriva `publicarVersion` del primero de su tipo, y `receta()` lo hace sola.
 */
interface FaseCruda {
  phase: "fermentation" | "drying";
  horasSugeridas?: number;
  volteoCadaHoras?: number;
  humedadMinPct?: number;
  humedadMaxPct?: number;
}

/**
 * Una receta de la organización con UNA versión publicada: sus pasos en orden, las metas de cada paso, las metas de la versión
 * (sin paso, con la fase que se les dé) y las fases tal como las deriva `publicarVersion` (tarea 3): una por fase de
 * `FASE_DEL_TIPO`, con los valores del PRIMER paso de esa fase. **Una versión SIN pasos** (`pasos` vacío) lleva las fases que se le
 * den en `fasesDeLaVersion`: es el mundo de antes de la 2a, el único donde una corrida sin paso lee la fase (R9).
 */
async function receta(
  m: Mundo,
  etiqueta: string,
  pasos: PasoCrudo[],
  metasDeLaVersion: (MetaCruda & { phase: "fermentation" | "drying" })[] = [],
  fasesDeLaVersion: FaseCruda[] = [],
) {
  // Las dos fuentes de fase no se mezclan: con pasos la fase sale del primero de cada tipo, y una fase suelta chocaría con ella
  // (`ProcessRecipePhase` es única por versión y fase). Un armado así de roto cae aquí y no en una clave duplicada.
  if (pasos.length > 0 && fasesDeLaVersion.length > 0) {
    throw new Error("receta(): las fases sueltas son del mundo SIN pasos; con pasos las deriva el primero de cada fase");
  }
  const r = await prisma.processRecipe.create({ data: { name: nombre(`Receta ${etiqueta}`), organizationId: m.orgId, status: "approved" } });
  const v = await prisma.processRecipeVersion.create({ data: { recipeId: r.id, version: 1, status: "approved" } });
  const pasoIds: string[] = [];
  const fasesVistas = new Set<string>();
  for (const [i, p] of pasos.entries()) {
    const paso = await prisma.processRecipeStep.create({
      data: {
        recipeVersionId: v.id,
        seq: i + 1,
        stepTypeValueId: await valor("tipo_paso", p.tipo),
        horasSugeridas: p.horasSugeridas ?? null,
        volteoCadaHoras: p.volteoCadaHoras ?? null,
        humedadMinPct: p.humedadMinPct ?? null,
        humedadMaxPct: p.humedadMaxPct ?? null,
      },
    });
    pasoIds.push(paso.id);
    for (const [j, t] of (p.metas ?? []).entries()) {
      await prisma.processTarget.create({
        data: { ...t, recipeVersionId: v.id, recipeStepId: paso.id, phase: FASE_DEL_TIPO[p.tipo] ?? null, displayOrder: j },
      });
    }
    const fase = FASE_DEL_TIPO[p.tipo];
    if (fase && !fasesVistas.has(fase)) {
      fasesVistas.add(fase);
      await prisma.processRecipePhase.create({
        data: {
          recipeVersionId: v.id,
          phase: fase,
          expectedHours: p.horasSugeridas ?? null,
          turnEveryHours: p.volteoCadaHoras ?? null,
          targetMoistureMinPct: p.humedadMinPct ?? null,
          targetMoistureMaxPct: p.humedadMaxPct ?? null,
        },
      });
    }
  }
  for (const [j, t] of metasDeLaVersion.entries()) {
    await prisma.processTarget.create({ data: { ...t, recipeVersionId: v.id, recipeStepId: null, displayOrder: j } });
  }
  for (const f of fasesDeLaVersion) {
    await prisma.processRecipePhase.create({
      data: {
        recipeVersionId: v.id,
        phase: f.phase,
        expectedHours: f.horasSugeridas ?? null,
        turnEveryHours: f.volteoCadaHoras ?? null,
        targetMoistureMinPct: f.humedadMinPct ?? null,
        targetMoistureMaxPct: f.humedadMaxPct ?? null,
      },
    });
  }
  return { versionId: v.id, pasoIds };
}

/**
 * Un lote con su proceso (sobre la versión) y UNA corrida abierta —de secado o de fermentación— que cumple el paso `pasoId` o,
 * con `null`, ninguno. Todo crudo. El lote lleva `RUN` en su código: el `afterAll` encuentra por él todo lo que cuelga de él.
 */
async function conCorrida(
  m: Mundo,
  o: {
    codigo: string;
    fase: "drying" | "fermentation";
    versionId: string;
    pasoId: string | null;
    iniciadoHaceHoras: number;
    volteoHaceHoras?: number;
    cama?: string;
    locationId?: string;
  },
) {
  const lot = await prisma.lot.create({
    data: {
      lotCode: `${o.codigo}-${RUN}`,
      lotType: o.fase === "drying" ? "parchment" : "cherry",
      organizationId: m.orgId,
      locationId: o.locationId ?? m.cuarto,
      status: "approved",
      classification: "internal",
    },
  });
  const proceso = await prisma.lotProcess.create({
    data: {
      lotId: lot.id,
      sequenceOrder: 1,
      intent: nombre(`proceso de ${o.codigo}`),
      targetMoisturePct: 11,
      startedAt: haceHoras(o.iniciadoHaceHoras + 1),
      provenanceClass: "original_record",
      processGradeValueId: await valor("grado_proceso", "Washed"),
      cherryStateValueId: await valor("estado_cereza", "despulpada"),
      processRecipeVersionId: o.versionId,
    },
  });
  // La base exige que un paso venga con su tipo (CHECK `…_paso_exige_tipo`): el de la corrida es el de su paso.
  const paso =
    o.pasoId === null
      ? {}
      : {
          recipeStepId: o.pasoId,
          stepTypeValueId: (await prisma.processRecipeStep.findUniqueOrThrow({ where: { id: o.pasoId }, select: { stepTypeValueId: true } }))
            .stepTypeValueId,
        };
  const inicio = haceHoras(o.iniciadoHaceHoras);
  let runId: string;
  if (o.fase === "drying") {
    const corrida = await prisma.dryingRun.create({
      data: {
        method: nombre(`secado de ${o.codigo}`),
        startedAt: inicio,
        dryingBedLocationId: o.cama ?? null,
        locationId: m.cuarto,
        lotProcessId: proceso.id,
        ...paso,
      },
    });
    runId = corrida.id;
    await prisma.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt: inicio,
        provenanceClass: "original_record",
        dryingRunId: corrida.id,
        inputs: { create: [{ lotId: lot.id, quantity: 60, unit: "kg" }] },
      },
    });
    if (o.volteoHaceHoras !== undefined) {
      await prisma.dryingTurnEvent.create({ data: { dryingRunId: corrida.id, eventType: "turned", occurredAt: haceHoras(o.volteoHaceHoras) } });
    }
  } else {
    const corrida = await prisma.fermentationRun.create({
      data: { startedAt: inicio, vesselNote: nombre(`tanque de ${o.codigo}`), lotProcessId: proceso.id, processRecipeVersionId: o.versionId, ...paso },
    });
    runId = corrida.id;
    await prisma.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt: inicio,
        provenanceClass: "original_record",
        fermentationRunId: corrida.id,
        inputs: { create: [{ lotId: lot.id, quantity: 60, unit: "kg" }] },
      },
    });
  }
  return { lotId: lot.id, lotCode: lot.lotCode, runId };
}

beforeAll(() => {
  ahora = new Date();
});

afterAll(async () => {
  // La limpieza DESCUBRE lo que borra, no lo hereda de los `beforeAll`: si uno muere antes de asignar su mundo, las variables siguen
  // sin definir, `assertDefinedWhere` lanza y abandona las filas que quedan (CLAUDE.md del repositorio, «Una limpieza que se apoya
  // en una variable del fixture no corre si el `beforeAll` muere antes»). Todo sale de la marca del RUN: las organizaciones por su
  // nombre; de ellas, las ubicaciones y los lotes; las personas por su `displayName` y de ellas las cuentas; de las ubicaciones, los
  // ámbitos; de los lotes, sus procesos, sus transformaciones y las corridas que cuelgan de ellas.
  const ids = <T extends { id: string }>(filas: T[]) => filas.map((f) => f.id);
  const organizaciones = ids(await prisma.organization.findMany({ where: assertDefinedWhere({ name: { contains: RUN } }), select: { id: true } }));
  const ubicaciones = ids(
    await prisma.location.findMany({
      where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }),
      select: { id: true },
    }),
  );
  const personas = ids(await prisma.person.findMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }), select: { id: true } }));
  const cuentas = ids(await prisma.userAccount.findMany({ where: assertDefinedWhere({ personId: { in: personas } }), select: { id: true } }));
  const ambitos = ids(
    await prisma.scope.findMany({ where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: ubicaciones } }), select: { id: true } }),
  );
  // Todos los lotes de la organización, no sólo los que lleva el RUN en su código: la puerta de verdad (`startDryingRun`) no crea
  // lotes, pero una división o un alta que una mutación hiciera salir sí, y `lot.organization_id` es RESTRICT.
  const lotes = ids(
    await prisma.lot.findMany({
      where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { lotCode: { contains: RUN } }] }),
      select: { id: true },
    }),
  );
  const transformaciones = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotes } } } }, { outputs: { some: { lotId: { in: lotes } } } }] }),
    select: { id: true, dryingRunId: true, fermentationRunId: true },
  });
  const tIds = transformaciones.map((t) => t.id);
  const idsDeSecados = transformaciones.map((t) => t.dryingRunId).filter((x): x is string => x !== null);
  const idsDeFermentaciones = transformaciones.map((t) => t.fermentationRunId).filter((x): x is string => x !== null);
  const secados = ids(
    await prisma.dryingRun.findMany({
      where: assertDefinedWhere({ OR: [{ id: { in: idsDeSecados } }, { method: { contains: RUN } }] }),
      select: { id: true },
    }),
  );
  const fermentaciones = ids(
    await prisma.fermentationRun.findMany({
      where: assertDefinedWhere({ OR: [{ id: { in: idsDeFermentaciones } }, { vesselNote: { contains: RUN } }] }),
      select: { id: true },
    }),
  );
  const idsDeProcesos = ids(await prisma.lotProcess.findMany({ where: assertDefinedWhere({ lotId: { in: lotes } }), select: { id: true } }));

  // **Cada borrado en su propio `try`, y no una cadena**: un `afterAll` es una cadena, y la primera clave ajena que se queja tira
  // todo lo que viene después (CLAUDE.md del repositorio, «Una limpieza escrita debajo de las aserciones no corre»). Las
  // corridas, antes que la receta: su `recipe_step_id` es RESTRICT; los procesos, antes que la versión por lo mismo.
  const pasos: [string, () => Promise<unknown>][] = [
    ["measurement", () => prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) })],
    ["dryingTurnEvent", () => prisma.dryingTurnEvent.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: secados } }) })],
    ["lotTransformationInput", () => prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) })],
    ["lotTransformationOutput", () => prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) })],
    ["lotTransformation", () => prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: tIds } }) })],
    ["dryingRun", () => prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: secados } }) })],
    ["fermentationRun", () => prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: fermentaciones } }) })],
    ["lotProcess", () => borrarProcesosDeLotesDonde({ id: { in: lotes } })],
    // Lo que escribió el operario por la puerta de verdad (`drying_run.start`…): antes de borrar su cuenta, que lo deja en SET NULL.
    ["auditEvent", () => prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) })],
    // Las versiones caen con la receta, y los pasos y las metas con la versión. Por organización y por nombre: con
    // `process_recipe.organization_id` en RESTRICT, una receta viva haría FALLAR el borrado de la organización, más abajo.
    [
      "processRecipe",
      () => prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }) }),
    ],
    ["lot", () => prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) })],
    ["assignment", () => prisma.assignment.deleteMany({ where: assertDefinedWhere({ OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] }) })],
    ["scope", () => prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) })],
    ["userAccount", () => prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) })],
    ["person", () => prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) })],
    ["location", () => prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) })],
    ["organization", () => prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) })],
  ];
  const fallos: string[] = [];
  for (const [etiqueta, borrar] of pasos) {
    try {
      await borrar();
    } catch (e) {
      const lineas = (e as Error).message.split("\n").map((l) => l.trim()).filter(Boolean);
      fallos.push(`${etiqueta}: ${lineas[lineas.length - 1] ?? "(sin mensaje)"}`);
    }
  }
  // `process.stdout.write` y no `console.log`: vitest intercepta la consola y sólo la saca para las pruebas que FALLAN.
  if (fallos.length > 0) process.stdout.write(`\n[FUGA] la limpieza de ${RUN} dejó filas: ${fallos.join(" | ")}\n`);

  // La limpieza se AFIRMA, no se supone. El control: la corrida sí creó lotes; sin eso los ceros de abajo no miran nada.
  expect(lotes.length).toBeGreaterThan(0);
  expect(await prisma.lot.count({ where: { OR: [{ id: { in: lotes } }, { lotCode: { contains: RUN } }] } })).toBe(0);
  expect(await prisma.processRecipe.count({ where: { OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] } })).toBe(0);
  expect(await prisma.processRecipeStep.count({ where: { recipeVersion: { recipe: { name: { contains: RUN } } } } })).toBe(0);
  expect(await prisma.lotProcess.count({ where: { lotId: { in: lotes } } })).toBe(0);
  expect(await prisma.auditEvent.count({ where: { entityType: "lot_process", entityId: { in: idsDeProcesos } } })).toBe(0);
  expect(await prisma.dryingRun.count({ where: { OR: [{ id: { in: secados } }, { method: { contains: RUN } }] } })).toBe(0);
  expect(await prisma.fermentationRun.count({ where: { OR: [{ id: { in: fermentaciones } }, { vesselNote: { contains: RUN } }] } })).toBe(0);
  expect(await prisma.measurement.count({ where: { lotId: { in: lotes } } })).toBe(0);
  expect(await prisma.userAccount.count({ where: { id: { in: cuentas } } })).toBe(0);
  expect(await prisma.scope.count({ where: { id: { in: ambitos } } })).toBe(0);
  expect(await prisma.person.count({ where: { displayName: { contains: RUN } } })).toBe(0);
  expect(await prisma.location.count({ where: { OR: [{ id: { in: ubicaciones } }, { name: { contains: RUN } }] } })).toBe(0);
  expect(await prisma.organization.count({ where: { OR: [{ id: { in: organizaciones } }, { name: { contains: RUN } }] } })).toBe(0);
}, 60_000);

describe("la cola de secado lee el paso de la corrida (diseño §3.1 y §3.2)", () => {
  let m: Mundo;
  /** Tres pasos de secado: volteo cada 4 h, cada 12 h, y uno que no declara ritmo. La fase derivada es la del primero. */
  let dosSecados: { versionId: string; pasoIds: string[] };
  /** Un paso de secado con una meta de humedad cada 6 h, y una meta de la VERSIÓN (temperatura cada 3 h), sin paso. */
  let conMetas: { versionId: string; pasoIds: string[] };
  /**
   * El mundo de ANTES de la 2a: una versión con la fase de secado (100 h, volteo cada 4 h, banda 10–12: lo mismo que dice la fase
   * derivada de `dosSecados`) y SIN pasos. Es el único donde una corrida sin paso lee la fase, y el control de «sin paso» (R9).
   */
  let antesDeLa2a: { versionId: string; pasoIds: string[] };

  /** La unidad de la cola de un lote, o un fallo con nombre: «no aparece» no es «no tiene ritmo». */
  const unidadDe = async (lotId: string) => {
    const cola = await colaDeSecado(m.operario, ahora);
    const unidad = cola.areas.flatMap((a) => a.unidades).find((u) => u.lotId === lotId);
    expect(unidad, "el lote no aparece en la cola de quien mira").toBeDefined();
    return unidad!;
  };

  beforeAll(async () => {
    m = await mundo("cola");
    dosSecados = await receta(m, "dos secados", [
      { tipo: "drying", horasSugeridas: 100, volteoCadaHoras: 4, humedadMinPct: 10, humedadMaxPct: 12 },
      { tipo: "drying", horasSugeridas: 60, volteoCadaHoras: 12, humedadMinPct: 11, humedadMaxPct: 12.5 },
      { tipo: "drying" },
    ]);
    conMetas = await receta(
      m,
      "secado con metas",
      [
        {
          tipo: "drying",
          horasSugeridas: 100,
          volteoCadaHoras: 24,
          metas: [{ variable: "moisture", moment: "during", unit: "%", minValue: 10, maxValue: 12, everyHours: 6 }],
        },
      ],
      [{ variable: "temperature", moment: "during", phase: "drying", unit: "C", minValue: 20, maxValue: 30, everyHours: 3 }],
    );
    antesDeLa2a = await receta(m, "secado antes de la 2a", [], [], [
      { phase: "drying", horasSugeridas: 100, volteoCadaHoras: 4, humedadMinPct: 10, humedadMaxPct: 12 },
    ]);
  }, 60_000);

  it("fila patrón: la versión de los dos secados trae sus tres pasos, y su fase es la derivada del primero", async () => {
    const pasos = await prisma.processRecipeStep.findMany({
      where: { recipeVersionId: dosSecados.versionId },
      orderBy: { seq: "asc" },
      select: { seq: true, volteoCadaHoras: true },
    });
    expect(pasos.map((p) => [p.seq, p.volteoCadaHoras])).toEqual([
      [1, 4],
      [2, 12],
      [3, null],
    ]);
    const fases = await prisma.processRecipePhase.findMany({ where: { recipeVersionId: dosSecados.versionId } });
    expect(fases.map((f) => [f.phase, f.expectedHours, f.turnEveryHours])).toEqual([["drying", 100, 4]]);
    // R9: la versión de antes de la 2a dice LO MISMO en su fase (100 h, cada 4 h) y no tiene ningún paso: lo único que la distingue
    // de la de arriba es eso, que es lo que hace de ella el control de «sin paso».
    const antes = await prisma.processRecipePhase.findMany({ where: { recipeVersionId: antesDeLa2a.versionId } });
    expect(antes.map((f) => [f.phase, f.expectedHours, f.turnEveryHours])).toEqual([["drying", 100, 4]]);
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: antesDeLa2a.versionId } })).toBe(0);
  });

  it("dos secados de volteo distinto: cada corrida lee el suyo, y una sin paso bajo una versión SIN pasos sigue leyendo la fase (§8)", async () => {
    // Las tres llevan 30 h secándose y se voltearon hace 8 h: con volteo cada 4 h «le toca»; con cada 12 h, no.
    const corrida = (codigo: string, versionId: string, pasoId: string | null) =>
      conCorrida(m, { codigo, fase: "drying", versionId, pasoId, iniciadoHaceHoras: 30, volteoHaceHoras: 8 });
    const sinPaso = await corrida("DOS-SIN-PASO", antesDeLa2a.versionId, null);
    const primero = await corrida("DOS-PASO-1", dosSecados.versionId, dosSecados.pasoIds[0]!);
    const segundo = await corrida("DOS-PASO-2", dosSecados.versionId, dosSecados.pasoIds[1]!);

    // Control: la corrida SIN paso, bajo una versión que no tiene pasos, lee la fase (100 h, volteo cada 4 h, banda 10–12): es el camino de
    // antes de la 2a, y la fase sólo vale ahí (R9). Con una versión de pasos la misma corrida es una desviación: la prueba siguiente.
    const control = await unidadDe(sinPaso.lotId);
    expect(control.ritmo).toEqual({ expectedHours: 100, turnEveryHours: 4, humedadMinPct: 10, humedadMaxPct: 12 });
    expect(control.estado).toBe("le toca volteo");
    // La del primer paso lee el suyo, que coincide con la fase: aquí sólo se ve que la cola no se rompe.
    const u1 = await unidadDe(primero.lotId);
    expect(u1.ritmo).toEqual({ expectedHours: 100, turnEveryHours: 4, humedadMinPct: 10, humedadMaxPct: 12 });
    expect(u1.estado).toBe("le toca volteo");
    // La del SEGUNDO paso es la que distingue: la fase diría 4 h y «le toca volteo»; su paso dice 12 h, y a 8 h sin voltear está al día.
    const u2 = await unidadDe(segundo.lotId);
    expect(u2.ritmo).toEqual({ expectedHours: 60, turnEveryHours: 12, humedadMinPct: 11, humedadMaxPct: 12.5 });
    expect(u2.estado).toBe("al dia");
  });

  it("una corrida SIN paso bajo una versión CON pasos es una desviación: no hereda el ritmo de la fase, sale «receta sin ritmo de secado» (R9)", async () => {
    // La MISMA corrida —30 h secándose, volteada hace 8 h— bajo dos versiones cuya fase de secado dice lo mismo (100 h, volteo cada 4 h):
    // la de antes de la 2a no tiene pasos, y la de los dos secados tiene tres. Lo único que cambia es si la versión tiene pasos.
    const corrida = (codigo: string, versionId: string) =>
      conCorrida(m, { codigo, fase: "drying", versionId, pasoId: null, iniciadoHaceHoras: 30, volteoHaceHoras: 8 });
    const desviacion = await corrida("R9-DESVIACION", dosSecados.versionId);
    const sinPasos = await corrida("R9-SIN-PASOS", antesDeLa2a.versionId);

    // Control: bajo la versión sin pasos la fase manda, y a 8 h sin voltear con volteo cada 4 h «le toca volteo».
    const control = await unidadDe(sinPasos.lotId);
    expect(control.ritmo).toEqual({ expectedHours: 100, turnEveryHours: 4, humedadMinPct: 10, humedadMaxPct: 12 });
    expect(control.estado).toBe("le toca volteo");
    // La desviación NO lee la fase de su versión (la del primer paso, volteo cada 4 h): no declaró ritmo, y no se le juzga por el de otro.
    const u = await unidadDe(desviacion.lotId);
    expect(u.ritmo).toEqual({ expectedHours: null, turnEveryHours: null, humedadMinPct: null, humedadMaxPct: null });
    expect(u.estado).toBe("receta sin ritmo de secado");
    // Control de la otra mitad: la fase de ESA MISMA versión sí declara ritmo (100 h, cada 4 h); heredarla daría «le toca volteo».
    const fase = await prisma.processRecipePhase.findFirstOrThrow({ where: { recipeVersionId: dosSecados.versionId, phase: "drying" } });
    expect([fase.expectedHours, fase.turnEveryHours]).toEqual([100, 4]);
  });

  it("un paso que no declara ritmo NO hereda el de la fase: la cola dice «receta sin ritmo de secado», no el volteo de otro paso", async () => {
    const tercero = await conCorrida(m, {
      codigo: "SIN-RITMO",
      fase: "drying",
      versionId: dosSecados.versionId,
      pasoId: dosSecados.pasoIds[2]!,
      iniciadoHaceHoras: 30,
      volteoHaceHoras: 8,
    });
    const u = await unidadDe(tercero.lotId);
    expect(u.ritmo).toEqual({ expectedHours: null, turnEveryHours: null, humedadMinPct: null, humedadMaxPct: null });
    expect(u.estado).toBe("receta sin ritmo de secado");
    // Control: la fase de ESA MISMA versión sí declara ritmo (100 h, cada 4 h); heredarlo daría «le toca volteo» a 8 h sin voltear.
    const fase = await prisma.processRecipePhase.findFirstOrThrow({ where: { recipeVersionId: dosSecados.versionId, phase: "drying" } });
    expect([fase.expectedHours, fase.turnEveryHours]).toEqual([100, 4]);
  });

  it("las metas de una corrida son las de su paso, y las de la versión no incluyen las de ningún paso (§3.2)", async () => {
    // 30 h sin una sola lectura, y volteada hace 1 h con volteo cada 24 h: lo único que puede pesar son las lecturas debidas. (La corrida
    // SIN paso es aquí una desviación —la versión tiene un paso— y por R9 no lee ningún ritmo de la fase; lo que sí la rige son las metas
    // de la VERSIÓN, que no salen de la fase: decisión 9. Por eso su estado es «debe lectura», que se mira antes que «receta sin ritmo».)
    const corrida = (codigo: string, pasoId: string | null) =>
      conCorrida(m, { codigo, fase: "drying", versionId: conMetas.versionId, pasoId, iniciadoHaceHoras: 30, volteoHaceHoras: 1 });
    const delPaso = await corrida("METAS-PASO", conMetas.pasoIds[0]!);
    const sinPaso = await corrida("METAS-SIN-PASO", null);

    // La corrida con paso debe SU lectura: humedad cada 6 h. La temperatura es una meta de la versión y no es suya.
    const p = await unidadDe(delPaso.lotId);
    expect(p.ritmoDelLote.debidas.map((d) => [d.variable, d.cada])).toEqual([["moisture", 6]]);
    expect(p.estado).toBe("debe lectura");
    // La sin paso debe la de la versión (temperatura cada 3 h) y NO la humedad del paso: es lo que la consulta de la versión filtra. El filtro es de la
    // 9a y ya está en el árbol: esta mitad pasa ANTES de tocar nada, y es el control de la primera.
    const q = await unidadDe(sinPaso.lotId);
    expect(q.ritmoDelLote.debidas.map((d) => [d.variable, d.cada])).toEqual([["temperature", 3]]);
    expect(q.estado).toBe("debe lectura");
  });

  it("una corrida empezada con startDryingRun y su paso se lee en la cola por ese paso (el cableado con la tarea 7)", async () => {
    const lote = await prisma.lot.create({
      data: {
        lotCode: `E2E-${RUN}`,
        lotType: "cherry",
        organizationId: m.orgId,
        locationId: m.finca,
        status: "approved",
        classification: "internal",
      },
    });
    await abrirProcesoDePrueba(m.operario, lote.id, { processRecipeVersionId: dosSecados.versionId });
    const { run } = await startDryingRun(m.operario, {
      lotId: lote.id,
      startedAt: haceHoras(3),
      provenanceClass: "original_record",
      recipeStepId: dosSecados.pasoIds[1]!,
    });
    expect(run.recipeStepId, "la puerta no guardó el paso en la corrida").toBe(dosSecados.pasoIds[1]);
    const u = await unidadDe(lote.id);
    expect(u.ritmo).toEqual({ expectedHours: 60, turnEveryHours: 12, humedadMinPct: 11, humedadMaxPct: 12.5 });
  });
});

describe("el tablero lee el paso de la corrida (diseño §3.1 y §3.2)", () => {
  let m: Mundo;
  /** Prefermentación de 12 h, fermentación de 36 h con pH cada 6 h y una tercera fermentación sin horas ni metas; la meta de la VERSIÓN es la temperatura cada 2 h. */
  let fermenta: { versionId: string; pasoIds: string[] };
  /**
   * El mundo de ANTES de la 2a, para la fermentación: la fase dice 12 h (lo mismo que la fase derivada de `fermenta`), la meta de la
   * VERSIÓN es la misma temperatura cada 2 h, y no hay ningún paso. Es el control de «sin paso» (R9).
   */
  let fermentaAntes: { versionId: string; pasoIds: string[] };
  /** Tres pasos de secado: 100 h, 60 h y uno que no declara horas. La fase derivada es la del primero. */
  let secados: { versionId: string; pasoIds: string[] };
  /** Un paso sin metas y otro con su banda de humedad (10–14) y de Brix (20–30); la banda de la VERSIÓN es la de humedad 10–12. */
  let curvas: { versionId: string; pasoIds: string[] };

  /** La entrada de un lote en la cola de atención, o un fallo con nombre: «no aparece» no es «no tiene horas». */
  const entradaDe = (d: Awaited<ReturnType<typeof datosDelTablero>>, lotId: string) => {
    const e = d.lotes.find((l) => l.lotId === lotId);
    expect(e, "el lote con una fermentación abierta no está en el tablero").toBeDefined();
    return e!;
  };

  beforeAll(async () => {
    m = await mundo("tablero");
    fermenta = await receta(
      m,
      "fermenta",
      [
        { tipo: "prefermentacion", horasSugeridas: 12 },
        {
          tipo: "fermentation",
          horasSugeridas: 36,
          metas: [{ variable: "ph", moment: "during", unit: "pH", minValue: 3.8, maxValue: 4.6, everyHours: 6 }],
        },
        { tipo: "fermentation" },
      ],
      [{ variable: "temperature", moment: "during", phase: "fermentation", unit: "C", minValue: 18, maxValue: 24, everyHours: 2 }],
    );
    fermentaAntes = await receta(
      m,
      "fermenta antes de la 2a",
      [],
      [{ variable: "temperature", moment: "during", phase: "fermentation", unit: "C", minValue: 18, maxValue: 24, everyHours: 2 }],
      [{ phase: "fermentation", horasSugeridas: 12 }],
    );
    secados = await receta(m, "dos secados del tablero", [
      { tipo: "drying", horasSugeridas: 100, volteoCadaHoras: 4 },
      { tipo: "drying", horasSugeridas: 60, volteoCadaHoras: 12 },
      { tipo: "drying" },
    ]);
    curvas = await receta(
      m,
      "curva",
      [
        { tipo: "drying", horasSugeridas: 100, volteoCadaHoras: 4 },
        {
          tipo: "drying",
          horasSugeridas: 60,
          metas: [
            { variable: "moisture", moment: "during", unit: "%", minValue: 10, maxValue: 14, targetValue: 13 },
            { variable: "brix", moment: "during", unit: "Bx", minValue: 20, maxValue: 30, targetValue: 25 },
          ],
        },
      ],
      [{ variable: "moisture", moment: "during", phase: "drying", unit: "%", minValue: 10, maxValue: 12, targetValue: 11 }],
    );
  }, 60_000);

  it("fila patrón: la fase derivada de la fermentación es la del primer paso (12 h), distinta de la del segundo (36 h)", async () => {
    const fase = await prisma.processRecipePhase.findFirstOrThrow({ where: { recipeVersionId: fermenta.versionId, phase: "fermentation" } });
    expect(fase.expectedHours).toBe(12);
    const pasos = await prisma.processRecipeStep.findMany({
      where: { recipeVersionId: fermenta.versionId },
      orderBy: { seq: "asc" },
      select: { horasSugeridas: true },
    });
    expect(pasos.map((p) => p.horasSugeridas)).toEqual([12, 36, null]);
    // Las metas: la del paso cuelga de su paso y la de la versión no cuelga de ninguno.
    const metas = await prisma.processTarget.findMany({ where: { recipeVersionId: fermenta.versionId }, orderBy: { variable: "asc" } });
    expect(metas.map((t) => [t.variable, t.recipeStepId === null ? "versión" : "paso"])).toEqual([
      ["ph", "paso"],
      ["temperature", "versión"],
    ]);
    // R9: la versión de antes de la 2a dice 12 h en su fase —lo mismo que la fase derivada de arriba—, trae la misma meta de la VERSIÓN
    // y no tiene ningún paso: lo único que la distingue de `fermenta` es eso, que es lo que la hace el control de «sin paso».
    const faseAntes = await prisma.processRecipePhase.findFirstOrThrow({ where: { recipeVersionId: fermentaAntes.versionId, phase: "fermentation" } });
    expect(faseAntes.expectedHours).toBe(12);
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: fermentaAntes.versionId } })).toBe(0);
    expect(await prisma.processTarget.count({ where: { recipeVersionId: fermentaAntes.versionId, recipeStepId: null } })).toBe(1);
  });

  it("la entrada del lote en la cola de atención lee las horas y las metas de su paso; sin paso y sin pasos en la versión, las de la fase y las de la versión", async () => {
    const delPaso = await conCorrida(m, { codigo: "TAB-PASO", fase: "fermentation", versionId: fermenta.versionId, pasoId: fermenta.pasoIds[1]!, iniciadoHaceHoras: 10 });
    const sinPaso = await conCorrida(m, { codigo: "TAB-SIN-PASO", fase: "fermentation", versionId: fermentaAntes.versionId, pasoId: null, iniciadoHaceHoras: 10 });
    const sinHoras = await conCorrida(m, { codigo: "TAB-SIN-HORAS", fase: "fermentation", versionId: fermenta.versionId, pasoId: fermenta.pasoIds[2]!, iniciadoHaceHoras: 10 });
    const d = await datosDelTablero(m.operario, ahora);

    // Control: la corrida SIN paso, bajo la versión sin pasos de antes de la 2a, lee la fase (12 h) y las metas de la versión (temperatura cada 2 h).
    const control = entradaDe(d, sinPaso.lotId);
    expect(control.expectedHours).toBe(12);
    expect(control.metas).toEqual([{ variable: "temperature", everyHours: 2, ultimaLectura: null }]);
    // La del segundo paso: sus 36 h y su pH cada 6 h, y ninguna meta de la versión.
    const e = entradaDe(d, delPaso.lotId);
    expect(e.expectedHours).toBe(36);
    expect(e.metas).toEqual([{ variable: "ph", everyHours: 6, ultimaLectura: null }]);
    // Un paso que no declara horas ni metas NO hereda las de la fase ni las de la versión: no tiene ninguna.
    const vacio = entradaDe(d, sinHoras.lotId);
    expect(vacio.expectedHours).toBeNull();
    expect(vacio.metas).toEqual([]);
  });

  it("la entrada de una corrida SIN paso bajo una versión CON pasos no lee las horas de la fase —sale sin horas—, y sus metas son las de la versión (R9)", async () => {
    // La MISMA corrida —10 h de fermentación, sin paso— bajo dos versiones cuya fase de fermentación dice 12 h y que traen la misma meta de la
    // VERSIÓN (temperatura cada 2 h): la de antes de la 2a no tiene pasos, y la de los tres pasos sí. Lo único que cambia es si la versión los tiene.
    const desviacion = await conCorrida(m, { codigo: "TAB-R9-DESVIACION", fase: "fermentation", versionId: fermenta.versionId, pasoId: null, iniciadoHaceHoras: 10 });
    const sinPasos = await conCorrida(m, { codigo: "TAB-R9-SIN-PASOS", fase: "fermentation", versionId: fermentaAntes.versionId, pasoId: null, iniciadoHaceHoras: 10 });
    const d = await datosDelTablero(m.operario, ahora);

    // Control: bajo la versión sin pasos la fase manda, y son 12 h.
    expect(entradaDe(d, sinPasos.lotId).expectedHours).toBe(12);
    // La desviación NO lee las 12 h de la fase de su versión (la del primer paso, la prefermentación): no declaró ninguna.
    const e = entradaDe(d, desviacion.lotId);
    expect(e.expectedHours).toBeNull();
    // Lo que R9 NO quita: las metas de la versión, que no salen de la fase. Son las mismas del control, y no traen el pH del paso 2.
    expect(e.metas).toEqual([{ variable: "temperature", everyHours: 2, ultimaLectura: null }]);
  });

  it("la liberación se calcula por corrida: gana el paso más corto, y un paso sin horas no hereda las de la fase (§3.1)", async () => {
    const cama = async (rotulo: string) =>
      (
        await prisma.location.create({
          data: { name: nombre(`${rotulo} del tablero`), locationType: "drying_bed", classification: "internal", status: "approved", organizationId: m.orgId },
        })
      ).id;
    const cama1 = await cama("Cama 1");
    const cama2 = await cama("Cama 2");
    const cama3 = await cama("Cama 3");
    // Las dos primeras llevan 10 h secándose. Por la fase (la del primer paso) las dos durarían 100 h; por su paso, una dura 100 h y la otra 60.
    await conCorrida(m, { codigo: "LIB-100H", fase: "drying", versionId: secados.versionId, pasoId: secados.pasoIds[0]!, iniciadoHaceHoras: 10, cama: cama1 });
    await conCorrida(m, { codigo: "LIB-60H", fase: "drying", versionId: secados.versionId, pasoId: secados.pasoIds[1]!, iniciadoHaceHoras: 10, cama: cama2 });
    // La tercera lleva 90 h y su paso no declara horas: si heredara las 100 h de la fase se liberaría dentro de 10 h y ganaría; sin
    // duración declarada su cama no tiene hora (`proximaLiberacion` agrupa por unidad y una unidad sin fin conocido no cuenta), y la próxima sigue siendo la de 60 h.
    await conCorrida(m, { codigo: "LIB-SIN-HORAS", fase: "drying", versionId: secados.versionId, pasoId: secados.pasoIds[2]!, iniciadoHaceHoras: 90, cama: cama3 });

    const d = await datosDelTablero(m.operario, ahora);
    // Control: las tres camas son unidades visibles de quien mira; si no, ninguna corrida contaría para la liberación.
    expect(d.camas.map((c) => c.id)).toEqual(expect.arrayContaining([cama1, cama2, cama3]));
    expect(d.liberacion).toEqual({ tipo: "a_las", cuando: new Date(haceHoras(10).getTime() + 60 * HORA) });
  });

  it("la liberación: una corrida SIN paso bajo una versión CON pasos no hereda la duración de la fase, y bajo una versión sin pasos sí (R9)", async () => {
    // Un mundo PROPIO: la liberación es la de la próxima unidad de TODAS las visibles, y las camas de la prueba de arriba, abiertas todavía en
    // el mundo del `describe`, la contaminarían.
    const w = await mundo("tablero-r9");
    const cama = async (rotulo: string) =>
      (
        await prisma.location.create({
          data: { name: nombre(`${rotulo} del tablero R9`), locationType: "drying_bed", classification: "internal", status: "approved", organizationId: w.orgId },
        })
      ).id;
    const camaDeLaDesviacion = await cama("Cama de la desviación");
    const camaDelControl = await cama("Cama del control");
    // La fase de las dos versiones dice 100 h (la de la primera por derivación del primer paso), así que heredarla liberaría la cama dentro de 10 h.
    const conPasos = await receta(w, "secado con pasos del tablero R9", [
      { tipo: "drying", horasSugeridas: 100, volteoCadaHoras: 4 },
      { tipo: "drying", horasSugeridas: 60, volteoCadaHoras: 12 },
    ]);
    const sinPasos = await receta(w, "secado antes de la 2a del tablero R9", [], [], [{ phase: "drying", horasSugeridas: 100 }]);

    // Las dos corridas llevan 90 h secándose y NINGUNA cumple un paso.
    await conCorrida(w, { codigo: "LIB-R9-DESVIACION", fase: "drying", versionId: conPasos.versionId, pasoId: null, iniciadoHaceHoras: 90, cama: camaDeLaDesviacion });
    const sola = await datosDelTablero(w.operario, ahora);
    // Control: la cama es una unidad visible de quien mira; si no, ninguna corrida contaría para la liberación y el resultado de abajo no diría nada.
    expect(sola.camas.map((c) => c.id)).toContain(camaDeLaDesviacion);
    // La desviación sola: hay algo ocupado y NADIE declaró cuándo acaba. Heredar la fase daría «a las» dentro de 10 h.
    expect(sola.liberacion).toEqual({ tipo: "sin_duracion_declarada" });

    await conCorrida(w, { codigo: "LIB-R9-SIN-PASOS", fase: "drying", versionId: sinPasos.versionId, pasoId: null, iniciadoHaceHoras: 90, cama: camaDelControl });
    const conControl = await datosDelTablero(w.operario, ahora);
    expect(conControl.camas.map((c) => c.id)).toEqual(expect.arrayContaining([camaDeLaDesviacion, camaDelControl]));
    // Control: bajo la versión sin pasos la fase manda (100 h desde hace 90 h = dentro de 10 h), y la desviación sigue sin aportar ninguna hora.
    expect(conControl.liberacion).toEqual({ tipo: "a_las", cuando: new Date(haceHoras(90).getTime() + 100 * HORA) });
  });

  it("la curva pinta la banda del paso de la corrida abierta; sin paso, la de la versión, y la de un paso no se cuela en ella", async () => {
    const delPaso = await conCorrida(m, { codigo: "CURVA-PASO", fase: "drying", versionId: curvas.versionId, pasoId: curvas.pasoIds[1]!, iniciadoHaceHoras: 10 });
    const sinPaso = await conCorrida(m, { codigo: "CURVA-SIN-PASO", fase: "drying", versionId: curvas.versionId, pasoId: null, iniciadoHaceHoras: 10 });
    const bandaDe = async (lotId: string, variable: string) => {
      const { curva } = await datosDelTablero(m.operario, ahora, { curva: { lotId, variable, ancho: 300, alto: 100 } });
      expect(curva, "el lote no es visible para quien mira").not.toBeNull();
      return curva!.banda;
    };

    // Control: sin paso, la banda de humedad es la de la VERSIÓN (10–12, objetivo 11: y = 50). Un objetivo `during` es una banda de trayectoria.
    expect(await bandaDe(sinPaso.lotId, "moisture")).toEqual({ tipo: "banda", alcance: "trayectoria", yMin: 100, yMax: 0, yObjetivo: 50 });
    // Con el segundo paso es la SUYA (10–14, objetivo 13: y = 25).
    expect(await bandaDe(delPaso.lotId, "moisture")).toEqual({ tipo: "banda", alcance: "trayectoria", yMin: 100, yMax: 0, yObjetivo: 25 });
    // El Brix sólo lo declara ese paso: con él hay banda (20–30, objetivo 25: y = 50); sin paso, la meta de un paso no se cuela.
    expect(await bandaDe(delPaso.lotId, "brix")).toEqual({ tipo: "banda", alcance: "trayectoria", yMin: 100, yMax: 0, yObjetivo: 50 });
    expect(await bandaDe(sinPaso.lotId, "brix")).toEqual({ tipo: "sin_objetivo_declarado" });
  });
});

describe("compareRunToTargets lee las metas del paso de la corrida (diseño §3.2)", () => {
  let m: Mundo;
  let admin: string;
  /** Un paso de fermentación con su pH final (3,8) y su Brix inicial (22); la meta de la VERSIÓN es otro pH final (4,2). */
  let compara: { versionId: string; pasoIds: string[] };

  const lectura = (c: { lotId: string; runId: string }, variable: string, value: number, haceH: number) =>
    prisma.measurement.create({
      data: {
        variable,
        value,
        unit: variable === "ph" ? "pH" : "Bx",
        occurredAt: haceHoras(haceH),
        lotId: c.lotId,
        fermentationRunId: c.runId,
        provenanceClass: "direct_observation",
      },
    });

  beforeAll(async () => {
    m = await mundo("compara");
    // El Platform Admin de la base sembrada, como `processTargets.test.ts`: `compareRunToTargets` lee por el id de UNA corrida y
    // no cuenta nada global, así que ese alcance no contamina ninguna cifra.
    admin = (
      await prisma.assignment.findFirstOrThrow({
        where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
        select: { userAccountId: true },
      })
    ).userAccountId;
    compara = await receta(
      m,
      "compara",
      [
        {
          tipo: "fermentation",
          horasSugeridas: 36,
          metas: [
            { variable: "ph", moment: "final", unit: "pH", targetValue: 3.8 },
            { variable: "brix", moment: "initial", unit: "Bx", targetValue: 22 },
          ],
        },
      ],
      [{ variable: "ph", moment: "final", phase: "fermentation", unit: "pH", targetValue: 4.2 }],
    );
  }, 60_000);

  it("fila patrón: la versión trae dos metas de su paso y una de la versión, cada una con su pH final distinto", async () => {
    const metas = await prisma.processTarget.findMany({ where: { recipeVersionId: compara.versionId }, select: { variable: true, targetValue: true, recipeStepId: true } });
    expect(metas.filter((t) => t.recipeStepId === compara.pasoIds[0]).map((t) => t.variable).sort()).toEqual(["brix", "ph"]);
    expect(metas.filter((t) => t.recipeStepId === null).map((t) => [t.variable, t.targetValue?.toNumber()])).toEqual([["ph", 4.2]]);
  });

  it("una corrida con paso se compara contra las metas de SU paso, con sus lecturas, y no contra las de la versión", async () => {
    const delPaso = await conCorrida(m, {
      codigo: "CMP-PASO",
      fase: "fermentation",
      versionId: compara.versionId,
      pasoId: compara.pasoIds[0]!,
      iniciadoHaceHoras: 5,
      locationId: m.finca,
    });
    await lectura(delPaso, "ph", 3.785, 1);
    const filas = await compareRunToTargets(admin, delPaso.runId);
    expect(filas.map((f) => [f.variable, f.moment, f.target.value?.toNumber()])).toEqual([
      ["ph", "final", 3.8],
      ["brix", "initial", 22],
    ]);
    // Y la comparación es de verdad: la lectura se mide contra SU meta (3,8) y no contra la de la versión (4,2).
    expect(filas[0]!.actual.mean?.toNumber()).toBe(3.785);
    expect(filas[0]!.deviation?.toNumber()).toBeCloseTo(-0.015, 4);

    // Control (el lado contrario, en la MISMA versión y con la misma lectura): una corrida SIN paso se compara contra la meta de la versión
    // —su pH final de 4,2— y de ninguna del paso. Sin esto, «solo salen las del paso» no distinguiría un lector que siempre lee las del paso.
    const sinPaso = await conCorrida(m, {
      codigo: "CMP-SIN-PASO",
      fase: "fermentation",
      versionId: compara.versionId,
      pasoId: null,
      iniciadoHaceHoras: 5,
      locationId: m.finca,
    });
    await lectura(sinPaso, "ph", 3.785, 1);
    const delControl = await compareRunToTargets(admin, sinPaso.runId);
    expect(delControl.map((f) => [f.variable, f.moment, f.target.value?.toNumber()])).toEqual([["ph", "final", 4.2]]);
    expect(delControl[0]!.deviation?.toNumber()).toBeCloseTo(3.785 - 4.2, 4);
  });
});
