/**
 * La receta Libre — Parte 2a, §5.2 (tarea 10 del plan, 2026-10-03; re-anclada el 2026-10-04 con las decisiones del controlador).
 *
 * «Puedo escoger un proceso o inventar un proceso, pero debo mantenerlo dentro de su receta; no se improvisa constante: se define y
 * se ejecuta» (Daniel). Abrir con «Libre» crea, dentro de la transacción de `abrirProceso`, una receta `esLibre` PUBLICADA de la
 * organización del lote, con los pasos planeados, y abre el proceso con ella. Esta prueba mira: que la crea bien (nombre, estado,
 * pasos, fases, auditoría); que exige intención, pasos y grado; que una Libre ya hecha no se elige por su id; el control de
 * parecido contra las recetas que la organización puede usar, con sus alcances; que abrir con una Libre exige `lot:manage` y NO la
 * autoría de recetas (V13); y que un choque de nombre, una apertura que falla después de crear la receta y dos aperturas a la vez
 * no dejan una receta huérfana ni se leen como lo que no son. Y, de la revisión del 2026-10-05: que la Libre hereda la clasificación
 * de su lote y recorta la intención en el nombre sin perderla de la descripción (R8); que no acepta más de `MAX_PASOS_PLANEADOS` pasos
 * ni un fin con lectura de cierre (R6); y que `escribirPasosPlaneados` sólo escribe en la versión sin pasos de una receta Libre (R14).
 *
 * **Autorización (Ruling INV): nada se protege por comentario.** Cada puerta nueva se prueba con la cuenta que NO debe, con su control y
 * su flip: abrir con Libre sin gestionar el lote (quien sólo escribe recetas, quien no tiene nada, quien gestiona OTRA organización),
 * la pregunta del parecido por las mismas tres cuentas, el ORDEN de las comprobaciones (el acceso al lote va antes que cualquier
 * validación de la Libre; la organización de la receta va antes que su marca de Libre) y los dos únicos llamadores de las puertas que no
 * autorizan por sí mismas (`tests/arquitectura/pasos-planeados-un-solo-camino.test.ts`).
 *
 * **Cada rechazo lleva su control al lado, y el control cambia SÓLO lo que el rechazo mira**: la misma entrada con la intención, los
 * pasos o el grado que faltaban; la misma receta pasada a la organización, desarchivada o publicada. Así un rechazo que saliera por
 * otra razón no podría pasar por éste. Y cada rechazo comprueba que NO dejó nada escrito: ni receta Libre, ni proceso.
 *
 * **Unicidad de los planes.** Ya no hay un mucílago único por caso: sólo existen seis tramos (0, 10, 25, 50, 75 y 100; Ruling M).
 * Las recetas de cada caso se distinguen por la TEMPERATURA MÍNIMA de su fermentación, ÚNICA en este archivo (de 21,1 a 22,6 °C), que
 * es una columna de la huella del parecido (`temperaturaMinC`); la Libre «distinta» lleva un rango (13,25–15,75 °C) que ninguna
 * receta real tiene. Así ningún caso se parece a otro ni a una plantilla que la base ya traiga o que la Parte 3 siembre después.
 *
 * **Usuarios.** `gestor` es un Farm Operator acotado a su finca (`lot:manage`, SIN la autoría de recetas): el que abre procesos.
 * `autor` es un Coffee Process Manager de plataforma (V16): escribe las recetas «publicadas» con las puertas de la tarea 3, que sí
 * piden la autoría, y NO lleva `lot:manage`: no abre procesos. `intruso` no tiene ninguna asignación. (Desde V16 la autoría no
 * pide ningún lote: una receta de otra organización se escribe sin tener un lote suyo.) `admin` es el Platform Admin sembrado, el
 * mismo que busca la prueba de autoría de la tarea 3 (R8): limpia `confidential` y `trade_secret`, que el operario no, y sólo abre
 * los lotes de esas clasificaciones. `loteAjeno` es de OTRA organización y de otra finca: `gestor` no lo gestiona.
 *
 * **Limpieza** en `afterAll`, nunca debajo de las aserciones, y en orden de claves ajenas: los procesos primero
 * (`process_recipe_version_id` es RESTRICT); después las recetas Libre (`parecida_a_version_id` es RESTRICT hacia la versión con la
 * que coincidieron: tienen que irse antes que ella); después todas las demás, con sus hijas; y al final lotes, cuentas y
 * organizaciones (`process_recipe.organization_id` es RESTRICT desde la tarea 1: una receta que sobreviviera impediría borrarla).
 * **Descubre lo que borra por el RUN y por las organizaciones de la corrida**, no por lo que el `beforeAll` o los `it` guardaron en
 * variables (un `beforeAll` que muere a mitad deja esas variables sin asignar), y cuenta al final lo que queda; sus controles valen
 * para cualquier subconjunto de pruebas (`-t`).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { Prisma } from "../../generated/prisma/client";
import type { ClassificationLevel, ProvenanceClass } from "../../generated/prisma/client";
import { abrirProceso, traducirP2002DeApertura } from "../../lib/traceability/lotProcess";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { exigeAutoriaDeReceta } from "../../lib/recetas/autoria";
import { RecipeError } from "../../lib/recetas/errorDeReceta";
import { parecidoDeLaLibre, type LibreAlAbrir } from "../../lib/recetas/libre";
import { MAX_INTENCION_EN_EL_NOMBRE, MAX_PASOS_PLANEADOS, nombreDeLaLibre } from "../../lib/recetas/parecido";
import { agregarPaso, escribirPasosPlaneados, publicarVersion, validarPasosPlaneados, type PasoEditable } from "../../lib/recetas/pasos";
import { EJES_POR_TIPO_DE_PASO, FASE_DEL_TIPO, type TipoDePaso } from "../../lib/recetas/vocabulario";
import { crearRecetaEnBorrador } from "../../lib/recetas/versiones";
import { listRecipeVersionsForLot } from "../../lib/traceability/processTargets";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";

const RUN = `libre-${Date.now()}`;
const FECHA = new Date("2026-03-01T12:00:00Z");
/** La intención por defecto de cada apertura: lleva el RUN, y con él lo lleva el NOMBRE de la receta Libre (limpieza y recuento). */
const INTENCION = `probar una fermentación corta ${RUN}`;
const cuentas = fabricaDeCuentas("Libre");

let autor: string;
let gestor: string;
let intruso: string;
let admin: string;
let orgId: string;
let otraOrgId: string;
let plotId: string;
let plotAjenoId: string;
let scopeId: string;
let gradoId: string;
let cerezaId: string;
const lotes: string[] = [];
/** Cada paso que se creó, también los que una prueba quitó después: su auditoría cuelga de su id. */
const pasosCreados: string[] = [];

const codigoDe = (codigo: string) => `${codigo}-${RUN}`;

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}

/** Un lote de la corrida; `deOtraOrg` lo pone en la OTRA organización y en su finca, donde `gestor` no tiene nada. */
async function lote(codigo: string, classification: ClassificationLevel = "internal", deOtraOrg = false) {
  const id = (
    await prisma.lot.create({
      data: {
        lotCode: codigoDe(codigo),
        lotType: "cherry",
        organizationId: deOtraOrg ? otraOrgId : orgId,
        locationId: deOtraOrg ? plotAjenoId : plotId,
        status: "approved",
        classification,
        createdBy: gestor,
      },
    })
  ).id;
  lotes.push(id);
  return id;
}

async function valorDe(catalogo: string, value: string): Promise<string> {
  return (
    await prisma.variableCatalogValue.findFirstOrThrow({ where: { value, catalog: { key: catalogo } }, select: { id: true } })
  ).id;
}

async function pasoDe(tipo: TipoDePaso, extra: Omit<PasoEditable, "stepTypeValueId"> = {}): Promise<PasoEditable> {
  return { stepTypeValueId: await valorDe("tipo_paso", tipo), ...extra };
}

/**
 * Cuatro pasos «de Lavado»: despulpa, fermenta, lava (mucílago objetivo 0: Lavado) y seca. `minC` es lo que distingue una receta de
 * otra en este archivo (la temperatura mínima de la fermentación: única por caso; ver la cabecera). El secado lleva horas, volteo y
 * banda de humedad: la afinación que NO es identidad y que las pruebas cambian a propósito.
 */
async function lavado(minC: number): Promise<PasoEditable[]> {
  return [
    await pasoDe("pulping", { estadoFrutoValueId: await valorDe("estado_cereza", "entera") }),
    await pasoDe("fermentation", { temperaturaMinC: minC, temperaturaMaxC: 30, horasMin: 12, horasSugeridas: 18, horasMax: 24 }),
    await pasoDe("washing", { mucilagoObjetivo: 0, medioValueId: await valorDe("medio_lavado", "agua_limpia") }),
    await pasoDe("drying", { modoSecado: "african_bed_outdoor", horasSugeridas: 120, volteoCadaHoras: 4, humedadMinPct: 10, humedadMaxPct: 12 }),
  ];
}

/** Un plan que no se parece a ninguna receta: despulpa, fermenta entre 13,25 y 15,75 °C y seca bajo techo. */
async function distinto(): Promise<PasoEditable[]> {
  return [
    await pasoDe("pulping", { estadoFrutoValueId: await valorDe("estado_cereza", "entera") }),
    await pasoDe("fermentation", { temperaturaMinC: 13.25, temperaturaMaxC: 15.75, horasMin: 24, horasSugeridas: 48, horasMax: 72 }),
    await pasoDe("drying", { modoSecado: "covered_patio", horasSugeridas: 120, volteoCadaHoras: 4, humedadMinPct: 10, humedadMaxPct: 12 }),
  ];
}

/**
 * Una receta PUBLICADA con sus pasos, escrita por el servicio de la tarea 3 con el Coffee Process Manager (la misma puerta que usa
 * un editor de recetas). Sin `publicada: false`, la deja publicada; con ella, en borrador. `nombreExacto` es para la que se llama
 * «Libre» a secas.
 */
async function receta(
  nombre: string,
  pasos: readonly PasoEditable[],
  datos: { organizationId?: string | null; publicada?: boolean; nombreExacto?: string } = {},
) {
  const r = await crearRecetaEnBorrador(autor, {
    name: datos.nombreExacto ?? `LIBRE ${nombre} ${RUN}`,
    organizationId: datos.organizationId === undefined ? orgId : datos.organizationId,
  });
  const versionId = r.versionId;
  for (const [i, paso] of pasos.entries()) {
    const creado = await agregarPaso(autor, { recipeVersionId: versionId, despuesDeSeq: i === 0 ? null : i, paso });
    pasosCreados.push(creado.id);
  }
  if (datos.publicada !== false) await publicarVersion(autor, versionId);
  return { recipeId: r.recipeId, versionId };
}

/**
 * Una receta publicada SIN pasos, como las `approved` de antes de la 2a (que no se tocan): ya no se puede publicar una así por el
 * servicio (`version_sin_pasos`), así que se escribe cruda.
 */
async function recetaVieja(nombre: string) {
  const r = await prisma.processRecipe.create({
    data: { name: `LIBRE ${nombre} ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor },
  });
  const v = await prisma.processRecipeVersion.create({ data: { recipeId: r.id, version: 1, status: "approved", createdBy: gestor } });
  return { recipeId: r.id, versionId: v.id };
}

/**
 * Una receta Libre con su versión 1 PUBLICADA y SIN pasos: lo que `crearRecetaLibreEnTx` deja justo antes de llamar a
 * `escribirPasosPlaneados` (R14). Se escribe cruda, sin abrir ningún proceso; lleva el RUN en el nombre y es de la organización que se
 * diga (la del lote por omisión), así que la limpieza de `afterAll` la encuentra por las dos.
 */
async function libreVacia(organizationId: string = orgId): Promise<string> {
  const r = await prisma.processRecipe.create({
    data: {
      name: `LIBRE vacía ${randomUUID().slice(0, 8)} ${RUN}`,
      organizationId,
      status: "approved",
      esLibre: true,
      createdBy: gestor,
      versions: { create: { version: 1, status: "approved", createdBy: gestor } },
    },
    include: { versions: { select: { id: true } } },
  });
  return r.versions[0]!.id;
}

type Extra = {
  intent?: string;
  provenanceClass?: ProvenanceClass;
  processGradeValueId?: string;
  processRecipeVersionId?: string;
  /** Quién abre: el operario por defecto. */
  quien?: string;
};

/** Abre con la entrada mínima y válida: de una prueba a otra sólo cambian el lote, la Libre y, a veces, un campo de `extra`. */
const abrirLibre = (lotId: string, libre: LibreAlAbrir, extra: Extra = {}) =>
  abrirProceso(extra.quien ?? gestor, {
    lotId,
    intent: extra.intent ?? INTENCION,
    targetMoisturePct: 11,
    startedAt: FECHA,
    provenanceClass: extra.provenanceClass ?? "original_record",
    processGradeValueId: extra.processGradeValueId ?? gradoId,
    cherryStateValueId: cerezaId,
    processRecipeVersionId: extra.processRecipeVersionId ?? null,
    libre,
  });

/** Abre con una receta publicada elegida por su id, sin Libre: la forma de siempre. */
const abrirConReceta = (lotId: string, processRecipeVersionId: string) =>
  abrirProceso(gestor, {
    lotId,
    intent: INTENCION,
    targetMoisturePct: 11,
    startedAt: FECHA,
    provenanceClass: "original_record",
    processGradeValueId: gradoId,
    cherryStateValueId: cerezaId,
    processRecipeVersionId,
  });

const libresDeLaOrg = (organizationId: string = orgId) =>
  prisma.processRecipe.count({ where: { organizationId, esLibre: true, name: { contains: RUN } } });
const procesosDe = (lotId: string) => prisma.lotProcess.count({ where: { lotId } });

/** La receta de la que es versión `processRecipeVersionId`. */
async function recetaDeLaVersion(processRecipeVersionId: string | null) {
  const v = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: processRecipeVersionId! }, select: { recipeId: true } });
  return prisma.processRecipe.findUniqueOrThrow({ where: { id: v.recipeId } });
}

/** Rechaza con un error de ESA clase y ESE código: la clase y el mensaje, no sólo el mensaje. */
async function rechaza(promesa: Promise<unknown>, codigo: string, clase: typeof RecipeError | typeof LotProcessError = RecipeError) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `esperaba ${clase.name}("${codigo}") y no lanzó nada`).not.toBeNull();
  expect(error, `esperaba ${clase.name}("${codigo}"), lanzó ${String(error)}`).toBeInstanceOf(clase);
  expect((error as Error).message).toBe(codigo);
}

/** Rechaza con un `Error` común —una invariante rota de quien llama, no algo que una persona provoque— cuyo mensaje dice `fragmento`. */
async function rechazaConMensaje(promesa: Promise<unknown>, fragmento: string) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `esperaba un Error que dijera «${fragmento}» y no lanzó nada`).not.toBeNull();
  expect(error, `esperaba un Error, lanzó ${String(error)}`).toBeInstanceOf(Error);
  expect((error as Error).message, `lanzó otro mensaje: ${(error as Error).message}`).toContain(fragmento);
}

/** Borra todo lo de las recetas que cumplan `donde`, en orden de claves ajenas. Devuelve los ids, para contar después. */
async function borrarRecetas(donde: Prisma.ProcessRecipeWhereInput) {
  const recetaIds = (await prisma.processRecipe.findMany({ where: assertDefinedWhere(donde), select: { id: true } })).map((r) => r.id);
  const versionIds = (
    await prisma.processRecipeVersion.findMany({ where: assertDefinedWhere({ recipeId: { in: recetaIds } }), select: { id: true } })
  ).map((v) => v.id);
  const pasoIds = (
    await prisma.processRecipeStep.findMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }), select: { id: true } })
  ).map((p) => p.id);
  const todosLosPasos = [...new Set([...pasoIds, ...pasosCreados])];
  // Una Libre cita con `parecida_a_version_id` (RESTRICT) la versión con la que coincidió. Con la regla bien puesta cita sólo versiones de
  // recetas que NO son Libre, y éstas se borran después; pero con la regla rota (el flip de `esLibre: false` en `buscarParecida`) una Libre cita
  // a OTRA Libre de la misma corrida, y borrar las versiones antes que las recetas choca con su propia RESTRICT, aborta el `afterAll` y deja
  // la corrida entera en la base (medido: 29 recetas, 29 lotes, 2 organizaciones y 3 cuentas). La limpieza suelta esas citas primero, para que
  // no dependa de que el código que prueba esté sano.
  await prisma.processRecipe.updateMany({
    where: assertDefinedWhere({ id: { in: recetaIds }, parecidaAVersionId: { not: null } }),
    data: { parecidaAVersionId: null },
  });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...recetaIds, ...versionIds, ...todosLosPasos] } }) });
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
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  otraOrgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST otra ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  plotAjenoId = (
    await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ajeno ${RUN}`, organizationId: otraOrgId, status: "approved", classification: "internal" } })
  ).id;
  gestor = await cuenta("Gestor");
  intruso = await cuenta("Intruso");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  autor = await cuentas.cuenta("Coffee Process Manager", "plataforma");
  // R8: el Platform Admin SEMBRADO (no se crea ni se borra aquí: es de la base, y la prueba de autoría de la tarea 3 lo busca igual).
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;
  const [g, c] = await Promise.all([
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
  ]);
  gradoId = g.id;
  cerezaId = c.id;
}, 60000);

afterAll(async () => {
  // Todo se DESCUBRE por el RUN y por las organizaciones de esta corrida (regla 3 del PR-B): un `beforeAll` que murió a mitad, o un
  // subconjunto de pruebas (`-t`), dejan sin asignar las variables de arriba, y una limpieza que dependiera de ellas no limpiaría.
  const organizaciones = (
    await prisma.organization.findMany({ where: assertDefinedWhere({ name: { contains: RUN } }), select: { id: true } })
  ).map((o) => o.id);
  const lotesDeLaCorrida = (
    await prisma.lot.findMany({
      where: assertDefinedWhere({ OR: [{ lotCode: { endsWith: RUN } }, { organizationId: { in: organizaciones } }] }),
      select: { id: true },
    })
  ).map((l) => l.id);
  // Se cuentan ahora y se AFIRMAN al final, debajo de toda la limpieza: un control que lanzara aquí abandonaría el resto del `afterAll`.
  const organizacionesVistas = organizaciones.length;
  await borrarProcesosDeLotesDonde({ id: { in: lotesDeLaCorrida } });
  const deEstaCorrida: Prisma.ProcessRecipeWhereInput = {
    OR: [{ name: { contains: RUN } }, { organizationId: { in: organizaciones } }],
  };
  await borrarRecetas({ AND: [{ esLibre: true }, deEstaCorrida] });
  const ids = await borrarRecetas(deEstaCorrida);
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotesDeLaCorrida } }) });
  // Lo que escribieron las dos cuentas y no colgaba de nada de arriba (los eventos de las metas, los de la apertura). Antes de
  // borrarlas: el actor es SET NULL y después no se encontrarían.
  const personas = (
    await prisma.person.findMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }), select: { id: true } })
  ).map((p) => p.id);
  const cuentasDeLaCorrida = (
    await prisma.userAccount.findMany({ where: assertDefinedWhere({ personId: { in: personas } }), select: { id: true } })
  ).map((u) => u.id);
  const deSusUbicaciones: Prisma.ScopeWhereInput = { scopeType: "location", scopeRefId: { in: await ubicacionesDe(organizaciones) } };
  const ambitos = (await prisma.scope.findMany({ where: assertDefinedWhere(deSusUbicaciones), select: { id: true } })).map((s) => s.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: [...cuentasDeLaCorrida, ...(autor ? [autor] : [])] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId: { in: ambitos } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentasDeLaCorrida } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await cuentas.limpiar();
  await prisma.location.deleteMany({ where: assertDefinedWhere({ organizationId: { in: organizaciones } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });
  // Lo que quede es basura de ESTA corrida: se cuenta por el RUN y por las organizaciones, no por lo que se guardó en variables.
  // Control: las consultas de arriba SÍ veían filas (las dos organizaciones del `beforeAll`, siempre, sea cual sea el subconjunto de
  // pruebas); con 0 todos los ceros de abajo no habrían mirado nada.
  expect(organizacionesVistas, "control: la limpieza veía las dos organizaciones de la corrida").toBe(2);
  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } }), "quedan recetas de esta corrida").toBe(0);
  expect(await prisma.processRecipe.count({ where: { organizationId: { in: organizaciones } } }), "quedan recetas de sus organizaciones").toBe(0);
  expect(await prisma.processRecipeStep.count({ where: { id: { in: ids.pasoIds } } }), "quedan pasos de esta corrida").toBe(0);
  expect(await prisma.lot.count({ where: { lotCode: { endsWith: RUN } } }), "quedan lotes de esta corrida").toBe(0);
  expect(await prisma.lotProcess.count({ where: { lotId: { in: lotesDeLaCorrida } } }), "quedan procesos de esta corrida").toBe(0);
  expect(await prisma.organization.count({ where: { name: { contains: RUN } } }), "quedan organizaciones de esta corrida").toBe(0);
  expect(await prisma.person.count({ where: { displayName: { contains: RUN } } }), "quedan personas de esta corrida").toBe(0);
}, 60000);

/** Las ubicaciones de las organizaciones dadas: de ellas cuelgan los ámbitos que la corrida creó. */
async function ubicacionesDe(organizaciones: string[]): Promise<string[]> {
  return (
    await prisma.location.findMany({ where: assertDefinedWhere({ organizationId: { in: organizaciones } }), select: { id: true } })
  ).map((l) => l.id);
}

describe("control: lo que estas pruebas suponen de la tarea 2", () => {
  it("control: la tabla de la tarea 2 admite los ejes que estas pruebas usan, y la base tiene sus valores", async () => {
    expect(EJES_POR_TIPO_DE_PASO.washing).toEqual(expect.arrayContaining(["mucilagoObjetivo", "medio"]));
    expect(EJES_POR_TIPO_DE_PASO.washing, "«washing» admite el modo de secado: el rechazo de eje_no_aplica ya no discrimina").not.toContain("modoSecado");
    expect(EJES_POR_TIPO_DE_PASO.drying).toContain("modoSecado");
    expect(EJES_POR_TIPO_DE_PASO.fermentation, "la temperatura es lo que distingue una receta de otra en este archivo").toContain("temperatura");
    expect(EJES_POR_TIPO_DE_PASO.pulping).toContain("estadoFruto");
    expect(FASE_DEL_TIPO.drying).toBe("drying");
    expect(FASE_DEL_TIPO.fermentation).toBe("fermentation");
    for (const tipo of ["pulping", "washing", "drying", "fermentation", "reception"]) await valorDe("tipo_paso", tipo);
    await valorDe("estado_cereza", "entera");
    await valorDe("medio_lavado", "agua_limpia");
    await valorDe("medio_lavado", "mosto_propio");
  });
});

describe("Parte 2a, §5.2 — abrir con «Libre» define una receta pequeña y abre el proceso con ella", () => {
  it("abrir con Libre crea una receta Libre PUBLICADA, propia de la organización y con su nombre; el proceso abre con ella", async () => {
    const l = await lote("A1");
    const antes = await libresDeLaOrg();
    const pasos = await distinto();
    const proceso = await abrirLibre(l, { pasos });
    expect(await libresDeLaOrg(), "no se creó UNA receta Libre").toBe(antes + 1);
    expect(proceso.processRecipeVersionId, "el proceso no se abrió con una receta").not.toBeNull();

    const version = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: proceso.processRecipeVersionId! } });
    const nueva = await prisma.processRecipe.findUniqueOrThrow({ where: { id: version.recipeId } });
    expect(nueva.esLibre, "la marca de una Libre es la columna").toBe(true);
    expect(nueva.organizationId, "una Libre es propia de la organización del lote").toBe(orgId);
    expect(nueva.status).toBe("approved");
    expect(nueva.name, "el nombre es «Libre — <intención> — <código del lote> <fecha>»").toBe(`Libre — ${INTENCION} — ${codigoDe("A1")} 2026-03-01`);
    expect(nueva.description).toBe(INTENCION);
    expect(nueva.createdBy).toBe(gestor);
    expect(nueva.parecidaAVersionId, "sin coincidencia no se guarda con qué").toBeNull();
    expect(nueva.motivoDeLibre).toBeNull();
    expect(nueva.classification, "la Libre de un lote `internal` es `internal` (R8: las otras clasificaciones, más abajo)").toBe("internal");
    expect([version.version, version.status], "la versión nace PUBLICADA: una Libre no se edita ni se espera a publicar").toEqual([1, "approved"]);

    // Los pasos planeados, en su orden, con lo que se escribió.
    const filas = await prisma.processRecipeStep.findMany({
      where: { recipeVersionId: version.id },
      orderBy: { seq: "asc" },
      select: { seq: true, stepTypeValueId: true, modoSecado: true },
    });
    expect(filas.map((f) => f.seq)).toEqual([1, 2, 3]);
    expect(filas.map((f) => f.stepTypeValueId)).toEqual(pasos.map((p) => p.stepTypeValueId));
    expect(filas[2]!.modoSecado).toBe("covered_patio");

    // Las fases, derivadas como al publicar (diseño §3.1): una por fase, de su primer paso.
    const fases = await prisma.processRecipePhase.findMany({ where: { recipeVersionId: version.id } });
    const fase = (nombre: string) => fases.find((f) => f.phase === nombre);
    expect(fases, "una fase por tipo de fase: fermentación y secado").toHaveLength(2);
    expect([fase("fermentation")?.expectedHours, fase("fermentation")?.turnEveryHours]).toEqual([48, null]);
    expect([
      fase("drying")?.expectedHours,
      fase("drying")?.turnEveryHours,
      Number(fase("drying")?.targetMoistureMinPct),
      Number(fase("drying")?.targetMoistureMaxPct),
    ]).toEqual([120, 4, 10, 12]);

    // La auditoría de la receta, escrita con quien la creó.
    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "process_recipe", entityId: nueva.id, operation: "process_recipe.create", actorUserAccountId: gestor },
    });
    expect(evento, "la creación de la Libre no dejó su evento de auditoría").not.toBeNull();
    expect(evento!.sourceInterface).toBe("recetas.libre");
  }, 60000);

  it("sin intención no se abre una Libre (`intent_required`); con intención, la misma entrada abre", async () => {
    const l = await lote("R1");
    const antes = await libresDeLaOrg();
    await rechaza(abrirLibre(l, { pasos: await distinto() }, { intent: "   " }), "intent_required", LotProcessError);
    expect(await libresDeLaOrg(), "un rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "un rechazo dejó un proceso").toBe(0);
    // Control: lo único que cambia es la intención.
    expect((await abrirLibre(l, { pasos: await distinto() })).processRecipeVersionId).not.toBeNull();
  });

  it("sin pasos planeados no se abre una Libre (`libre_sin_pasos`); con pasos, abre", async () => {
    const l = await lote("R2");
    const antes = await libresDeLaOrg();
    await rechaza(abrirLibre(l, { pasos: [] }), "libre_sin_pasos");
    expect(await libresDeLaOrg(), "un rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "un rechazo dejó un proceso").toBe(0);
    // Control: lo único que cambia son los pasos.
    expect((await abrirLibre(l, { pasos: await distinto() })).processRecipeVersionId).not.toBeNull();
  });

  it("sin grado no se abre una Libre (`process_grade_required`); con grado, abre", async () => {
    const l = await lote("R3");
    const antes = await libresDeLaOrg();
    await rechaza(abrirLibre(l, { pasos: await distinto() }, { processGradeValueId: "" }), "process_grade_required", LotProcessError);
    expect(await libresDeLaOrg(), "un rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "un rechazo dejó un proceso").toBe(0);
    // Control: lo único que cambia es el grado.
    expect((await abrirLibre(l, { pasos: await distinto() })).processRecipeVersionId).not.toBeNull();
  });

  it("una Libre y una receta a la vez no se abren (`libre_con_receta`); cada una por separado, sí", async () => {
    const publicada = await receta("con receta", await lavado(21.1));
    const l1 = await lote("MIX1");
    const antes = await libresDeLaOrg();
    await rechaza(abrirLibre(l1, { pasos: await distinto() }, { processRecipeVersionId: publicada.versionId }), "libre_con_receta");
    expect(await procesosDe(l1), "el rechazo dejó un proceso").toBe(0);
    expect(await libresDeLaOrg(), "el rechazo dejó una receta Libre").toBe(antes);
    // Control 1: la Libre sola, sobre el mismo lote.
    expect((await abrirLibre(l1, { pasos: await distinto() })).processRecipeVersionId).not.toBeNull();
    // Control 2: la receta sola, sobre otro lote, abre con ELLA y no crea ninguna Libre.
    const l2 = await lote("MIX2");
    const conReceta = await abrirConReceta(l2, publicada.versionId);
    expect(conReceta.processRecipeVersionId).toBe(publicada.versionId);
    expect(await libresDeLaOrg(), "abrir con una receta publicada creó una Libre").toBe(antes + 1);
  }, 60000);

  it("un paso que su tipo no admite se rechaza con el código de la receta y no deja nada escrito; sin ese eje, abre", async () => {
    const l = await lote("R4");
    const antes = await libresDeLaOrg();
    // «washing» no admite el modo de secado (control en el primer `it`).
    await rechaza(
      abrirLibre(l, { pasos: [await pasoDe("washing", { mucilagoObjetivo: 25, modoSecado: "african_bed_outdoor" })] }),
      "eje_no_aplica",
    );
    expect(await libresDeLaOrg(), "un rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "un rechazo dejó un proceso").toBe(0);
    // Control: el mismo paso sin ese eje.
    expect((await abrirLibre(l, { pasos: [await pasoDe("washing", { mucilagoObjetivo: 25 })] })).processRecipeVersionId).not.toBeNull();
  });

  it("un mucílago que no es uno de los seis tramos se rechaza (`mucilago_fuera_de_tramos`); un tramo, abre", async () => {
    const l = await lote("R5");
    const antes = await libresDeLaOrg();
    await rechaza(abrirLibre(l, { pasos: [await pasoDe("washing", { mucilagoObjetivo: 40 })] }), "mucilago_fuera_de_tramos");
    expect(await libresDeLaOrg(), "un rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "un rechazo dejó un proceso").toBe(0);
    // Control: lo único que cambia es el valor, que ahora es un tramo (0 = Lavado, 100 = Honey; Ruling M).
    expect((await abrirLibre(l, { pasos: [await pasoDe("washing", { mucilagoObjetivo: 75 })] })).processRecipeVersionId).not.toBeNull();
  });

  it("una Libre ya hecha NO se elige por su id (`receta_libre_no_se_elige`); una receta publicada común, sí", async () => {
    const l1 = await lote("ELIG1");
    const primera = await abrirLibre(l1, { pasos: await distinto() });
    const libreVersionId = primera.processRecipeVersionId!;
    // Control de lo que NO rechaza esto: la Libre es de esta organización, está publicada y su receta está viva. Sólo su marca la
    // distingue de una receta que sí se elige.
    const v = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: libreVersionId }, include: { recipe: true } });
    expect([v.status, v.recipe.status, v.recipe.organizationId, v.recipe.esLibre]).toEqual(["approved", "approved", orgId, true]);

    const l2 = await lote("ELIG2");
    const antes = await libresDeLaOrg();
    await rechaza(abrirConReceta(l2, libreVersionId), "receta_libre_no_se_elige", LotProcessError);
    expect(await procesosDe(l2), "el rechazo dejó un proceso").toBe(0);
    expect(await libresDeLaOrg(), "el rechazo dejó una receta Libre").toBe(antes);
    // Control: una receta publicada común, sobre el mismo lote, abre con ella.
    const comun = await receta("elegible", await lavado(22.5));
    expect((await abrirConReceta(l2, comun.versionId)).processRecipeVersionId).toBe(comun.versionId);
  }, 60000);

  it("el orden: la organización de la receta va ANTES que su marca de Libre (la Libre de otra organización sigue siendo «de otra organización»)", async () => {
    const l = await lote("ORDEN-ORG");
    const ajena = await libreVacia(otraOrgId);
    const propia = await libreVacia(orgId);
    const antes = await libresDeLaOrg();
    // La que el rechazo ve: una Libre de OTRA organización. Antes de decir que es Libre, dice de quién es.
    await rechaza(abrirConReceta(l, ajena), "receta_de_otra_organizacion", LotProcessError);
    // Control: la Libre PROPIA, con el resto idéntico (publicada, viva, mismo lote), sí llega a su marca.
    await rechaza(abrirConReceta(l, propia), "receta_libre_no_se_elige", LotProcessError);
    expect(await procesosDe(l), "un rechazo dejó un proceso").toBe(0);
    expect(await libresDeLaOrg(), "un rechazo creó una receta Libre").toBe(antes);
  }, 60000);

  it("abrir con Libre exige `lot:manage` y NO la autoría de recetas (V13): el operario abre; quien sólo escribe recetas, no", async () => {
    // Los dos controles de quién es quién: el operario NO tiene la autoría (el permiso del Coffee Process Manager) y el autor SÍ.
    // Sin ellos, «abre» o «no abre» podría ser de cualquier otra cosa.
    await expect(exigeAutoriaDeReceta(gestor, orgId), "control: el operario NO tiene la autoría").rejects.toThrow(
      new RecipeError("sin_permiso_de_autoria"),
    );
    await expect(exigeAutoriaDeReceta(autor, orgId), "control: el autor SÍ la tiene").resolves.toBeUndefined();
    // El operario abre su Libre sin la autoría.
    const l = await lote("PERM1");
    expect((await abrirLibre(l, { pasos: await distinto() })).processRecipeVersionId, "el operario no abrió su Libre").not.toBeNull();
    // Quien sólo tiene la autoría no gestiona el lote: abrir es operar, y escribir recetas no es operar. No deja nada escrito.
    const l2 = await lote("PERM2");
    const antes = await libresDeLaOrg();
    await expect(abrirLibre(l2, { pasos: await distinto() }, { quien: autor })).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await procesosDe(l2), "el rechazo dejó un proceso").toBe(0);
    expect(await libresDeLaOrg(), "el rechazo dejó una receta Libre").toBe(antes);
    // Y quien no tiene nada, tampoco.
    await expect(abrirLibre(l2, { pasos: await distinto() }, { quien: intruso })).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await procesosDe(l2), "el rechazo del intruso dejó un proceso").toBe(0);
    expect(await libresDeLaOrg(), "el rechazo del intruso dejó una receta Libre").toBe(antes);
  }, 60000);

  it("quien gestiona OTRA organización no abre una Libre en ésta, y no deja una receta en ninguna de las dos; el administrador de plataforma, sí", async () => {
    const ajeno = await lote("AJENO", "internal", true);
    const antesPropia = await libresDeLaOrg(orgId);
    const antesAjena = await libresDeLaOrg(otraOrgId);
    // `gestor` gestiona su finca (de `orgId`) y nada de `otraOrgId`.
    await expect(abrirLibre(ajeno, { pasos: await distinto() }, { quien: gestor })).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await procesosDe(ajeno), "el rechazo dejó un proceso").toBe(0);
    expect(await libresDeLaOrg(orgId), "el rechazo dejó una Libre en la organización de quien abre").toBe(antesPropia);
    expect(await libresDeLaOrg(otraOrgId), "el rechazo dejó una Libre en la organización del lote").toBe(antesAjena);
    // Control: el mismo lote, la misma entrada, quien SÍ lo gestiona (el administrador de plataforma): abre, y la Libre es de la
    // organización DEL LOTE, no de la de quien abre.
    const abierto = await abrirLibre(ajeno, { pasos: await distinto() }, { quien: admin });
    expect((await recetaDeLaVersion(abierto.processRecipeVersionId)).organizationId).toBe(otraOrgId);
    expect(await libresDeLaOrg(otraOrgId)).toBe(antesAjena + 1);
  }, 60000);

  it("el orden: el acceso al lote va ANTES que cualquier validación de la Libre; sólo quien gestiona el lote recibe los códigos de la Libre", async () => {
    const l = await lote("ORDEN-ACC");
    const pasos = await distinto();
    const publicada = await receta("orden del acceso", await lavado(22.6));
    const antes = await libresDeLaOrg();
    const casos: [string, (quien: string) => Promise<unknown>][] = [
      ["sin pasos (libre_sin_pasos)", (quien) => abrirLibre(l, { pasos: [] }, { quien })],
      ["con una receta a la vez (libre_con_receta)", (quien) => abrirLibre(l, { pasos }, { quien, processRecipeVersionId: publicada.versionId })],
      ["con demasiados pasos (libre_demasiados_pasos)", (quien) => abrirLibre(l, { pasos: Array.from({ length: MAX_PASOS_PLANEADOS + 1 }, () => pasos[0]!) }, { quien })],
      ["con un paso que su tipo no admite (eje_no_aplica)", async (quien) => abrirLibre(l, { pasos: [await pasoDe("washing", { modoSecado: "african_bed_outdoor" })] }, { quien })],
    ];
    for (const [que, abrir] of casos) {
      // Quien NO gestiona el lote (la que sólo escribe recetas y la que no tiene nada) recibe el rechazo de ACCESO, nunca el código de
      // la Libre: no aprende nada de lo que se valida detrás de la puerta.
      for (const quien of [autor, intruso]) {
        await expect(abrir(quien), `${que}: quien no gestiona el lote recibió otra cosa que el rechazo de acceso`).rejects.toBeInstanceOf(TraceabilityAccessError);
      }
    }
    // Control: la MISMA entrada de cada caso, con quien SÍ gestiona el lote, recibe el código de la Libre (si no, los rechazos de
    // arriba podrían ser de cualquier otra razón).
    await rechaza(casos[0]![1](gestor), "libre_sin_pasos");
    await rechaza(casos[1]![1](gestor), "libre_con_receta");
    await rechaza(casos[2]![1](gestor), "libre_demasiados_pasos");
    await rechaza(casos[3]![1](gestor), "eje_no_aplica");
    expect(await procesosDe(l), "un rechazo dejó un proceso").toBe(0);
    expect(await libresDeLaOrg(), "un rechazo dejó una receta Libre").toBe(antes);
  }, 60000);
});

describe("Parte 2a, §5.2 — el control de parecido", () => {
  it("pasos iguales a los de «Lavado»: exige usar esa receta o un motivo; con motivo abre y guarda con qué coincidió", async () => {
    const lav = await receta("Lavado 21,2", await lavado(21.2));
    const l = await lote("P1");
    const antes = await libresDeLaOrg();
    // Los MISMOS pasos con otra afinación: lo que no es identidad no los distingue.
    const copia = (await lavado(21.2)).map((p) => ({ ...p, intencion: "mi variante", opcional: true }));
    await rechaza(abrirLibre(l, { pasos: copia }), "libre_parecida");
    await rechaza(abrirLibre(l, { pasos: copia, motivoDeLibre: "   " }), "libre_parecida");
    expect(await libresDeLaOrg(), "un rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "un rechazo dejó un proceso").toBe(0);
    // Control: lo único que cambia es el motivo.
    const proceso = await abrirLibre(l, { pasos: copia, motivoDeLibre: "  Quiero medir el lavado con otra agua  " });
    const creada = await recetaDeLaVersion(proceso.processRecipeVersionId);
    expect(creada.esLibre).toBe(true);
    expect(creada.parecidaAVersionId, "la Libre no guardó con qué receta coincidió").toBe(lav.versionId);
    expect(creada.motivoDeLibre, "el motivo se guarda recortado").toBe("Quiero medir el lavado con otra agua");
  }, 60000);

  it("pasos distintos abren sin motivo; un motivo escrito sin parecido no se guarda", async () => {
    const lav = await receta("Lavado 21,3", await lavado(21.3));
    const l = await lote("P2");
    // Control: la receta existe y es elegible, y la pregunta la encuentra con sus mismos pasos.
    expect((await parecidoDeLaLibre(gestor, { lotId: l, pasos: await lavado(21.3) }))?.recipeVersionId).toBe(lav.versionId);
    // Sólo cambia la temperatura mínima (21,4 contra 21,3): ya no es la misma receta, y abre sin pedir motivo.
    const sinMotivo = await abrirLibre(l, { pasos: await lavado(21.4) });
    const sin = await recetaDeLaVersion(sinMotivo.processRecipeVersionId);
    expect(sin.parecidaAVersionId).toBeNull();
    expect(sin.motivoDeLibre).toBeNull();
    // Un motivo que nadie pidió se descarta: no hay con qué receta coincidió.
    const l2 = await lote("P2B");
    const conMotivo = await abrirLibre(l2, { pasos: await lavado(21.4), motivoDeLibre: "Un motivo que nadie pidió" });
    const con = await recetaDeLaVersion(conMotivo.processRecipeVersionId);
    expect(con.parecidaAVersionId).toBeNull();
    expect(con.motivoDeLibre, "se guardó un motivo sin coincidencia").toBeNull();
  }, 60000);

  it("la pregunta dice lo que dirá la creación: un id en blanco o con espacios es «ninguno» en las dos, y las dos topan en MAX_PASOS_PLANEADOS", async () => {
    // Ronda de arreglo del 2026-10-14, hallazgo 1. La pregunta pasaba `input.pasos` CRUDO y la creación los pasos ya normalizados
    // (`completar`: un id vacío o con espacios es «ninguno»). Un `select` vacío manda `""`: la pregunta decía «no hay parecido» y la
    // apertura rechazaba con `libre_parecida`, y la acción que atrapa ese rechazo y llama a la pregunta para NOMBRAR la receta no
    // nombraba nada. Y la pregunta no aplicaba el tope de pasos.
    const lav = await receta("Lavado 22,9", await lavado(22.9));
    const l = await lote("P6");
    const antes = await libresDeLaOrg();
    const pregunta = async (pasos: readonly PasoEditable[]) =>
      (await parecidoDeLaLibre(gestor, { lotId: l, pasos }))?.recipeVersionId ?? null;
    const copia = await lavado(22.9);
    // Lo que manda un `select` vacío en los seis ejes de id, sobre la fermentación (que los admite todos): ninguno está declarado.
    const enBlanco = copia.map((p, i) =>
      i === 1
        ? {
            ...p,
            estadoFrutoValueId: " ",
            oxigenoValueId: "",
            temperaturaValueId: "  ",
            fuenteMicrobianaValueId: " ",
            medioValueId: "",
            fisicoValueId: "",
          }
        : p,
    );
    // Control: la copia sin esos campos coincide en las dos, y los campos en blanco son LITERALMENTE distintos de «sin campo».
    expect(await pregunta(copia), "control: la copia exacta no coincide con la receta").toBe(lav.versionId);
    expect(enBlanco[1], "control: la copia en blanco no lleva los campos en blanco").toMatchObject({ oxigenoValueId: "", fisicoValueId: "" });
    // La pregunta y la creación coinciden: las dos ven el parecido…
    expect(await pregunta(enBlanco), "la pregunta no ve el parecido que la creación ve (ids en blanco)").toBe(lav.versionId);
    await rechaza(abrirLibre(l, { pasos: enBlanco }), "libre_parecida");
    expect(await libresDeLaOrg(), "el rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "el rechazo dejó un proceso").toBe(0);
    // …o las dos dejan de verlo cuando un id SÍ está declarado (un valor real del catálogo, no en blanco): la receta no lo declara.
    const anaerobico = await valorDe("condicion_oxigeno", "anaerobico");
    const conOxigeno = enBlanco.map((p, i) => (i === 1 ? { ...p, oxigenoValueId: anaerobico } : p));
    expect(await pregunta(conOxigeno), "la pregunta vio parecido con un eje de más").toBeNull();
    const abierta = await abrirLibre(l, { pasos: conOxigeno });
    expect((await recetaDeLaVersion(abierta.processRecipeVersionId)).parecidaAVersionId, "la creación vio parecido con un eje de más").toBeNull();

    // El tope: la pregunta lo aplica igual que la creación, y DESPUÉS del acceso al lote (Ruling INV).
    const uno = await pasoDe("pulping");
    const demasiados = Array.from({ length: MAX_PASOS_PLANEADOS + 1 }, () => uno);
    const l2 = await lote("P6B");
    await rechaza(parecidoDeLaLibre(gestor, { lotId: l2, pasos: demasiados }), "libre_demasiados_pasos");
    await rechaza(abrirLibre(l2, { pasos: demasiados }), "libre_demasiados_pasos");
    for (const quien of [autor, intruso]) {
      await expect(
        parecidoDeLaLibre(quien, { lotId: l2, pasos: demasiados }),
        "quien no gestiona el lote recibió otra cosa que el rechazo de acceso",
      ).rejects.toBeInstanceOf(TraceabilityAccessError);
    }
    // Control: exactamente MAX_PASOS_PLANEADOS pasos, la pregunta contesta (que no coincide con nada).
    expect(await parecidoDeLaLibre(gestor, { lotId: l2, pasos: demasiados.slice(1) }), "el control no contestó con MAX_PASOS_PLANEADOS pasos").toBeNull();
  }, 120000);

  it("cada diferencia de identidad evita el parecido; lo que no es identidad no la evita", async () => {
    const lav = await receta("Lavado 21,5", await lavado(21.5));
    const l = await lote("P3");
    const base = await lavado(21.5);
    const [despulpado, fermentacion, lavadoPaso, secado] = base as [PasoEditable, PasoEditable, PasoEditable, PasoEditable];
    const parecido = async (pasos: readonly PasoEditable[]) => (await parecidoDeLaLibre(gestor, { lotId: l, pasos }))?.recipeVersionId ?? null;

    expect(await parecido(base), "control: la copia exacta no coincide con la receta").toBe(lav.versionId);
    const distintos: [string, PasoEditable[]][] = [
      // Los seis tramos son 0, 10, 25, 50, 75 y 100: el Lavado es 0, y 50 es otro tramo.
      ["otro tramo de mucílago", [despulpado, fermentacion, { ...lavadoPaso, mucilagoObjetivo: 50 }, secado]],
      ["otra temperatura", [despulpado, { ...fermentacion, temperaturaMinC: 19.5 }, lavadoPaso, secado]],
      ["otro medio de lavado", [despulpado, fermentacion, { ...lavadoPaso, medioValueId: await valorDe("medio_lavado", "mosto_propio") }, secado]],
      ["otro modo de secado", [despulpado, fermentacion, lavadoPaso, { ...secado, modoSecado: "covered_patio" }]],
      ["otro orden", [lavadoPaso, despulpado, fermentacion, secado]],
      ["un paso de más", [...base, await pasoDe("reception")]],
      ["un paso de menos", [despulpado, fermentacion, lavadoPaso]],
    ];
    for (const [que, pasos] of distintos) {
      expect(await parecido(pasos), `«${que}» no debería parecerse a la receta`).toBeNull();
    }
    // Lo que no es identidad: la afinación, la intención y lo opcional.
    const afinados = base.map((p) => ({ ...p, intencion: "otra intención", opcional: true, horasSugeridas: 7 }));
    expect(await parecido(afinados), "la afinación no es identidad: tiene que seguir coincidiendo").toBe(lav.versionId);
  }, 60000);

  it("la receta publicada se lee con TODOS sus ejes y sus adiciones: el oxígeno, la temperatura por id, la fuente microbiana, lo físico y las adiciones cuentan para el parecido", async () => {
    // Ronda de arreglo del 2026-10-14, hallazgo 2. `lavado()` no declara ninguna de esas cinco cosas, así que la LECTURA que `buscarParecida`
    // hace de la receta publicada no estaba fijada para ellas: «las adiciones y esos ejes cuentan» sólo se probaba en la función pura
    // (`parecido.test.ts`), no en el camino que lee la base. Quitar la línea que lee una columna dejaba la suite en verde.
    const [entera, anaerobico, aerobico, fria, ambiente, levadura, espontanea, agitacion, ninguno, mosto, coFermentacion] = await Promise.all([
      valorDe("estado_cereza", "entera"),
      valorDe("condicion_oxigeno", "anaerobico"),
      valorDe("condicion_oxigeno", "abierto_aerobico"),
      valorDe("manejo_temperatura", "fermentacion_fria"),
      valorDe("manejo_temperatura", "ambiente"),
      valorDe("fuente_microbiana", "levadura_inoculada"),
      valorDe("fuente_microbiana", "espontanea"),
      valorDe("fisico", "agitacion"),
      valorDe("fisico", "ninguno"),
      valorDe("sustrato_anadido", "mosto"),
      valorDe("sustrato_anadido", "co_fermentacion"),
    ]);
    const A0 = { categoriaValueId: mosto, cantidad: 5, unidad: "kg", momento: "pre_green" as const };
    const A1 = { categoriaValueId: coFermentacion, momento: "post_green" as const };
    /** El plan de la receta; `cambio` pisa lo que se diga en la fermentación, que es el paso que declara los ejes y las adiciones. */
    const plan = async (cambio: Partial<PasoEditable> = {}): Promise<PasoEditable[]> => [
      await pasoDe("pulping", { estadoFrutoValueId: entera }),
      await pasoDe("fermentation", {
        oxigenoValueId: anaerobico,
        temperaturaValueId: fria,
        temperaturaMinC: 23.1,
        temperaturaMaxC: 30,
        fuenteMicrobianaValueId: levadura,
        fisicoValueId: agitacion,
        adiciones: [A0, A1],
        horasSugeridas: 48,
        ...cambio,
      }),
      await pasoDe("drying", { modoSecado: "covered_patio", horasSugeridas: 120 }),
    ];
    const rec = await receta("Todos los ejes 23,1", await plan());
    const l = await lote("P7");
    const parecido = async (pasos: readonly PasoEditable[]) => (await parecidoDeLaLibre(gestor, { lotId: l, pasos }))?.recipeVersionId ?? null;

    // Controles: la receta DECLARA cada cosa que esta prueba cambia (un nulo que pasa a otro nulo no probaría nada) y la copia exacta coincide.
    const fermentacion = await prisma.processRecipeStep.findFirstOrThrow({ where: { recipeVersionId: rec.versionId, seq: 2 } });
    expect(
      [fermentacion.oxigenoValueId, fermentacion.temperaturaValueId, fermentacion.fuenteMicrobianaValueId, fermentacion.fisicoValueId],
      "control: la receta no declara los cuatro ejes",
    ).toEqual([anaerobico, fria, levadura, agitacion]);
    expect(await prisma.processRecipeStepAddition.count({ where: { stepId: fermentacion.id } }), "control: la receta no guardó sus dos adiciones").toBe(2);
    expect(await parecido(await plan()), "control: la copia exacta no coincide con la receta").toBe(rec.versionId);

    // Cada eje, cambiado a otro valor de su catálogo o quitado, y cada diferencia de las adiciones: es otra receta.
    const distintos: [string, Partial<PasoEditable>][] = [
      ["otro oxígeno", { oxigenoValueId: aerobico }],
      ["sin oxígeno", { oxigenoValueId: null }],
      ["otro manejo de temperatura", { temperaturaValueId: ambiente }],
      ["sin manejo de temperatura", { temperaturaValueId: null }],
      ["otra fuente microbiana", { fuenteMicrobianaValueId: espontanea }],
      ["sin fuente microbiana", { fuenteMicrobianaValueId: null }],
      ["otro físico", { fisicoValueId: ninguno }],
      ["sin físico", { fisicoValueId: null }],
      ["una adición de menos", { adiciones: [A0] }],
      ["una adición repetida", { adiciones: [A0, A1, A0] }],
      ["otra categoría de adición", { adiciones: [{ ...A0, categoriaValueId: coFermentacion }, A1] }],
      ["otro momento de adición", { adiciones: [{ ...A0, momento: "post_green" as const }, A1] }],
      ["sin adiciones", { adiciones: [] }],
    ];
    for (const [que, cambio] of distintos) {
      expect(await parecido(await plan(cambio)), `«${que}» no debería parecerse a la receta`).toBeNull();
    }
    // Lo que no es identidad: la dosis de una adición y el orden en que se escriben.
    expect(
      await parecido(await plan({ adiciones: [{ ...A1, cantidad: 3, unidad: "L" }, { ...A0, cantidad: 9, unidad: "g" }] })),
      "la dosis y el orden de las adiciones no son identidad: tiene que seguir coincidiendo",
    ).toBe(rec.versionId);
  }, 120000);

  it("sólo se compara con lo que la organización puede usar: ni ajenas, ni archivadas, ni borradores, ni Libres, ni versiones superadas; sí las plantillas", async () => {
    const l = await lote("P4");
    /** Qué versión coincide con una copia del plan cuya fermentación empieza en `minC`, o nulo. */
    const veLaCopia = async (minC: number) =>
      (await parecidoDeLaLibre(gestor, { lotId: l, pasos: await lavado(minC) }))?.recipeVersionId ?? null;

    // 1. De OTRA organización.
    const ajena = await receta("ajena", await lavado(21.6), { organizationId: otraOrgId });
    expect(await veLaCopia(21.6), "una receta de otra organización cuenta").toBeNull();
    await prisma.processRecipe.update({ where: { id: ajena.recipeId }, data: { organizationId: orgId } });
    expect(await veLaCopia(21.6), "control: la misma receta, pasada a la organización, no cuenta").toBe(ajena.versionId);

    // 2. Archivada.
    const archivada = await receta("archivada", await lavado(21.7));
    await prisma.processRecipe.update({ where: { id: archivada.recipeId }, data: { status: "archived" } });
    expect(await veLaCopia(21.7), "una receta archivada cuenta").toBeNull();
    await prisma.processRecipe.update({ where: { id: archivada.recipeId }, data: { status: "approved" } });
    expect(await veLaCopia(21.7), "control: la misma receta, desarchivada, no cuenta").toBe(archivada.versionId);

    // 3. Borrador.
    const borrador = await receta("borrador", await lavado(21.8), { publicada: false });
    expect(await veLaCopia(21.8), "un borrador cuenta").toBeNull();
    await publicarVersion(autor, borrador.versionId);
    expect(await veLaCopia(21.8), "control: el mismo borrador, publicado, no cuenta").toBe(borrador.versionId);

    // 4. Otra Libre: no se puede «usar esa receta», porque el selector no la ofrece.
    const otraLibre = await receta("libre previa", await lavado(21.9));
    await prisma.processRecipe.update({ where: { id: otraLibre.recipeId }, data: { esLibre: true } });
    expect(await veLaCopia(21.9), "una Libre anterior cuenta").toBeNull();
    await prisma.processRecipe.update({ where: { id: otraLibre.recipeId }, data: { esLibre: false } });
    expect(await veLaCopia(21.9), "control: la misma receta, ya no Libre, no cuenta").toBe(otraLibre.versionId);

    // 5. Una versión superada por otra publicada: el selector ofrece la más nueva.
    const v1 = await receta("superada", await lavado(22.1));
    const v2 = (await prisma.processRecipeVersion.create({ data: { recipeId: v1.recipeId, version: 2, status: "draft", createdBy: autor } })).id;
    for (const [i, paso] of (await lavado(22.2)).entries()) {
      const creado = await agregarPaso(autor, { recipeVersionId: v2, despuesDeSeq: i === 0 ? null : i, paso });
      pasosCreados.push(creado.id);
    }
    await publicarVersion(autor, v2);
    expect(await veLaCopia(22.1), "la versión 1, superada por la 2, cuenta").toBeNull();
    expect(await veLaCopia(22.2), "control: la versión más nueva no cuenta").toBe(v2);

    // 6. Una plantilla (sin organización) sí cuenta: es de todas.
    const plantilla = await receta("plantilla", await lavado(22.3), { organizationId: null });
    expect(await veLaCopia(22.3), "una plantilla no cuenta").toBe(plantilla.versionId);
  }, 120000);

  it("una receta propia que se llama «Libre» no se confunde con una Libre: se ofrece, se compara por sus pasos y no choca con ningún nombre", async () => {
    const propia = await receta("x", await lavado(22.4), { nombreExacto: "Libre" });
    const l1 = await lote("N1");
    const l2 = await lote("N2");
    // Se compara por sus pasos: el nombre no la esconde.
    const nombrada = await parecidoDeLaLibre(gestor, { lotId: l1, pasos: await lavado(22.4) });
    expect(nombrada?.recipeVersionId, "la receta que se llama «Libre» no se comparó").toBe(propia.versionId);
    expect(nombrada?.nombre).toBe("Libre");
    // Una Libre de verdad (marcada por la columna) abre sin chocar con ella, y el selector las distingue por la columna, no por el nombre.
    const proceso = await abrirLibre(l2, { pasos: await distinto() });
    const ofrecidas = (await listRecipeVersionsForLot(gestor, l1)).map((v) => v.id);
    expect(ofrecidas, "la receta que se llama «Libre» no se ofrece").toContain(propia.versionId);
    expect(ofrecidas, "la Libre de verdad se ofrece como receta").not.toContain(proceso.processRecipeVersionId);
  }, 60000);

  it("la pregunta del parecido pide gestionar el lote (no basta la autoría), y sin pasos no encuentra nada", async () => {
    const l = await lote("PRE");
    const lav = await receta("Lavado PRE", await lavado(22.6));
    // Una receta publicada SIN pasos, como las de antes de la 2a: una secuencia vacía no coincide con ella.
    await recetaVieja("sin pasos");
    const pregunta = (cuentaId: string, pasos: readonly PasoEditable[]) => parecidoDeLaLibre(cuentaId, { lotId: l, pasos });
    // Control: quien gestiona el lote recibe la receta.
    expect((await pregunta(gestor, await lavado(22.6)))?.recipeVersionId).toBe(lav.versionId);
    // Quien no gestiona el lote, el rechazo de acceso, no la receta: ni quien no tiene nada, ni quien sólo escribe recetas.
    await expect(pregunta(intruso, await lavado(22.6))).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(pregunta(autor, await lavado(22.6))).rejects.toBeInstanceOf(TraceabilityAccessError);
    // Un lote que no existe se nombra.
    await rechaza(parecidoDeLaLibre(gestor, { lotId: randomUUID(), pasos: await lavado(22.6) }), "lot_not_found", LotProcessError);
    // Sin pasos no hay con qué comparar.
    expect(await pregunta(gestor, []), "una secuencia vacía coincidió con una receta").toBeNull();
  }, 60000);

  it("quien gestiona sólo su organización no pregunta el parecido de un lote de OTRA: recibe el rechazo de acceso, no el nombre de sus recetas", async () => {
    const ajeno = await lote("PRE-AJENO", "internal", true);
    const deLaOtra = await receta("sólo de la otra", await lavado(22.7), { organizationId: otraOrgId });
    const pasos = await lavado(22.7);
    // Control: quien SÍ gestiona ese lote (el administrador de plataforma) recibe la receta de ESA organización.
    const vista = await parecidoDeLaLibre(admin, { lotId: ajeno, pasos });
    expect(vista?.recipeVersionId, "el control no encontró la receta de la otra organización").toBe(deLaOtra.versionId);
    // `gestor` no gestiona ese lote.
    await expect(parecidoDeLaLibre(gestor, { lotId: ajeno, pasos })).rejects.toBeInstanceOf(TraceabilityAccessError);
  }, 60000);
});

describe("Parte 2a, §5.2 — lo que NO puede salir como «ya hay un proceso abierto»", () => {
  it("un choque con el nombre de otra receta no sale como «ya hay un proceso abierto»: sale `libre_repetida`", async () => {
    const l = await lote("REP");
    const intent = `repetida ${RUN}`;
    // Una receta que ya lleva el nombre exacto que tendría ESTA Libre (otro proceso del mismo lote, el mismo día).
    const nombre = nombreDeLaLibre({ intencion: intent, lotCode: codigoDe("REP"), fecha: FECHA });
    await prisma.processRecipe.create({ data: { name: nombre, organizationId: orgId, status: "approved", esLibre: true, createdBy: gestor } });
    const antes = await libresDeLaOrg();
    await rechaza(abrirLibre(l, { pasos: await distinto() }, { intent }), "libre_repetida");
    expect(await procesosDe(l), "el rechazo dejó un proceso").toBe(0);
    expect(await libresDeLaOrg(), "el rechazo dejó otra receta Libre").toBe(antes);
    // Control: lo único que cambia es la intención, y entonces el nombre es otro.
    const proceso = await abrirLibre(l, { pasos: await distinto() }, { intent: `${intent} otra` });
    expect(proceso.processRecipeVersionId).not.toBeNull();
  }, 60000);

  it("traducirP2002DeApertura decide por el índice que chocó, con errores reales de la base", async () => {
    const chocar = async (hacer: () => Promise<unknown>) => {
      try {
        await hacer();
      } catch (error) {
        return error;
      }
      throw new Error("control: la escritura no chocó, y no hay error que traducir");
    };
    // Un nombre de receta repetido, de verdad: `@@unique([organizationId, name])`.
    const datos = { name: `TEST nombre repetido ${RUN}`, organizationId: orgId, status: "approved" as const, createdBy: gestor };
    await prisma.processRecipe.create({ data: datos });
    const deReceta = await chocar(() => prisma.processRecipe.create({ data: datos }));
    // El índice único parcial de «un proceso abierto por lote», de verdad.
    const l = await lote("P2002");
    const abierto = (orden: number) =>
      prisma.lotProcess.create({
        data: {
          lotId: l,
          sequenceOrder: orden,
          intent: `TEST ${RUN}`,
          targetMoisturePct: 11,
          startedAt: FECHA,
          provenanceClass: "original_record",
          processGradeValueId: gradoId,
          cherryStateValueId: cerezaId,
        },
      });
    await abierto(1);
    const deProceso = await chocar(() => abierto(2));

    const traducidoDeReceta = traducirP2002DeApertura(deReceta);
    expect(traducidoDeReceta, "un choque de nombre de receta no se tradujo").toBeInstanceOf(RecipeError);
    expect((traducidoDeReceta as Error).message).toBe("libre_repetida");
    const traducidoDeProceso = traducirP2002DeApertura(deProceso);
    expect(traducidoDeProceso, "el choque del índice del proceso abierto dejó de traducirse").toBeInstanceOf(LotProcessError);
    expect((traducidoDeProceso as Error).message).toBe("process_already_open");
    // Lo que no es un P2002 no se traduce: se relanza tal cual.
    expect(traducirP2002DeApertura(new Error("otra cosa"))).toBeNull();
    expect(
      traducirP2002DeApertura(new Prisma.PrismaClientKnownRequestError("no existe", { code: "P2025", clientVersion: "test" })),
    ).toBeNull();
  });

  it("la receta Libre y la apertura son UNA transacción: si la apertura falla después de crearla, no queda ni receta ni evento", async () => {
    const l = await lote("ATOM");
    const intent = `atomica ${RUN}`;
    const nombre = nombreDeLaLibre({ intencion: intent, lotCode: codigoDe("ATOM"), fecha: FECHA });
    const eventos = () =>
      prisma.auditEvent.count({ where: { actorUserAccountId: gestor, operation: "process_recipe.create", sourceInterface: "recetas.libre" } });
    const eventosAntes = await eventos();
    // Una procedencia inválida: la rechaza Prisma al ESCRIBIR EL PROCESO, que es lo último que hace la transacción, después de
    // crear la receta Libre, sus pasos y su evento.
    await expect(
      abrirLibre(l, { pasos: await distinto() }, { intent, provenanceClass: "no_es_una_procedencia" as never }),
    ).rejects.toThrow();
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "la receta Libre sobrevivió a la apertura fallida").toBe(0);
    expect(await eventos(), "el evento de la receta sobrevivió a la apertura fallida").toBe(eventosAntes);
    expect(await procesosDe(l)).toBe(0);
    // Control: la misma apertura, bien armada, crea la receta, su evento y el proceso.
    await abrirLibre(l, { pasos: await distinto() }, { intent });
    expect(await prisma.processRecipe.count({ where: { name: nombre } })).toBe(1);
    expect(await eventos()).toBe(eventosAntes + 1);
    expect(await procesosDe(l)).toBe(1);
  }, 60000);

  it("dos Libres a la vez sobre el mismo lote: una abre, la otra recibe `process_already_open` y no queda una receta huérfana", async () => {
    const l = await lote("CONC");
    const intent = `concurrente ${RUN}`;
    const nombre = nombreDeLaLibre({ intencion: intent, lotCode: codigoDe("CONC"), fecha: FECHA });
    const planes = [await distinto(), await distinto()] as const;
    const res = await Promise.allSettled([abrirLibre(l, { pasos: planes[0] }, { intent }), abrirLibre(l, { pasos: planes[1] }, { intent })]);
    expect(res.filter((r) => r.status === "fulfilled"), "no abrió exactamente una").toHaveLength(1);
    const perdedora = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(perdedora.reason).toBeInstanceOf(LotProcessError);
    expect((perdedora.reason as Error).message, "la perdedora recibió otra cosa que la verdad").toBe("process_already_open");
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "la perdedora dejó una receta").toBe(1);
    expect(await procesosDe(l)).toBe(1);
  }, 60000);
});

describe("Parte 2a, R8 — lo que una Libre hereda del lote y lo que le cabe en el nombre", () => {
  it("la Libre hereda la clasificación de su lote: `internal`, `confidential` y `trade_secret` salen como entraron", async () => {
    // Sólo el Platform Admin limpia `confidential` y `trade_secret`: el operario no gestiona esos lotes (el último control de abajo lo
    // demuestra, para que el `admin` de las dos aperturas de en medio no sea un atajo que esconde otra cosa).
    const casos: [ClassificationLevel, string][] = [
      ["internal", gestor],
      ["confidential", admin],
      ["trade_secret", admin],
    ];
    for (const [clasificacion, quien] of casos) {
      const l = await lote(`CLAS-${clasificacion}`, clasificacion);
      const proceso = await abrirLibre(l, { pasos: await distinto() }, { quien });
      const nueva = await recetaDeLaVersion(proceso.processRecipeVersionId);
      expect(nueva.esLibre, "control: es la Libre de ESTE proceso").toBe(true);
      expect(nueva.classification, `la Libre de un lote «${clasificacion}» no heredó su clasificación`).toBe(clasificacion);
    }
    // Control: el operario NO gestiona un lote confidencial. La clasificación la hereda la receta del lote, no de quien abre.
    const confidencial = await lote("CLAS-NO", "confidential");
    await expect(abrirLibre(confidencial, { pasos: await distinto() }, { quien: gestor })).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await procesosDe(confidencial), "el rechazo dejó un proceso").toBe(0);
  }, 60000);

  it("una intención de 5 KB abre: el nombre lleva su comienzo (MAX_INTENCION_EN_EL_NOMBRE caracteres, con «…») y la descripción la lleva entera", async () => {
    const l = await lote("LARGA");
    // Casi incompresible a propósito: la base comprime lo que va a indexar, y 5 KB de «aaa…» cabrían aunque el nombre no se recortara.
    // Así, sin el recorte el nombre ni siquiera cabe en el índice; y además la prueba mira el LARGO del nombre, no sólo que abra.
    const intent = `${RUN} ${randomBytes(2560).toString("hex")}`;
    expect(intent.length, "control: la intención mide más de 5 KB").toBeGreaterThan(5000);
    const proceso = await abrirLibre(l, { pasos: await distinto() }, { intent });
    const nueva = await recetaDeLaVersion(proceso.processRecipeVersionId);
    const cola = ` — ${codigoDe("LARGA")} 2026-03-01`;
    expect(nueva.name.startsWith("Libre — "), "no es el nombre de una Libre").toBe(true);
    expect(nueva.name.endsWith(cola), "el nombre perdió el código del lote o la fecha").toBe(true);
    const enElNombre = nueva.name.slice("Libre — ".length, nueva.name.length - cola.length);
    expect([...enElNombre], "la intención del nombre no mide MAX_INTENCION_EN_EL_NOMBRE").toHaveLength(MAX_INTENCION_EN_EL_NOMBRE);
    expect(enElNombre.endsWith("…"), "el recorte no termina en «…»").toBe(true);
    expect(intent.startsWith(enElNombre.slice(0, -1)), "el nombre no lleva el COMIENZO de la intención").toBe(true);
    expect(nueva.description, "la descripción no conserva la intención entera").toBe(intent);
    // Control: una intención corta no se recorta (el nombre de siempre).
    const corta = await abrirLibre(await lote("CORTA"), { pasos: await distinto() });
    expect((await recetaDeLaVersion(corta.processRecipeVersionId)).name).toBe(`Libre — ${INTENCION} — ${codigoDe("CORTA")} 2026-03-01`);
  }, 60000);
});

describe("Parte 2a, R6 — lo que una Libre no acepta y una receta publicada sí", () => {
  it("más de MAX_PASOS_PLANEADOS pasos se rechazan (`libre_demasiados_pasos`) sin escribir nada; con MAX_PASOS_PLANEADOS, la validación pasa", async () => {
    const uno = await pasoDe("pulping");
    const demasiados = Array.from({ length: MAX_PASOS_PLANEADOS + 1 }, () => uno);
    await rechaza(validarPasosPlaneados(demasiados), "libre_demasiados_pasos");
    // Por la apertura también, y sin dejar nada escrito.
    const l = await lote("TOPE");
    const antes = await libresDeLaOrg();
    await rechaza(abrirLibre(l, { pasos: demasiados }), "libre_demasiados_pasos");
    expect(await libresDeLaOrg(), "el rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "el rechazo dejó un proceso").toBe(0);
    // Control: exactamente MAX_PASOS_PLANEADOS pasos validan. Sólo se valida: abrir con tantos escribiría cien filas que aquí no dicen nada.
    expect(await validarPasosPlaneados(demasiados.slice(1)), "el control no validó MAX_PASOS_PLANEADOS pasos").toHaveLength(MAX_PASOS_PLANEADOS);
  }, 60000);

  it("una Libre no trae fines que salgan de una lectura de cierre (`libre_con_lectura_de_cierre`); el mismo fin sin lectura de origen, pasa", async () => {
    const fin = { variable: "moisture", operador: "lte" as const, valor: 11, unidad: "%" };
    const secado = (desdeLecturaId?: string) =>
      pasoDe("drying", { modoSecado: "covered_patio", horasSugeridas: 120, fines: [desdeLecturaId ? { ...fin, desdeLecturaId } : fin] });
    // Control: un fin SIN lectura de origen es un fin como cualquier otro de una Libre.
    const [valido] = await validarPasosPlaneados([await secado()]);
    expect(valido?.paso.fines, "el control no validó el fin sin lectura de origen").toHaveLength(1);
    // Un id cualquiera: se rechaza ANTES de preguntarle nada a la base. Sin esta comprobación saldría `lectura_no_marcada` (la de la
    // tarea 3), y una lectura marcada de verdad, o de otra organización, pasaría esa pregunta: por eso la Libre no la hace.
    await rechaza(validarPasosPlaneados([await secado(randomUUID())]), "libre_con_lectura_de_cierre");
    const l = await lote("FIN");
    const antes = await libresDeLaOrg();
    await rechaza(abrirLibre(l, { pasos: [await secado(randomUUID())] }), "libre_con_lectura_de_cierre");
    expect(await libresDeLaOrg(), "el rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "el rechazo dejó un proceso").toBe(0);
    // Control: la misma apertura con el fin sin lectura de origen abre.
    expect((await abrirLibre(l, { pasos: [await secado()] })).processRecipeVersionId).not.toBeNull();
  }, 60000);
});

describe("Parte 2a, §5.2 — cada valor de catálogo de una Libre es de SU catálogo", () => {
  it("un valor de OTRO catálogo en un eje se rechaza (`valor_de_otro_catalogo`) por la validación y por la apertura, sin escribir nada; el valor de su catálogo, pasa", async () => {
    // Ronda de arreglo del 2026-10-14, hallazgo 3. `validarPasosPlaneados` llama a `exigeValoresDelPaso`, y la clave ajena sola no basta: un
    // valor de `tipo_paso` en la columna del medio de lavado es una FK perfectamente válida (la FK acepta cualquier valor de catálogo). Sin
    // esa llamada un formulario manipulado guardaría en la receta Libre ids de otro catálogo, y la fila 19 del flip sólo mutaba `validarPaso`.
    const deOtroCatalogo = await valorDe("tipo_paso", "pulping");
    const agua = await valorDe("medio_lavado", "agua_limpia");
    expect(deOtroCatalogo, "control: el valor «malo» no es el bueno").not.toBe(agua);
    const lavar = (medioValueId: string) => pasoDe("washing", { mucilagoObjetivo: 75, medioValueId });

    // Por la validación…
    await rechaza(validarPasosPlaneados([await lavar(deOtroCatalogo)]), "valor_de_otro_catalogo");
    expect(await validarPasosPlaneados([await lavar(agua)]), "control: el valor de su catálogo no validó").toHaveLength(1);
    // …y por la apertura, que no deja ni receta ni proceso.
    const l = await lote("CAT");
    const antes = await libresDeLaOrg();
    await rechaza(abrirLibre(l, { pasos: [await lavar(deOtroCatalogo)] }), "valor_de_otro_catalogo");
    expect(await libresDeLaOrg(), "el rechazo dejó una receta Libre").toBe(antes);
    expect(await procesosDe(l), "el rechazo dejó un proceso").toBe(0);
    // Control: lo único que cambia es de qué catálogo es el valor.
    expect((await abrirLibre(l, { pasos: [await lavar(agua)] })).processRecipeVersionId).not.toBeNull();
    expect(await libresDeLaOrg(), "el control no creó UNA receta Libre").toBe(antes + 1);
  }, 60000);
});

describe("Parte 2a, R14 — escribirPasosPlaneados sólo escribe en la versión sin pasos de una receta Libre", () => {
  /** Valida y escribe como lo hace `abrirProceso`: la validación fuera de la transacción, la escritura dentro. */
  const escribir = async (versionId: string, pasos: readonly PasoEditable[]) => {
    const planeados = await validarPasosPlaneados(pasos);
    return prisma.$transaction((tx) => escribirPasosPlaneados(tx, versionId, planeados));
  };
  const pasosDe = (versionId: string) =>
    prisma.processRecipeStep.findMany({ where: { recipeVersionId: versionId }, orderBy: { seq: "asc" }, select: { id: true, seq: true } });

  it("no escribe en una receta que NO es Libre —ni la publicada de antes de la 2a, ni un borrador— ni en una versión que no existe, y no deja ningún paso; en una Libre vacía, escribe", async () => {
    const vieja = await recetaVieja("R14 vieja");
    const borrador = await receta("R14 borrador", [], { publicada: false });
    const plan = await distinto();
    await rechazaConMensaje(escribir(vieja.versionId, plan), "sólo escribe los pasos de una receta Libre");
    await rechazaConMensaje(escribir(borrador.versionId, plan), "sólo escribe los pasos de una receta Libre");
    await rechazaConMensaje(escribir(randomUUID(), plan), "esa versión no existe");
    expect(await pasosDe(vieja.versionId), "escribió pasos en la publicada de antes de la 2a").toHaveLength(0);
    expect(await pasosDe(borrador.versionId), "escribió pasos en el borrador de una receta que no es Libre").toHaveLength(0);
    // Control: lo único que cambia es que la receta SEA Libre.
    const libre = await libreVacia();
    const escritos = await escribir(libre, plan);
    expect(escritos.map((p) => p.seq), "el control no escribió los tres pasos, en orden").toEqual([1, 2, 3]);
    expect(await pasosDe(libre)).toHaveLength(3);
  }, 60000);

  it("no escribe dos veces: una Libre que ya tiene pasos conserva los suyos y no recibe más", async () => {
    const libre = await libreVacia();
    await escribir(libre, await distinto());
    const antes = await pasosDe(libre);
    expect(antes, "control: la primera escritura dejó los tres pasos").toHaveLength(3);
    await rechazaConMensaje(escribir(libre, await distinto()), "esa versión ya tiene pasos");
    expect(await pasosDe(libre), "la segunda escritura cambió los pasos de la Libre").toEqual(antes);
  }, 60000);
});
