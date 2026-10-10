/**
 * Parte 2a, tarea 1 — el esquema de la receta con pasos, contra la BASE.
 *
 * **Qué vigila esto y qué no.** Las reglas de aquí viven en la base: los CHECK y los dos índices únicos
 * parciales que `schema.prisma` no sabe expresar, la clave ajena COMPUESTA de las metas, y las acciones de
 * borrado (RESTRICT y CASCADE) que deciden qué se puede borrar y qué se va con qué —incluida la de la
 * organización de la receta, que pasa de SET NULL a RESTRICT (registro de la 2a, Ruling FK-ORG)—. Probarlas a través de
 * un servicio comprobaría el servicio: una restricción que sólo existe en TypeScript se la salta un
 * importador, una reparación o SQL directo. Aquí no hay servicio todavía; las escrituras son de Prisma
 * directo, como en `describe("los CHECK de \`lot_process\`")` de `lotProcess.test.ts`.
 *
 * **Cómo se mide.** Cada prueba corre en UNA transacción que se deshace al final
 * (`enTransaccionQueSeDeshace`): nada de lo que crea llega a la base. Dentro, cada intento va en un
 * SAVEPOINT (`intentar`: una transacción anidada de Prisma 7, que el adaptador `pg` hace con
 * `SAVEPOINT prisma_sp_N` y `ROLLBACK TO SAVEPOINT`), así que un rechazo deshace sólo lo suyo y la
 * transacción sigue viva para el siguiente. Las filas de las que cuelga cada rechazo se crean ANTES, y
 * cada rechazo lleva al lado su control —lo bien formado entra—: si no, «no entró» se leería igual cuando
 * la fila no llegó a construirse (CLAUDE.md del repo, «Ocho guardias falsos en un día», regla 3). La
 * primera prueba mide el instrumento.
 *
 * **Cómo se reconoce cada rechazo.** Los nombres son los de la migración `receta_con_pasos`. Un CHECK,
 * por su nombre en el mensaje de Postgres; una clave ajena, por el suyo («Foreign key constraint violated
 * on the constraint: `…`»); un índice único, por sus CAMPOS, que es lo que dice Prisma (medido en
 * `lotProcess.test.ts`, «dos procesos abiertos en el mismo lote…»).
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import type { Prisma } from "../../generated/prisma/client";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { deleteTestOrganizations } from "../helpers/testOrganization";

// Prefijo PROPIO (F2-10): `pasos-` es el de `pasos.test.ts`, y los dos archivos corren en paralelo; en el mismo milisegundo el `afterAll` de uno (`contains: RUN`) borraba lo del otro.
const RUN = `esquema-${Date.now()}`;
const AHORA = new Date("2026-03-02T12:00:00Z");
type Tx = Prisma.TransactionClient;

/** Lo que cada prueba necesita, creado DENTRO de su transacción. */
interface Mundo {
  orgId: string;
  recetaId: string;
  /** Dos versiones de la MISMA receta: la clave ajena compuesta tiene que distinguirlas. */
  v1: string;
  v2: string;
  /** Valores de un catálogo de prueba. La base exige que el valor exista; de qué catálogo sea, lo exige el servicio. */
  tipo: { fermentation: string; prefermentacion: string; washing: string };
  valor: string;
  lotId: string;
  procesoId: string;
  lecturaId: string;
}

async function lectura(tx: Tx, lotId: string): Promise<string> {
  return (
    await tx.measurement.create({
      data: { variable: "ph", value: 4.1, unit: "pH", occurredAt: AHORA, lotId, provenanceClass: "measured_fact" },
    })
  ).id;
}

async function montar(tx: Tx): Promise<Mundo> {
  const orgId = (
    await tx.organization.create({
      data: { organizationType: "farm", name: `TEST Organization (${RUN})`, status: "approved", classification: "internal" },
    })
  ).id;
  const catalogId = (await tx.variableCatalog.create({ data: { key: `test_pasos_${RUN}`, name: `TEST pasos ${RUN}` } })).id;
  const valor = async (v: string) =>
    (await tx.variableCatalogValue.create({ data: { catalogId, value: `TEST ${v} ${RUN}` } })).id;
  const tipo = {
    fermentation: await valor("fermentation"),
    prefermentacion: await valor("prefermentacion"),
    washing: await valor("washing"),
  };
  const otro = await valor("otro");
  const recetaId = (
    await tx.processRecipe.create({ data: { name: `TEST receta con pasos ${RUN}`, organizationId: orgId } })
  ).id;
  const v1 = (await tx.processRecipeVersion.create({ data: { recipeId: recetaId, version: 1 } })).id;
  const v2 = (await tx.processRecipeVersion.create({ data: { recipeId: recetaId, version: 2 } })).id;
  const lotId = (
    await tx.lot.create({ data: { lotCode: `TEST-PASOS-${RUN}`, lotType: "cherry", organizationId: orgId } })
  ).id;
  const procesoId = (
    await tx.lotProcess.create({
      data: {
        lotId,
        sequenceOrder: 1,
        intent: `TEST ${RUN}`,
        targetMoisturePct: 11.5,
        startedAt: AHORA,
        provenanceClass: "original_record",
        processGradeValueId: otro,
        cherryStateValueId: otro,
      },
    })
  ).id;
  const lecturaId = await lectura(tx, lotId);
  return { orgId, recetaId, v1, v2, tipo, valor: otro, lotId, procesoId, lecturaId };
}

class Deshacer extends Error {}

/** Corre `cuerpo` en una transacción que SIEMPRE se deshace: nada de lo que crea queda en la base. */
async function enTransaccionQueSeDeshace(cuerpo: (tx: Tx, m: Mundo) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await cuerpo(tx, await montar(tx));
        throw new Deshacer("fin de la prueba: se deshace todo");
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (error instanceof Deshacer) return;
    throw error; // una aserción que falla dentro sale con su propio mensaje
  }
}

/**
 * Intenta `fn` en un SAVEPOINT y devuelve el mensaje con que se rechazó, o `null` si entró. Un rechazo
 * deshace sólo lo suyo; lo que entra se queda en la transacción de fuera.
 */
async function intentar(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<string | null> {
  try {
    await tx.$transaction(async (sp) => {
      await fn(sp);
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** `seq` distinto en cada llamada salvo que la prueba lo fije: la unicidad por versión no se cruza sin querer. */
let seqLibre = 100;
function paso(tx: Tx, m: Mundo, extra: Partial<Prisma.ProcessRecipeStepUncheckedCreateInput> = {}) {
  const data: Prisma.ProcessRecipeStepUncheckedCreateInput = {
    recipeVersionId: m.v1,
    seq: seqLibre++,
    stepTypeValueId: m.tipo.fermentation,
    ...extra,
  };
  return tx.processRecipeStep.create({ data });
}

function meta(tx: Tx, m: Mundo, extra: Partial<Prisma.ProcessTargetUncheckedCreateInput> = {}) {
  const data: Prisma.ProcessTargetUncheckedCreateInput = {
    recipeVersionId: m.v1,
    variable: "ph",
    moment: "initial",
    unit: "pH",
    targetValue: 4.5,
    phase: "fermentation",
    ...extra,
  };
  return tx.processTarget.create({ data });
}

type ExtraDeRegistro = { recipeStepId?: string; stepTypeValueId?: string; motivoDesviacion?: string };

/** Los cuatro registros de §4.1, con lo mínimo que exige su tabla, marcados con RUN para la red del `afterAll`. */
function registros(m: Mundo, corridaId: string): readonly [string, (sp: Tx, x: ExtraDeRegistro) => Promise<{ id: string }>][] {
  return [
    ["fermentation_run", (sp, x) => sp.fermentationRun.create({ data: { startedAt: AHORA, vesselNote: `TEST ${RUN}`, ...x } })],
    ["drying_run", (sp, x) => sp.dryingRun.create({ data: { startedAt: AHORA, method: `TEST ${RUN}`, ...x } })],
    [
      "lot_process_intervention",
      (sp, x) =>
        sp.lotProcessIntervention.create({
          data: { lotProcessId: m.procesoId, catalogValueId: m.valor, occurredAt: AHORA, ...x },
        }),
    ],
    [
      "fermentation_intervention",
      (sp, x) =>
        sp.fermentationIntervention.create({
          data: { fermentationRunId: corridaId, interventionType: "addition", occurredAt: AHORA, notes: `TEST ${RUN}`, ...x },
        }),
    ],
  ];
}

/**
 * La red: si alguna transacción NO se hubiera deshecho, lo que dejó se borra aquí en orden de claves
 * ajenas, y la corrida falla diciendo cuánto escapó. Con el instrumento sano no borra nada. El recuento
 * va ANTES de borrar y la aserción DESPUÉS, para que una aserción que falla no se salte la limpieza.
 */
afterAll(async () => {
  const lotes = (
    await prisma.lot.findMany({ where: assertDefinedWhere({ lotCode: { contains: RUN } }), select: { id: true } })
  ).map((l) => l.id);
  const recetas = (
    await prisma.processRecipe.findMany({ where: assertDefinedWhere({ name: { contains: RUN } }), select: { id: true } })
  ).map((r) => r.id);
  const catalogos = await prisma.variableCatalog.count({ where: assertDefinedWhere({ key: { contains: RUN } }) });
  const organizaciones = await prisma.organization.count({ where: assertDefinedWhere({ name: { contains: RUN } }) });

  // Los registros antes que los pasos que cumplen (RESTRICT); sus marcas de cierre caen con ellos (CASCADE).
  await prisma.fermentationIntervention.deleteMany({ where: assertDefinedWhere({ notes: { contains: RUN } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ vesselNote: { contains: RUN } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ method: { contains: RUN } }) });
  // Los procesos antes que las versiones (`origen_de_receta_version_id`, RESTRICT); sus intervenciones caen con ellos.
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  // Las recetas que apuntan a una versión (derivada o parecida, RESTRICT) antes que las demás. Borrar una receta se
  // lleva sus versiones, y éstas sus pasos —con adiciones, fines, requisitos y metas del paso— y sus metas.
  await prisma.processRecipe.deleteMany({
    where: assertDefinedWhere({
      id: { in: recetas },
      OR: [{ derivadaDeVersionId: { not: null } }, { parecidaAVersionId: { not: null } }],
    }),
  });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recetas } }) });
  // Las lecturas después de los fines y las marcas que las citan (RESTRICT).
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.variableCatalog.deleteMany({ where: assertDefinedWhere({ key: { contains: RUN } }) }); // sus valores caen con él
  await deleteTestOrganizations(RUN);

  expect(
    { lotes: lotes.length, recetas: recetas.length, catalogos, organizaciones },
    "filas que escaparon de una transacción que debía deshacerse",
  ).toEqual({ lotes: 0, recetas: 0, catalogos: 0, organizaciones: 0 });
});

describe("el instrumento: una transacción que se deshace, con SAVEPOINT dentro", () => {
  it("un rechazo dentro de un SAVEPOINT deshace sólo lo suyo, la transacción sigue viva, y al terminar no queda nada", async () => {
    let pasoId = "";
    let versionId = "";
    await enTransaccionQueSeDeshace(async (tx, m) => {
      versionId = m.v1;
      // Un rechazo de verdad de la base: un tipo de paso que no existe.
      expect(await intentar(tx, (sp) => paso(sp, m, { stepTypeValueId: "00000000-0000-4000-8000-000000000000" }))).toMatch(
        /process_recipe_step_step_type_value_id_fkey/,
      );
      // La transacción de fuera sigue viva —la lectura siguiente contesta— y el rechazo no dejó nada.
      expect(await tx.processRecipeStep.count({ where: { recipeVersionId: m.v1 } })).toBe(0);
      // Lo que entra en un SAVEPOINT se queda en la transacción de fuera…
      expect(
        await intentar(tx, async (sp) => {
          pasoId = (await paso(sp, m)).id;
        }),
      ).toBeNull();
      expect(await tx.processRecipeStep.count({ where: { recipeVersionId: m.v1 } })).toBe(1);
      // …y lo que un SAVEPOINT deshace, no.
      expect(
        await intentar(tx, async (sp) => {
          await paso(sp, m);
          throw new Error("se deshace sólo esto");
        }),
      ).toBe("se deshace sólo esto");
      expect(await tx.processRecipeStep.count({ where: { recipeVersionId: m.v1 } })).toBe(1);
    });
    // Al terminar la prueba, NADA de lo que creó sigue en la base: ni el paso ni la versión de la que colgaba.
    expect(pasoId).not.toBe("");
    expect(await prisma.processRecipeStep.count({ where: { id: pasoId } })).toBe(0);
    expect(await prisma.processRecipeVersion.count({ where: { id: versionId } })).toBe(0);
  });
});

describe("process_recipe_step: los rangos y el orden los exige la base (§3)", () => {
  it("el mucílago que QUEDA va en uno de los seis tramos: 33, 110 y −1 no entran; 0 (Lavado), 100 (Honey) y los otros cuatro sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      // 33 está entre 0 y 100 y no es un tramo: es el caso que distingue `IN (…)` de `BETWEEN 0 AND 100`.
      for (const malo of [33, 110, -1]) {
        expect(await intentar(tx, (sp) => paso(sp, m, { mucilagoObjetivo: malo })), String(malo)).toMatch(
          /process_recipe_step_mucilago_en_tramos/,
        );
      }
      for (const bueno of [0, 10, 25, 50, 75, 100]) {
        expect(await intentar(tx, (sp) => paso(sp, m, { mucilagoObjetivo: bueno })), String(bueno)).toBeNull();
      }
      // Sin declarar (NULL) entra: es «no se declaró», no un tramo.
      expect(await intentar(tx, (sp) => paso(sp, m, { mucilagoObjetivo: null })), "sin declarar").toBeNull();
    });
  });

  it("las horas van en orden —mínimo ≤ sugeridas ≤ máximo—, también sin la sugerida", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const malos = [
        { horasMin: 24, horasSugeridas: 12 },
        { horasSugeridas: 48, horasMax: 36 },
        // La trampa: sin la sugerida, la forma corta del CHECK vale NULL y PASA (lo explica la migración).
        { horasMin: 48, horasMax: 24 },
      ];
      for (const h of malos) {
        expect(await intentar(tx, (sp) => paso(sp, m, h)), JSON.stringify(h)).toMatch(/process_recipe_step_horas_en_orden/);
      }
      const buenos = [
        { horasMin: 12, horasSugeridas: 24, horasMax: 36 },
        { horasSugeridas: 24 },
        { horasMin: 12, horasMax: 36 },
        { horasMin: 24, horasSugeridas: 24, horasMax: 24 },
      ];
      for (const h of buenos) {
        expect(await intentar(tx, (sp) => paso(sp, m, h)), JSON.stringify(h)).toBeNull();
      }
    });
  });

  it("la humedad mínima no pasa de la máxima; igual, o con un solo extremo, entra", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      expect(await intentar(tx, (sp) => paso(sp, m, { humedadMinPct: 12, humedadMaxPct: 10 }))).toMatch(
        /process_recipe_step_humedad_en_orden/,
      );
      for (const h of [{ humedadMinPct: 10, humedadMaxPct: 12 }, { humedadMinPct: 11, humedadMaxPct: 11 }, { humedadMaxPct: 12 }]) {
        expect(await intentar(tx, (sp) => paso(sp, m, h)), JSON.stringify(h)).toBeNull();
      }
    });
  });

  it("la temperatura mínima no pasa de la máxima; igual, o con un solo extremo, entra", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      expect(await intentar(tx, (sp) => paso(sp, m, { temperaturaMinC: 30, temperaturaMaxC: 20 }))).toMatch(
        /process_recipe_step_temperatura_en_orden/,
      );
      for (const t of [{ temperaturaMinC: 18, temperaturaMaxC: 22 }, { temperaturaMinC: 20, temperaturaMaxC: 20 }, { temperaturaMinC: 4 }]) {
        expect(await intentar(tx, (sp) => paso(sp, m, t)), JSON.stringify(t)).toBeNull();
      }
    });
  });

  it("seq es único dentro de la versión; el mismo seq en otra versión entra", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      expect(await intentar(tx, (sp) => paso(sp, m, { seq: 1 }))).toBeNull();
      expect(await intentar(tx, (sp) => paso(sp, m, { seq: 1 }))).toMatch(
        /Unique constraint failed on the fields: \(`recipe_version_id`, `seq`\)/,
      );
      expect(await intentar(tx, (sp) => paso(sp, m, { seq: 1, recipeVersionId: m.v2 }))).toBeNull();
    });
  });
});

describe("process_recipe_step_addition (§3, E)", () => {
  it("cantidad y unidad van juntas: una sin la otra no entra; las dos, o ninguna, sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const p = await paso(tx, m);
      const adicion = (sp: Tx, extra: { cantidad?: number; unidad?: string }) =>
        sp.processRecipeStepAddition.create({ data: { stepId: p.id, categoriaValueId: m.valor, momento: "pre_green", ...extra } });
      for (const mala of [{ cantidad: 2 }, { unidad: "kg" }]) {
        expect(await intentar(tx, (sp) => adicion(sp, mala)), JSON.stringify(mala)).toMatch(
          /process_recipe_step_addition_cantidad_con_unidad/,
        );
      }
      for (const buena of [{ cantidad: 2, unidad: "kg" }, {}]) {
        expect(await intentar(tx, (sp) => adicion(sp, buena)), JSON.stringify(buena)).toBeNull();
      }
    });
  });
});

describe("process_step_closing_reading (§5.3)", () => {
  it("una marca de cierre es de exactamente un registro: ninguno o dos no entran; cualquiera de los tres, sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const corrida = await tx.fermentationRun.create({ data: { startedAt: AHORA, vesselNote: `TEST ${RUN}` } });
      const secado = await tx.dryingRun.create({ data: { startedAt: AHORA, method: `TEST ${RUN}` } });
      const manejo = await tx.lotProcessIntervention.create({
        data: { lotProcessId: m.procesoId, catalogValueId: m.valor, occurredAt: AHORA },
      });
      const marca = (sp: Tx, extra: { fermentationRunId?: string; dryingRunId?: string; lotProcessInterventionId?: string }) =>
        sp.processStepClosingReading.create({ data: { measurementId: m.lecturaId, ...extra } });
      for (const mala of [{}, { fermentationRunId: corrida.id, dryingRunId: secado.id }]) {
        expect(await intentar(tx, (sp) => marca(sp, mala)), JSON.stringify(mala)).toMatch(
          /process_step_closing_reading_un_registro/,
        );
      }
      for (const buena of [{ fermentationRunId: corrida.id }, { dryingRunId: secado.id }, { lotProcessInterventionId: manejo.id }]) {
        expect(await intentar(tx, (sp) => marca(sp, buena)), JSON.stringify(buena)).toBeNull();
      }
    });
  });

  it("la misma lectura no se marca dos veces para el mismo registro; para otro registro, sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const corrida = await tx.fermentationRun.create({ data: { startedAt: AHORA, vesselNote: `TEST ${RUN}` } });
      const otra = await tx.fermentationRun.create({ data: { startedAt: AHORA, vesselNote: `TEST ${RUN}` } });
      const marca = (sp: Tx, fermentationRunId: string) =>
        sp.processStepClosingReading.create({ data: { measurementId: m.lecturaId, fermentationRunId } });
      expect(await intentar(tx, (sp) => marca(sp, corrida.id))).toBeNull();
      expect(await intentar(tx, (sp) => marca(sp, corrida.id))).toMatch(
        /Unique constraint failed on the fields: \(`measurement_id`, `fermentation_run_id`\)/,
      );
      expect(await intentar(tx, (sp) => marca(sp, otra.id))).toBeNull();
    });
  });
});

describe("process_target con paso (§3.2)", () => {
  it("una meta no cuelga de un paso de OTRA versión: la clave ajena compuesta lo rechaza; de su versión, entra", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const pasoDeV1 = await paso(tx, m);
      // El paso existe —una clave simple sobre `recipe_step_id` estaría satisfecha—; lo que falla es el par (paso, versión).
      expect(await intentar(tx, (sp) => meta(sp, m, { recipeVersionId: m.v2, recipeStepId: pasoDeV1.id }))).toMatch(
        /process_target_recipe_step_id_recipe_version_id_fkey/,
      );
      expect(await intentar(tx, (sp) => meta(sp, m, { recipeVersionId: m.v1, recipeStepId: pasoDeV1.id }))).toBeNull();
    });
  });

  it("la misma variable y momento en dos pasos de la misma versión entran; repetida en el mismo paso, no", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      // La fiebre y la fermentación, y sus metas con la MISMA fase: si el índice de las metas de la versión no
      // excluyera las que llevan paso, estas dos chocarían en (versión, fase, variable, momento).
      const fiebre = await paso(tx, m, { stepTypeValueId: m.tipo.prefermentacion });
      const fermento = await paso(tx, m);
      expect(await intentar(tx, (sp) => meta(sp, m, { recipeStepId: fiebre.id }))).toBeNull();
      expect(await intentar(tx, (sp) => meta(sp, m, { recipeStepId: fermento.id }))).toBeNull();
      expect(await intentar(tx, (sp) => meta(sp, m, { recipeStepId: fiebre.id, targetValue: 4.2 }))).toMatch(
        /Unique constraint failed on the fields: \(`recipe_step_id`, `variable`, `moment`\)/,
      );
      // Control: otro momento en el mismo paso sí entra.
      expect(await intentar(tx, (sp) => meta(sp, m, { recipeStepId: fiebre.id, moment: "final" }))).toBeNull();
    });
  });

  it("las metas sin paso siguen únicas por versión, fase, variable y momento, y no chocan con las de un paso", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const p = await paso(tx, m);
      expect(await intentar(tx, (sp) => meta(sp, m))).toBeNull();
      // La misma versión, fase, variable y momento, pero de un paso: vive en el otro índice.
      expect(await intentar(tx, (sp) => meta(sp, m, { recipeStepId: p.id }))).toBeNull();
      expect(await intentar(tx, (sp) => meta(sp, m, { targetValue: 4.2 }))).toMatch(
        /Unique constraint failed on the fields: \(`recipe_version_id`, `phase`, `variable`, `moment`\)/,
      );
      // Control: la misma variable y momento en otra fase es otra meta.
      expect(await intentar(tx, (sp) => meta(sp, m, { phase: "drying" }))).toBeNull();
    });
  });
});

describe("los cuatro registros que cumplen un paso (§4.1)", () => {
  it("con paso y sin tipo no entra ninguno de los cuatro; con paso y tipo, o sólo con tipo, sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const p = await paso(tx, m);
      const corrida = await tx.fermentationRun.create({ data: { startedAt: AHORA, vesselNote: `TEST ${RUN}` } });
      // El mismo tipo para los cuatro: que el tipo corresponda al registro lo decide el guardián del servicio (§4.2), no la base.
      for (const [tabla, crear] of registros(m, corrida.id)) {
        expect(await intentar(tx, (sp) => crear(sp, { recipeStepId: p.id })), tabla).toMatch(
          new RegExp(`${tabla}_paso_exige_tipo`),
        );
        expect(await intentar(tx, (sp) => crear(sp, { recipeStepId: p.id, stepTypeValueId: m.tipo.fermentation })), tabla).toBeNull();
        // Sólo con tipo: un registro sin paso, que bajo una receta con pasos es una desviación (§4.4).
        expect(
          await intentar(tx, (sp) => crear(sp, { stepTypeValueId: m.tipo.fermentation, motivoDesviacion: "TEST se fermentó en saco" })),
          tabla,
        ).toBeNull();
      }
    });
  });

  it("un paso que algún registro cumple no se borra —RESTRICT, no SET NULL—; uno que nadie cumple, sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const corrida = await tx.fermentationRun.create({ data: { startedAt: AHORA, vesselNote: `TEST ${RUN}` } });
      for (const [tabla, crear] of registros(m, corrida.id)) {
        const cumplido = await paso(tx, m);
        await crear(tx, { recipeStepId: cumplido.id, stepTypeValueId: m.tipo.fermentation });
        // Con SET NULL el borrado entraría y el registro quedaría, en silencio, como una desviación sin motivo.
        expect(await intentar(tx, (sp) => sp.processRecipeStep.delete({ where: { id: cumplido.id } })), tabla).toMatch(
          new RegExp(`${tabla}_recipe_step_id_fkey`),
        );
      }
      const libre = await paso(tx, m);
      expect(await intentar(tx, (sp) => sp.processRecipeStep.delete({ where: { id: libre.id } }))).toBeNull();
    });
  });
});

describe("lot_process_intervention: el acto es el tipo de paso (decisión de Daniel, 2026-10-03)", () => {
  it("sin valor de catálogo y sin tipo no entra; con cualquiera de los dos, o con los dos, sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const manejo = (sp: Tx, extra: { catalogValueId?: string; stepTypeValueId?: string }) =>
        sp.lotProcessIntervention.create({ data: { lotProcessId: m.procesoId, occurredAt: AHORA, ...extra } });
      expect(await intentar(tx, (sp) => manejo(sp, {}))).toMatch(/lot_process_intervention_catalogo_o_tipo/);
      for (const bueno of [
        { stepTypeValueId: m.tipo.washing },
        { catalogValueId: m.valor },
        { catalogValueId: m.valor, stepTypeValueId: m.tipo.washing },
      ]) {
        expect(await intentar(tx, (sp) => manejo(sp, bueno)), JSON.stringify(Object.keys(bueno))).toBeNull();
      }
    });
  });
});

describe("process_recipe: la Libre y su control de parecido (§5.2)", () => {
  it("un parecido sin motivo no entra, ni parecido o motivo fuera de una Libre; lo bien formado sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      let n = 0;
      const receta = (sp: Tx, extra: { esLibre?: boolean; parecidaAVersionId?: string; motivoDeLibre?: string }) =>
        sp.processRecipe.create({ data: { name: `TEST Libre ${++n} ${RUN}`, organizationId: m.orgId, ...extra } });
      // Cada caso malo viola UNA sola de las dos restricciones: el nombre que se espera es el único posible.
      expect(await intentar(tx, (sp) => receta(sp, { esLibre: true, parecidaAVersionId: m.v1 }))).toMatch(
        /process_recipe_parecida_exige_motivo/,
      );
      expect(await intentar(tx, (sp) => receta(sp, { motivoDeLibre: "TEST" }))).toMatch(
        /process_recipe_solo_libre_lleva_parecido_y_motivo/,
      );
      expect(await intentar(tx, (sp) => receta(sp, { parecidaAVersionId: m.v1, motivoDeLibre: "TEST" }))).toMatch(
        /process_recipe_solo_libre_lleva_parecido_y_motivo/,
      );
      // Controles: una Libre que se parece y dice por qué; una Libre sin parecido; una receta de siempre.
      expect(
        await intentar(tx, (sp) =>
          receta(sp, { esLibre: true, parecidaAVersionId: m.v1, motivoDeLibre: "TEST fermenta en saco, no en tanque" }),
        ),
      ).toBeNull();
      expect(await intentar(tx, (sp) => receta(sp, { esLibre: true }))).toBeNull();
      expect(await intentar(tx, (sp) => receta(sp, {}))).toBeNull();
    });
  });
});

describe("lo que apunta a una versión o a una lectura es RESTRICT, no SET NULL", () => {
  it("una versión de la que salió una receta, con la que se comparó una Libre o de la que nació un proceso no se borra; una sin nada, sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const version = async (n: number) => (await tx.processRecipeVersion.create({ data: { recipeId: m.recetaId, version: n } })).id;
      const derivada = await version(3);
      const parecida = await version(4);
      const origen = await version(5);
      const suelta = await version(6);
      await tx.processRecipe.create({ data: { name: `TEST derivada ${RUN}`, organizationId: m.orgId, derivadaDeVersionId: derivada } });
      await tx.processRecipe.create({
        data: { name: `TEST Libre parecida ${RUN}`, organizationId: m.orgId, esLibre: true, parecidaAVersionId: parecida, motivoDeLibre: "TEST" },
      });
      await tx.lotProcess.update({ where: { id: m.procesoId }, data: { origenDeRecetaVersionId: origen } });
      const casos: [string, string][] = [
        [derivada, "process_recipe_derivada_de_version_id_fkey"],
        [parecida, "process_recipe_parecida_a_version_id_fkey"],
        [origen, "lot_process_origen_de_receta_version_id_fkey"],
      ];
      for (const [id, clave] of casos) {
        expect(await intentar(tx, (sp) => sp.processRecipeVersion.delete({ where: { id } })), clave).toMatch(new RegExp(clave));
      }
      expect(await intentar(tx, (sp) => sp.processRecipeVersion.delete({ where: { id: suelta } }))).toBeNull();
    });
  });

  it("una lectura marcada como de cierre, o de la que salió un fin de paso, no se borra; una sin marcar, sí", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const corrida = await tx.fermentationRun.create({ data: { startedAt: AHORA, vesselNote: `TEST ${RUN}` } });
      await tx.processStepClosingReading.create({ data: { measurementId: m.lecturaId, fermentationRunId: corrida.id } });
      const deUnFin = await lectura(tx, m.lotId);
      const p = await paso(tx, m);
      await tx.processRecipeStepEnd.create({
        data: { stepId: p.id, variable: "ph", operador: "lte", valor: 4.2, unidad: "pH", desdeLecturaId: deUnFin },
      });
      const suelta = await lectura(tx, m.lotId);
      expect(await intentar(tx, (sp) => sp.measurement.delete({ where: { id: m.lecturaId } }))).toMatch(
        /process_step_closing_reading_measurement_id_fkey/,
      );
      expect(await intentar(tx, (sp) => sp.measurement.delete({ where: { id: deUnFin } }))).toMatch(
        /process_recipe_step_end_desde_lectura_id_fkey/,
      );
      expect(await intentar(tx, (sp) => sp.measurement.delete({ where: { id: suelta } }))).toBeNull();
    });
  });
});

describe("lo que cuelga de una versión y de un paso se va con ellos (CASCADE)", () => {
  it("borrar una versión se lleva sus pasos —con sus adiciones, fines, requisitos y metas— y sus metas sin paso", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const p = await paso(tx, m);
      await tx.processRecipeStepAddition.create({ data: { stepId: p.id, categoriaValueId: m.valor, momento: "post_green" } });
      await tx.processRecipeStepEnd.create({ data: { stepId: p.id, variable: "ph", operador: "lte", valor: 4.2, unidad: "pH" } });
      await tx.processRecipeStepRequirement.create({ data: { stepId: p.id, capacidadValueId: m.valor } });
      await meta(tx, m, { recipeStepId: p.id });
      await meta(tx, m);
      // Es lo que hará la limpieza de las pruebas de las tareas siguientes: `processRecipe.deleteMany` → versiones → …
      expect(await intentar(tx, (sp) => sp.processRecipeVersion.delete({ where: { id: m.v1 } }))).toBeNull();
      expect({
        pasos: await tx.processRecipeStep.count({ where: { id: p.id } }),
        adiciones: await tx.processRecipeStepAddition.count({ where: { stepId: p.id } }),
        fines: await tx.processRecipeStepEnd.count({ where: { stepId: p.id } }),
        requisitos: await tx.processRecipeStepRequirement.count({ where: { stepId: p.id } }),
        metas: await tx.processTarget.count({ where: { recipeVersionId: m.v1 } }),
      }).toEqual({ pasos: 0, adiciones: 0, fines: 0, requisitos: 0, metas: 0 });
    });
  });

  it("quitar un paso se lleva sus metas, adiciones, fines y requisitos; los otros pasos y las metas de la versión se quedan", async () => {
    await enTransaccionQueSeDeshace(async (tx, m) => {
      const quitado = await paso(tx, m);
      const otro = await paso(tx, m);
      await tx.processRecipeStepAddition.create({ data: { stepId: quitado.id, categoriaValueId: m.valor, momento: "pre_green" } });
      await tx.processRecipeStepEnd.create({ data: { stepId: quitado.id, variable: "ph", operador: "lte", valor: 4.2, unidad: "pH" } });
      await tx.processRecipeStepRequirement.create({ data: { stepId: quitado.id, capacidadValueId: m.valor } });
      await meta(tx, m, { recipeStepId: quitado.id });
      await meta(tx, m, { recipeStepId: otro.id });
      await meta(tx, m);
      expect(await intentar(tx, (sp) => sp.processRecipeStep.delete({ where: { id: quitado.id } }))).toBeNull();
      expect({
        metasDelQuitado: await tx.processTarget.count({ where: { recipeStepId: quitado.id } }),
        adiciones: await tx.processRecipeStepAddition.count({ where: { stepId: quitado.id } }),
        fines: await tx.processRecipeStepEnd.count({ where: { stepId: quitado.id } }),
        requisitos: await tx.processRecipeStepRequirement.count({ where: { stepId: quitado.id } }),
        metasDelOtro: await tx.processTarget.count({ where: { recipeStepId: otro.id } }),
        metasDeLaVersion: await tx.processTarget.count({ where: { recipeVersionId: m.v1, recipeStepId: null } }),
      }).toEqual({ metasDelQuitado: 0, adiciones: 0, fines: 0, requisitos: 0, metasDelOtro: 1, metasDeLaVersion: 1 });
    });
  });
});

describe("process_recipe.organization_id es RESTRICT: borrar una organización no convierte sus recetas en plantillas (Ruling FK-ORG)", () => {
  it("una organización con una receta no se borra —y la receta conserva su organización—; una sin recetas, sí", async () => {
    await enTransaccionQueSeDeshace(async (tx) => {
      // Cada organización sólo cuelga de lo que esta prueba le pone: el rechazo que se espera es el único posible.
      const organizacion = async (que: string) =>
        (
          await tx.organization.create({
            data: { organizationType: "farm", name: `TEST ${que} (${RUN})`, status: "approved", classification: "internal" },
          })
        ).id;
      const conReceta = await organizacion("con receta");
      const sinReceta = await organizacion("sin receta");
      const receta = await tx.processRecipe.create({ data: { name: `TEST receta de organización ${RUN}`, organizationId: conReceta } });
      expect(await intentar(tx, (sp) => sp.organization.delete({ where: { id: conReceta } }))).toMatch(
        /process_recipe_organization_id_fkey/,
      );
      // Con SET NULL el borrado entraría y la receta quedaría, en silencio, como plantilla de todas las organizaciones.
      expect((await tx.processRecipe.findUniqueOrThrow({ where: { id: receta.id } })).organizationId).toBe(conReceta);
      // Control: la misma operación sobre una organización sin recetas entra.
      expect(await intentar(tx, (sp) => sp.organization.delete({ where: { id: sinReceta } }))).toBeNull();
    });
  });
});
