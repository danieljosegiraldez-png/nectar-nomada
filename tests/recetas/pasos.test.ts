/**
 * La receta con pasos: borrador, pasos y publicar — Parte 2a, tarea 3 (2026-10-03).
 *
 * Diseño `docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md`: §3 (el paso y sus ejes), §3.1 (publicar
 * deriva UNA fase por tipo, del primer paso de esa fase), §3.2 (metas por paso) y §3.3 (borrador, publicar y concurrencia).
 * Cada rechazo lleva al lado el caso válido que pasa, para que no pase vacío.
 *
 * **Lo que viene de la tarea 2, con su precondición escrita en la prueba que lo usa:** el catálogo `tipo_paso` sembrado con un
 * valor por cada id de `TIPOS_DE_PASO`, y las tablas `EJES_POR_TIPO_DE_PASO` y `FASE_DEL_TIPO`. Donde una prueba necesita «un
 * tipo que admite X» y «uno que no», los saca DE la tabla (`tipoCon`, `tipoSin`) en vez de suponerlos: así sigue
 * discriminando aunque la tarea 2 reparta los ejes de otra forma.
 *
 * **Usuario (V16, 2026-10-04):** un **Coffee Process Manager de alcance de plataforma** (`gestor`, de `fabricaDeCuentas`), no el
 * Platform Admin: escribir una receta es del perfil nuevo, y la organización de prueba no tiene `Location`, así que sólo el
 * alcance de plataforma la autoriza (`exigeAutoriaDeReceta`). `admin` —el Platform Admin sembrado— queda para lo que es del
 * LOTE (`listRecipeVersionsForLot`). Nada aquí cuenta filas globales, así que ese alcance no contamina ninguna cifra. Los
 * permisos se prueban aparte, al final, con un Farm Manager, un capataz y un Project Viewer de una finca propia. El `gestor` no ve
 * ningún lote (el perfil no lleva `lot:view`): el bloque del §5.3 (R6) crea un segundo, `citador`, con ese permiso concedido, que es
 * quien puede citar una lectura de cierre de un lote.
 *
 * **R23 y R24 (2026-10-05).** El bloque del §5.3 gana las pruebas de la CORRECCIÓN de una lectura marcada (cadenas de `correctsId` como las
 * que escribe `correctMeasurement`: otra fila, del mismo lote, que apunta a la que sustituye) y el bloque de los permisos gana el de las
 * recetas LIBRES: sus procesos son filas de `lot_process` que apuntan a una receta que todavía no es Libre (el mismo `lotProcess.create` crudo de
 * las pruebas que necesitan un proceso ya hecho), y la marca `esLibre` se pone después con un `update` —lo que hace la apertura con Libre (tarea 10)
 * no hace falta aquí, y esta tarea se construye antes que ella—. **No usa `abrirProcesoDePrueba`, a propósito:** la tarea 5 mide ese ayudante (148
 * líneas, 149 apariciones, 7 con receta, 14 archivos) y cambia lo que hace por omisión, y una llamada de más aquí movería esas cifras sin que la prueba
 * lo necesite: lo que se lee es QUÉ LOTES usan la versión, no cómo se abrió el proceso.
 *
 * **Limpieza:** en `afterAll` (y en el `afterEach` de los permisos), por el prefijo `RUN` y en orden de claves ajenas —metas,
 * hijas del paso, pasos, fases, versiones, recetas—, sin apoyarse en ningún `ON DELETE`. La auditoría de un paso cuelga del id
 * del PASO, que ya no existe si una prueba lo quitó: por eso `pasosCreados` guarda cada id. Las cuentas, **después** de las
 * recetas que firmaron. Los procesos del bloque de las Libres, **antes** que las recetas y los lotes que referencian (las dos claves
 * son `RESTRICT`).
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import type { Prisma, ProcessPhase } from "../../generated/prisma/client";
import { listRecipeVersionsForLot, ProcessTargetError, validateTargets } from "../../lib/traceability/processTargets";
import { crearRecetaEnBorrador } from "../../lib/recetas/versiones";
import {
  actualizarPaso,
  agregarPaso,
  moverPaso,
  pasosDeLaVersion,
  publicarVersion,
  quitarPaso,
  type PasoEditable,
} from "../../lib/recetas/pasos";
import { RecipeError } from "../../lib/recetas/errorDeReceta";
import {
  EJES_POR_TIPO_DE_PASO,
  FASE_DEL_TIPO,
  TIPOS_DE_PASO,
  TRAMOS_DE_MUCILAGO,
  type EjeDelPaso,
  type TipoDePaso,
} from "../../lib/recetas/vocabulario";
import { requireLotAccess, TraceabilityAccessError } from "../../lib/traceability/lots";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";
import { borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";

const RUN = `pasos-${Date.now()}`;
const cuentas = fabricaDeCuentas("Pasos");

let admin: string;
/** El que escribe las recetas: un Coffee Process Manager de plataforma (V16). */
let gestor: string;
let organizationId: string;
let lotId: string;
const lotes: string[] = [];
const organizaciones: string[] = [];
/** Cada paso que se creó, también los que una prueba quitó después: su auditoría cuelga de su id. */
const pasosCreados: string[] = [];

async function valor(catalogo: string, value: string): Promise<string> {
  return (
    await prisma.variableCatalogValue.findFirstOrThrow({ where: { value, catalog: { key: catalogo } }, select: { id: true } })
  ).id;
}

/** El primer valor canónico de un catálogo: para los catálogos nuevos de la tarea 2, cuyos valores no se suponen aquí. */
async function primerValor(catalogo: string): Promise<string> {
  return (
    await prisma.variableCatalogValue.findFirstOrThrow({
      where: { catalog: { key: catalogo }, aliasOfId: null },
      orderBy: { displayOrder: "asc" },
      select: { id: true },
    })
  ).id;
}

async function pasoDe(tipo: TipoDePaso, extra: Omit<PasoEditable, "stepTypeValueId"> = {}): Promise<PasoEditable> {
  return { stepTypeValueId: await valor("tipo_paso", tipo), ...extra };
}

/** Un tipo que admite el eje, sacado de la tabla de la tarea 2. */
function tipoCon(eje: EjeDelPaso): TipoDePaso {
  const t = TIPOS_DE_PASO.find((x) => EJES_POR_TIPO_DE_PASO[x].includes(eje));
  expect(t, `precondición (tarea 2): algún tipo admite «${eje}»`).toBeDefined();
  return t!;
}

/** Un tipo que NO admite el eje, sacado de la misma tabla. */
function tipoSin(eje: EjeDelPaso): TipoDePaso {
  const t = TIPOS_DE_PASO.find((x) => !EJES_POR_TIPO_DE_PASO[x].includes(eje));
  expect(t, `precondición (tarea 2): algún tipo NO admite «${eje}»`).toBeDefined();
  return t!;
}

/** Una receta de la organización de prueba con su v1 en borrador (desde esta tarea, toda versión nace así). */
async function borrador(
  nombre: string,
  extra: {
    /** Filas de fase ya escritas en la versión, como las de una receta anterior a la 2a: sólo `publicarVersion` las reemplaza o las deja. */
    fases?: readonly {
      phase: ProcessPhase;
      expectedHours?: number;
      turnEveryHours?: number;
      targetMoistureMinPct?: number;
      targetMoistureMaxPct?: number;
    }[];
    organizationId?: string | null;
    autor?: string;
  } = {},
) {
  const r = await crearRecetaEnBorrador(extra.autor ?? gestor, {
    name: `PASOS ${nombre} ${RUN}`,
    organizationId: extra.organizationId === undefined ? organizationId : extra.organizationId,
  });
  // Un servicio que escribiera estas filas ya no existe (la tarea 14 borró el que las escribía): se escriben crudas, que es lo que eran —datos de antes—.
  for (const f of extra.fases ?? []) await prisma.processRecipePhase.create({ data: { recipeVersionId: r.versionId, ...f } });
  return r;
}

/** `agregarPaso`, guardando el id para la limpieza de la auditoría. */
async function agregar(recipeVersionId: string, despuesDeSeq: number | null, paso: PasoEditable, autor = gestor) {
  const creado = await agregarPaso(autor, { recipeVersionId, despuesDeSeq, paso });
  pasosCreados.push(creado.id);
  return creado;
}

/** Rechaza con un error de ESA clase y ESE código: la clase y el mensaje, no sólo el mensaje. */
async function rechaza(
  promesa: Promise<unknown>,
  codigo: string,
  clase: typeof RecipeError | typeof ProcessTargetError = RecipeError,
) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `esperaba ${clase.name}("${codigo}") y no lanzó nada`).not.toBeNull();
  expect(error, `esperaba ${clase.name}("${codigo}"), lanzó ${String(error)}`).toBeInstanceOf(clase);
  expect((error as Error).message).toBe(codigo);
}

/** Borra todo lo de las recetas que cumplan `donde`, en orden de claves ajenas. Devuelve los ids, para contar después. */
async function borrarRecetas(donde: Prisma.ProcessRecipeWhereInput) {
  const recetaIds = (await prisma.processRecipe.findMany({ where: assertDefinedWhere(donde), select: { id: true } })).map(
    (r) => r.id,
  );
  const versionIds = (
    await prisma.processRecipeVersion.findMany({
      where: assertDefinedWhere({ recipeId: { in: recetaIds } }),
      select: { id: true },
    })
  ).map((v) => v.id);
  const pasoIds = (
    await prisma.processRecipeStep.findMany({
      where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }),
      select: { id: true },
    })
  ).map((p) => p.id);
  const todosLosPasos = [...new Set([...pasoIds, ...pasosCreados])];
  await prisma.auditEvent.deleteMany({
    where: assertDefinedWhere({ entityId: { in: [...recetaIds, ...versionIds, ...todosLosPasos] } }),
  });
  await prisma.processTarget.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) });
  await prisma.processRecipeStepAddition.deleteMany({ where: assertDefinedWhere({ stepId: { in: pasoIds } }) });
  await prisma.processRecipeStepEnd.deleteMany({ where: assertDefinedWhere({ stepId: { in: pasoIds } }) });
  await prisma.processRecipeStepRequirement.deleteMany({ where: assertDefinedWhere({ stepId: { in: pasoIds } }) });
  await prisma.processRecipeStep.deleteMany({ where: assertDefinedWhere({ id: { in: pasoIds } }) });
  await prisma.processRecipePhase.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) });
  await prisma.processRecipeVersion.deleteMany({ where: assertDefinedWhere({ id: { in: versionIds } }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recetaIds } }) });
  return { recetaIds, versionIds, pasoIds: todosLosPasos };
}

beforeAll(async () => {
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;
  gestor = await cuentas.cuenta("Coffee Process Manager", "plataforma");
  const org = await prisma.organization.create({ data: { name: `PASOS Org ${RUN}`, organizationType: "farm" } });
  organizationId = org.id;
  organizaciones.push(org.id);
  const lot = await prisma.lot.create({
    data: { lotCode: `PASOS-${RUN}`, lotType: "cherry", organizationId, classification: "internal" },
  });
  lotId = lot.id;
  lotes.push(lot.id);
});

afterAll(async () => {
  const ids = await borrarRecetas({ name: { contains: RUN } });
  if (lotes.length) await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  if (organizaciones.length) {
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });
  }
  // Las cuentas, DESPUÉS de las recetas que firmaron.
  await cuentas.limpiar();
  // Lo que quede es basura de ESTA corrida. El control: la corrida sí creó pasos; si no, los ceros de abajo no miran nada.
  expect(pasosCreados.length).toBeGreaterThan(0);
  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.processRecipeStep.count({ where: { id: { in: ids.pasoIds } } })).toBe(0);
  expect(await prisma.processTarget.count({ where: { recipeVersionId: { in: ids.versionIds } } })).toBe(0);
  expect(await prisma.processRecipePhase.count({ where: { recipeVersionId: { in: ids.versionIds } } })).toBe(0);
  expect(
    await prisma.auditEvent.count({ where: { entityId: { in: [...ids.recetaIds, ...ids.versionIds, ...ids.pasoIds] } } }),
  ).toBe(0);
});

describe("control: el vocabulario de la tarea 2 está en la base", () => {
  it("cada id de TIPOS_DE_PASO es un valor del catálogo tipo_paso", async () => {
    const valores = await prisma.variableCatalogValue.findMany({ where: { catalog: { key: "tipo_paso" } }, select: { value: true } });
    const enLaBase = new Set(valores.map((v) => v.value));
    expect(TIPOS_DE_PASO.length).toBe(24);
    expect(TIPOS_DE_PASO.filter((t) => !enLaBase.has(t))).toEqual([]);
  });
});

describe("§3.3 — una versión nace borrador, y sólo un borrador se edita", () => {
  it("un borrador se edita por los cuatro caminos; publicado, por ninguno, y no se publica dos veces", async () => {
    const { versionId } = await borrador("publicada");
    // Control: en borrador, los cuatro caminos pasan.
    const lavado = await agregar(versionId, null, await pasoDe("washing"));
    const despulpado = await agregar(versionId, null, await pasoDe("pulping"));
    await actualizarPaso(gestor, { stepId: lavado.id, paso: await pasoDe("washing", { intencion: "sin mucílago" }) });
    await moverPaso(gestor, { stepId: lavado.id, aSeq: 1 });
    await quitarPaso(gestor, despulpado.id);

    await publicarVersion(gestor, versionId);
    const otro = await pasoDe("pulping");
    await rechaza(agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso: otro }), "version_no_es_borrador");
    await rechaza(actualizarPaso(gestor, { stepId: lavado.id, paso: otro }), "version_no_es_borrador");
    await rechaza(moverPaso(gestor, { stepId: lavado.id, aSeq: 1 }), "version_no_es_borrador");
    await rechaza(quitarPaso(gestor, lavado.id), "version_no_es_borrador");
    await rechaza(publicarVersion(gestor, versionId), "version_no_es_borrador");
    // Y nada cambió: el lavado sigue solo, con su intención.
    const pasos = await pasosDeLaVersion(gestor, versionId);
    expect(pasos.map((p) => [p.seq, p.tipo, p.intencion])).toEqual([[1, "washing", "sin mucílago"]]);
  });

  it("una versión o un paso que no existen se nombran", async () => {
    const paso = await pasoDe("washing");
    await rechaza(agregarPaso(gestor, { recipeVersionId: randomUUID(), despuesDeSeq: null, paso }), "version_no_encontrada");
    await rechaza(publicarVersion(gestor, randomUUID()), "version_no_encontrada");
    await rechaza(quitarPaso(gestor, randomUUID()), "paso_no_encontrado");
    await rechaza(moverPaso(gestor, { stepId: randomUUID(), aSeq: 1 }), "paso_no_encontrado");
  });
});

describe("la lista de pasos queda numerada 1..n, sin huecos", () => {
  const orden = async (versionId: string) => (await pasosDeLaVersion(gestor, versionId)).map((p) => [p.seq, p.tipo]);

  it("agregar al principio y detrás de un paso; mover abajo y arriba; quitar del medio", async () => {
    const { versionId } = await borrador("orden");
    await agregar(versionId, null, await pasoDe("pulping"));
    await agregar(versionId, 1, await pasoDe("drying"));
    const fermentacion = await agregar(versionId, 1, await pasoDe("fermentation"));
    const flotado = await agregar(versionId, null, await pasoDe("sorting_flotation"));
    expect(await orden(versionId)).toEqual([[1, "sorting_flotation"], [2, "pulping"], [3, "fermentation"], [4, "drying"]]);

    await moverPaso(gestor, { stepId: flotado.id, aSeq: 4 });
    expect(await orden(versionId)).toEqual([[1, "pulping"], [2, "fermentation"], [3, "drying"], [4, "sorting_flotation"]]);
    await moverPaso(gestor, { stepId: flotado.id, aSeq: 2 });
    expect(await orden(versionId)).toEqual([[1, "pulping"], [2, "sorting_flotation"], [3, "fermentation"], [4, "drying"]]);

    await quitarPaso(gestor, fermentacion.id);
    expect(await orden(versionId)).toEqual([[1, "pulping"], [2, "sorting_flotation"], [3, "drying"]]);
  });

  it("una posición que no existe se rechaza, y la lista no cambia", async () => {
    const { versionId } = await borrador("posicion");
    const despulpado = await agregar(versionId, null, await pasoDe("pulping"));
    await agregar(versionId, 1, await pasoDe("washing"));
    await rechaza(
      agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: 3, paso: await pasoDe("drying") }),
      "posicion_invalida",
    );
    await rechaza(moverPaso(gestor, { stepId: despulpado.id, aSeq: 0 }), "posicion_invalida");
    await rechaza(moverPaso(gestor, { stepId: despulpado.id, aSeq: 3 }), "posicion_invalida");
    // H5: una posición que no es un número entero tampoco existe. `1.5` cae DENTRO de 1..n y `NaN` compara falso con todo, así que sólo
    // `Number.isInteger` las deja fuera; sin él, `splice` las trunca y el paso se movería en silencio.
    await rechaza(moverPaso(gestor, { stepId: despulpado.id, aSeq: 1.5 }), "posicion_invalida");
    await rechaza(moverPaso(gestor, { stepId: despulpado.id, aSeq: Number.NaN }), "posicion_invalida");
    expect(await orden(versionId)).toEqual([[1, "pulping"], [2, "washing"]]);
    // Control: la última posición que sí existe.
    await moverPaso(gestor, { stepId: despulpado.id, aSeq: 2 });
    expect(await orden(versionId)).toEqual([[1, "washing"], [2, "pulping"]]);
  });

  // H2: el título decía «lo que se escribe es lo que se lee» y no lo promete para el ORDEN de las adiciones ni de los fines: dentro de un
  // paso no es semántico (las adiciones son simultáneas y los fines se combinan por `reglaDeFin`). Lo fija la prueba de después.
  it("lo escrito se lee con los mismos valores; actualizar reemplaza columnas e hijas y conserva el lugar", async () => {
    expect(FASE_DEL_TIPO.drying, "precondición (tarea 2)").toBe("drying");
    expect(EJES_POR_TIPO_DE_PASO.drying, "precondición (tarea 2)").toContain("modoSecado");
    const { versionId } = await borrador("ida-y-vuelta");
    const capacidad = await primerValor("capacidad");
    await agregar(versionId, null, await pasoDe("pulping"));
    const secado = await agregar(
      versionId,
      1,
      await pasoDe("drying", {
        intencion: "  secar despacio  ",
        opcional: true,
        modoSecado: "solar_greenhouse",
        horasMin: 72,
        horasSugeridas: 96,
        horasMax: 240,
        volteoCadaHoras: 4,
        humedadMinPct: 10.5,
        humedadMaxPct: 12,
        finPorTiempo: true,
        reglaDeFin: "all",
        fines: [{ variable: "moisture", operador: "lte", valor: 11.5, unidad: "%" }],
        // Dos veces la misma: un conjunto, una fila.
        capacidadesRequeridas: [capacidad, capacidad],
        metas: [{ variable: "moisture", moment: "during", unit: "%", minValue: 9, maxValue: 24, everyHours: 12 }],
      }),
    );
    const [, leido] = await pasosDeLaVersion(gestor, versionId);
    expect(leido).toMatchObject({
      id: secado.id,
      seq: 2,
      tipo: "drying",
      intencion: "secar despacio",
      opcional: true,
      modoSecado: "solar_greenhouse",
      horasMin: 72,
      horasSugeridas: 96,
      horasMax: 240,
      volteoCadaHoras: 4,
      humedadMinPct: 10.5,
      humedadMaxPct: 12,
      finPorTiempo: true,
      reglaDeFin: "all",
      fines: [{ variable: "moisture", operador: "lte", valor: 11.5, unidad: "%", desdeLecturaId: null }],
      capacidadesRequeridas: [capacidad],
      metas: [{ variable: "moisture", moment: "during", unit: "%", targetValue: null, minValue: 9, maxValue: 24, note: null, everyHours: 12 }],
    });

    await actualizarPaso(gestor, {
      stepId: secado.id,
      paso: await pasoDe("drying", { horasSugeridas: 120, humedadMinPct: 11, humedadMaxPct: 12 }),
    });
    const [, otraVez] = await pasosDeLaVersion(gestor, versionId);
    expect(otraVez).toMatchObject({
      id: secado.id,
      seq: 2,
      horasSugeridas: 120,
      humedadMinPct: 11,
      volteoCadaHoras: null,
      modoSecado: null,
      opcional: false,
      fines: [],
      capacidadesRequeridas: [],
      metas: [],
    });
  });

  it("quitar un paso se lleva sus adiciones, fines, requisitos y metas", async () => {
    expect(EJES_POR_TIPO_DE_PASO.addition, "precondición (tarea 2)").toContain("adiciones");
    const { versionId } = await borrador("quitar");
    const adicion = await agregar(
      versionId,
      null,
      await pasoDe("addition", {
        adiciones: [{ categoriaValueId: await valor("sustrato_anadido", "doble_mosto"), cantidad: 2, unidad: "L", momento: "pre_green" }],
        fines: [{ variable: "brix", operador: "lte", valor: 8, unidad: "Bx" }],
        capacidadesRequeridas: [await primerValor("capacidad")],
        metas: [{ variable: "ph", moment: "final", unit: "pH", maxValue: 4.2 }],
      }),
    );
    const cuantas = async () => [
      await prisma.processRecipeStepAddition.count({ where: { stepId: adicion.id } }),
      await prisma.processRecipeStepEnd.count({ where: { stepId: adicion.id } }),
      await prisma.processRecipeStepRequirement.count({ where: { stepId: adicion.id } }),
      await prisma.processTarget.count({ where: { recipeStepId: adicion.id } }),
      await prisma.processRecipeStep.count({ where: { id: adicion.id } }),
    ];
    expect(await cuantas(), "control: las cinco estaban").toEqual([1, 1, 1, 1, 1]);
    await quitarPaso(gestor, adicion.id);
    expect(await cuantas()).toEqual([0, 0, 0, 0, 0]);
  });

  it("el orden de las adiciones y de los fines de un paso es el de su contenido: el mismo escribas en el orden que escribas, y el mismo en cada reescritura (H2)", async () => {
    // Antes se leían por `id`, un UUID aleatorio: salían en otro orden del que se escribieron y cambiaban de orden en CADA reescritura, porque
    // cada una borra las filas y crea otras con ids nuevos. Dentro de un paso el orden no es semántico —las adiciones son simultáneas y
    // los fines se combinan por `reglaDeFin`—, así que lo único que se pide es que sea estable. Con `orderBy: id` cada lectura es una
    // permutación al azar de cuatro: la probabilidad de que cinco coincidan con la primera es (1/24)^5, por cada lista.
    expect(EJES_POR_TIPO_DE_PASO.fermentation, "precondición (tarea 2)").toContain("adiciones");
    const { versionId } = await borrador("orden-de-hijas");
    const sustratos = (
      await prisma.variableCatalogValue.findMany({
        where: { catalog: { key: "sustrato_anadido" }, aliasOfId: null },
        orderBy: { displayOrder: "asc" },
        select: { id: true },
      })
    ).map((v) => v.id);
    expect(sustratos.length, "precondición: el catálogo sembrado trae al menos dos sustratos").toBeGreaterThanOrEqual(2);
    const adiciones = [
      { categoriaValueId: sustratos[0]!, cantidad: 2, unidad: "L", momento: "pre_green" },
      { categoriaValueId: sustratos[0]!, cantidad: 5, unidad: "L", momento: "post_green" },
      { categoriaValueId: sustratos[1]!, cantidad: 1, unidad: "kg", momento: "pre_green" },
      { categoriaValueId: sustratos[1]!, momento: "post_green" },
    ] as const;
    const fines = [
      { variable: "ph", operador: "lte", valor: 4.2, unidad: "pH" },
      { variable: "ph", operador: "gte", valor: 3.4, unidad: "pH" },
      { variable: "brix", operador: "lte", valor: 8, unidad: "Bx" },
      { variable: "moisture", operador: "lte", valor: 11.5, unidad: "%" },
    ] as const;
    // Seis órdenes de entrada distintos de las mismas cuatro filas: la identidad, el inverso y cuatro más.
    const ordenes = [[0, 1, 2, 3], [3, 2, 1, 0], [1, 2, 3, 0], [2, 3, 0, 1], [1, 3, 0, 2], [2, 0, 3, 1]];
    const como = async (orden: number[]) =>
      pasoDe("fermentation", { adiciones: orden.map((i) => adiciones[i]!), fines: orden.map((i) => fines[i]!) });
    const leerHijas = async () => {
      const [paso] = await pasosDeLaVersion(gestor, versionId);
      return { adiciones: paso!.adiciones, fines: paso!.fines };
    };
    const huella = (xs: readonly unknown[]) => xs.map((x) => JSON.stringify(x)).sort();

    const creado = await agregar(versionId, null, await como(ordenes[0]!));
    const primera = await leerHijas();
    expect(primera.adiciones, "control: las cuatro adiciones se leen").toHaveLength(4);
    expect(primera.fines, "control: los cuatro fines se leen").toHaveLength(4);
    // Lo que se lee es lo que se escribió (mismo contenido, aunque no se promete el orden)...
    expect(huella(primera.adiciones)).toEqual(
      huella(adiciones.map((a) => ({ categoriaValueId: a.categoriaValueId, cantidad: "cantidad" in a ? a.cantidad : null, unidad: "unidad" in a ? a.unidad : null, momento: a.momento }))),
    );
    expect(huella(primera.fines)).toEqual(huella(fines.map((f) => ({ ...f, desdeLecturaId: null }))));
    // ...y se lee en el MISMO orden cada vez que se reescribe, sea cual sea el orden de entrada.
    for (const orden of ordenes.slice(1)) {
      await actualizarPaso(gestor, { stepId: creado.id, paso: await como(orden) });
      const otra = await leerHijas();
      expect(otra.adiciones, `adiciones, entrada ${orden.join("")}`).toEqual(primera.adiciones);
      expect(otra.fines, `fines, entrada ${orden.join("")}`).toEqual(primera.fines);
    }
  });
});

/**
 * H1 (revisión de la tarea 3, 2026-10-06): las dos tablas de `pasos.ts` —`EJE_DEL_CAMPO`, de qué eje es cada columna, y
 * `CATALOGO_DEL_CAMPO`, de qué catálogo sale cada valor— se prueban CAMPO A CAMPO, y estas dos listas están ESCRITAS A MANO aquí, no
 * importadas de `pasos.ts`: una prueba que recorriera la tabla del servicio recorrería lo que quede de ella, y quitar una fila la dejaba
 * en verde con una fila menos. Medido en la revisión: quitar `fisicoValueId` (o `estadoFrutoValueId`, `temperaturaValueId`,
 * `fuenteMicrobianaValueId`, `medioValueId`, `mucilagoObjetivo`) de `EJE_DEL_CAMPO`, o cambiar el catálogo de cuatro de las seis de
 * `CATALOGO_DEL_CAMPO`, dejaba 120 de 120 en verde; sólo caía quitar el oxígeno. La especificación es ésta (diseño §3: los
 * vocabularios y los ejes); lo que se comprueba contra ella es el servicio, llamado con la entrada hostil.
 *
 * Los tipos salen de `EJES_POR_TIPO_DE_PASO` (`tipoCon`, `tipoSin`) y los valores del catálogo sembrado (`primerValor`): ninguno se
 * inventa. Cada caso lleva su control al lado —el mismo dato en un tipo que SÍ admite el eje se guarda y se lee igual—, para que el
 * rechazo no pase vacío.
 */
type CampoDeEje = Exclude<keyof PasoEditable, "stepTypeValueId">;
type DatoDeEje = Omit<PasoEditable, "stepTypeValueId">;

/** Las diez columnas de eje, con el eje del tipo al que pertenecen y un dato que se guardaría si el tipo lo admitiera. */
const CAMPOS_DE_EJE: ReadonlyArray<[campo: CampoDeEje, eje: EjeDelPaso, dato: () => Promise<DatoDeEje>]> = [
  ["estadoFrutoValueId", "estadoFruto", async () => ({ estadoFrutoValueId: await primerValor("estado_cereza") })],
  ["mucilagoObjetivo", "mucilagoObjetivo", async () => ({ mucilagoObjetivo: 50 })],
  ["oxigenoValueId", "oxigeno", async () => ({ oxigenoValueId: await primerValor("condicion_oxigeno") })],
  ["temperaturaValueId", "temperatura", async () => ({ temperaturaValueId: await primerValor("manejo_temperatura") })],
  ["temperaturaMinC", "temperatura", async () => ({ temperaturaMinC: 18 })],
  ["temperaturaMaxC", "temperatura", async () => ({ temperaturaMaxC: 22 })],
  ["fuenteMicrobianaValueId", "fuenteMicrobiana", async () => ({ fuenteMicrobianaValueId: await primerValor("fuente_microbiana") })],
  ["medioValueId", "medio", async () => ({ medioValueId: await primerValor("medio_lavado") })],
  ["fisicoValueId", "fisico", async () => ({ fisicoValueId: await primerValor("fisico") })],
  ["modoSecado", "modoSecado", async () => ({ modoSecado: "open_patio" })],
];

/** Las seis columnas que son un valor de catálogo: el suyo, y el de OTRO catálogo con el que se prueba el rechazo (el siguiente de la lista). */
const CATALOGOS_DE_CAMPO: ReadonlyArray<[campo: CampoDeEje, catalogo: string, ajeno: string, eje: EjeDelPaso]> = [
  ["estadoFrutoValueId", "estado_cereza", "condicion_oxigeno", "estadoFruto"],
  ["oxigenoValueId", "condicion_oxigeno", "manejo_temperatura", "oxigeno"],
  ["temperaturaValueId", "manejo_temperatura", "fuente_microbiana", "temperatura"],
  ["fuenteMicrobianaValueId", "fuente_microbiana", "medio_lavado", "fuenteMicrobiana"],
  ["medioValueId", "medio_lavado", "fisico", "medio"],
  ["fisicoValueId", "fisico", "estado_cereza", "fisico"],
];

describe("§3.5 — cada tipo admite sólo sus ejes, y cada valor sale de su catálogo", () => {
  it.each(CAMPOS_DE_EJE)(
    "EJE_DEL_CAMPO — %s es del eje «%s»: se rechaza en un tipo que no lo admite (eje_no_aplica) y se guarda en uno que sí",
    async (campo, eje, dato) => {
      const { versionId } = await borrador(`eje-${campo}`);
      const sin = tipoSin(eje);
      const con = tipoCon(eje);
      const delCampo = await dato();
      expect(delCampo[campo], "precondición: el dato de la prueba no es nulo").not.toBeNull();
      await rechaza(
        agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso: await pasoDe(sin, delCampo) }),
        "eje_no_aplica",
      );
      expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } }), "el rechazo no dejó el paso").toBe(0);
      // Control: el mismo dato, en un tipo que admite el eje, se guarda y se lee igual.
      await agregar(versionId, null, await pasoDe(con, delCampo));
      const [guardado] = await pasosDeLaVersion(gestor, versionId);
      expect(guardado!.tipo).toBe(con);
      expect(guardado![campo]).toBe(delCampo[campo]);
    },
  );

  it.each(CATALOGOS_DE_CAMPO)(
    "CATALOGO_DEL_CAMPO — %s sale de «%s»: un valor de otro catálogo se rechaza (valor_de_otro_catalogo) y uno suyo se guarda",
    async (campo, catalogo, ajeno, eje) => {
      const { versionId } = await borrador(`catalogo-${campo}`);
      const tipo = tipoCon(eje);
      const propio = await primerValor(catalogo);
      const deOtro = await primerValor(ajeno);
      expect(deOtro, "precondición: el valor ajeno es de otro catálogo").not.toBe(propio);
      const con = (id: string) => pasoDe(tipo, { [campo]: id } as DatoDeEje);
      await rechaza(
        agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso: await con(deOtro) }),
        "valor_de_otro_catalogo",
      );
      expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } }), "el rechazo no dejó el paso").toBe(0);
      // Control: el mismo campo con un valor de SU catálogo se guarda y se lee igual.
      await agregar(versionId, null, await con(propio));
      const [guardado] = await pasosDeLaVersion(gestor, versionId);
      expect(guardado![campo]).toBe(propio);
    },
  );

  it("un eje que no aplica al tipo se rechaza; el mismo valor en un tipo que lo admite, pasa", async () => {
    const { versionId } = await borrador("ejes");
    const intenta = (paso: PasoEditable) => agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso });
    const anaerobico = await valor("condicion_oxigeno", "anaerobico");
    await rechaza(intenta(await pasoDe(tipoSin("oxigeno"), { oxigenoValueId: anaerobico })), "eje_no_aplica");
    await agregar(versionId, null, await pasoDe(tipoCon("oxigeno"), { oxigenoValueId: anaerobico }));

    await rechaza(intenta(await pasoDe(tipoSin("modoSecado"), { modoSecado: "open_patio" })), "eje_no_aplica");
    await agregar(versionId, null, await pasoDe(tipoCon("modoSecado"), { modoSecado: "open_patio" }));

    const doble = await valor("sustrato_anadido", "doble_mosto");
    await rechaza(
      intenta(await pasoDe(tipoSin("adiciones"), { adiciones: [{ categoriaValueId: doble, momento: "pre_green" }] })),
      "eje_no_aplica",
    );
    await agregar(versionId, null, await pasoDe(tipoCon("adiciones"), { adiciones: [{ categoriaValueId: doble, momento: "pre_green" }] }));
    expect((await pasosDeLaVersion(gestor, versionId)).length).toBe(3);
  });

  it("un valor de otro catálogo no entra en un eje, ni el tipo sale de otra lista", async () => {
    const { versionId } = await borrador("catalogos");
    const intenta = (paso: PasoEditable) => agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso });
    const conMedio = tipoCon("medio");
    const anaerobico = await valor("condicion_oxigeno", "anaerobico");
    await rechaza(intenta(await pasoDe(conMedio, { medioValueId: anaerobico })), "valor_de_otro_catalogo");
    await rechaza(intenta({ stepTypeValueId: await valor("grado_proceso", "Washed") }), "tipo_de_paso_desconocido");
    await rechaza(intenta(await pasoDe("washing", { capacidadesRequeridas: [anaerobico] })), "valor_de_otro_catalogo");
    // Control: los mismos caminos, con el valor de su catálogo.
    await agregar(versionId, null, await pasoDe(conMedio, { medioValueId: await valor("medio_lavado", "agua_limpia") }));
    await agregar(versionId, null, await pasoDe("washing", { capacidadesRequeridas: [await primerValor("capacidad")] }));
  });

  it("una adición: la categoría de sustrato_anadido; la cepa de levadura_cultivo, sólo en una inoculación", async () => {
    expect(EJES_POR_TIPO_DE_PASO.inoculation, "precondición (tarea 2)").toContain("adiciones");
    expect(EJES_POR_TIPO_DE_PASO.addition, "precondición (tarea 2)").toContain("adiciones");
    const { versionId } = await borrador("adiciones");
    const intenta = (paso: PasoEditable) => agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso });
    const mp72 = await valor("levadura_cultivo", "MP72");
    const doble = await valor("sustrato_anadido", "doble_mosto");
    await rechaza(intenta(await pasoDe("addition", { adiciones: [{ categoriaValueId: mp72, momento: "pre_green" }] })), "valor_de_otro_catalogo");
    await agregar(versionId, null, await pasoDe("inoculation", {
      adiciones: [{ categoriaValueId: mp72, cantidad: 1, unidad: "g/kg", momento: "pre_green" }],
    }));
    await agregar(versionId, null, await pasoDe("addition", {
      adiciones: [{ categoriaValueId: doble, cantidad: 2, unidad: "L", momento: "post_green" }],
    }));
    // Cantidad y unidad van juntas, y la cantidad es mayor que cero.
    await rechaza(
      intenta(await pasoDe("addition", { adiciones: [{ categoriaValueId: doble, cantidad: 2, momento: "pre_green" }] })),
      "adicion_invalida",
    );
    await rechaza(
      intenta(await pasoDe("addition", { adiciones: [{ categoriaValueId: doble, cantidad: 0, unidad: "L", momento: "pre_green" }] })),
      "adicion_invalida",
    );
    expect((await pasosDeLaVersion(gestor, versionId)).map((p) => p.tipo)).toEqual(["addition", "inoculation"]);
  });

  it("las horas, el volteo y la humedad: enteros en orden, y volteo y humedad sólo en el secado", async () => {
    const { versionId } = await borrador("horas");
    const intenta = (paso: PasoEditable) => agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso });
    const sec = (extra: Omit<PasoEditable, "stepTypeValueId">) => pasoDe("drying", extra);
    await rechaza(intenta(await sec({ horasMin: 200, horasSugeridas: 100 })), "horas_invalidas");
    await rechaza(intenta(await sec({ horasSugeridas: 0 })), "horas_invalidas");
    await rechaza(intenta(await sec({ volteoCadaHoras: 1.5 })), "horas_invalidas");
    await rechaza(intenta(await sec({ finPorTiempo: true })), "fin_por_tiempo_sin_horas");
    await rechaza(intenta(await pasoDe("fermentation", { volteoCadaHoras: 4 })), "solo_en_secado");
    await rechaza(intenta(await pasoDe("fermentation", { humedadMinPct: 10, humedadMaxPct: 12 })), "solo_en_secado");
    await rechaza(intenta(await sec({ humedadMinPct: 10 })), "rango_invalido");
    await rechaza(intenta(await sec({ humedadMinPct: 12, humedadMaxPct: 10 })), "rango_invalido");
    await rechaza(intenta(await sec({ humedadMinPct: 0, humedadMaxPct: 12 })), "porcentaje_fuera_de_rango");
    await rechaza(intenta(await pasoDe(tipoCon("temperatura"), { temperaturaMinC: 30, temperaturaMaxC: 20 })), "rango_invalido");
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } })).toBe(0);
    // Control: los mismos campos, bien.
    await agregar(versionId, null, await sec({
      horasMin: 72, horasSugeridas: 96, horasMax: 240, volteoCadaHoras: 4, humedadMinPct: 10, humedadMaxPct: 12, finPorTiempo: true,
    }));
    await agregar(versionId, null, await pasoDe(tipoCon("temperatura"), { temperaturaMinC: 18, temperaturaMaxC: 22 }));
  });

  it("el mucílago que QUEDA: sólo los seis tramos, y 0 es un Lavado y 100 un Honey (Ruling M)", async () => {
    expect([...TRAMOS_DE_MUCILAGO], "precondición (tarea 2): los seis tramos de Daniel").toEqual([0, 10, 25, 50, 75, 100]);
    const { versionId } = await borrador("mucilago");
    const tipo = tipoCon("mucilagoObjetivo");
    const intenta = async (mucilagoObjetivo: number) =>
      agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso: await pasoDe(tipo, { mucilagoObjetivo }) });
    // Fuera de los seis: lo imposible (120, -10), lo que sería un porcentaje posible pero no es un tramo (40, 5, 25,5) y el `NaN`.
    for (const malo of [120, -10, 40, 5, 25.5, Number.NaN]) await rechaza(intenta(malo), "mucilago_fuera_de_tramos");
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } })).toBe(0);
    // Control: cada tramo entra y se lee igual, incluidos los dos extremos, Lavado (0) y Honey (100).
    for (const tramo of TRAMOS_DE_MUCILAGO) await agregar(versionId, null, await pasoDe(tipo, { mucilagoObjetivo: tramo }));
    const leidos = (await pasosDeLaVersion(gestor, versionId)).map((p) => p.mucilagoObjetivo);
    expect([...leidos].sort((a, b) => (a ?? -1) - (b ?? -1))).toEqual([0, 10, 25, 50, 75, 100]);
  });

  it("números no finitos (NaN, Infinity) en temperaturas, horas, humedades, cantidades y metas: se rechazan, y no queda el paso a medias", async () => {
    const { versionId } = await borrador("no-finitos");
    const intenta = (paso: PasoEditable) => agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso });
    const sec = (extra: Omit<PasoEditable, "stepTypeValueId">) => pasoDe("drying", extra);
    const doble = await valor("sustrato_anadido", "doble_mosto");
    const conTemperatura = tipoCon("temperatura");
    for (const malo of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      // La temperatura es donde `NaN` SE COLABA: `t < min || t > max` es falso con `NaN`, y pasaba la comprobación de límites.
      await rechaza(intenta(await pasoDe(conTemperatura, { temperaturaMinC: malo })), "rango_invalido");
      await rechaza(intenta(await pasoDe(conTemperatura, { temperaturaMaxC: malo })), "rango_invalido");
      // Las horas y las humedades ya fallaban cerradas (`!(h > 0)`, `!(v > 0 && v <= 100)`): estas líneas lo fijan, no lo arreglan.
      await rechaza(intenta(await sec({ horasSugeridas: malo })), "horas_invalidas");
      await rechaza(intenta(await sec({ volteoCadaHoras: malo })), "horas_invalidas");
      await rechaza(intenta(await sec({ humedadMinPct: malo, humedadMaxPct: 12 })), "porcentaje_fuera_de_rango");
      await rechaza(intenta(await sec({ humedadMinPct: 10, humedadMaxPct: malo })), "porcentaje_fuera_de_rango");
      // La cantidad de una adición: `Infinity > 0` es verdad, y una base `numeric(12,4)` no guarda un infinito.
      await rechaza(
        intenta(await pasoDe("addition", { adiciones: [{ categoriaValueId: doble, cantidad: malo, unidad: "L", momento: "pre_green" }] })),
        "adicion_invalida",
      );
    }
    // El valor de una meta: `validateTargets` comparaba con `v < min || v > max`, y con `NaN` las dos son falsas.
    for (const malo of [Number.NaN, Number.POSITIVE_INFINITY]) {
      await rechaza(
        intenta(await pasoDe("fermentation", { metas: [{ variable: "ph", moment: "final", unit: "pH", targetValue: malo }] })),
        "target_out_of_physical_range",
        ProcessTargetError,
      );
    }
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } })).toBe(0);
    // Control: los mismos campos con números de verdad.
    await agregar(versionId, null, await pasoDe(conTemperatura, { temperaturaMinC: 18, temperaturaMaxC: 22 }));
    await agregar(versionId, null, await sec({ horasSugeridas: 96, volteoCadaHoras: 4, humedadMinPct: 10, humedadMaxPct: 12 }));
    await agregar(versionId, null, await pasoDe("addition", { adiciones: [{ categoriaValueId: doble, cantidad: 2, unidad: "L", momento: "pre_green" }] }));
    await agregar(versionId, null, await pasoDe("fermentation", { metas: [{ variable: "ph", moment: "final", unit: "pH", targetValue: 3.8 }] }));
  });

  it("una condición de fin: variable conocida, su unidad y un valor posible", async () => {
    const { versionId } = await borrador("fines");
    const conFin = (fin: { variable: string; operador: "gte" | "lte"; valor: number; unidad: string }) =>
      pasoDe("drying", { fines: [fin] });
    const intenta = (paso: PasoEditable) => agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso });
    await rechaza(intenta(await conFin({ variable: "vibes", operador: "lte", valor: 1, unidad: "x" })), "fin_invalido");
    await rechaza(intenta(await conFin({ variable: "moisture", operador: "lte", valor: 11, unidad: "pH" })), "fin_invalido");
    await rechaza(intenta(await conFin({ variable: "moisture", operador: "lte", valor: 150, unidad: "%" })), "fin_invalido");
    // Control.
    await agregar(versionId, null, await conFin({ variable: "moisture", operador: "lte", valor: 11, unidad: "%" }));
  });
});

describe("§5.3, R6 y R23 — un fin sólo cita una lectura de cierre (o la corrección de una) de su organización, y que quien escribe ve", () => {
  // Quien cita: un Coffee Process Manager de plataforma que ADEMÁS ve los lotes (`lot:view`, concedido a su asignación). El `gestor` de
  // arriba escribe recetas pero no ve ningún lote —el perfil no lleva `lot:view`—: es el caso «no la ve».
  let citador: string;
  let corridaId: string;
  /** Marcadas como de cierre: dos del lote de esta organización y una de un lote de OTRA. Y una del lote propio SIN marcar. */
  let propia: string;
  let otraPropia: string;
  let ajena: string;
  let sinMarcar: string;
  /**
   * Cadenas de correcciones (R23): cada una es una lectura del MISMO lote que su original y apunta a ella por `correctsId` —lo que escribe
   * `correctMeasurement`; la corrección NO lleva la corrida—. `c1` y `c2` corrigen en cadena a `propia` (marcada en la RAÍZ); `r0` (sin
   * marcar) se corrigió en `m1`, que SÍ se marcó, y `m1` en `m2` (marcada en un eslabón de EN MEDIO); `d1` y `d2` corrigen a `sinMarcar`
   * (ninguna marca en toda la cadena); `cAjena` corrige a `ajena`, que es de otra organización.
   */
  let c1: string, c2: string, r0: string, m1: string, m2: string, d1: string, d2: string, cAjena: string;
  const lecturas: string[] = [];
  const corridas: string[] = [];

  async function lectura(deLote: string): Promise<string> {
    const m = await prisma.measurement.create({
      data: { variable: "moisture", value: 11, unit: "%", occurredAt: new Date("2026-03-02T12:00:00Z"), lotId: deLote, provenanceClass: "measured_fact" },
    });
    lecturas.push(m.id);
    return m.id;
  }
  async function marcar(id: string): Promise<void> {
    await prisma.processStepClosingReading.create({ data: { measurementId: id, fermentationRunId: corridaId } });
  }
  async function marcada(deLote: string): Promise<string> {
    const id = await lectura(deLote);
    await marcar(id);
    return id;
  }
  /** Una corrección de `de`, como la escribe `correctMeasurement`: otra lectura DEL MISMO LOTE que apunta a la que sustituye, sin la corrida. */
  async function corregida(de: string): Promise<string> {
    const original = await prisma.measurement.findUniqueOrThrow({ where: { id: de }, select: { lotId: true } });
    const m = await prisma.measurement.create({
      data: {
        variable: "moisture",
        value: 11.2,
        unit: "%",
        occurredAt: new Date("2026-03-02T12:05:00Z"),
        lotId: original.lotId,
        provenanceClass: "measured_fact",
        correctsId: de,
      },
    });
    lecturas.push(m.id);
    return m.id;
  }
  /** Un paso de secado cuyo fin cita `desdeLecturaId` (o ninguna, sin argumento). */
  const conLectura = (desdeLecturaId?: string, extra: Omit<PasoEditable, "stepTypeValueId" | "fines"> = {}) =>
    pasoDe("drying", { ...extra, fines: [{ variable: "moisture", operador: "lte", valor: 11, unidad: "%", desdeLecturaId }] });
  const agrega = (versionId: string, paso: PasoEditable, autor: string) =>
    agregarPaso(autor, { recipeVersionId: versionId, despuesDeSeq: null, paso });
  /** Las lecturas que citan los fines de la versión, en el orden en que se leen. */
  const citaDe = async (versionId: string) =>
    (await pasosDeLaVersion(gestor, versionId)).flatMap((p) => p.fines.map((f) => f.desdeLecturaId));

  beforeAll(async () => {
    citador = await cuentas.cuenta("Coffee Process Manager", "plataforma");
    await cuentas.conceder(citador, "lot", "view");
    const ajeno = await prisma.organization.create({ data: { name: `PASOS Org ajena ${RUN}`, organizationType: "farm" } });
    organizaciones.push(ajeno.id);
    const loteAjeno = await prisma.lot.create({
      data: { lotCode: `PASOS-AJENO-${RUN}`, lotType: "cherry", organizationId: ajeno.id, classification: "internal" },
    });
    lotes.push(loteAjeno.id);
    const corrida = await prisma.fermentationRun.create({ data: { startedAt: new Date("2026-03-02T12:00:00Z"), vesselNote: `TEST pasos ${RUN}` } });
    corridaId = corrida.id;
    corridas.push(corrida.id);
    propia = await marcada(lotId);
    otraPropia = await marcada(lotId);
    ajena = await marcada(loteAjeno.id);
    sinMarcar = await lectura(lotId);
    // R23. Marca en la raíz: propia → c1 → c2. Marca en un eslabón de en medio: r0 → m1 (marcada) → m2. Sin marca: sinMarcar → d1 → d2.
    c1 = await corregida(propia);
    c2 = await corregida(c1);
    r0 = await lectura(lotId);
    m1 = await corregida(r0);
    await marcar(m1);
    m2 = await corregida(m1);
    d1 = await corregida(sinMarcar);
    d2 = await corregida(d1);
    cAjena = await corregida(ajena);
  });

  afterAll(async () => {
    // Las recetas de este bloque ANTES que las lecturas: `desde_lectura_id` de un fin es RESTRICT. Después, las marcas (se irían con su
    // corrida, pero su clave a la lectura es RESTRICT), la corrida y las lecturas. Los lotes y la organización ajena los borra el `afterAll`
    // de arriba, que las apuntó en sus listas.
    await borrarRecetas({ AND: [{ name: { contains: RUN } }, { name: { contains: " lecturas-" } }] });
    await prisma.processStepClosingReading.deleteMany({ where: assertDefinedWhere({ measurementId: { in: lecturas } }) });
    await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: corridas } }) });
    await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: lecturas } }) });
    expect(await prisma.measurement.count({ where: { id: { in: lecturas } } }), "control: las lecturas del bloque ya no están").toBe(0);
  });

  it("una lectura marcada de un lote de OTRA organización no es el origen de un fin, aunque quien escribe la vea; la propia, sí", async () => {
    const { versionId } = await borrador("lecturas-ajena");
    await rechaza(agrega(versionId, await conLectura(ajena), citador), "lectura_no_marcada");
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } }), "no queda el paso a medias").toBe(0);
    // Control: la misma construcción con una lectura marcada del lote de la propia organización, y el mismo que escribe.
    await agregar(versionId, null, await conLectura(propia), citador);
    expect(await citaDe(versionId)).toEqual([propia]);
  });

  it("al ACTUALIZAR un paso tampoco entra la lectura ajena; cambiarla por una propia, sí", async () => {
    const { versionId } = await borrador("lecturas-actualizar");
    const paso = await agregar(versionId, null, await pasoDe("drying"));
    await rechaza(actualizarPaso(citador, { stepId: paso.id, paso: await conLectura(ajena) }), "lectura_no_marcada");
    expect(await citaDe(versionId), "el paso sigue sin citar nada").toEqual([]);
    await actualizarPaso(citador, { stepId: paso.id, paso: await conLectura(propia) });
    expect(await citaDe(versionId)).toEqual([propia]);
  });

  it("una lectura que no existe, o que existe pero NO está marcada como de cierre, se rechaza aunque sea de la organización y se vea; marcada, pasa", async () => {
    const { versionId } = await borrador("lecturas-sin-marcar");
    await rechaza(agrega(versionId, await conLectura(randomUUID()), citador), "lectura_no_marcada");
    await rechaza(agrega(versionId, await conLectura(sinMarcar), citador), "lectura_no_marcada");
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } })).toBe(0);
    await agregar(versionId, null, await conLectura(propia), citador);
    expect(await citaDe(versionId)).toEqual([propia]);
  });

  it("quien escribe y no ve el lote de la lectura no la cita: el gestor, sin lot:view, no; el citador, con lot:view, sí", async () => {
    const { versionId } = await borrador("lecturas-no-ve");
    // La lectura es marcada y de la organización de la receta: lo único que la separa del citador es que el gestor no ve el lote.
    await rechaza(agrega(versionId, await conLectura(propia), gestor), "lectura_no_marcada");
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } })).toBe(0);
    await agregar(versionId, null, await conLectura(propia), citador);
    expect(await citaDe(versionId)).toEqual([propia]);
  });

  it("una plantilla no cita lecturas: ni una marcada de un lote que se ve, ni una que su paso ya trae", async () => {
    const { versionId } = await borrador("lecturas-plantilla", { organizationId: null });
    await rechaza(agrega(versionId, await conLectura(propia), citador), "lectura_no_marcada");
    // Control: la misma plantilla acepta el mismo fin SIN lectura.
    const paso = await agregar(versionId, null, await conLectura(), citador);
    // Un vínculo que una plantilla ya trajera —ningún camino lo escribe: se fuerza en la base— tampoco se conserva al actualizar, por
    // mucho que el paso ya lo cite: lo que ya cita sólo se conserva en la receta de una organización.
    await prisma.processRecipeStepEnd.updateMany({ where: assertDefinedWhere({ stepId: paso.id }), data: { desdeLecturaId: propia } });
    await rechaza(actualizarPaso(citador, { stepId: paso.id, paso: await conLectura(propia) }), "lectura_no_marcada");
    await actualizarPaso(citador, { stepId: paso.id, paso: await conLectura() });
    expect(await citaDe(versionId)).toEqual([null]);
  });

  it("al ACTUALIZAR, la lectura que el paso YA cita no se autoriza otra vez (el gestor sin lot:view edita el resto); una nueva sí", async () => {
    const { versionId } = await borrador("lecturas-conservar");
    const paso = await agregar(versionId, null, await conLectura(propia), citador);
    // El gestor no ve el lote, y aun así puede cambiar el resto del paso conservando el vínculo...
    await actualizarPaso(gestor, { stepId: paso.id, paso: await conLectura(propia, { intencion: "secar despacio" }) });
    const [leido] = await pasosDeLaVersion(gestor, versionId);
    expect([leido?.intencion, leido?.fines.map((f) => f.desdeLecturaId)]).toEqual(["secar despacio", [propia]]);
    // ...pero no cambiarlo por OTRA lectura: ésa es nueva, y él no la ve.
    await rechaza(actualizarPaso(gestor, { stepId: paso.id, paso: await conLectura(otraPropia) }), "lectura_no_marcada");
    expect(await citaDe(versionId)).toEqual([propia]);
    // Control: quien sí ve el lote la cambia.
    await actualizarPaso(citador, { stepId: paso.id, paso: await conLectura(otraPropia) });
    expect(await citaDe(versionId)).toEqual([otraPropia]);
  });

  it("R23 — la CORRECCIÓN de una lectura marcada es origen válido de un fin, en cualquier eslabón de la cadena; la de una NO marcada, no", async () => {
    const { versionId } = await borrador("lecturas-correccion");
    // Control: la lectura marcada misma, lo que valía antes de R23.
    await agregar(versionId, null, await conLectura(propia), citador);
    // La marca en la RAÍZ y se cita su corrección (c1) o la corrección de ésa (c2); y la marca en un eslabón de EN MEDIO (m1: la raíz r0 ya
    // estaba corregida cuando se marcó) y se cita la corrección que viene detrás (m2).
    for (const id of [c1, c2, m2]) await agregar(versionId, null, await conLectura(id), citador);
    expect((await citaDe(versionId)).sort()).toEqual([propia, c1, c2, m2].sort());
    // Ninguna marca en toda la cadena: ni la primera corrección (d1) ni la segunda (d2) se vuelven «de cierre» por ser correcciones. Y sólo
    // se SUBE: r0, la raíz que la marca de m1 sustituyó, no es la marcada ni una corrección de ella.
    for (const mala of [d1, d2, r0]) await rechaza(agrega(versionId, await conLectura(mala), citador), "lectura_no_marcada");
    expect(await citaDe(versionId), "los tres rechazos no dejaron un paso a medias").toHaveLength(4);
  });

  it("R23 y R6 — la corrección de una marcada sigue las reglas de quien cita: la de otra organización no, y quien no ve el lote no la cita", async () => {
    const { versionId } = await borrador("lecturas-correccion-r6");
    // La corrección lleva el lote de su original: la de `ajena` es de OTRA organización, y el citador, que ve ese lote, no la cita.
    await rechaza(agrega(versionId, await conLectura(cAjena), citador), "lectura_no_marcada");
    // El gestor no ve ningún lote (el perfil no lleva `lot:view`): ni la marcada ni su corrección.
    await rechaza(agrega(versionId, await conLectura(c1), gestor), "lectura_no_marcada");
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } }), "no queda el paso a medias").toBe(0);
    // Control: la MISMA corrección c1, con quien sí ve el lote de la organización.
    await agregar(versionId, null, await conLectura(c1), citador);
    expect(await citaDe(versionId)).toEqual([c1]);
  });

  it("R23 — la cadena se sube con tope: la corrección a 1000 eslabones de su marca se acepta; la que está a 1001, no", async () => {
    // El `TOPE_DE_LA_CADENA_DE_CORRECCIONES` de `pasos.ts`: si cambia, esta prueba se cambia a sabiendas (el control de abajo cae).
    const TOPE = 1000;
    const { versionId } = await borrador("lecturas-tope");
    const raiz = await lectura(lotId);
    await marcar(raiz);
    // 1001 correcciones encadenadas —cada una apunta a la anterior; la primera, a la raíz marcada— en UN `createMany`.
    const ids = Array.from({ length: TOPE + 1 }, () => randomUUID());
    await prisma.measurement.createMany({
      data: ids.map((id, i) => ({
        id,
        variable: "moisture",
        value: 11.1,
        unit: "%",
        occurredAt: new Date("2026-03-02T12:10:00Z"),
        lotId,
        provenanceClass: "measured_fact" as const,
        correctsId: i === 0 ? raiz : ids[i - 1]!,
      })),
    });
    lecturas.push(...ids);
    // Fila patrón: la cadena tiene de verdad 1001 correcciones, y la última apunta a la anterior, no a la raíz.
    expect(await prisma.measurement.count({ where: { id: { in: ids } } })).toBe(TOPE + 1);
    const ultima = await prisma.measurement.findUniqueOrThrow({ where: { id: ids[TOPE]! }, select: { correctsId: true } });
    expect(ultima.correctsId).toBe(ids[TOPE - 1]);
    // La última está a 1001 eslabones de la marca: el recorrido se detiene antes de llegar.
    await rechaza(agrega(versionId, await conLectura(ids[TOPE]!), citador), "lectura_no_marcada");
    // Control: la anterior está a 1000 —el tope— y llega a la marca; sin el control, el rechazo de arriba no diría nada del tope.
    await agregar(versionId, null, await conLectura(ids[TOPE - 1]!), citador);
    expect(await citaDe(versionId)).toEqual([ids[TOPE - 1]]);
  }, 120000);
});

describe("§3.2 — metas por paso", () => {
  const phInicial = { variable: "ph", moment: "initial" as const, unit: "pH", minValue: 4.5, maxValue: 5.5 };

  it("pH inicial en la prefermentación y en la fermentación de la misma versión: se guardan las dos", async () => {
    // Las dos con la MISMA fase: sólo así el índice de las metas de la versión (fase, variable, momento) chocaría si la meta
    // no llevara su paso. Es lo que hace discriminar a esta prueba.
    expect(FASE_DEL_TIPO.prefermentacion, "precondición (tarea 2)").toBe("fermentation");
    expect(FASE_DEL_TIPO.fermentation, "precondición (tarea 2)").toBe("fermentation");
    const { versionId } = await borrador("metas");
    // Una meta de la VERSIÓN (el pH final): el ayudante `borrador` la ponía de relleno mientras existió `createRecipeWithVersion`, y esta
    // prueba la necesita para afirmar al final que las dos clases de meta conviven.
    await prisma.processTarget.create({
      data: { recipeVersionId: versionId, variable: "ph", moment: "final", phase: "fermentation", unit: "pH", targetValue: 3.8 },
    });
    await agregar(versionId, null, await pasoDe("prefermentacion", { metas: [phInicial] }));
    await agregar(versionId, 1, await pasoDe("fermentation", { metas: [{ ...phInicial, minValue: 4.0, maxValue: 4.8 }] }));
    const delPaso = await prisma.processTarget.findMany({
      where: { recipeVersionId: versionId, recipeStepId: { not: null } },
      orderBy: { minValue: "asc" },
    });
    expect(delPaso.map((m) => [m.variable, m.moment, m.phase, m.minValue?.toNumber()])).toEqual([
      ["ph", "initial", "fermentation", 4],
      ["ph", "initial", "fermentation", 4.5],
    ]);
    // La de la versión (el pH final del borrador) sigue sin paso: las dos clases conviven.
    expect(await prisma.processTarget.count({ where: { recipeVersionId: versionId, recipeStepId: null } })).toBe(1);
  });

  it("la misma variable y momento dos veces en un paso se rechaza, y no deja el paso a medias", async () => {
    const { versionId } = await borrador("metas-repetidas");
    await rechaza(
      agregarPaso(gestor, {
        recipeVersionId: versionId,
        despuesDeSeq: null,
        paso: await pasoDe("fermentation", { metas: [phInicial, { ...phInicial, minValue: 4 }] }),
      }),
      "duplicate_variable_and_moment",
      ProcessTargetError,
    );
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } })).toBe(0);
    // Control: una sola, pasa.
    await agregar(versionId, null, await pasoDe("fermentation", { metas: [phInicial] }));
  });

  it("la meta de un paso sin fase (lavado) no lleva fase; la de un secado lleva drying", async () => {
    expect(FASE_DEL_TIPO.washing, "precondición (diseño §3.2: un lavado no tiene fase)").toBeUndefined();
    const { versionId } = await borrador("metas-fase");
    const lavado = await agregar(versionId, null, await pasoDe("washing", {
      metas: [{ variable: "wash_medium_ph", moment: "final", unit: "pH", maxValue: 5 }],
    }));
    const secado = await agregar(versionId, 1, await pasoDe("drying", {
      metas: [{ variable: "moisture", moment: "final", unit: "%", minValue: 10, maxValue: 12 }],
    }));
    const fase = async (stepId: string) => (await prisma.processTarget.findFirstOrThrow({ where: { recipeStepId: stepId } })).phase;
    expect(await fase(lavado.id)).toBeNull();
    expect(await fase(secado.id)).toBe("drying");
  });

  it("validateTargets: con paso no pide fase, y un paso que no es de la versión se rechaza paso_de_otra_version", () => {
    const PASO = randomUUID();
    const OTRO = randomUUID();
    const base = { variable: "ph", moment: "final" as const, unit: "pH", targetValue: 4 };
    const lanza = (f: () => void): unknown => {
      try {
        f();
        return null;
      } catch (e) {
        return e;
      }
    };
    // Con paso de la versión y sin fase: vale.
    expect(lanza(() => validateTargets([{ ...base, recipeStepId: PASO }], new Set([PASO])))).toBeNull();
    // La misma variable y momento en DOS pasos no es un duplicado; en el mismo, sí.
    expect(lanza(() => validateTargets([{ ...base, recipeStepId: PASO }, { ...base, recipeStepId: OTRO }], new Set([PASO, OTRO])))).toBeNull();
    const repetida = lanza(() => validateTargets([{ ...base, recipeStepId: PASO }, { ...base, recipeStepId: PASO }], new Set([PASO])));
    expect(repetida).toBeInstanceOf(ProcessTargetError);
    expect((repetida as Error).message).toBe("duplicate_variable_and_moment");
    // Un paso que no es de la versión, o sin la lista de pasos contra la que comprobarlo: rechazo.
    for (const pasos of [new Set([OTRO]), undefined]) {
      const e = lanza(() => validateTargets([{ ...base, recipeStepId: PASO }], pasos));
      expect(e).toBeInstanceOf(RecipeError);
      expect((e as Error).message).toBe("paso_de_otra_version");
    }
    // Sin paso, la fase sigue siendo obligatoria, como desde el 2026-09-27.
    const sinFase = lanza(() => validateTargets([{ ...base }]));
    expect(sinFase).toBeInstanceOf(ProcessTargetError);
    expect((sinFase as Error).message).toBe("phase_required");
    // Un valor que no es un número finito no es «posible»: con `NaN`, `v < min || v > max` es falso y la meta pasaba.
    for (const malo of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const e = lanza(() => validateTargets([{ ...base, recipeStepId: PASO, targetValue: malo }], new Set([PASO])));
      expect(e).toBeInstanceOf(ProcessTargetError);
      expect((e as Error).message).toBe("target_out_of_physical_range");
    }
  });

  it("un paso de recepción sólo vigila el Brix inicial: cualquier otra meta se rechaza (I9)", async () => {
    const { versionId } = await borrador("recepcion");
    const brixInicial = { variable: "brix", moment: "initial" as const, unit: "Bx", minValue: 18, maxValue: 24 };
    const phInicial = { variable: "ph", moment: "initial" as const, unit: "pH", minValue: 4.5, maxValue: 5.5 };
    const intenta = async (metas: NonNullable<PasoEditable["metas"]>) =>
      agregarPaso(gestor, { recipeVersionId: versionId, despuesDeSeq: null, paso: await pasoDe("reception", { metas }) });
    await rechaza(intenta([phInicial]), "meta_de_recepcion_no_se_vigila");
    await rechaza(intenta([{ ...brixInicial, moment: "final" }]), "meta_de_recepcion_no_se_vigila");
    await rechaza(intenta([brixInicial, { variable: "ph", moment: "final", unit: "pH", maxValue: 4.2 }]), "meta_de_recepcion_no_se_vigila");
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } })).toBe(0);
    // Control: el Brix inicial pasa, un paso de recepción sin metas también, y la misma meta de pH en otro tipo de paso (la regla
    // es del TIPO, no de la variable).
    await agregar(versionId, null, await pasoDe("reception", { metas: [brixInicial] }));
    await agregar(versionId, 1, await pasoDe("reception"));
    await agregar(versionId, 2, await pasoDe("fermentation", { metas: [phInicial] }));
  });
});

describe("§3.1 — publicar deriva UNA fase por tipo, del primer paso de esa fase en seq", () => {
  type FaseLeida = {
    phase: string;
    expectedHours: number | null;
    turnEveryHours: number | null;
    targetMoistureMinPct: { toNumber(): number } | null;
    targetMoistureMaxPct: { toNumber(): number } | null;
  };
  const comoSeLee = (fases: FaseLeida[]) =>
    fases
      .map((f) => ({
        phase: f.phase,
        horas: f.expectedHours,
        volteo: f.turnEveryHours,
        min: f.targetMoistureMinPct?.toNumber() ?? null,
        max: f.targetMoistureMaxPct?.toNumber() ?? null,
      }))
      .sort((a, b) => a.phase.localeCompare(b.phase));

  it("fermentación del primer paso fermentativo; secado del PRIMER secado en seq, no del primero creado; un lavado no da fase; la fase escrita a mano se va", async () => {
    expect(FASE_DEL_TIPO.fermentation, "precondición (tarea 2)").toBe("fermentation");
    expect(FASE_DEL_TIPO.drying, "precondición (tarea 2)").toBe("drying");
    expect(FASE_DEL_TIPO.washing, "precondición (diseño §3.2)").toBeUndefined();
    // El borrador trae una fase escrita a mano (999 h): con pasos, los pasos mandan y esa fila se va.
    const { versionId } = await borrador("publicar", { fases: [{ phase: "fermentation", expectedHours: 999 }] });
    await agregar(versionId, null, await pasoDe("fermentation", { horasSugeridas: 36 }));
    await agregar(versionId, 1, await pasoDe("washing", { horasSugeridas: 2 }));
    await agregar(versionId, 2, await pasoDe("drying", { horasSugeridas: 192, volteoCadaHoras: 4, humedadMinPct: 10, humedadMaxPct: 12 }));
    // Creado DESPUÉS pero colocado ANTES: es el primero en seq, y es el que manda.
    await agregar(versionId, 2, await pasoDe("drying", { horasSugeridas: 96, volteoCadaHoras: 8, humedadMinPct: 11, humedadMaxPct: 12.5 }));
    expect((await pasosDeLaVersion(gestor, versionId)).map((p) => [p.seq, p.tipo, p.horasSugeridas])).toEqual([
      [1, "fermentation", 36],
      [2, "washing", 2],
      [3, "drying", 96],
      [4, "drying", 192],
    ]);

    await publicarVersion(gestor, versionId);
    const v = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: versionId }, include: { fases: true } });
    expect(v.status).toBe("approved");
    expect(comoSeLee(v.fases)).toEqual([
      { phase: "drying", horas: 96, volteo: 8, min: 11, max: 12.5 },
      { phase: "fermentation", horas: 36, volteo: null, min: null, max: null },
    ]);
  });

  it("una versión sin pasos NO se publica (version_sin_pasos) y sigue en borrador; con un paso, sí (I9)", async () => {
    // Antes una versión sin pasos se publicaba con las fases que traía; desde la 2a toda versión nueva se publica con pasos (las
    // `approved` de antes no se tocan).
    const { versionId } = await borrador("sin-pasos", {
      fases: [{ phase: "drying", expectedHours: 100, turnEveryHours: 6, targetMoistureMinPct: 11, targetMoistureMaxPct: 12 }],
    });
    await rechaza(publicarVersion(gestor, versionId), "version_sin_pasos");
    const despues = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: versionId }, include: { fases: true } });
    expect(despues.status, "sigue en borrador").toBe("draft");
    // Y no tocó las fases que traía: la derivación no llegó a correr.
    expect(comoSeLee(despues.fases)).toEqual([{ phase: "drying", horas: 100, volteo: 6, min: 11, max: 12 }]);
    expect(await prisma.auditEvent.count({ where: { entityId: versionId, operation: "process_recipe_version.publish" } })).toBe(0);
    // Control: con UN paso, la misma versión se publica.
    await agregar(versionId, null, await pasoDe("washing"));
    await publicarVersion(gestor, versionId);
    expect((await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: versionId } })).status).toBe("approved");
  });

  it("publicada, la versión se ofrece para un proceso; en borrador, no", async () => {
    const { versionId } = await borrador("ofrecida");
    const ofrecidas = async () => (await listRecipeVersionsForLot(admin, lotId)).map((v) => v.id);
    expect(await ofrecidas()).not.toContain(versionId);
    // Sin pasos no se publica (I9, `version_sin_pasos`): se le pone uno. (El texto del plan publicaba el borrador vacío, que I9
    // rechaza: era una prueba escrita antes de I9.)
    await agregar(versionId, null, await pasoDe("washing"));
    await publicarVersion(gestor, versionId);
    expect(await ofrecidas()).toContain(versionId);
  });
});

describe("§3.3 — concurrencia: la versión y la receta se bloquean dentro de su transacción", () => {
  it("dos publicaciones a la vez: una gana, y la otra encuentra la versión ya publicada", async () => {
    const { versionId } = await borrador("carrera-publicar");
    await agregar(versionId, null, await pasoDe("fermentation", { horasSugeridas: 24 }));
    const r = await Promise.allSettled([publicarVersion(gestor, versionId), publicarVersion(gestor, versionId)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const perdedora = r.find((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(perdedora?.reason).toBeInstanceOf(RecipeError);
    expect((perdedora?.reason as Error).message).toBe("version_no_es_borrador");
    expect(
      await prisma.auditEvent.count({ where: { entityId: versionId, operation: "process_recipe_version.publish" } }),
    ).toBe(1);
  }, 20000);

});

describe("cada escritura deja su evento", () => {
  it("agregar, actualizar, mover, quitar y publicar", async () => {
    const { versionId } = await borrador("auditoria");
    const a = await agregar(versionId, null, await pasoDe("pulping"));
    const b = await agregar(versionId, 1, await pasoDe("washing"));
    await actualizarPaso(gestor, { stepId: a.id, paso: await pasoDe("pulping", { intencion: "despulpar en seco" }) });
    await moverPaso(gestor, { stepId: b.id, aSeq: 1 });
    await quitarPaso(gestor, a.id);
    await publicarVersion(gestor, versionId);
    const ops = async (entityId: string) =>
      (await prisma.auditEvent.findMany({ where: { entityId }, select: { operation: true } })).map((e) => e.operation).sort();
    expect(await ops(a.id)).toEqual(["process_recipe_step.create", "process_recipe_step.delete", "process_recipe_step.update"]);
    expect(await ops(b.id)).toEqual(["process_recipe_step.create", "process_recipe_step.move"]);
    expect(await ops(versionId)).toEqual(["process_recipe_version.publish"]);

    // H4: que haya un evento por escritura no dice QUÉ dejó escrito. Quitar `before` y `after` del `update` dejaba esta prueba en verde, así
    // que cada evento se lee entero: quién lo escribió, y el antes y el después del cambio.
    const evento = (entityId: string, operation: string) => prisma.auditEvent.findFirstOrThrow({ where: { entityId, operation } });
    const todos = await prisma.auditEvent.findMany({
      where: { entityId: { in: [a.id, b.id, versionId] } },
      select: { actorUserAccountId: true },
    });
    expect(todos, "control: los seis eventos de la corrida").toHaveLength(6);
    expect(todos.map((e) => e.actorUserAccountId), "el actor de cada evento es quien escribió").toEqual(Array(6).fill(gestor));

    const creado = await evento(a.id, "process_recipe_step.create");
    expect(creado.before).toBeNull();
    expect(creado.after).toMatchObject({ recipeVersionId: versionId, id: a.id, seq: 1, tipo: "pulping", intencion: null });
    // Actualizar: la intención pasa de nula al texto nuevo.
    const actualizado = await evento(a.id, "process_recipe_step.update");
    expect(actualizado.before).toMatchObject({ recipeVersionId: versionId, id: a.id, tipo: "pulping", intencion: null });
    expect(actualizado.after).toMatchObject({ recipeVersionId: versionId, id: a.id, tipo: "pulping", intencion: "despulpar en seco" });
    // Mover: de la posición 2 a la 1.
    const movido = await evento(b.id, "process_recipe_step.move");
    expect(movido.before).toEqual({ recipeVersionId: versionId, seq: 2 });
    expect(movido.after).toEqual({ recipeVersionId: versionId, seq: 1 });
    // Quitar: el antes lleva el paso entero (con la intención ya cambiada, y en el lugar 2 que le dejó el movimiento), y no hay después.
    const quitado = await evento(a.id, "process_recipe_step.delete");
    expect(quitado.before).toMatchObject({ recipeVersionId: versionId, id: a.id, seq: 2, intencion: "despulpar en seco" });
    expect(quitado.after).toBeNull();
    // Publicar: de borrador a aprobada.
    const publicado = await evento(versionId, "process_recipe_version.publish");
    expect(publicado.before).toMatchObject({ id: versionId, status: "draft" });
    expect(publicado.after).toMatchObject({ id: versionId, status: "approved" });
  });
});

describe("permisos (V16): quién escribe una receta, y quién lee sus pasos", () => {
  const cuentasDePermisos = fabricaDeCuentas("PasosPermisos");
  const nombres: string[] = [];
  const lugares: string[] = [];
  const lotesDeFinca: string[] = [];
  const orgsDeFinca: string[] = [];

  afterEach(async () => {
    // En orden de claves ajenas: las recetas (y su auditoría) antes que las cuentas que las firmaron; los lotes antes que la
    // finca; la finca antes que su organización.
    await borrarRecetas({ name: { in: nombres } });
    await cuentasDePermisos.limpiar();
    if (lotesDeFinca.length) await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotesDeFinca } }) });
    if (lugares.length) await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: lugares } }) });
    if (orgsDeFinca.length) await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgsDeFinca } }) });
    for (const lista of [nombres, lugares, lotesDeFinca, orgsDeFinca]) lista.length = 0;
  });

  const nombre = (n: string) => {
    const completo = `PASOS ${n} ${RUN} ${randomUUID()}`;
    nombres.push(completo);
    return completo;
  };

  /** Una organización con su finca y, si se pide, un lote en ella: quien está asignado en la finca gestiona ese lote. */
  async function finca(conLote: boolean) {
    const org = await prisma.organization.create({ data: { name: `PASOS Finca ${RUN} ${randomUUID()}`, organizationType: "farm" } });
    orgsDeFinca.push(org.id);
    const lugar = await prisma.location.create({
      data: { name: `TEST-PASOS-${randomUUID()}`, locationType: "site", classification: "internal", organizationId: org.id },
    });
    lugares.push(lugar.id);
    if (conLote) {
      const lot = await prisma.lot.create({
        data: { lotCode: `PASOS-F-${randomUUID()}`, lotType: "cherry", organizationId: org.id, locationId: lugar.id, classification: "internal" },
      });
      lotesDeFinca.push(lot.id);
    }
    return { org, lugar };
  }

  /** Otro lote de la misma organización, en su PROPIA ubicación (hermana de la de `finca`: un ámbito en una no alcanza la otra). */
  async function otroLoteEnLaFinca(orgId: string) {
    const lugar = await prisma.location.create({
      data: { name: `TEST-PASOS-${randomUUID()}`, locationType: "site", classification: "internal", organizationId: orgId },
    });
    lugares.push(lugar.id);
    const lot = await prisma.lot.create({
      data: { lotCode: `PASOS-F-${randomUUID()}`, lotType: "cherry", organizationId: orgId, locationId: lugar.id, classification: "internal" },
    });
    lotesDeFinca.push(lot.id);
    return { lugar, lot };
  }

  /** ¿Gestiona esta cuenta el lote `internal` de esa ubicación? Es la fila patrón de las pruebas de H3: lo que cada una puede gestionar. */
  const gestiona = (quien: string, lugarId: string) =>
    requireLotAccess(quien, "manage", [{ projectId: null, locationId: lugarId, classification: "internal" }]);

  it("un Farm Manager NO escribe en una receta de su organización —edit_beneficio ya no basta—, ni un capataz; el Coffee Process Manager sí", async () => {
    const { org, lugar } = await finca(true);
    const jefe = await cuentasDePermisos.cuenta("Farm Manager", { locationId: lugar.id });
    const capataz = await cuentasDePermisos.cuenta("Farm Operator", { locationId: lugar.id });
    const gestorDeFinca = await cuentasDePermisos.cuenta("Coffee Process Manager", { locationId: lugar.id });
    // La receta la escribe el gestor de plataforma de este archivo: lo que se mide es quién la TOCA después.
    const { versionId } = await crearRecetaEnBorrador(gestor, { name: nombre("de la finca"), organizationId: org.id });
    const paso = await pasoDe("washing");
    const sinPermiso = [jefe, capataz];
    for (const quien of sinPermiso) {
      await rechaza(agregarPaso(quien, { recipeVersionId: versionId, despuesDeSeq: null, paso }), "sin_permiso_de_autoria");
    }
    expect((await pasosDeLaVersion(gestorDeFinca, versionId)).length, "los rechazos no dejaron nada").toBe(0);
    // Control: el gestor de la finca sí agrega, y lo que sigue se rechaza a los otros dos por cada una de las cinco escrituras.
    const creado = await agregar(versionId, null, paso, gestorDeFinca);
    for (const quien of sinPermiso) {
      await rechaza(actualizarPaso(quien, { stepId: creado.id, paso }), "sin_permiso_de_autoria");
      await rechaza(moverPaso(quien, { stepId: creado.id, aSeq: 1 }), "sin_permiso_de_autoria");
      await rechaza(quitarPaso(quien, creado.id), "sin_permiso_de_autoria");
      await rechaza(publicarVersion(quien, versionId), "sin_permiso_de_autoria");
    }
    expect((await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: versionId } })).status, "no se publicó").toBe("draft");
    await publicarVersion(gestorDeFinca, versionId);
    expect((await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: versionId } })).status).toBe("approved");
  });

  it("los pasos los lee quien puede escribir la receta, sin ser operario, y quien opera los lotes de su organización; un Project Viewer no", async () => {
    const { org, lugar } = await finca(true);
    const gestorDeFinca = await cuentasDePermisos.cuenta("Coffee Process Manager", { locationId: lugar.id });
    const jefe = await cuentasDePermisos.cuenta("Farm Manager", { locationId: lugar.id });
    const capataz = await cuentasDePermisos.cuenta("Farm Operator", { locationId: lugar.id });
    const visor = await cuentasDePermisos.cuenta("Project Viewer", { locationId: lugar.id });
    const { versionId } = await crearRecetaEnBorrador(gestor, { name: nombre("a leer"), organizationId: org.id });
    await agregar(versionId, null, await pasoDe("washing"));
    // El gestor de la finca no lleva `lot:manage` y lee con su permiso de autoría; el jefe y el capataz, con `lot:manage` sobre el
    // lote de su finca (lo que pide hoy `getRecipeForEditor`).
    for (const quien of [gestorDeFinca, jefe, capataz]) {
      expect((await pasosDeLaVersion(quien, versionId)).map((p) => p.tipo)).toEqual(["washing"]);
    }
    // El visor ve lotes (`lot:view`) pero no los gestiona, y tampoco escribe recetas: ni uno ni otro camino lo deja pasar.
    await expect(pasosDeLaVersion(visor, versionId)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("una organización sin lotes: el Process Manager lee igual; quien sólo opera no tiene un lote por el que leer (organizacion_sin_lotes)", async () => {
    const { org, lugar } = await finca(false);
    const gestorDeFinca = await cuentasDePermisos.cuenta("Coffee Process Manager", { locationId: lugar.id });
    const capataz = await cuentasDePermisos.cuenta("Farm Operator", { locationId: lugar.id });
    const { versionId } = await crearRecetaEnBorrador(gestor, { name: nombre("sin lotes"), organizationId: org.id });
    await agregar(versionId, null, await pasoDe("washing"));
    expect((await pasosDeLaVersion(gestorDeFinca, versionId)).length).toBe(1);
    await rechaza(pasosDeLaVersion(capataz, versionId), "organizacion_sin_lotes");
  });

  it("una plantilla (sin organización) sólo se escribe con alcance de plataforma: ni el Farm Manager ni el Process Manager de una finca", async () => {
    const { lugar } = await finca(true);
    const jefe = await cuentasDePermisos.cuenta("Farm Manager", { locationId: lugar.id });
    const gestorDeFinca = await cuentasDePermisos.cuenta("Coffee Process Manager", { locationId: lugar.id });
    const { versionId } = await crearRecetaEnBorrador(gestor, { name: nombre("plantilla"), organizationId: null });
    const paso = await pasoDe("washing");
    await rechaza(agregarPaso(jefe, { recipeVersionId: versionId, despuesDeSeq: null, paso }), "sin_permiso_de_autoria");
    await rechaza(agregarPaso(gestorDeFinca, { recipeVersionId: versionId, despuesDeSeq: null, paso }), "sin_permiso_de_autoria");
    // Control: con alcance de plataforma (el `gestor` de este archivo), sí.
    await agregar(versionId, null, paso, gestor);
    expect((await pasosDeLaVersion(gestor, versionId)).length).toBe(1);
  });

  // H3 (revisión de la tarea 3): leer los pasos pedía `lot:manage` sobre «un lote cualquiera» —`findFirst` sin orden—, así que quien
  // gestionaba UN lote de la organización lo leía o no según el orden físico de las filas. Ahora basta con gestionar AL MENOS UNO. Las
  // tres pruebas de abajo no dependen de ese orden: la finca lleva dos lotes en ubicaciones hermanas, cada jefe gestiona sólo uno, y
  // por tanto, con cualquier orden físico, uno de los dos habría caído con el `findFirst` de antes.
  async function dosJefesDeUnaFincaConDosLotes() {
    const { org, lugar: lugarA } = await finca(true); // el lote A, el primero que se crea
    const { lugar: lugarB } = await otroLoteEnLaFinca(org.id); // el lote B, después
    const jefeA = await cuentasDePermisos.cuenta("Farm Manager", { locationId: lugarA.id });
    const jefeB = await cuentasDePermisos.cuenta("Farm Manager", { locationId: lugarB.id });
    // Fila patrón: cada jefe gestiona SU lote y no el del otro. Sin esto, lo que sigue no mediría nada.
    await gestiona(jefeA, lugarA.id);
    await gestiona(jefeB, lugarB.id);
    await expect(gestiona(jefeA, lugarB.id)).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(gestiona(jefeB, lugarA.id)).rejects.toBeInstanceOf(TraceabilityAccessError);
    return { org, lugarA, lugarB, jefeA, jefeB };
  }

  it("H3 — quien gestiona un solo lote de la organización lee los pasos de su receta, haya o no otro lote suyo que no gestiona (sin depender del orden de las filas)", async () => {
    const { org, jefeA, jefeB } = await dosJefesDeUnaFincaConDosLotes();
    const { versionId } = await crearRecetaEnBorrador(gestor, { name: nombre("de una finca con dos lotes"), organizationId: org.id });
    await agregar(versionId, null, await pasoDe("washing"));
    for (const quien of [jefeA, jefeB]) {
      expect((await pasosDeLaVersion(quien, versionId)).map((p) => p.tipo)).toEqual(["washing"]);
    }
  });

  it("H3 — los mismos dos jefes leen los pasos de una plantilla, y también quien gestiona un lote de OTRA organización: una plantilla sirve en cualquiera", async () => {
    const { jefeA, jefeB } = await dosJefesDeUnaFincaConDosLotes();
    const ajena = await finca(true);
    const jefeAjeno = await cuentasDePermisos.cuenta("Farm Manager", { locationId: ajena.lugar.id });
    const { versionId } = await crearRecetaEnBorrador(gestor, { name: nombre("plantilla a leer"), organizationId: null });
    await agregar(versionId, null, await pasoDe("washing"));
    for (const quien of [jefeA, jefeB, jefeAjeno]) {
      expect((await pasosDeLaVersion(quien, versionId)).map((p) => p.tipo)).toEqual(["washing"]);
    }
  });

  it("H3 — quien no gestiona ningún lote ni escribe recetas no lee: ni un Project Viewer, en la receta ni en la plantilla, ni quien gestiona lotes sólo de OTRA organización, en la receta", async () => {
    const { org, lugarA, jefeA } = await dosJefesDeUnaFincaConDosLotes();
    const visor = await cuentasDePermisos.cuenta("Project Viewer", { locationId: lugarA.id });
    const ajena = await finca(true);
    const jefeAjeno = await cuentasDePermisos.cuenta("Farm Manager", { locationId: ajena.lugar.id });
    const deLaOrg = (await crearRecetaEnBorrador(gestor, { name: nombre("de la organización"), organizationId: org.id })).versionId;
    const plantilla = (await crearRecetaEnBorrador(gestor, { name: nombre("plantilla cerrada"), organizationId: null })).versionId;
    await agregar(deLaOrg, null, await pasoDe("washing"));
    await agregar(plantilla, null, await pasoDe("washing"));
    // Control: quien sí gestiona un lote de la organización la lee; sin esto los rechazos de abajo no distinguen nada.
    expect((await pasosDeLaVersion(jefeA, deLaOrg)).length).toBe(1);
    await expect(pasosDeLaVersion(visor, deLaOrg)).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(pasosDeLaVersion(visor, plantilla)).rejects.toBeInstanceOf(TraceabilityAccessError);
    // Los lotes candidatos son los de la organización de la receta: el jefe de otra finca gestiona los suyos y no los de ésta.
    await expect(pasosDeLaVersion(jefeAjeno, deLaOrg)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });
});

describe("R24 — los pasos de una receta Libre se leen por el lote de su proceso, no por la autoría", () => {
  // `citador`: un Coffee Process Manager de plataforma que ADEMÁS ve los lotes (`lot:view`, concedido). El `gestor` de arriba escribe recetas y no
  // ve ninguno. Los lotes de este bloque son suyos —no se mezclan con los de arriba— y se borran aquí, DESPUÉS de sus procesos.
  let citador: string;
  const lotesDeLibres: string[] = [];

  beforeAll(async () => {
    citador = await cuentas.cuenta("Coffee Process Manager", "plataforma");
    await cuentas.conceder(citador, "lot", "view");
  });

  afterAll(async () => {
    // Los procesos ANTES que las recetas de las que cuelgan y que los lotes (`process_recipe_version_id` y `lot_id` son RESTRICT).
    if (lotesDeLibres.length > 0) await borrarProcesosDeLotesDonde({ id: { in: lotesDeLibres } });
    await borrarRecetas({ AND: [{ name: { contains: RUN } }, { name: { contains: " libres-" } }] });
    if (lotesDeLibres.length > 0) await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotesDeLibres } }) });
    expect(await prisma.lot.count({ where: { id: { in: lotesDeLibres } } }), "control: los lotes del bloque ya no están").toBe(0);
    expect(await prisma.lotProcess.count({ where: { lotId: { in: lotesDeLibres } } }), "control: sus procesos ya no están").toBe(0);
  });

  async function lote(clasificacion: "internal" | "confidential"): Promise<string> {
    const l = await prisma.lot.create({
      data: { lotCode: `PASOS-LIBRE-${randomUUID()}`, lotType: "cherry", organizationId, classification: clasificacion },
    });
    lotesDeLibres.push(l.id);
    return l.id;
  }
  /**
   * Un proceso del lote que usa la versión: la fila, con las columnas que pide la base y la forma de los `lotProcess.create` de las pruebas
   * de hoy (`colaDeSecado`, `procesoDelLinaje`…). No pasa por `abrirProceso` —lo que se prueba es quién ve los lotes que USAN la versión— ni por
   * `abrirProcesoDePrueba` (ver la cabecera). Se borra en el `afterAll` de este bloque, con `borrarProcesosDeLotesDonde`.
   */
  async function procesoEn(deLote: string, versionId: string): Promise<void> {
    await prisma.lotProcess.create({
      data: {
        lotId: deLote,
        sequenceOrder: 1,
        processRecipeVersionId: versionId,
        intent: `TEST ${RUN}`,
        targetMoisturePct: 11,
        startedAt: new Date("2026-03-01T12:00:00Z"),
        provenanceClass: "original_record",
        processGradeValueId: await valor("grado_proceso", "Washed"),
        cherryStateValueId: await valor("estado_cereza", "despulpada"),
      },
    });
  }
  /** Una receta de la organización con un paso, PUBLICADA, y un proceso con ella en cada lote dado. Todavía NO es Libre. */
  async function conProcesosEn(nombre: string, enLotes: string[]) {
    const { recipeId, versionId } = await borrador(nombre);
    await agregar(versionId, null, await pasoDe("washing"));
    await publicarVersion(gestor, versionId);
    for (const l of enLotes) await procesoEn(l, versionId);
    return { recipeId, versionId };
  }
  const marcarLibre = (recipeId: string, esLibre: boolean) => prisma.processRecipe.update({ where: { id: recipeId }, data: { esLibre } });
  const tipos = async (quien: string, versionId: string) => (await pasosDeLaVersion(quien, versionId)).map((p) => p.tipo);

  it("una Libre la lee quien ve el lote de su proceso y NO quien sólo escribe recetas; la misma receta sin la marca la lee quien escribe", async () => {
    const { recipeId, versionId } = await conProcesosEn("libres-uno", [await lote("internal")]);
    // Control: todavía no es Libre. Quien escribe recetas sin ver ningún lote la lee por su autoría (V16), como cualquier receta.
    expect(await tipos(gestor, versionId)).toEqual(["washing"]);
    await marcarLibre(recipeId, true);
    // La misma versión y la misma cuenta: ahora cuenta el lote, y el gestor no lo ve.
    await expect(pasosDeLaVersion(gestor, versionId)).rejects.toBeInstanceOf(TraceabilityAccessError);
    // Quien SÍ ve el lote la lee: el Process Manager con `lot:view` concedido, y el administrador.
    expect(await tipos(citador, versionId)).toEqual(["washing"]);
    expect(await tipos(admin, versionId)).toEqual(["washing"]);
    // Y sin la marca vuelve a leerla quien la escribe: lo que cambia la respuesta es la marca, no la receta ni la cuenta.
    await marcarLibre(recipeId, false);
    expect(await tipos(gestor, versionId)).toEqual(["washing"]);
  });

  it("una Libre que usan DOS lotes —una división copia la versión a cada parte— la lee sólo quien los ve todos", async () => {
    const abierto = await lote("internal");
    const reservado = await lote("confidential");
    // Fila patrón: el citador ve un lote `internal` y NO uno `confidential` (el perfil no lleva `clear_confidential`). Sin esto, el rechazo de
    // abajo podría venir de cualquier otra cosa.
    const visto = (classification: "internal" | "confidential") => requireLotAccess(citador, "view", [{ projectId: null, locationId: null, classification }]);
    await visto("internal");
    await expect(visto("confidential")).rejects.toBeInstanceOf(TraceabilityAccessError);
    const { recipeId, versionId } = await conProcesosEn("libres-dos", [abierto, reservado]);
    await marcarLibre(recipeId, true);
    // Ve uno de los dos y no basta.
    await expect(pasosDeLaVersion(citador, versionId)).rejects.toBeInstanceOf(TraceabilityAccessError);
    // Control: quien ve los dos la lee.
    expect(await tipos(admin, versionId)).toEqual(["washing"]);
  });

  it("una Libre que ningún proceso usa no se abre a nadie, tampoco al administrador (no hay lote por el que autorizar)", async () => {
    const { recipeId, versionId } = await conProcesosEn("libres-ninguno", []);
    // Control: sin la marca, el administrador la lee (tiene la autoría).
    expect(await tipos(admin, versionId)).toEqual(["washing"]);
    await marcarLibre(recipeId, true);
    await expect(pasosDeLaVersion(admin, versionId)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });
});
