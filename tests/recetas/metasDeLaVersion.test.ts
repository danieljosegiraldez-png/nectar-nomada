/**
 * Las metas de la VERSIÓN son las que no tienen paso — Parte 2a, tarea 9a (diseño §3.2; corte del 2026-10-06).
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md, §3.2: las metas de un paso son del paso.
 *
 * Desde la tarea 1 una meta puede colgar de un paso (`ProcessTarget.recipeStepId`), y desde las tareas 3 y 14 el editor las escribe. Cuatro
 * lectores leían **todas** las metas de la versión de una corrida, de cualquier paso: la cola de secado (`colaDeSecado`), la entrada de cada
 * lote y la curva del tablero (`datosDelTablero`), la tabla «objetivo contra real» (`compareRunToTargets`) y el perfil de tueste elegido
 * (`getPerfilDeTuesteElegido`). Una meta de un paso no es de la versión: es de quien cumple ese paso. Esta tarea hace que los cuatro lean,
 * de la versión, sólo las que no cuelgan de ningún paso; **leer las del paso de la corrida es de la tarea 9 (PR-B)**, que necesita corridas
 * que guardan su paso, y por eso aquí toda corrida es SIN paso.
 *
 * **Cada prueba lleva su control al lado: la meta de la versión SÍ se lee.** Sin él, un filtro que lo quitara todo (`recipeStepId: { not: null }`)
 * pasaría por «no lee la meta del paso». Los dos lados de cada fixture son metas con el mismo orden de magnitud y distinta variable, para que
 * ninguna se confunda con la otra.
 *
 * **Todo se arma CRUDO**, con `prisma`: la receta con su versión publicada, sus pasos y sus metas, y las corridas con su proceso. No hay ninguna
 * puerta del servicio: lo que se mide es qué lee el lector, y las puertas de las tareas 3 (autoría) y 7 (guardián) no cambian nada de eso. Las
 * corridas van SIN paso: es lo único que existe en el PR-A.
 *
 * **Cada `describe` arma su propio mundo** (organización, sitio, operario Farm Operator de SU sitio): con ámbito acotado la cola y el tablero sólo
 * ven lo que el archivo creó. Nunca Platform Admin donde se cuenta (CLAUDE.md del repositorio, «Un admin de plataforma ve la base compartida
 * entera»); sólo `compareRunToTargets`, que lee por el id de una corrida, usa el Platform Admin de la base sembrada.
 *
 * Grupo `base-sembrada`: necesita base y el catálogo `tipo_paso` sembrado por la tarea 2, así que va en `scripts/pruebas-por-compuerta.txt`.
 * **Limpieza** en `afterAll`, por el prefijo `RUN` y en orden de claves ajenas; nada se borra debajo de las aserciones.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { colaDeSecado } from "../../lib/beneficio/colaDeSecado";
import { datosDelTablero } from "../../lib/beneficio/datosDelTablero";
import { compareRunToTargets } from "../../lib/traceability/processTargets";
import { getPerfilDeTuesteElegido } from "../../lib/traceability/roasting";
import { FASE_DEL_TIPO, type TipoDePaso } from "../../lib/recetas/vocabulario";
import { borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `mdv-${Date.now()}`;
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

/** Una meta de prueba: lo que `ProcessTarget` guarda, sin id, versión, paso ni fase (la fase sale del tipo del paso, o se da aparte). */
interface MetaCruda {
  variable: string;
  moment: "initial" | "during" | "final";
  unit: string;
  minValue?: number;
  maxValue?: number;
  targetValue?: number;
  everyHours?: number;
}

/** Un paso de prueba: su tipo y las metas que cuelgan DE ÉL. `seq` es su lugar en la lista, desde 1. */
interface PasoCrudo {
  tipo: TipoDePaso;
  metas?: MetaCruda[];
}

/**
 * Una receta de la organización con UNA versión publicada: sus pasos en orden, las metas de cada paso, y las metas de la versión (las que no
 * cuelgan de ningún paso, con la fase que se les dé). Sin fases derivadas: lo que se mide son las metas, no el ritmo de la fase.
 */
async function receta(
  m: Mundo,
  etiqueta: string,
  pasos: PasoCrudo[],
  metasDeLaVersion: (MetaCruda & { phase: "fermentation" | "drying" })[] = [],
) {
  const r = await prisma.processRecipe.create({ data: { name: nombre(`Receta ${etiqueta}`), organizationId: m.orgId, status: "approved" } });
  const v = await prisma.processRecipeVersion.create({ data: { recipeId: r.id, version: 1, status: "approved" } });
  for (const [i, p] of pasos.entries()) {
    const paso = await prisma.processRecipeStep.create({
      data: { recipeVersionId: v.id, seq: i + 1, stepTypeValueId: await valor("tipo_paso", p.tipo) },
    });
    for (const [j, t] of (p.metas ?? []).entries()) {
      await prisma.processTarget.create({
        data: { ...t, recipeVersionId: v.id, recipeStepId: paso.id, phase: FASE_DEL_TIPO[p.tipo] ?? null, displayOrder: j },
      });
    }
  }
  for (const [j, t] of metasDeLaVersion.entries()) {
    await prisma.processTarget.create({ data: { ...t, recipeVersionId: v.id, recipeStepId: null, displayOrder: j } });
  }
  return { versionId: v.id };
}

/**
 * Un lote con su proceso (sobre la versión) y UNA corrida abierta —de secado o de fermentación— que NO cumple ningún paso. Todo crudo. El lote lleva
 * `RUN` en su código: el `afterAll` encuentra por él todo lo que cuelga de él.
 */
async function conCorrida(
  m: Mundo,
  o: { codigo: string; fase: "drying" | "fermentation"; versionId: string; iniciadoHaceHoras: number; volteoHaceHoras?: number; locationId?: string },
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
  const inicio = haceHoras(o.iniciadoHaceHoras);
  let runId: string;
  if (o.fase === "drying") {
    const corrida = await prisma.dryingRun.create({ data: { startedAt: inicio, locationId: m.cuarto, lotProcessId: proceso.id } });
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
      data: { startedAt: inicio, vesselNote: nombre(`tanque de ${o.codigo}`), lotProcessId: proceso.id, processRecipeVersionId: o.versionId },
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
  const lotes = (await prisma.lot.findMany({ where: assertDefinedWhere({ lotCode: { contains: RUN } }), select: { id: true } })).map((l) => l.id);
  const transformaciones = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ inputs: { some: { lotId: { in: lotes } } } }),
    select: { id: true, dryingRunId: true, fermentationRunId: true },
  });
  const tIds = transformaciones.map((t) => t.id);
  // Las corridas se descubren por DOS caminos —la transformación que las abre y el proceso de su lote—: si el armado murió entre crear la
  // corrida y su transformación, la segunda vía la encuentra igual.
  const procesos = (await prisma.lotProcess.findMany({ where: assertDefinedWhere({ lotId: { in: lotes } }), select: { id: true } })).map((p) => p.id);
  const secadosDeProceso = (await prisma.dryingRun.findMany({ where: assertDefinedWhere({ lotProcessId: { in: procesos } }), select: { id: true } })).map((r) => r.id);
  const fermentacionesDeProceso = (
    await prisma.fermentationRun.findMany({ where: assertDefinedWhere({ lotProcessId: { in: procesos } }), select: { id: true } })
  ).map((r) => r.id);
  const secados = [
    ...new Set([...transformaciones.map((t) => t.dryingRunId).filter((x): x is string => x !== null), ...secadosDeProceso]),
  ];
  const fermentaciones = [
    ...new Set([...transformaciones.map((t) => t.fermentationRunId).filter((x): x is string => x !== null), ...fermentacionesDeProceso]),
  ];
  // **Nada se hereda de una variable del fixture**: las personas, sus cuentas, los sitios y sus ámbitos se descubren por el RUN que llevan en
  // el nombre. Una corrida que murió a mitad de un `beforeAll` se limpia igual que una que terminó.
  const personas = (await prisma.person.findMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }), select: { id: true } })).map((p) => p.id);
  const cuentas = (await prisma.userAccount.findMany({ where: assertDefinedWhere({ personId: { in: personas } }), select: { id: true } })).map((c) => c.id);
  const sitios = (await prisma.location.findMany({ where: assertDefinedWhere({ name: { contains: RUN } }), select: { id: true } })).map((l) => l.id);
  const ambitos = (
    await prisma.scope.findMany({ where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: sitios } }), select: { id: true } })
  ).map((s) => s.id);

  // **Cada borrado en su propio `try`, y no una cadena**: un `afterAll` es una cadena, y la primera clave ajena que se queja tira
  // todo lo que viene después (CLAUDE.md del repositorio, «Una limpieza escrita debajo de las aserciones no corre»). Las
  // corridas, antes que la receta; los procesos, antes que la versión (su `processRecipeVersionId` es RESTRICT).
  const pasos: [string, () => Promise<unknown>][] = [
    // El perfil de tueste elegido del último `describe` (FK a su lote y a su versión): antes que la receta y que el lote.
    ["lotRoastProfile", () => prisma.lotRoastProfile.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) })],
    ["measurement", () => prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) })],
    ["dryingTurnEvent", () => prisma.dryingTurnEvent.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: secados } }) })],
    ["lotTransformationInput", () => prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) })],
    ["lotTransformationOutput", () => prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) })],
    ["lotTransformation", () => prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: tIds } }) })],
    ["dryingRun", () => prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: secados } }) })],
    ["fermentationRun", () => prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: fermentaciones } }) })],
    ["lotProcess", () => borrarProcesosDeLotesDonde({ id: { in: lotes } })],
    // Las versiones caen con la receta, y los pasos y las metas con la versión.
    ["processRecipe", () => prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) })],
    ["lot", () => prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) })],
    ["assignment", () => prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) })],
    ["scope", () => prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) })],
    ["userAccount", () => prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) })],
    ["person", () => prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) })],
    ["location", () => prisma.location.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) })],
    ["organization", () => prisma.organization.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) })],
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

  // La limpieza se AFIRMA, no se supone, y se cuenta lo que ESTA corrida creó (por su RUN), no un recuento global: un total que no se mueve
  // no distingue «limpió» de «no creó nada». El control positivo va ANTES de los ceros: la corrida sí creó lotes, personas,
  // cuentas, sitios y ámbitos (valen para cualquier subconjunto: con `-t` hay describes sin procesos ni corridas); sin eso los ceros de abajo no miran nada.
  expect(lotes.length).toBeGreaterThan(0);
  expect(personas.length).toBeGreaterThan(0);
  expect(cuentas.length).toBe(personas.length);
  expect(sitios.length).toBeGreaterThan(0);
  expect(ambitos.length).toBeGreaterThan(0);
  expect(await prisma.lot.count({ where: { lotCode: { contains: RUN } } })).toBe(0);
  expect(await prisma.measurement.count({ where: { lotId: { in: lotes } } })).toBe(0);
  expect(await prisma.lotTransformation.count({ where: { id: { in: tIds } } })).toBe(0);
  expect(await prisma.assignment.count({ where: { userAccountId: { in: cuentas } } })).toBe(0);
  expect(await prisma.scope.count({ where: { id: { in: ambitos } } })).toBe(0);
  expect(await prisma.userAccount.count({ where: { id: { in: cuentas } } })).toBe(0);
  expect(await prisma.person.count({ where: { id: { in: personas } } })).toBe(0);
  expect(await prisma.location.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.processTarget.count({ where: { recipeVersion: { recipe: { name: { contains: RUN } } } } })).toBe(0);
  expect(await prisma.processRecipeStep.count({ where: { recipeVersion: { recipe: { name: { contains: RUN } } } } })).toBe(0);
  expect(await prisma.lotProcess.count({ where: { lotId: { in: lotes } } })).toBe(0);
  expect(await prisma.lotRoastProfile.count({ where: { lotId: { in: lotes } } })).toBe(0);
  expect(await prisma.dryingRun.count({ where: { id: { in: secados } } })).toBe(0);
  expect(await prisma.fermentationRun.count({ where: { id: { in: fermentaciones } } })).toBe(0);
  expect(await prisma.organization.count({ where: { name: { contains: RUN } } })).toBe(0);
}, 60_000);

describe("la cola de secado y el tablero leen las metas de la versión, no las de un paso (diseño §3.2)", () => {
  let m: Mundo;
  /** Un paso de secado con una meta de humedad cada 6 h (DEL PASO), y una meta de la VERSIÓN: la temperatura, cada 3 h. */
  let secado: { versionId: string };
  /** Un paso de fermentación con su pH cada 6 h (DEL PASO), y la meta de la VERSIÓN: la temperatura, cada 2 h. */
  let fermenta: { versionId: string };
  /** Un paso de secado con una banda de Brix (DEL PASO), y la banda de humedad de la VERSIÓN. */
  let curvas: { versionId: string };

  /** La unidad de la cola de un lote, o un fallo con nombre: «no aparece» no es «no debe lecturas». */
  const unidadDe = async (lotId: string) => {
    const cola = await colaDeSecado(m.operario, ahora);
    const unidad = cola.areas.flatMap((a) => a.unidades).find((u) => u.lotId === lotId);
    expect(unidad, "el lote no aparece en la cola de quien mira").toBeDefined();
    return unidad!;
  };

  beforeAll(async () => {
    m = await mundo("lectores");
    secado = await receta(
      m,
      "secado con metas",
      [{ tipo: "drying", metas: [{ variable: "moisture", moment: "during", unit: "%", minValue: 10, maxValue: 12, everyHours: 6 }] }],
      [{ variable: "temperature", moment: "during", phase: "drying", unit: "C", minValue: 20, maxValue: 30, everyHours: 3 }],
    );
    fermenta = await receta(
      m,
      "fermenta con metas",
      [{ tipo: "fermentation", metas: [{ variable: "ph", moment: "during", unit: "pH", minValue: 3.8, maxValue: 4.6, everyHours: 6 }] }],
      [{ variable: "temperature", moment: "during", phase: "fermentation", unit: "C", minValue: 18, maxValue: 24, everyHours: 2 }],
    );
    curvas = await receta(
      m,
      "curva con metas",
      [{ tipo: "drying", metas: [{ variable: "brix", moment: "during", unit: "Bx", minValue: 20, maxValue: 30, targetValue: 25 }] }],
      [{ variable: "moisture", moment: "during", phase: "drying", unit: "%", minValue: 10, maxValue: 12, targetValue: 11 }],
    );
  }, 60_000);

  it("fila patrón: cada versión trae una meta de un paso y una meta de la versión, de variables distintas", async () => {
    const dequien = async (versionId: string) =>
      (await prisma.processTarget.findMany({ where: { recipeVersionId: versionId }, select: { variable: true, recipeStepId: true } }))
        .map((t) => `${t.variable}:${t.recipeStepId === null ? "versión" : "paso"}`)
        .sort();
    expect(await dequien(secado.versionId)).toEqual(["moisture:paso", "temperature:versión"]);
    expect(await dequien(fermenta.versionId)).toEqual(["ph:paso", "temperature:versión"]);
    expect(await dequien(curvas.versionId)).toEqual(["brix:paso", "moisture:versión"]);
  });

  it("la cola de secado debe las lecturas de las metas de la versión y no las de un paso (§3.2)", async () => {
    // 30 h sin una sola lectura, y volteada hace 1 h: lo único que puede pesar son las lecturas debidas. La corrida no cumple ningún paso.
    const corrida = await conCorrida(m, { codigo: "COLA", fase: "drying", versionId: secado.versionId, iniciadoHaceHoras: 30, volteoHaceHoras: 1 });
    const u = await unidadDe(corrida.lotId);
    // Debe la temperatura, que es meta de la VERSIÓN (cada 3 h: el control, la meta de la versión SÍ se lee); y NO la humedad, que es de un paso (cada 6 h).
    expect(u.ritmoDelLote.debidas.map((d) => [d.variable, d.cada])).toEqual([["temperature", 3]]);
  });

  it("la entrada del lote en el tablero trae las metas de la versión y no las de un paso (§3.2)", async () => {
    const corrida = await conCorrida(m, { codigo: "TAB", fase: "fermentation", versionId: fermenta.versionId, iniciadoHaceHoras: 10 });
    const d = await datosDelTablero(m.operario, ahora);
    const e = d.lotes.find((l) => l.lotId === corrida.lotId);
    expect(e, "el lote con una fermentación abierta no está en el tablero").toBeDefined();
    // La temperatura es de la VERSIÓN (cada 2 h: el control); el pH es de un paso y no es de esta corrida.
    expect(e!.metas).toEqual([{ variable: "temperature", everyHours: 2, ultimaLectura: null }]);
  });

  it("la banda de la curva sale de las metas de la versión: la de un paso no se cuela en ella (§3.2)", async () => {
    const corrida = await conCorrida(m, { codigo: "CURVA", fase: "drying", versionId: curvas.versionId, iniciadoHaceHoras: 10 });
    const bandaDe = async (variable: string) => {
      const { curva } = await datosDelTablero(m.operario, ahora, { curva: { lotId: corrida.lotId, variable, ancho: 300, alto: 100 } });
      expect(curva, "el lote no es visible para quien mira").not.toBeNull();
      return curva!.banda;
    };
    // Control: la humedad es una meta de la VERSIÓN (10–12, objetivo 11: y = 50). Un objetivo `during` es una banda de trayectoria.
    expect(await bandaDe("moisture")).toEqual({ tipo: "banda", alcance: "trayectoria", yMin: 100, yMax: 0, yObjetivo: 50 });
    // El Brix sólo lo declara un PASO: la corrida no lo cumple, así que no hay banda.
    expect(await bandaDe("brix")).toEqual({ tipo: "sin_objetivo_declarado" });
  });
});

describe("compareRunToTargets compara una corrida sólo contra las metas de la versión (diseño §3.2)", () => {
  let m: Mundo;
  let admin: string;
  /** Un paso de fermentación con su pH final (3,8) y su Brix inicial (22); la meta de la VERSIÓN es otro pH final (4,2). */
  let compara: { versionId: string };

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
          metas: [
            { variable: "ph", moment: "final", unit: "pH", targetValue: 3.8 },
            { variable: "brix", moment: "initial", unit: "Bx", targetValue: 22 },
          ],
        },
      ],
      [{ variable: "ph", moment: "final", phase: "fermentation", unit: "pH", targetValue: 4.2 }],
    );
  }, 60_000);

  it("fila patrón: la versión trae dos metas de un paso y una de la versión, cada una con su pH final distinto", async () => {
    const metas = await prisma.processTarget.findMany({ where: { recipeVersionId: compara.versionId }, select: { variable: true, targetValue: true, recipeStepId: true } });
    expect(metas.filter((t) => t.recipeStepId !== null).map((t) => t.variable).sort()).toEqual(["brix", "ph"]);
    expect(metas.filter((t) => t.recipeStepId === null).map((t) => [t.variable, t.targetValue?.toNumber()])).toEqual([["ph", 4.2]]);
  });

  it("una corrida se compara contra las metas de la versión, sin las de ningún paso (§3.2)", async () => {
    const corrida = await conCorrida(m, { codigo: "CMP", fase: "fermentation", versionId: compara.versionId, iniciadoHaceHoras: 5, locationId: m.finca });
    await lectura(corrida, "ph", 4.1, 1);
    const filas = await compareRunToTargets(admin, corrida.runId);
    // Control: la meta de la VERSIÓN (pH final 4,2) sí se compara; y no salen ni el pH final ni el Brix del paso.
    expect(filas.map((f) => [f.variable, f.moment, f.target.value?.toNumber()])).toEqual([["ph", "final", 4.2]]);
    expect(filas[0]!.deviation?.toNumber()).toBeCloseTo(-0.1, 4);
  });
});

describe("el perfil de tueste elegido enseña las metas de la versión y no las de sus pasos (diseño §3.2, adjudicación I5)", () => {
  let m: Mundo;
  /** Un paso de secado con su humedad (meta DEL PASO) y una meta de la VERSIÓN, la temperatura. */
  let conPasos: { versionId: string };
  /** Una versión SIN pasos con dos metas de la versión: el mundo de antes de la 2a, y el control. */
  let sinPasos: { versionId: string };

  /** Un lote verde con esa versión elegida como su perfil. Se elige por la FK: lo que se prueba es qué lee el lector, no la puerta que elige. */
  const verdeConPerfil = async (codigo: string, versionId: string) => {
    const lote = await prisma.lot.create({
      data: { lotCode: `${codigo}-${RUN}`, lotType: "green", organizationId: m.orgId, locationId: m.finca, status: "approved", classification: "internal" },
    });
    await prisma.lotRoastProfile.create({ data: { lotId: lote.id, recipeVersionId: versionId, chosenBy: m.operario } });
    return lote.id;
  };
  /** Las metas que devuelve el lector, como «variable:de quién», ordenadas: el orden de las filas no es lo que se prueba. */
  const metasDelPerfil = async (lotId: string) => {
    const perfil = await getPerfilDeTuesteElegido(m.operario, lotId);
    expect(perfil, "el lote no tiene perfil elegido, o no es visible para quien mira").not.toBeNull();
    return perfil!.recipeVersion.targets.map((t) => `${t.variable}:${t.recipeStepId === null ? "versión" : "paso"}`).sort();
  };

  beforeAll(async () => {
    m = await mundo("tueste");
    conPasos = await receta(
      m,
      "perfil con pasos",
      [{ tipo: "drying", metas: [{ variable: "moisture", moment: "during", unit: "%", minValue: 10, maxValue: 12 }] }],
      [{ variable: "temperature", moment: "during", phase: "drying", unit: "C", minValue: 20, maxValue: 30 }],
    );
    sinPasos = await receta(
      m,
      "perfil sin pasos",
      [],
      [
        { variable: "temperature", moment: "during", phase: "drying", unit: "C", minValue: 20, maxValue: 30 },
        { variable: "moisture", moment: "final", phase: "drying", unit: "%", minValue: 10, maxValue: 12 },
      ],
    );
  }, 60_000);

  it("fila patrón: la versión con pasos trae una meta de su paso y una de la versión; la sin pasos, dos de la versión", async () => {
    const dequien = async (versionId: string) =>
      (await prisma.processTarget.findMany({ where: { recipeVersionId: versionId }, select: { variable: true, recipeStepId: true } }))
        .map((t) => `${t.variable}:${t.recipeStepId === null ? "versión" : "paso"}`)
        .sort();
    expect(await dequien(conPasos.versionId)).toEqual(["moisture:paso", "temperature:versión"]);
    expect(await dequien(sinPasos.versionId)).toEqual(["moisture:versión", "temperature:versión"]);
  });

  it("con pasos, el perfil trae las metas de la versión y de ningún paso; sin pasos, trae todas las suyas", async () => {
    const delPerfilConPasos = await verdeConPerfil("PERFIL-CON-PASOS", conPasos.versionId);
    const delPerfilSinPasos = await verdeConPerfil("PERFIL-SIN-PASOS", sinPasos.versionId);
    // La humedad es del PASO y la temperatura es de la VERSIÓN: sólo la segunda es del perfil.
    expect(await metasDelPerfil(delPerfilConPasos)).toEqual(["temperature:versión"]);
    // Control: la misma lectura sobre una versión sin pasos devuelve sus dos metas, como hasta ahora; el filtro no quita metas de la versión.
    expect(await metasDelPerfil(delPerfilSinPasos)).toEqual(["moisture:versión", "temperature:versión"]);
  });
});
