/**
 * Las tres lecturas de las pantallas de recetas — Parte 2a, tarea 14 (2026-10-04), Ruling C4 y V16; ronda del 2026-10-05, R7 y R8.
 *
 * `listRecipes`, `listRecipeOrganizations` y `getRecipeForEditor` (`lib/traceability/processTargets.ts`) pedían `lot:manage` sobre un lote, un permiso
 * operativo que el Coffee Process Manager NO lleva (V13: escribe recetas, no opera lotes; el perfil no gana `lot:manage` ni `lot:view`): escribía recetas por
 * servicio y no abría ninguna pantalla. Desde esta tarea aceptan TAMBIÉN `puedeAutoriaDeReceta` —la gemela de la regla de autoría de la tarea 3—: quien puede
 * escribir una receta puede verla, y quien opera los lotes de su organización, como hasta hoy. Cada lectura lleva su «sí» y los «no» que siguen valiendo: el
 * Project Viewer, que ve lotes y no los gestiona ni escribe recetas, y el Process Manager de OTRA finca, que escribe recetas pero no en ésta.
 *
 * **R7 (revisión adversaria del 2026-10-05): cada receta se lee por SU organización.** `listRecipes` autorizaba contra «un lote cualquiera de toda la base» y,
 * si pasaba, devolvía las recetas de todas las organizaciones: un operario de la finca A recibía las de B según qué lote devolviera la base, y un Coffee
 * Process Manager con un perfil operativo de más eludía además el filtro de la autoría. Ahora la ve quien opera ALGÚN lote de la organización o quien puede
 * escribir sus recetas, y las plantillas las ve quien opera algún lote en cualquier parte o tiene la autoría de plataforma. Las pruebas usan cuatro organizaciones
 * (A y D con recetas y con lotes, B con lotes y sin recetas, S con receta y sin lotes) y una organización de DOS parcelas (D), cuyo lote de la parcela 1 se crea
 * primero: es el que una lectura que mirara «el primer lote» encontraría, y el operario de la parcela 2 tiene que abrir igual.
 *
 * **R8: una Libre es lo que ocurrió en un lote.** `listRecipes` no trae ninguna, y `getRecipeForEditor` la abre sólo a quien VE el lote cuyo proceso la usa —y, si
 * una división la copió a varios lotes, a quien los ve todos—; quien sólo escribe recetas de la organización y no ve el lote no la lee (el perfil no lleva
 * `lot:view`). Las Libres de la prueba nacen como una receta publicada corriente con un proceso abierto en cada lote, y SÓLO DESPUÉS se marcan Libres:
 * `abrirProceso` rechazará una Libre pasada por id (`receta_libre_no_se_elige`, tarea 10, PR-B; en el PR-A todavía la acepta, y esta prueba no depende de eso), que es lo que hará la apertura real con su bloque `libre`.
 *
 * **Quién pasa por qué camino, dicho en la primera prueba** (el control que importa): el Process Manager de la finca NO pasa la guardia de operar un lote y el
 * capataz sí; el visor ve el lote y no lo opera. Sin ese control, «el Process Manager abre la receta» podría ser un permiso operativo que se coló en el perfil.
 *
 * **F1-12 (revisión final del PR-A): `listRecipeOrganizations` mira los ámbitos de TODOS los lotes de cada organización, como las otras dos lecturas.** Autorizaba con «el primer lote que
 * devolviera la base» (`findFirst` sin orden), y un operario de una sola parcela de la organización D se la veía ofrecida o no según el orden físico de las filas. D tiene sus lotes en dos parcelas
 * y DOS operarios, uno por parcela: el lote que la base devuelva primero es de la una o de la otra, así que una lectura que mire «el primero» deja fuera a uno de los dos en cualquier orden.
 *
 * **Lo que NO prueba, y se dice:** que `pasosDeLaVersion` (tarea 3) cierre los pasos de una Libre a quien no ve el lote.
 *
 * **Limpieza:** `afterAll`, en orden de claves ajenas —los procesos que abrió la prueba, las recetas (y su auditoría), las cuentas, los lotes, las ubicaciones y las
 * organizaciones—, con `assertDefinedWhere`. Nada de lo que crea un `it` queda fuera de ella: cada `it` sólo LEE, salvo uno que marca una receta suya como Libre, y esa
 * receta lleva el prefijo `RUN` como todas.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearRecetaEnBorrador } from "../../lib/recetas/versiones";
import { requireLotAccess, TraceabilityAccessError } from "../../lib/traceability/lots";
import {
  getRecipeForEditor,
  listRecipeOrganizations,
  listRecipes,
  ProcessTargetError,
  puedeCrearRecetaEnAlguna,
} from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";

const RUN = `lecturas-${Date.now()}`;
const cuentas = fabricaDeCuentas("Lecturas");

let admin: string;
/** Coffee Process Manager con alcance de plataforma: escribe también las plantillas. */
let gestorDePlataforma: string;
/** Coffee Process Manager en la finca A: escribe las recetas de A y NO lleva `lot:manage` ni `lot:view`. */
let gestorA: string;
/** Coffee Process Manager en la finca B: otra organización, sin recetas todavía. */
let gestorB: string;
/** Coffee Process Manager en la finca S: una organización SIN lotes. */
let gestorS: string;
/** Farm Operator en la finca A: lleva `lot:manage` y `lot:view` sobre el lote de A. */
let capataz: string;
/** Project Viewer en la finca A: ve lotes (`lot:view`), no los gestiona y no escribe recetas. */
let visor: string;
/** Farm Operator en la parcela 2 de la organización D: opera esa parcela y no la 1. */
let capatazD: string;
/** Farm Operator en la parcela 1 de la organización D: opera esa parcela y no la 2 (F1-12: el reverso de `capatazD`). */
let capatazD1: string;
/** Coffee Process Manager en la finca A Y Farm Operator en la parcela 2 de D: escribe las recetas de A y opera D (el «perfil operativo de más» de R7). */
let mixto: string;

let fincaA: { orgId: string; lugarId: string; loteId: string | null };
let fincaB: { orgId: string; lugarId: string; loteId: string | null };
let fincaS: { orgId: string; lugarId: string; loteId: string | null };
/** D, de dos parcelas: el lote 1 en la parcela 1 (el primero que se crea), los lotes 2 y 3 en la parcela 2. */
let fincaD: { orgId: string; lugar1: string; lugar2: string; lote1: string; lote2: string; lote3: string };
let recetaA: string;
let recetaS: string;
let recetaD: string;
let plantilla: string;
/** Libre de A: la usa el proceso del lote de A. */
let libreDeA: string;
/** Libre de la división: la usan los procesos del lote 1 (parcela 1) y del lote 2 (parcela 2) de D. */
let libreDeLaDivision: string;
/** Libre de la parcela 2: la usa sólo el proceso del lote 3 (parcela 2) de D. */
let libreDeLaParcela2: string;
/** Libre que ningún proceso usa. */
let libreSinProceso: string;

const orgs: string[] = [];
const lugares: string[] = [];
const lotes: string[] = [];
/** Cada receta que creó la prueba: el control de que la corrida sí creó cosas antes de afirmar que no queda nada. */
const creadas: string[] = [];

/** Una organización con su finca y, si se pide, un lote suyo en ella. */
async function finca(etiqueta: string, conLote: boolean) {
  const org = await prisma.organization.create({ data: { name: `LECTURAS ${etiqueta} ${RUN}`, organizationType: "farm" } });
  orgs.push(org.id);
  const lugar = await prisma.location.create({
    data: { name: `TEST-LECTURAS-${randomUUID()}`, locationType: "site", classification: "internal", organizationId: org.id },
  });
  lugares.push(lugar.id);
  let loteId: string | null = null;
  if (conLote) {
    const lote = await prisma.lot.create({
      data: {
        lotCode: `LECTURAS-${etiqueta}-${RUN}`, lotType: "cherry", organizationId: org.id, locationId: lugar.id, status: "approved", classification: "internal",
      },
    });
    lotes.push(lote.id);
    loteId = lote.id;
  }
  return { orgId: org.id, lugarId: lugar.id, loteId };
}

/** La organización D: dos parcelas (dos ubicaciones) y tres lotes. El de la parcela 1 se crea PRIMERO. */
async function fincaDeDosParcelas() {
  const org = await prisma.organization.create({ data: { name: `LECTURAS D ${RUN}`, organizationType: "farm" } });
  orgs.push(org.id);
  const parcela = async (n: number) => {
    const lugar = await prisma.location.create({
      data: { name: `TEST-LECTURAS-D${n}-${randomUUID()}`, locationType: "site", classification: "internal", organizationId: org.id },
    });
    lugares.push(lugar.id);
    return lugar.id;
  };
  const lote = async (n: number, locationId: string) => {
    const l = await prisma.lot.create({
      data: { lotCode: `LECTURAS-D${n}-${RUN}`, lotType: "cherry", organizationId: org.id, locationId, status: "approved", classification: "internal" },
    });
    lotes.push(l.id);
    return l.id;
  };
  const lugar1 = await parcela(1);
  const lugar2 = await parcela(2);
  const lote1 = await lote(1, lugar1);
  const lote2 = await lote(2, lugar2);
  const lote3 = await lote(3, lugar2);
  return { orgId: org.id, lugar1, lugar2, lote1, lote2, lote3 };
}

/** Una receta en borrador, escrita por el Process Manager de plataforma (que escribe las de cualquier organización y las plantillas). */
async function receta(etiqueta: string, organizationId: string | null): Promise<string> {
  const { recipeId } = await crearRecetaEnBorrador(gestorDePlataforma, { name: `LECTURAS ${etiqueta} ${RUN}`, organizationId });
  creadas.push(recipeId);
  return recipeId;
}

/** Una receta CORRIENTE con su versión 1 publicada, escrita en crudo: la que `abrirProceso` acepta (la de la prueba no tiene pasos ni metas). */
async function recetaPublicada(etiqueta: string, organizationId: string) {
  const r = await prisma.processRecipe.create({
    data: {
      name: `LECTURAS ${etiqueta} ${RUN}`,
      organizationId,
      status: "approved",
      versions: { create: { version: 1, status: "approved", notes: "TEST: receta publicada de lecturasDeRecetas" } },
    },
    select: { id: true, versions: { select: { id: true } } },
  });
  creadas.push(r.id);
  const version = r.versions[0];
  if (!version) throw new Error(`recetaPublicada: la receta ${r.id} no trae su versión 1`);
  return { recipeId: r.id, versionId: version.id };
}

/** Una Libre: la receta publicada, un proceso abierto con ella en cada uno de `losLotes`, y SÓLO DESPUÉS marcada Libre. */
async function libreUsadaPor(etiqueta: string, organizationId: string, losLotes: string[]): Promise<string> {
  const { recipeId, versionId } = await recetaPublicada(etiqueta, organizationId);
  for (const lote of losLotes) await abrirProcesoDePrueba(admin, lote, { processRecipeVersionId: versionId });
  await prisma.processRecipe.update({ where: { id: recipeId }, data: { esLibre: true } });
  return recipeId;
}

beforeAll(async () => {
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;
  fincaA = await finca("A", true);
  fincaB = await finca("B", true);
  fincaS = await finca("S", false);
  fincaD = await fincaDeDosParcelas();
  gestorDePlataforma = await cuentas.cuenta("Coffee Process Manager", "plataforma");
  gestorA = await cuentas.cuenta("Coffee Process Manager", { locationId: fincaA.lugarId });
  gestorB = await cuentas.cuenta("Coffee Process Manager", { locationId: fincaB.lugarId });
  gestorS = await cuentas.cuenta("Coffee Process Manager", { locationId: fincaS.lugarId });
  capataz = await cuentas.cuenta("Farm Operator", { locationId: fincaA.lugarId });
  visor = await cuentas.cuenta("Project Viewer", { locationId: fincaA.lugarId });
  // Antes que `mixto`: crea el ámbito de la parcela 2 de D, que `mixto` reusa.
  capatazD = await cuentas.cuenta("Farm Operator", { locationId: fincaD.lugar2 });
  capatazD1 = await cuentas.cuenta("Farm Operator", { locationId: fincaD.lugar1 });
  mixto = await cuentas.cuenta("Coffee Process Manager", { locationId: fincaA.lugarId });
  const ambitoDeD2 = await prisma.scope.findFirstOrThrow({ where: { scopeType: "location", scopeRefId: fincaD.lugar2 }, select: { id: true } });
  const perfilOperario = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" }, select: { id: true } });
  await prisma.assignment.create({ data: { userAccountId: mixto, scopeId: ambitoDeD2.id, roleProfileId: perfilOperario.id } });
  recetaA = await receta("de A", fincaA.orgId);
  recetaS = await receta("de S", fincaS.orgId);
  recetaD = await receta("de D", fincaD.orgId);
  plantilla = await receta("plantilla", null);
  libreDeA = await libreUsadaPor("Libre de A", fincaA.orgId, [fincaA.loteId as string]);
  libreDeLaDivision = await libreUsadaPor("Libre de la división", fincaD.orgId, [fincaD.lote1, fincaD.lote2]);
  libreDeLaParcela2 = await libreUsadaPor("Libre de la parcela 2", fincaD.orgId, [fincaD.lote3]);
  libreSinProceso = await libreUsadaPor("Libre sin proceso", fincaA.orgId, []);
});

afterAll(async () => {
  // En orden de claves ajenas: los procesos que abrió la prueba antes que las recetas que usan (`lot_process.process_recipe_version_id` es RESTRICT) y que sus
  // lotes; las recetas (y su auditoría: la de una receta cuelga de su id, y la de su versión del de la VERSIÓN) antes que las cuentas que las firmaron y antes que
  // las organizaciones (`process_recipe.organization_id` es RESTRICT); los lotes y las ubicaciones, antes que su organización.
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  const recetaIds = (
    await prisma.processRecipe.findMany({ where: assertDefinedWhere({ name: { contains: RUN } }), select: { id: true } })
  ).map((r) => r.id);
  const versionIds = (
    await prisma.processRecipeVersion.findMany({ where: assertDefinedWhere({ recipeId: { in: recetaIds } }), select: { id: true } })
  ).map((v) => v.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...recetaIds, ...versionIds] } }) });
  await prisma.processRecipeVersion.deleteMany({ where: assertDefinedWhere({ id: { in: versionIds } }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recetaIds } }) });
  await cuentas.limpiar();
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: lugares } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs } }) });
  // Lo que quede es basura de ESTA corrida. El control: la corrida sí creó recetas (las ocho del `beforeAll`, más la de la prueba que marca una Libre); si no, los ceros de abajo no miran nada.
  expect(creadas.length).toBeGreaterThanOrEqual(8);
  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.processRecipeVersion.count({ where: { id: { in: versionIds } } })).toBe(0);
  expect(await prisma.organization.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.lot.count({ where: { id: { in: lotes } } })).toBe(0);
});

describe("control: por qué camino pasa cada cuenta y qué ve cada una de los lotes", () => {
  it("el Process Manager NO opera ni ve lotes, el capataz los opera, el visor sólo los ve, y el de la parcela 2 de D opera ésa y no la 1", async () => {
    const lote = { locationId: fincaA.lugarId, classification: "internal" as const };
    await expect(requireLotAccess(gestorA, "manage", [lote])).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(requireLotAccess(gestorA, "view", [lote]), "el Process Manager no ve lotes: es lo que impide que lea una Libre").rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(requireLotAccess(capataz, "manage", [lote])).resolves.toBeUndefined();
    await expect(requireLotAccess(visor, "manage", [lote])).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(requireLotAccess(visor, "view", [lote]), "el visor ve el lote").resolves.toBeUndefined();
    const parcela2 = { locationId: fincaD.lugar2, classification: "internal" as const };
    const parcela1 = { locationId: fincaD.lugar1, classification: "internal" as const };
    await expect(requireLotAccess(capatazD, "manage", [parcela2])).resolves.toBeUndefined();
    await expect(requireLotAccess(capatazD, "manage", [parcela1])).rejects.toBeInstanceOf(TraceabilityAccessError);
    // El reverso (F1-12): el operario de la parcela 1 opera ésa y no la 2.
    await expect(requireLotAccess(capatazD1, "manage", [parcela1])).resolves.toBeUndefined();
    await expect(requireLotAccess(capatazD1, "manage", [parcela2])).rejects.toBeInstanceOf(TraceabilityAccessError);
    // El «perfil operativo de más»: `mixto` opera la parcela 2 de D, no la finca A, y aun así escribe las recetas de A (lo que prueban las listas de abajo).
    await expect(requireLotAccess(mixto, "manage", [parcela2])).resolves.toBeUndefined();
    await expect(requireLotAccess(mixto, "manage", [lote])).rejects.toBeInstanceOf(TraceabilityAccessError);
  });
});

describe("getRecipeForEditor: cada receta se lee por su organización, y una Libre por su lote", () => {
  it("el Process Manager de la finca abre la receta de su organización, y el capataz que opera sus lotes también", async () => {
    expect((await getRecipeForEditor(gestorA, recetaA)).id).toBe(recetaA);
    expect((await getRecipeForEditor(capataz, recetaA)).id).toBe(recetaA);
  });

  it("quien no la escribe ni la opera sigue sin leer: el Project Viewer y el Process Manager de otra finca", async () => {
    await expect(getRecipeForEditor(visor, recetaA)).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(getRecipeForEditor(gestorB, recetaA)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("la autoría no pide ningún lote: el Process Manager abre la receta de una organización SIN lotes; quien no la escribe encuentra organization_has_no_lots", async () => {
    expect((await getRecipeForEditor(gestorS, recetaS)).id).toBe(recetaS);
    // Control: el mismo rechazo de siempre, para quien necesita un lote por el que pasar y no hay ninguno.
    const error = await getRecipeForEditor(gestorB, recetaS).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error, "esperaba ProcessTargetError y no lanzó nada").not.toBeNull();
    expect(error).toBeInstanceOf(ProcessTargetError);
    expect((error as Error).message).toBe("organization_has_no_lots");
  });

  it("una plantilla la abre quien escribe plantillas (alcance de plataforma); el Process Manager de una finca no", async () => {
    expect((await getRecipeForEditor(gestorDePlataforma, plantilla)).id).toBe(plantilla);
    await expect(getRecipeForEditor(gestorA, plantilla)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("el operario de UNA de las parcelas de una organización abre sus recetas, aunque la base devuelva primero el lote de la otra (R7)", async () => {
    expect((await getRecipeForEditor(capatazD, recetaD)).id).toBe(recetaD);
    // Control: la otra organización sigue cerrada para él.
    await expect(getRecipeForEditor(capatazD, recetaA)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("una receta Libre la lee quien ve el lote cuyo proceso la usa; quien sólo escribe recetas de la organización y no ve el lote, no (R8)", async () => {
    // Control del fixture: es una Libre de verdad, y la usa el proceso del lote de A. Sin esto, los rechazos de abajo podrían ser de cualquier otra cosa.
    expect((await getRecipeForEditor(admin, libreDeA)).esLibre).toBe(true);
    // Quien ve el lote la lee: el administrador, el capataz de la finca (que además lo opera) y el visor (que sólo lo ve).
    expect((await getRecipeForEditor(capataz, libreDeA)).id).toBe(libreDeA);
    expect((await getRecipeForEditor(visor, libreDeA)).id).toBe(libreDeA);
    // Quien puede ESCRIBIR las recetas de la organización y no ve el lote, no: ni el de la finca, ni el de plataforma, ni quien opera otra organización.
    await expect(getRecipeForEditor(gestorA, libreDeA)).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(getRecipeForEditor(gestorDePlataforma, libreDeA)).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(getRecipeForEditor(capatazD, libreDeA)).rejects.toBeInstanceOf(TraceabilityAccessError);
    // Control: la MISMA cuenta que se rechaza sí abre la receta corriente de su organización (con la autoría), así que el rechazo es de la regla de la Libre.
    expect((await getRecipeForEditor(gestorA, recetaA)).id).toBe(recetaA);
  });

  it("una Libre que usan dos lotes —la división la copia a cada parte— sólo la lee quien los ve todos (R8)", async () => {
    // El administrador ve los dos lotes.
    expect((await getRecipeForEditor(admin, libreDeLaDivision)).esLibre).toBe(true);
    // El operario de la parcela 2 ve el lote 2 y no el lote 1: la Libre la usan los dos, así que no la lee.
    await expect(getRecipeForEditor(capatazD, libreDeLaDivision)).rejects.toBeInstanceOf(TraceabilityAccessError);
    // Control: la Libre que usa SÓLO un lote de su parcela (el 3) sí la lee, así que el rechazo de arriba es del lote 1 y no de que no vea la parcela 2.
    expect((await getRecipeForEditor(capatazD, libreDeLaParcela2)).id).toBe(libreDeLaParcela2);
  });

  it("una Libre que ningún proceso usa no se abre a nadie, tampoco al administrador: no hay lote por el que autorizar (R8)", async () => {
    expect(
      await prisma.lotProcess.count({ where: { processRecipeVersion: { recipeId: libreSinProceso } } }),
      "control: ningún proceso la usa",
    ).toBe(0);
    await expect(getRecipeForEditor(admin, libreSinProceso)).rejects.toBeInstanceOf(TraceabilityAccessError);
    // Control: con un proceso que la use, el mismo administrador la abre.
    expect((await getRecipeForEditor(admin, libreDeA)).id).toBe(libreDeA);
  });
});

describe("listRecipeOrganizations: ofrece la organización a quien puede escribir sus recetas, aunque no opere sus lotes", () => {
  const ids = async (cuenta: string) => (await listRecipeOrganizations(cuenta)).map((o) => o.id);

  it("el Process Manager de cada finca ve la suya y no la ajena; el capataz, la de siempre; el visor, ninguna de las dos", async () => {
    const deGestorA = await ids(gestorA);
    expect(deGestorA).toContain(fincaA.orgId);
    expect(deGestorA, "el de la finca A no escribe en B").not.toContain(fincaB.orgId);
    const deGestorB = await ids(gestorB);
    expect(deGestorB).toContain(fincaB.orgId);
    expect(deGestorB, "el de la finca B no escribe en A").not.toContain(fincaA.orgId);
    // El camino de siempre, intacto.
    expect(await ids(capataz)).toContain(fincaA.orgId);
    // Y quien sólo ve lotes sigue sin que se le ofrezca ninguna.
    const deVisor = await ids(visor);
    expect(deVisor).not.toContain(fincaA.orgId);
    expect(deVisor).not.toContain(fincaB.orgId);
  });
});

describe("listRecipeOrganizations: el operario de UNA parcela ve su organización sea cual sea el lote que la base devuelva primero (F1-12)", () => {
  const ids = async (cuenta: string) => (await listRecipeOrganizations(cuenta)).map((o) => o.id);

  it("D tiene sus lotes en dos parcelas y un operario por parcela: a los dos se les ofrece D, y a ninguno una organización ajena", async () => {
    // Control del fixture: es el caso del orden. El lote 1 (parcela 1) se creó primero y los lotes 2 y 3 (parcela 2) después; cada operario opera una parcela y no la otra.
    expect(await prisma.lot.count({ where: { organizationId: fincaD.orgId } }), "control: D tiene tres lotes").toBe(3);
    // Un operario cuyo lote «primero» fuera de la otra parcela no se la veía ofrecida: al menos uno de los dos fallaba, según el orden físico de la tabla.
    expect(await ids(capatazD), "el de la parcela 2").toContain(fincaD.orgId);
    expect(await ids(capatazD1), "el de la parcela 1").toContain(fincaD.orgId);
    // Control: la organización ajena sigue cerrada para los dos.
    for (const cuenta of [capatazD, capatazD1]) {
      const lista = await ids(cuenta);
      expect(lista).not.toContain(fincaA.orgId);
      expect(lista).not.toContain(fincaB.orgId);
    }
    // Control: el administrador, que opera todo, las ve todas, D incluida.
    expect(await ids(admin)).toEqual(expect.arrayContaining([fincaA.orgId, fincaB.orgId, fincaD.orgId]));
  });

  it("la organización de un solo lote sigue ofreciéndose al que lo opera (el camino de siempre) y no al que sólo lo ve", async () => {
    expect(await ids(capataz)).toContain(fincaA.orgId);
    expect(await ids(visor)).not.toContain(fincaA.orgId);
  });
});

describe("listRecipes: cada cuenta ve las recetas de las organizaciones donde opera un lote o escribe recetas, y ninguna Libre", () => {
  it("quien opera sólo la finca A ve las recetas de A y las plantillas, y ninguna de otra organización (R7)", async () => {
    const lista = await listRecipes(capataz);
    const ids = lista.map((r) => r.id);
    expect(ids).toContain(recetaA);
    expect(ids, "las plantillas las ve quien opera").toContain(plantilla);
    expect(ids, "la de D es de otra organización").not.toContain(recetaD);
    expect(ids, "la de S es de otra organización").not.toContain(recetaS);
    expect(
      lista.filter((r) => r.organizationId !== null).every((r) => r.organizationId === fincaA.orgId),
      "sólo recetas de SU organización, y las plantillas",
    ).toBe(true);
    // Control: el administrador, que opera todo, las ve todas.
    const detodas = (await listRecipes(admin)).map((r) => r.id);
    expect(detodas).toEqual(expect.arrayContaining([recetaA, recetaD, recetaS, plantilla]));
  });

  it("el operario de UNA de las parcelas de una organización ve sus recetas, aunque la base devuelva primero el lote de la otra (R7)", async () => {
    const ids = (await listRecipes(capatazD)).map((r) => r.id);
    expect(ids).toContain(recetaD);
    expect(ids, "la de A es de otra organización").not.toContain(recetaA);
    expect(ids, "la de S es de otra organización").not.toContain(recetaS);
  });

  it("quien escribe recetas en una organización y opera otra ve las de las dos y ninguna más (R7)", async () => {
    // `mixto` escribe en A (el perfil de Process Manager) y opera la parcela 2 de D (el de operario): ni la de S, que ni escribe ni opera, ni todas.
    const ids = (await listRecipes(mixto)).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([recetaA, recetaD]));
    expect(ids, "la de S ni la escribe ni la opera").not.toContain(recetaS);
  });

  it("el Process Manager de la finca ve las recetas de su organización y ninguna más: ni la plantilla ni las de otras organizaciones", async () => {
    const lista = await listRecipes(gestorA);
    const ids = lista.map((r) => r.id);
    expect(ids).toContain(recetaA);
    expect(ids, "la plantilla es de plataforma").not.toContain(plantilla);
    expect(ids, "la de S es de otra organización").not.toContain(recetaS);
    expect(ids, "la de D es de otra organización").not.toContain(recetaD);
    expect(lista.every((r) => r.organizationId === fincaA.orgId), "sólo recetas de SU organización").toBe(true);
    // Control: el Process Manager de plataforma escribe todas, y las ve.
    const detodas = (await listRecipes(gestorDePlataforma)).map((r) => r.id);
    expect(detodas).toEqual(expect.arrayContaining([recetaA, recetaD, recetaS, plantilla]));
  });

  it("un Process Manager cuya organización todavía no tiene recetas ve una lista vacía, no un rechazo", async () => {
    // La finca B no tiene ninguna receta y el gestor de B puede escribirlas: es la primera vez que entra a la pantalla.
    expect(await listRecipes(gestorB)).toEqual([]);
  });

  it("el Project Viewer sigue sin leer; el Platform Admin, que opera todo, sigue viéndolas todas", async () => {
    await expect(listRecipes(visor)).rejects.toBeInstanceOf(TraceabilityAccessError);
    const deAdmin = (await listRecipes(admin)).map((r) => r.id);
    expect(deAdmin).toEqual(expect.arrayContaining([recetaA, recetaD, recetaS, plantilla]));
  });

  it("no trae ninguna receta Libre, ni a quien opera ni a quien escribe; la misma receta, sin marcar, sí sale (R8)", async () => {
    const { recipeId } = await recetaPublicada("para marcar Libre", fincaA.orgId);
    const ids = async (cuenta: string) => (await listRecipes(cuenta)).map((r) => r.id);
    // Control: sin marcar, la lista la trae —a quien opera la finca y a quien escribe sus recetas—; si no, «no sale» podría ser una lista que no ve nada.
    expect(await ids(admin)).toContain(recipeId);
    expect(await ids(capataz)).toContain(recipeId);
    expect(await ids(gestorA)).toContain(recipeId);
    await prisma.processRecipe.update({ where: { id: recipeId }, data: { esLibre: true } });
    for (const cuenta of [admin, capataz, gestorA, gestorDePlataforma]) {
      expect(await ids(cuenta)).not.toContain(recipeId);
    }
    // Y la Libre del fixture, que tiene un proceso de un lote de A, tampoco.
    expect(await ids(admin)).not.toContain(libreDeA);
  });
});

describe("puedeCrearRecetaEnAlguna: el Process Manager de una finca, que no opera lotes, sí", () => {
  it("lo ve el de la finca A, que ahora alcanza su organización por la lectura; el visor no", async () => {
    expect(await puedeCrearRecetaEnAlguna(gestorA)).toBe(true);
    expect(await puedeCrearRecetaEnAlguna(visor)).toBe(false);
  });
});
