/**
 * Lo que se exige de la receta que se pasa a abrir un proceso — Parte 2a, §3.3 (tarea 5a del plan, 2026-10-03; integrada el 2026-10-04; partida el 2026-10-06).
 *
 * `abrirProceso`, si se le pasa una versión, la abre sólo si está PUBLICADA, es de una receta que no esté archivada y de la organización del
 * lote o compartida (sin organización, como acepta el tueste), y bloquea la fila de esa versión y la de su receta con
 * `FOR SHARE` DESPUÉS del linaje. **Abrir SIN receta sigue valiendo en esta tarea**: su rechazo (`sin_receta`) y la prueba que lo mide (`lotProcess.test.ts`,
 * que se invierte), la división y la devolución de un proceso viejo sin receta y el ayudante `recetaDePrueba` son de la 5b, que añade a ESTE archivo lo que le toca.
 * El tueste, en `tests/recetas/tuesteSoloConPublicadas.test.ts`.
 *
 * **Cada rechazo lleva su control al lado, y el control cambia SÓLO lo que el rechazo mira**: la misma versión publicada,
 * la misma receta desarchivada, la misma receta pasada a la organización del lote. Así un rechazo que saliera por otra
 * razón (el lote, el grado, R2) no podría pasar por éste.
 *
 * Las recetas se crean CRUDAS, con el estado que cada prueba necesita: desde la tarea 3, la autoría crea la versión en
 * borrador, y aquí no se prueba la autoría.
 *
 * **Los bloqueos se OBSERVAN en la base** (`pg_blocking_pids`), no se infieren de que algo tarde. Tres preguntas distintas,
 * y la segunda es la que distingue `FOR SHARE` de `FOR UPDATE`: ¿espera a quien edita la versión? (sí), ¿espera a quien
 * también la lee? (no: dos aperturas con la misma receta no se serializan), ¿espera a quien toca la receta? (sí).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { abrirProceso } from "../../lib/traceability/lotProcess";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { listRecipeVersionsForLot } from "../../lib/traceability/processTargets";
import type { Prisma } from "../../generated/prisma/client";
import { RecordStatus } from "../../generated/prisma/enums";
import { borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `receta-obligatoria-${Date.now()}`;
let orgId: string, otraOrgId: string, plotId: string, scopeId: string, gestor: string, sinPermiso: string;
let gradoId: string, cerezaId: string;

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
/** Un lote de la corrida: su `lotCode` lleva el RUN, que es por lo que lo encuentra el `afterAll`. */
async function lote(codigo: string) {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType: "cherry", organizationId: orgId, locationId: plotId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  return id;
}
/** El id del valor `valor` del catálogo `tipo_paso`, el REAL de la base sembrada (tarea 2). */
async function tipoDePaso(valor: string): Promise<string> {
  return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: valor, catalog: { key: "tipo_paso" } }, select: { id: true } })).id;
}

/** Una receta con su versión 1, cruda y con el estado que pide la prueba. */
async function receta(
  nombre: string,
  datos: { organizationId: string | null; receta?: "approved" | "archived"; version?: RecordStatus; esLibre?: boolean },
) {
  const r = await prisma.processRecipe.create({
    data: {
      name: `TEST ${nombre} ${RUN}`,
      organizationId: datos.organizationId,
      status: datos.receta ?? "approved",
      esLibre: datos.esLibre ?? false,
      createdBy: gestor,
      versions: { create: { version: 1, status: datos.version ?? "approved", createdBy: gestor } },
    },
    select: { id: true, versions: { select: { id: true } } },
  });
  return { recipeId: r.id, versionId: r.versions[0]!.id };
}

/** Abre con la entrada mínima y válida: de una prueba a otra sólo cambian la cuenta, el lote y la versión. */
const abrirComo = (cuentaId: string, lotId: string, processRecipeVersionId: string) =>
  abrirProceso(cuentaId, {
    lotId, processRecipeVersionId, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: gradoId, cherryStateValueId: cerezaId,
  });
const abrir = (lotId: string, processRecipeVersionId: string) => abrirComo(gestor, lotId, processRecipeVersionId);
const procesosDe = (lotId: string) => prisma.lotProcess.count({ where: { lotId } });

/**
 * El resultado de una promesa sin que llegue a rechazarse nunca: mientras la prueba espera a otra cosa, una apertura que
 * falla no deja un rechazo sin atender. Copiada de `corridaConProceso.test.ts`, donde está explicada, con `retener`,
 * `esperarQueAlguienEspere` y `lotesLibres`.
 */
type Resultado<T> = { ok: true; valor: T } | { ok: false; error: unknown };
const resultadoDe = <T>(p: Promise<T>): Promise<Resultado<T>> =>
  p.then((valor) => ({ ok: true as const, valor }), (error: unknown) => ({ ok: false as const, error }));

/** Una transacción AJENA que hace `trabajo` y se queda abierta hasta que se la suelte. **Hay que llamar siempre a
 *  `soltar()`** (en un `finally`), o la limpieza se colgaría. */
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

/** Cuántas sesiones esperan ahora mismo a la sesión `pid`. */
async function esperanA(pid: number): Promise<number> {
  const [fila] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
  return fila!.n;
}

/** Se OBSERVA en la base que alguien espera a la sesión `pid`, en vez de inferirlo de que algo tarde. */
async function esperarQueAlguienEspere(pid: number, mensaje: string) {
  let esperando = 0;
  for (let intento = 0; intento < 100 && esperando === 0; intento++) {
    esperando = await esperanA(pid);
    if (esperando === 0) await new Promise((r) => setTimeout(r, 50));
  }
  expect(esperando, mensaje).toBeGreaterThan(0);
}

/** Las filas de `lot` que se pueden bloquear AHORA: `SKIP LOCKED` se salta las que alguien retiene. */
async function lotesLibres(ids: string[]): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM traceability.lot WHERE id = ANY(${ids}::uuid[]) FOR UPDATE SKIP LOCKED`;
  return filas.map((f) => f.id).sort();
}

/**
 * Abre `versionId` sobre `lotId` mientras una transacción AJENA retiene `bloqueo`, y dice si la apertura ESPERÓ a esa
 * transacción. **Lo que se observa** (`pg_blocking_pids`) es si alguien espera a la sesión ajena mientras la apertura está en
 * marcha: o se ve esperar, o la apertura termina sola. La ajena se suelta siempre (`finally`) y se espera a las dos
 * promesas, así que un `FOR UPDATE` donde tocaba `FOR SHARE` hace fallar la aserción del llamador, no cuelga la limpieza.
 */
async function aperturaMientrasAlguienRetiene(
  bloqueo: (tx: Prisma.TransactionClient) => Promise<unknown>,
  lotId: string,
  versionId: string,
) {
  const retiene = retener(bloqueo);
  let apertura: Promise<Resultado<Awaited<ReturnType<typeof abrir>>>> | undefined;
  let esperaba = false;
  let termino = false;
  try {
    const pid = await retiene.pid;
    apertura = resultadoDe(abrir(lotId, versionId));
    // Hasta ~10 s: o se ve esperar a alguien, o la apertura termina con la ajena todavía abierta.
    for (let intento = 0; intento < 200 && !esperaba && !termino; intento++) {
      esperaba = (await esperanA(pid)) > 0;
      if (esperaba) break;
      termino = await Promise.race([apertura.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 50))]);
    }
  } finally {
    retiene.soltar();
  }
  await retiene.hecho;
  const resultado = await apertura!;
  // Ni se vio esperar ni terminó: la prueba no midió nada, y un veredicto «no esperó» sería falso.
  if (!esperaba && !termino) throw new Error("la apertura ni terminó ni se vio esperar en ~10 s: no se puede decir si esperó");
  return { esperaba, resultado };
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  otraOrgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST otra ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  // Sin ninguna asignación: la prueba de acceso la usa para abrir sobre un lote que no puede gestionar.
  sinPermiso = await cuenta("SinPermiso");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  const [g, c] = await Promise.all([
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
  ]);
  gradoId = g.id;
  cerezaId = c.id;
}, 60000);

afterAll(async () => {
  // La limpieza DESCUBRE lo que tiene que borrar por el RUN de esta corrida y no hereda nada de las variables del fixture (ronda de arreglo del
  // 2026-10-06, H2): si el `beforeAll` muriera antes de asignarlas —un rol que no existe, una parcela que no se crea—, `assertDefinedWhere` sobre una
  // variable sin asignar abortaría el `afterAll` entero y dejaría vivo lo que el `beforeAll` SÍ creó (medido con esa mutación, en esta misma
  // forma: dos organizaciones de más). Aquí `orgId`, `plotId`, `gestor`… no se leen: se buscan las filas por su nombre, y las que dependen de ellas
  // (parcelas, cuentas, ámbitos, lotes) por las halladas. Cada `where` sale de arreglos —que pueden estar vacíos, y `{ in: [] }` no casa con nada—,
  // nunca de una variable que pueda no estar asignada.
  const organizaciones = (await prisma.organization.findMany({ where: { name: { contains: RUN } }, select: { id: true } })).map((o) => o.id);
  const parcelas = (await prisma.location.findMany({
    where: { OR: [{ name: { contains: RUN } }, { organizationId: { in: organizaciones } }] }, select: { id: true },
  })).map((l) => l.id);
  const personas = (await prisma.person.findMany({ where: { displayName: { contains: RUN } }, select: { id: true } })).map((p) => p.id);
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  const ambitos = (await prisma.scope.findMany({
    where: { scopeType: "location", scopeRefId: { in: parcelas } }, select: { id: true },
  })).map((s) => s.id);
  const lotesDeLaCorrida = (await prisma.lot.findMany({
    where: { OR: [{ lotCode: { contains: RUN } }, { organizationId: { in: organizaciones } }] }, select: { id: true },
  })).map((l) => l.id);

  // Los procesos primero (`process_recipe_version_id` es RESTRICT), con su auditoría.
  await borrarProcesosDeLotesDonde({ id: { in: lotesDeLaCorrida } });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotesDeLaCorrida } }) });
  // Las recetas de esta corrida —por su nombre, también las compartidas— y TODA receta que quede en sus dos
  // organizaciones (las de `abrirProcesoDePrueba` que traiga la 5b, si su limpieza fallara), con sus versiones, pasos y metas (Cascade). DESPUÉS de los
  // procesos que las usan y ANTES de las organizaciones: `process_recipe.organization_id` es RESTRICT desde la tarea 1, así
  // que una receta que quedara viva haría FALLAR el borrado de su organización (el `afterAll` entero, no una receta
  // convertida en plantilla de todas, que era lo que hacía el SET NULL de antes).
  await prisma.processRecipe.deleteMany({
    where: assertDefinedWhere({ OR: [{ name: { contains: RUN } }, { organizationId: { in: organizaciones } }] }),
  });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeId: { in: ambitos } }, { userAccountId: { in: cuentas } }] }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: parcelas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });
  // Al final, para que un fallo no deje sin borrar lo de arriba: se CUENTAN las filas del propio RUN, que es lo único que distingue «limpió» de «pasó».
  const quedan = {
    organizaciones: await prisma.organization.count({ where: { name: { contains: RUN } } }),
    parcelas: await prisma.location.count({ where: { name: { contains: RUN } } }),
    personas: await prisma.person.count({ where: { displayName: { contains: RUN } } }),
    cuentas: await prisma.userAccount.count({ where: { id: { in: cuentas } } }),
    ambitos: await prisma.scope.count({ where: { id: { in: ambitos } } }),
    lotes: await prisma.lot.count({ where: { lotCode: { contains: RUN } } }),
    recetas: await prisma.processRecipe.count({ where: { name: { contains: RUN } } }),
  };
  expect(Object.entries(quedan).filter(([, n]) => n > 0), "quedan filas de esta corrida").toEqual([]);
}, 60000);

describe("Parte 2a, §3.3 — la versión que se pasa a abrir tiene que estar publicada, viva y ser de la organización del lote", () => {
  it("una versión en BORRADOR no abre (`version_no_publicada`) y no deja nada escrito; la misma versión, publicada, abre", async () => {
    const { versionId } = await receta("Borrador", { organizationId: orgId, version: "draft" });
    const l = await lote("BORRADOR");
    await expect(abrir(l, versionId)).rejects.toThrow(new LotProcessError("version_no_publicada"));
    expect(await procesosDe(l), "un rechazo dejó un proceso escrito").toBe(0);
    // Control: lo único que cambia es el estado de la versión.
    await prisma.processRecipeVersion.update({ where: { id: versionId }, data: { status: "approved" } });
    expect((await abrir(l, versionId)).processRecipeVersionId).toBe(versionId);
  });

  // F2-8 (ronda 2 de la revisión final del PR-A): el enum `RecordStatus` tiene siete estados y sólo se probaba el borrador, así que aflojar `!== "approved"` a `=== "draft"` en la puerta dejaba
  // pasar una versión «incompleta», «pendiente de revisión», «verificada», «archivada» o «rechazada» y ninguna prueba caía. Los estados salen del enum GENERADO, no de una lista escrita
  // a mano: un estado nuevo entra solo en la prueba.
  const ESTADOS_QUE_NO_ABREN = Object.values(RecordStatus).filter((estado) => estado !== "approved");

  it("control: los estados que no abren salen del enum generado (todos menos «approved»), y entre ellos está el borrador", () => {
    expect(Object.values(RecordStatus), "el enum trae «approved»").toContain("approved");
    expect(ESTADOS_QUE_NO_ABREN, "y el borrador").toContain("draft");
    expect(ESTADOS_QUE_NO_ABREN.length, "y los demás: el enum tiene siete estados").toBeGreaterThanOrEqual(6);
  });

  it.each(ESTADOS_QUE_NO_ABREN)(
    "una versión en estado «%s» no abre (`version_no_publicada`) y no deja nada escrito; la misma versión, publicada, abre",
    async (estado) => {
      const { versionId } = await receta(`Estado ${estado}`, { organizationId: orgId, version: estado });
      const l = await lote(`ESTADO-${estado.toUpperCase()}`);
      await expect(abrir(l, versionId)).rejects.toThrow(new LotProcessError("version_no_publicada"));
      expect(await procesosDe(l), "un rechazo dejó un proceso escrito").toBe(0);
      // Control: lo único que cambia es el estado de la versión.
      await prisma.processRecipeVersion.update({ where: { id: versionId }, data: { status: "approved" } });
      expect((await abrir(l, versionId)).processRecipeVersionId).toBe(versionId);
    },
  );

  it("una receta ARCHIVADA no abre (`recipe_archived`) aunque su versión esté publicada; la misma receta, viva, abre", async () => {
    // `recipe_archived` existía desde la Parte 1 y no tenía ninguna prueba (medido: 0 apariciones en `tests/`).
    const { recipeId, versionId } = await receta("Archivada", { organizationId: orgId, receta: "archived" });
    const l = await lote("ARCHIVADA");
    await expect(abrir(l, versionId)).rejects.toThrow(new LotProcessError("recipe_archived"));
    expect(await procesosDe(l), "un rechazo dejó un proceso escrito").toBe(0);
    // Control: lo único que cambia es el estado de la receta.
    await prisma.processRecipe.update({ where: { id: recipeId }, data: { status: "approved" } });
    expect((await abrir(l, versionId)).processRecipeVersionId).toBe(versionId);
  });

  it("una receta de OTRA organización no abre (`receta_de_otra_organizacion`); una compartida sí, y la misma receta pasada a la organización del lote también", async () => {
    const ajena = await receta("Ajena", { organizationId: otraOrgId });
    const compartida = await receta("Compartida", { organizationId: null });
    const l1 = await lote("AJENA");
    await expect(abrir(l1, ajena.versionId)).rejects.toThrow(new LotProcessError("receta_de_otra_organizacion"));
    expect(await procesosDe(l1), "un rechazo dejó un proceso escrito").toBe(0);
    // Control 1: el MISMO lote, con una receta sin organización (compartida, como la acepta el tueste), abre.
    expect((await abrir(l1, compartida.versionId)).processRecipeVersionId).toBe(compartida.versionId);
    // Control 2: la MISMA receta ajena, pasada a la organización del lote, abre: lo que se rechazaba era la organización.
    await prisma.processRecipe.update({ where: { id: ajena.recipeId }, data: { organizationId: orgId } });
    const l2 = await lote("AJENA-YA-PROPIA");
    expect((await abrir(l2, ajena.versionId)).processRecipeVersionId).toBe(ajena.versionId);
  });

  /**
   * H3 (ronda de arreglo del 2026-10-06; decisión del controlador): la organización se mira ANTES que el estado, como en el tueste
   * (`tuesteSoloConPublicadas.test.ts`, «una versión AJENA en borrador se rechaza por ser ajena»). Quien no es de la organización de la receta no
   * aprende si su versión es un borrador o si la receta está archivada: recibe el mismo rechazo que con una ajena publicada. El control cambia SÓLO
   * de quién es la receta: la misma forma, propia, sí cuenta su estado.
   */
  it("una versión AJENA en borrador, o de una receta AJENA archivada, se rechaza por ser ajena: su estado no se cuenta a quien no es de su organización", async () => {
    const ajenaBorrador = await receta("Ajena borrador", { organizationId: otraOrgId, version: "draft" });
    const ajenaArchivada = await receta("Ajena archivada", { organizationId: otraOrgId, receta: "archived" });
    const l = await lote("AJENA-ESTADO");
    await expect(abrir(l, ajenaBorrador.versionId), "la ajena en borrador contó su estado").rejects.toThrow(new LotProcessError("receta_de_otra_organizacion"));
    await expect(abrir(l, ajenaArchivada.versionId), "la ajena archivada contó su estado").rejects.toThrow(new LotProcessError("receta_de_otra_organizacion"));
    expect(await procesosDe(l), "un rechazo dejó un proceso escrito").toBe(0);
    // Control: la MISMA forma, pero de la organización del lote, sí cuenta su estado: el borrador es `version_no_publicada`.
    const propiaBorrador = await receta("Propia borrador", { organizationId: orgId, version: "draft" });
    await expect(abrir(l, propiaBorrador.versionId)).rejects.toThrow(new LotProcessError("version_no_publicada"));
    expect(await procesosDe(l), "un rechazo dejó un proceso escrito").toBe(0);
  });

  /**
   * H1 (ronda de arreglo del 2026-10-06): `abrirProceso` recorta el id de la versión (`processRecipeVersionId?.trim() || null`), y el recorte no
   * tenía prueba: la mutación `?? null` compilaba y dejaba verdes todas. Antes de la 5a un id en blanco reventaba con la clave foránea
   * (P2007: la cadena vacía no es un uuid); ahora se trata como «sin versión» y abre «Sin receta».
   *
   * **La 5b invierte la primera mitad**: cuando la receta sea obligatoria, un id en blanco —igual que nulo o ausente— se rechaza con
   * `sin_receta`, y esta mitad pasa a esperar ese rechazo. La segunda se queda tal cual: un id con espacios alrededor se recorta y abre con SU
   * versión, y es la que prueba que el campo se lee y que el recorte llega a la versión (el control de que el id en blanco no se ignora porque sí).
   * Cada mitad ve una mutación distinta: `?? null` cae por la primera (la cadena vacía llega a la base) y recortar sólo para decidir si el id está en
   * blanco, pasando el id SIN recortar, cae por la segunda.
   */
  it("un id de versión en BLANCO abre «Sin receta»; con espacios alrededor, se recorta y abre con esa versión", async () => {
    const l1 = await lote("ID-EN-BLANCO");
    await expect(abrir(l1, "   "), "un id en blanco no abrió «Sin receta»").resolves.toMatchObject({ processRecipeVersionId: null });
    expect(await procesosDe(l1)).toBe(1);
    // Control: el MISMO campo, con una versión publicada y espacios alrededor, abre con ella.
    const { versionId } = await receta("Recortada", { organizationId: orgId });
    const l2 = await lote("ID-CON-ESPACIOS");
    await expect(abrir(l2, `  ${versionId}  `), "un id con espacios alrededor no se recortó").resolves.toMatchObject({ processRecipeVersionId: versionId });
    expect(await procesosDe(l2)).toBe(1);
  });
});

/**
 * H4 (ronda de arreglo del 2026-10-06; ruling INV): el ACCESO al lote va antes que todo lo que mira la versión. La única prueba de acceso de
 * `abrirProceso` (`lotProcess.test.ts`, «sin acceso al lote no se puede abrir») no pasa versión ni nombra el error, así que no veía una autorización
 * que sólo faltara cuando se pasa una. Aquí: sin permiso sobre el lote, abrir con una versión publicada —y con una en borrador— rechaza con la clase
 * de acceso (`TraceabilityAccessError`), nunca con `version_no_publicada` ni `recipe_version_not_found`, que le contarían a quien no puede ver el lote
 * cómo está esa receta. La cuenta con permiso es el control: sobre el mismo lote y las mismas versiones, el borrador sí se rechaza por su estado y la
 * publicada abre.
 */
describe("Parte 2a, §3.3 — sin permiso sobre el lote, abrir con una versión rechaza por acceso, antes que por la versión", () => {
  it("sin permiso: acceso rechazado con la versión publicada y con la que está en borrador; con permiso, el borrador es `version_no_publicada` y la publicada abre", async () => {
    const publicada = await receta("Acceso publicada", { organizationId: orgId });
    const borrador = await receta("Acceso borrador", { organizationId: orgId, version: "draft" });
    const l = await lote("ACCESO");
    for (const [cual, versionId] of [["publicada", publicada.versionId], ["en borrador", borrador.versionId]] as const) {
      const r = await resultadoDe(abrirComo(sinPermiso, l, versionId));
      expect(r.ok, `sin permiso, abrir con la versión ${cual} no se rechazó`).toBe(false);
      if (r.ok) continue;
      expect(r.error, `sin permiso, la versión ${cual} se rechazó con otra clase de error: ${String(r.error)}`).toBeInstanceOf(TraceabilityAccessError);
      expect(r.error, `sin permiso, la versión ${cual} salió con el error de proceso`).not.toBeInstanceOf(LotProcessError);
      expect((r.error as Error).message).toBe("no_lot_access");
    }
    expect(await procesosDe(l), "un rechazo dejó un proceso escrito").toBe(0);
    // Control: la cuenta con permiso, sobre el MISMO lote. El estado de la versión sí lo rechaza (el acceso pasó) y la publicada abre.
    await expect(abrir(l, borrador.versionId)).rejects.toThrow(new LotProcessError("version_no_publicada"));
    expect((await abrir(l, publicada.versionId)).processRecipeVersionId).toBe(publicada.versionId);
  });
});

/**
 * §3.3: «abrir un proceso con esa versión bloquea la fila de la versión», y la decisión del controlador del 2026-10-03: el
 * linaje PRIMERO, la versión después —el orden de R2—. Y la del 2026-10-04: con **`FOR SHARE`**, la versión y su receta —no
 * `FOR UPDATE`—: basta para cerrar el paso a publicar y a archivar, no serializa las aperturas entre sí y no choca con el
 * `FOR KEY SHARE` que la clave foránea de `lot_process` toma al insertar el proceso. Editar y publicar (tarea 3) toman
 * `FOR UPDATE` sobre la versión y numerar una versión nueva (tareas 3 y 4), sobre la receta —cada uno una sola fila—, así que
 * linaje → receta → versión no cierra ningún ciclo con ellos.
 *
 * Lo que la ajena toma en cada prueba, y por qué:
 * - **`FOR NO KEY UPDATE`** sobre la versión (la mutación de un estado, y lo que toma un `UPDATE` de una columna que no es
 *   clave): choca con `FOR SHARE` y NO con el `FOR KEY SHARE` de la clave foránea. Con `FOR UPDATE` en la ajena, `abrirProceso`
 *   esperaría por su propio insert aunque no bloqueara la versión él mismo, y la prueba no distinguiría nada.
 * - **`FOR SHARE`** sobre la versión: lo que tomaría OTRA apertura con la misma receta. Si `abrirProceso` tomara `FOR UPDATE`,
 *   esperaría; con `FOR SHARE`, no.
 * - **`FOR NO KEY UPDATE`** sobre la receta (lo que toma archivarla): si `abrirProceso` bloqueara sólo la versión, no esperaría.
 */
describe("Parte 2a, §3.3 — abrir bloquea la receta y su versión con FOR SHARE, después del linaje", () => {
  it("espera a quien edita la versión, y mientras espera ya tiene el lote (el linaje va primero)", async () => {
    const { versionId } = await receta("Bloqueo", { organizationId: orgId });
    const l = await lote("BLOQUEO");
    expect(await lotesLibres([l]), "control: antes de abrir, nadie retiene el lote").toEqual([l]);
    const retiene = retener((tx) => tx.$queryRaw`SELECT id FROM traceability.process_recipe_version WHERE id = ${versionId}::uuid FOR NO KEY UPDATE`);
    let apertura: Promise<Resultado<Awaited<ReturnType<typeof abrir>>>> | undefined;
    try {
      const pid = await retiene.pid;
      apertura = resultadoDe(abrir(l, versionId));
      await esperarQueAlguienEspere(pid, "abrir no esperó a quien retiene la versión: no la bloquea");
      expect(await lotesLibres([l]), "abrir espera la versión sin tener el lote: la versión se bloqueó ANTES que el linaje").toEqual([]);
    } finally {
      retiene.soltar();
    }
    await retiene.hecho;
    const resultado = await apertura!;
    expect(resultado.ok, "soltada la versión, la apertura tenía que terminar bien").toBe(true);
    expect(await procesosDe(l)).toBe(1);
  });

  it("NO espera a quien sólo LEE la versión: dos aperturas con la misma receta no se serializan (FOR SHARE, no FOR UPDATE)", async () => {
    const { versionId } = await receta("Compartido", { organizationId: orgId });
    const l = await lote("COMPARTIDO");
    const { esperaba, resultado } = await aperturaMientrasAlguienRetiene(
      (tx) => tx.$queryRaw`SELECT id FROM traceability.process_recipe_version WHERE id = ${versionId}::uuid FOR SHARE`,
      l,
      versionId,
    );
    expect(esperaba, "abrir esperó a quien sólo lee la versión: la bloquea con FOR UPDATE y serializa las aperturas").toBe(false);
    expect(resultado.ok, "con la ajena todavía abierta, la apertura tenía que terminar").toBe(true);
    expect(await procesosDe(l)).toBe(1);
  });

  it("espera a quien toca la RECETA (archivarla): bloquea también su fila, no sólo la de la versión", async () => {
    const { recipeId, versionId } = await receta("Bloqueo de la receta", { organizationId: orgId });
    const l = await lote("BLOQUEO-RECETA");
    const { esperaba, resultado } = await aperturaMientrasAlguienRetiene(
      (tx) => tx.$queryRaw`SELECT id FROM traceability.process_recipe WHERE id = ${recipeId}::uuid FOR NO KEY UPDATE`,
      l,
      versionId,
    );
    expect(esperaba, "abrir no esperó a quien retiene la receta: sólo bloquea la versión").toBe(true);
    expect(resultado.ok, "soltada la receta, la apertura tenía que terminar bien").toBe(true);
    expect(await procesosDe(l)).toBe(1);
  });
});

/**
 * El selector ofrece lo que `abrirProceso` acepta. Es el de la página del proceso, el de `roast/new` y el del perfil de
 * tueste de la ficha (`app/lots/[id]/page.tsx`): los tres llaman a `listRecipeVersionsForLot`. Recetas compartidas de
 * otros archivos pueden salir a la vez en la lista: por eso se mira cada id de ESTA corrida, no la longitud.
 */
describe("Parte 2a — el selector de recetas no ofrece lo que abrir rechaza", () => {
  it("ofrece la propia y la compartida en su versión PUBLICADA más nueva; ni borradores, ni archivadas, ni Libres, ni de otra organización", async () => {
    const l = await lote("SELECTOR");
    const propia = await receta("Selector propia", { organizationId: orgId });
    // Una v2 en borrador, como la deja la tarea 3 al «cambiar» una publicada: no esconde a la v1 publicada.
    const v2 = (await prisma.processRecipeVersion.create({ data: { recipeId: propia.recipeId, version: 2, status: "draft", createdBy: gestor } })).id;
    const compartida = await receta("Selector compartida", { organizationId: null });
    const soloBorrador = await receta("Selector solo borrador", { organizationId: orgId, version: "draft" });
    const archivada = await receta("Selector archivada", { organizationId: orgId, receta: "archived" });
    const libre = await receta("Selector libre", { organizationId: orgId, esLibre: true });
    const ajena = await receta("Selector ajena", { organizationId: otraOrgId });

    const ofrecidas = (await listRecipeVersionsForLot(gestor, l)).map((v) => v.id);
    // Controles: lo que SÍ se ofrece. Sin ellos, un selector vacío pasaría todas las ausencias de abajo.
    expect(ofrecidas, "no ofrece la v1 publicada de la receta propia").toContain(propia.versionId);
    expect(ofrecidas, "no ofrece la receta compartida").toContain(compartida.versionId);
    expect(ofrecidas, "ofrece la v2 en borrador").not.toContain(v2);
    expect(ofrecidas, "ofrece una receta cuya única versión es un borrador").not.toContain(soloBorrador.versionId);
    expect(ofrecidas, "ofrece una receta archivada").not.toContain(archivada.versionId);
    expect(ofrecidas, "ofrece una receta Libre").not.toContain(libre.versionId);
    expect(ofrecidas, "ofrece una receta de otra organización").not.toContain(ajena.versionId);
  });

  /**
   * I5 (registro, 2026-10-04): el rótulo del selector dice «<n> pasos» si la versión los tiene y «<n> objetivos» si no (tarea 13),
   * así que el selector trae cuántos pasos tiene cada versión y SÓLO las metas de la versión: las de sus pasos
   * (`recipeStepId` no nulo) las cuenta el paso, y contadas aquí inflarían «objetivos».
   */
  it("trae cuántos pasos tiene cada versión y sólo las metas de la VERSIÓN, no las de sus pasos", async () => {
    const l = await lote("SELECTOR-PASOS");
    const conPasos = await receta("Selector con pasos", { organizationId: orgId });
    const sinPasos = await receta("Selector sin pasos", { organizationId: orgId });
    const paso1 = await prisma.processRecipeStep.create({ data: { recipeVersionId: conPasos.versionId, seq: 1, stepTypeValueId: await tipoDePaso("pulping") } });
    await prisma.processRecipeStep.create({ data: { recipeVersionId: conPasos.versionId, seq: 2, stepTypeValueId: await tipoDePaso("drying") } });
    // Una meta de la VERSIÓN y otra de un PASO, con la misma variable y el mismo momento: la unicidad parcial de la tarea 1 deja
    // las dos. Valores de prueba.
    await prisma.processTarget.create({ data: { recipeVersionId: conPasos.versionId, variable: "brix", moment: "initial", minValue: 18, maxValue: 24, unit: "°Bx" } });
    await prisma.processTarget.create({ data: { recipeVersionId: conPasos.versionId, recipeStepId: paso1.id, variable: "brix", moment: "initial", minValue: 20, maxValue: 22, unit: "°Bx" } });

    const ofrecidas = await listRecipeVersionsForLot(gestor, l);
    const con = ofrecidas.find((v) => v.id === conPasos.versionId);
    const sin = ofrecidas.find((v) => v.id === sinPasos.versionId);
    // Controles: las dos se ofrecen y la base tiene las dos metas; lo que el selector decide es cuál enseña.
    expect(con, "no ofrece la versión con pasos").toBeDefined();
    expect(sin, "no ofrece la versión sin pasos").toBeDefined();
    expect(await prisma.processTarget.count({ where: { recipeVersionId: conPasos.versionId } }), "la base debía tener las dos metas").toBe(2);
    expect(con!._count.steps, "no trae cuántos pasos tiene la versión").toBe(2);
    expect(sin!._count.steps).toBe(0);
    expect(con!.targets.map((t) => t.recipeStepId), "enseña la meta de un paso como si fuera de la versión").toEqual([null]);
    expect(Number(con!.targets[0]!.minValue)).toBe(18);
  });
});
