/**
 * La intervención del proceso con su paso — Parte 2a, tarea 8 (diseño §4.1, §4.2, §4.4; registro de la 2a, 2026-10-03).
 *
 * Mide `registrarIntervencion` de `lib/traceability/lotProcess.ts`, la del PROCESO del lote. La homónima de
 * `lib/traceability/intervenciones.ts` es la fitosanitaria de parcela y esta tarea no la toca.
 *
 * - El acto es el TIPO DE PASO (decisión de Daniel, 2026-10-03) y, con él, el valor de catálogo es opcional.
 * - Pasa por el guardián de la tarea 7 (`exigePasoCoherente`): paso de otra receta, tipo que una intervención no cumple,
 *   el tipo tomado del paso, la desviación con motivo, y lo que NO es desviación.
 * - Decide dentro de la transacción, con el linaje bloqueado (antes decidía fuera: reconocimiento u2 §9 y u3 S9).
 * - Deja su `AuditEvent` `lot_process.record_intervention` con el paso, el tipo y el motivo, y pide `manage` sobre el lote
 *   del proceso ANTES que cualquier otra cosa: ninguna prueba leía ni lo uno ni lo otro (u3 S12; Ruling INV).
 * - `opcionesParaProceso` ofrece, aparte, los tipos de paso que una intervención cumple, y no ofrece los valores ALIAS.
 * - Un valor alias (`aliasOfId`) es el mismo valor escrito de otra forma: si llega, se guarda el canónico (Ruling I7 del
 *   cruce, 2026-10-04; como `fieldSessions.ts` con los tipos de evento). Se prueba con dos valores PROPIOS de la prueba,
 *   creados en un catálogo de manejos de verdad (`sustrato_anadido`) y borrados al final: no dependen de que la semilla
 *   haya corrido con los cuatro alias reales (que esta misma tarea añade, y prueban aparte `vocabulario`,
 *   `vocabularioSembrado` y `catalogosSinCrecer`).
 *
 * **Las recetas se escriben con `prisma` directo**, ya publicadas y en la organización del archivo, como en
 * `tests/recetas/guardian.test.ts`: lo que se mide es la intervención, y un fixture que pasara por el servicio de pasos
 * (tarea 3) caería por otra cosa el día que esa validación cambie. Se escriben en el orden que la tarea 3 hace cumplir:
 * la versión en borrador, sus pasos, y después publicada. Los procesos se abren por `abrirProceso`, salvo el proceso VIEJO
 * sin receta (R9), que desde la tarea 5b sólo existe escrito crudo.
 *
 * **La limpieza DESCUBRE lo que borra, no lo hereda del `beforeAll`** (CLAUDE.md del repositorio, «Una limpieza que se
 * apoya en una variable del fixture no corre si el `beforeAll` muere antes»): todo sale de la marca del RUN —la
 * organización por su nombre, de ella sus ubicaciones y sus lotes; las personas por su `displayName`; las recetas por
 * organización y por nombre; los dos valores de catálogo por su nombre—. Lo que crea un `it` se borra en `afterEach`
 * (falle o no la prueba), nunca al final del cuerpo; lo del `beforeAll`, en `afterAll`, que además CUENTA lo que queda del
 * RUN y falla si sobra algo. En orden de clave ajena: la auditoría de la intervención cuelga de ella sólo por su `entityId`
 * y no se va sola; las intervenciones antes que los pasos (`recipe_step_id` es RESTRICT) y que el valor de catálogo que
 * guardan (`catalog_value_id` es RESTRICT); los procesos antes que las mediciones (la de cierre es RESTRICT) y que las
 * versiones (RESTRICT); las recetas antes que la organización (`organization_id` es RESTRICT desde la tarea 1 —Ruling
 * FK-ORG—: borrar una organización que aún tiene recetas FALLA, ya no las convierte en silencio en plantillas de todas).
 * El alias se borra antes que su canónico (`alias_of_id`).
 *
 * Cuentas: un Farm Operator con ámbito en la parcela del archivo, y una cuenta sin ninguna asignación —el control del
 * permiso—. Ningún Platform Admin: vería la base entera (CLAUDE.md del repositorio).
 *
 * Base: la base propia de la 2a, sembrada. Grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { TIPOS_POR_REGISTRO } from "../../lib/recetas/vocabulario";
import { abrirProceso, LotProcessError, opcionesParaProceso, registrarIntervencion } from "../../lib/traceability/lotProcess";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { bloquearLinaje } from "../../lib/traceability/procesoDelLinaje";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";

const RUN = `intervencion-paso-${Date.now()}`;

let orgId: string;
let plotId: string;
let gestor: string;
let sinPermiso: string;
let grado: string;
let cereza: string;
/** Del vocabulario de manejos (`medio_lavado`): el «cómo» de un lavado. */
let aguaLimpia: string;
/** Un valor real que NO es del vocabulario de manejos ni de `tipo_paso`. */
let deOtroCatalogo: string;
/** Ruling I7: dos valores PROPIOS de la prueba en `sustrato_anadido` —un catálogo de manejos de verdad—: un canónico y un alias suyo. */
const NOMBRE_DEL_CANONICO = `TEST canónico ${RUN}`;
const NOMBRE_DEL_ALIAS = `TEST alias ${RUN}`;
let canonico: string;
let alias: string;
const tipo = { pulping: "", washing: "", drying: "" };
/** La receta del proceso: despulpado (1), lavado (2) y secado (3). */
const conPasos = { versionId: "", pulping: "", washing: "", drying: "" };
/** Otra receta publicada de la misma organización, con su propio despulpado. */
const otra = { versionId: "", pulping: "" };
/** Una receta publicada sin pasos, como todas las de antes de la 2a. */
const sinPasos = { versionId: "" };
/** Las mediciones de cierre de los procesos de la prueba: se borran DESPUÉS de los procesos (RESTRICT). */
const mediciones: string[] = [];
const cuando = new Date("2026-05-02T09:00:00Z");

async function valor(catalogo: string, value: string): Promise<string> {
  return (
    await prisma.variableCatalogValue.findFirstOrThrow({ where: { value, catalog: { key: catalogo } }, select: { id: true } })
  ).id;
}

async function cuenta(label: string): Promise<string> {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" },
  });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}

/** Un lote de la parcela del archivo. Todo lote de la prueba lleva `RUN` en su código: la limpieza los encuentra por él. */
async function lote(codigo: string): Promise<string> {
  return (
    await prisma.lot.create({
      data: {
        lotCode: `${codigo}-${RUN}`,
        lotType: "cherry",
        organizationId: orgId,
        locationId: plotId,
        status: "approved",
        classification: "internal",
        createdBy: gestor,
      },
    })
  ).id;
}

/** Una receta de la organización del archivo, con su v1 PUBLICADA y un paso por tipo, en orden. */
async function receta(nombre: string, tipos: readonly string[]): Promise<{ versionId: string; pasos: string[] }> {
  const r = await prisma.processRecipe.create({
    data: { name: `TEST ${nombre} ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor },
  });
  const v = await prisma.processRecipeVersion.create({
    data: { recipeId: r.id, version: 1, status: "draft", createdBy: gestor },
  });
  const pasos: string[] = [];
  for (const [i, stepTypeValueId] of tipos.entries()) {
    pasos.push((await prisma.processRecipeStep.create({ data: { recipeVersionId: v.id, seq: i + 1, stepTypeValueId } })).id);
  }
  await prisma.processRecipeVersion.update({ where: { id: v.id }, data: { status: "approved" } });
  return { versionId: v.id, pasos };
}

/** Abre un proceso por el servicio, con la receta dada (la receta es obligatoria desde la tarea 5b). */
async function abrirCon(lotId: string, versionId: string) {
  return abrirProceso(gestor, {
    lotId,
    processRecipeVersionId: versionId,
    intent: "TEST: manejos con su paso (Parte 2a, tarea 8)",
    processGradeValueId: grado,
    cherryStateValueId: cereza,
    targetMoisturePct: 11,
    startedAt: new Date("2026-05-01T12:00:00Z"),
    provenanceClass: "original_record",
  });
}

/** Un proceso de ANTES de la 2a, sin receta (R9). `abrirProceso` ya no lo abre: se escribe crudo. */
async function procesoSinReceta(lotId: string) {
  return prisma.lotProcess.create({
    data: {
      lotId,
      sequenceOrder: 1,
      intent: "TEST: proceso de antes de la 2a, sin receta (R9)",
      processGradeValueId: grado,
      cherryStateValueId: cereza,
      targetMoisturePct: 11,
      startedAt: new Date("2026-05-01T12:00:00Z"),
      provenanceClass: "original_record",
      createdBy: gestor,
    },
  });
}

/**
 * Borra lo que cuelga de los lotes del RUN, descubierto por el RUN y por la organización (no por variables del fixture):
 * la auditoría de sus intervenciones, las intervenciones, los procesos (con su receta de prueba y su auditoría), las
 * mediciones y los lotes. Lo llama el `afterEach` —tras cada `it`, falle o no— y el `afterAll`.
 */
async function limpiarLotes(): Promise<void> {
  const organizaciones = (
    await prisma.organization.findMany({ where: assertDefinedWhere({ name: { startsWith: `TEST ${RUN}` } }), select: { id: true } })
  ).map((o) => o.id);
  const lotes = (
    await prisma.lot.findMany({
      where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { lotCode: { contains: RUN } }] }),
      select: { id: true },
    })
  ).map((l) => l.id);
  const intervenciones = (
    await prisma.lotProcessIntervention.findMany({
      where: assertDefinedWhere({ lotProcess: { lotId: { in: lotes } } }),
      select: { id: true },
    })
  ).map((i) => i.id);
  // La auditoría de una intervención cuelga de la INTERVENCIÓN por su `entityId`: el ayudante de procesos no la conoce.
  await prisma.auditEvent.deleteMany({
    where: assertDefinedWhere({ entityType: "lot_process_intervention", entityId: { in: intervenciones } }),
  });
  await prisma.lotProcessIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: intervenciones } }) });
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ OR: [{ id: { in: mediciones } }, { lotId: { in: lotes } }] }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  mediciones.length = 0;
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" },
    })
  ).id;
  plotId = (
    await prisma.location.create({
      data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
    })
  ).id;

  gestor = await cuenta("Gestor");
  sinPermiso = await cuenta("SinPermiso");
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } });
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId: scope.id } });
  // `sinPermiso` no recibe ninguna asignación: es el control del permiso.

  grado = await valor("grado_proceso", "Washed");
  cereza = await valor("estado_cereza", "despulpada");
  aguaLimpia = await valor("medio_lavado", "agua_limpia");
  deOtroCatalogo = await valor("grado_proceso", "Natural");
  for (const t of ["pulping", "washing", "drying"] as const) tipo[t] = await valor("tipo_paso", t);

  // Ruling I7: el canónico y su alias, los dos de `sustrato_anadido` (es de `CATALOGOS_DE_INTERVENCION`). Un alias apunta
  // directo a su canónico, nunca a otro alias (`VariableCatalogValue.aliasOfId`). Nombres con `RUN`: nadie más los toca.
  const sustrato = await prisma.variableCatalog.findUniqueOrThrow({ where: { key: "sustrato_anadido" }, select: { id: true } });
  canonico = (await prisma.variableCatalogValue.create({ data: { catalogId: sustrato.id, value: NOMBRE_DEL_CANONICO } })).id;
  alias = (
    await prisma.variableCatalogValue.create({ data: { catalogId: sustrato.id, value: NOMBRE_DEL_ALIAS, aliasOfId: canonico } })
  ).id;

  const c = await receta("Lavado con pasos", [tipo.pulping, tipo.washing, tipo.drying]);
  conPasos.versionId = c.versionId;
  conPasos.pulping = c.pasos[0]!;
  conPasos.washing = c.pasos[1]!;
  conPasos.drying = c.pasos[2]!;
  const o = await receta("Otra con despulpado", [tipo.pulping]);
  otra.versionId = o.versionId;
  otra.pulping = o.pasos[0]!;
  sinPasos.versionId = (await receta("De antes, sin pasos", [])).versionId;
}, 60000);

afterEach(async () => {
  await limpiarLotes();
});

afterAll(async () => {
  // La limpieza DESCUBRE lo que borra, no lo hereda del `beforeAll`: si éste muere antes de asignar `orgId`, `plotId`, `gestor`…
  // esas variables siguen `undefined`, `assertDefinedWhere` lanza y abandona las filas que quedan. Todo sale de la marca del RUN.
  const ids = <T extends { id: string }>(filas: T[]) => filas.map((f) => f.id);
  await limpiarLotes();
  const organizaciones = ids(
    await prisma.organization.findMany({ where: assertDefinedWhere({ name: { startsWith: `TEST ${RUN}` } }), select: { id: true } }),
  );
  const ubicaciones = ids(
    await prisma.location.findMany({
      where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }),
      select: { id: true },
    }),
  );
  const personas = ids(await prisma.person.findMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }), select: { id: true } }));
  const cuentas = ids(await prisma.userAccount.findMany({ where: assertDefinedWhere({ personId: { in: personas } }), select: { id: true } }));
  const ambitos = ids(
    await prisma.scope.findMany({
      where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: ubicaciones } }),
      select: { id: true },
    }),
  );
  // Las recetas de la organización (las versiones caen en cascada con la receta, y los pasos con la versión). Por organización y no
  // sólo por nombre: con `process_recipe.organization_id` en RESTRICT, una receta viva haría FALLAR el borrado de la organización.
  await prisma.processRecipe.deleteMany({
    where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }),
  });
  // Ruling I7: el alias ANTES que su canónico (`alias_of_id`), y los dos después de las intervenciones. Por su nombre —que
  // lleva `RUN` y existe aunque el `beforeAll` haya fallado a medias—, no por un id que podría no estar.
  await prisma.variableCatalogValue.deleteMany({ where: assertDefinedWhere({ value: NOMBRE_DEL_ALIAS }) });
  await prisma.variableCatalogValue.deleteMany({ where: assertDefinedWhere({ value: NOMBRE_DEL_CANONICO }) });
  // Lo que firmaron las cuentas y nada de arriba borró: antes de borrar las cuentas (el actor es SET NULL y después no se
  // encontrarían). Luego, en el orden de las claves ajenas: asignaciones y ámbitos, cuentas y personas, ubicaciones y la organización.
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });

  // Contar lo que queda del RUN: «limpió» y «pasó» no son lo mismo. Si algo sobra, el archivo FALLA aquí, con la tabla y la cuenta.
  const restos: [string, number][] = [
    ["organization", await prisma.organization.count({ where: { OR: [{ id: { in: organizaciones } }, { name: { startsWith: `TEST ${RUN}` } }] } })],
    ["location", await prisma.location.count({ where: { OR: [{ id: { in: ubicaciones } }, { name: { contains: RUN } }] } })],
    ["scope", await prisma.scope.count({ where: { id: { in: ambitos } } })],
    ["person", await prisma.person.count({ where: { OR: [{ id: { in: personas } }, { displayName: { contains: RUN } }] } })],
    ["userAccount", await prisma.userAccount.count({ where: { id: { in: cuentas } } })],
    ["assignment", await prisma.assignment.count({ where: { OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] } })],
    ["lot", await prisma.lot.count({ where: { lotCode: { contains: RUN } } })],
    ["processRecipe", await prisma.processRecipe.count({ where: { OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] } })],
    ["variableCatalogValue", await prisma.variableCatalogValue.count({ where: { value: { contains: RUN } } })],
    ["auditEvent (de las cuentas)", await prisma.auditEvent.count({ where: { actorUserAccountId: { in: cuentas } } })],
  ];
  const sobran = restos.filter(([, n]) => n > 0);
  if (sobran.length > 0) {
    throw new Error(`intervencionConPaso.test: la limpieza dejó filas del RUN ${RUN}: ${sobran.map(([tabla, n]) => `${tabla}=${n}`).join(", ")}`);
  }
}, 60000);

describe("el acto es el tipo de paso, y con él el valor de catálogo es opcional (Daniel, 2026-10-03)", () => {
  it("fila patrón: la receta del proceso tiene sus tres pasos, la otra el suyo, y la de antes ninguno", async () => {
    const pasos = async (recipeVersionId: string) =>
      (
        await prisma.processRecipeStep.findMany({
          where: { recipeVersionId },
          orderBy: { seq: "asc" },
          select: { stepTypeValueId: true },
        })
      ).map((p) => p.stepTypeValueId);
    expect(await pasos(conPasos.versionId)).toEqual([tipo.pulping, tipo.washing, tipo.drying]);
    expect(await pasos(otra.versionId)).toEqual([tipo.pulping]);
    expect(await pasos(sinPasos.versionId)).toEqual([]);
    // Tres valores DISTINTOS de `tipo_paso`: si dos fueran el mismo, «toma el tipo del paso» no distinguiría nada.
    expect(new Set(Object.values(tipo)).size).toBe(3);
  });

  it("con un paso de la receta del proceso se une a él y toma su tipo, sin valor de catálogo", async () => {
    const p = await abrirCon(await lote("PASO"), conPasos.versionId);
    const i = await registrarIntervencion(gestor, { lotProcessId: p.id, recipeStepId: conPasos.pulping, occurredAt: cuando });
    const fila = await prisma.lotProcessIntervention.findUniqueOrThrow({ where: { id: i.id } });
    expect([fila.recipeStepId, fila.stepTypeValueId, fila.catalogValueId, fila.motivoDesviacion]).toEqual([
      conPasos.pulping,
      tipo.pulping,
      null,
      null,
    ]);
  });

  it("sin paso, tipo ni valor se rechaza intervencion_sin_acto; el valor solo o el tipo solo entran", async () => {
    const p = await abrirCon(await lote("ACTO"), sinPasos.versionId);
    await expect(registrarIntervencion(gestor, { lotProcessId: p.id, occurredAt: cuando })).rejects.toThrow(
      new LotProcessError("intervencion_sin_acto"),
    );
    // Lo que manda la acción con el desplegable sin elegir: cadenas vacías, que son «no viene».
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: "", stepTypeValueId: " ", occurredAt: cuando }),
    ).rejects.toThrow(new LotProcessError("intervencion_sin_acto"));
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
    // Controles: el valor solo —lo de antes de la 2a— y el tipo solo —lo nuevo— entran.
    const soloValor = await registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: cuando });
    expect([soloValor.catalogValueId, soloValor.stepTypeValueId]).toEqual([aguaLimpia, null]);
    const soloTipo = await registrarIntervencion(gestor, { lotProcessId: p.id, stepTypeValueId: tipo.washing, occurredAt: cuando });
    expect([soloTipo.catalogValueId, soloTipo.stepTypeValueId, soloTipo.recipeStepId, soloTipo.motivoDesviacion]).toEqual([
      null,
      tipo.washing,
      null,
      null,
    ]);
  });

  it("con tipo, el valor de catálogo, si viene, sigue siendo del vocabulario de manejos", async () => {
    const p = await abrirCon(await lote("VALOR"), sinPasos.versionId);
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, stepTypeValueId: tipo.washing, catalogValueId: deOtroCatalogo, occurredAt: cuando }),
    ).rejects.toThrow(new LotProcessError("catalog_value_wrong_catalog"));
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
    // Control: el mismo lavado con su «cómo» del vocabulario de manejos entra con los dos.
    const ok = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      stepTypeValueId: tipo.washing,
      catalogValueId: aguaLimpia,
      occurredAt: cuando,
    });
    expect([ok.stepTypeValueId, ok.catalogValueId]).toEqual([tipo.washing, aguaLimpia]);
  });

  /**
   * Ruling I7 (cruce del 2026-10-04): un alias es el mismo valor escrito de otra forma, y lo que se guarda es el CANÓNICO.
   * Sin esto, `mosto` y `doble mosto` serían dos valores en la tabla de intervenciones. El control es el canónico mismo, que
   * entra tal cual; y una intervención con el alias no deja guardado el alias, que es lo que cae si se quita la conducta.
   */
  it("mandar el id de un alias guarda el canónico; el canónico entra tal cual", async () => {
    const p = await abrirCon(await lote("ALIAS"), sinPasos.versionId);
    const porAlias = await registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: alias, occurredAt: cuando });
    expect(porAlias.catalogValueId).toBe(canonico);
    // Releído de la base, no sólo lo que devuelve la función.
    expect((await prisma.lotProcessIntervention.findUniqueOrThrow({ where: { id: porAlias.id } })).catalogValueId).toBe(canonico);
    // Control: el canónico, tal cual, sin pasar por ningún alias.
    const porCanonico = await registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: canonico, occurredAt: cuando });
    expect(porCanonico.catalogValueId).toBe(canonico);
    // Y el alias no quedó guardado en ninguna: sin esta cuenta, «guarda el canónico» no distinguiría de «guarda los dos».
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id, catalogValueId: alias } })).toBe(0);
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id, catalogValueId: canonico } })).toBe(2);
  });

  /**
   * Lo decide el guardián de la tarea 7 (supuesto (b) de este plan): un secado lo cumple una corrida de secado, no una
   * intervención (diseño §4.1), y un valor que no es de `tipo_paso` no es un acto, aunque su FK sea válida.
   */
  it("un tipo declarado sin paso tiene que ser uno que una intervención cumple", async () => {
    const p = await abrirCon(await lote("TIPO"), sinPasos.versionId);
    await expect(registrarIntervencion(gestor, { lotProcessId: p.id, stepTypeValueId: tipo.drying, occurredAt: cuando })).rejects.toThrow(
      new LotProcessError("paso_no_corresponde"),
    );
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, stepTypeValueId: deOtroCatalogo, occurredAt: cuando }),
    ).rejects.toBeInstanceOf(LotProcessError);
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
    // Control: un tipo de la fila de la intervención entra.
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, stepTypeValueId: tipo.washing, occurredAt: cuando }),
    ).resolves.toMatchObject({ stepTypeValueId: tipo.washing });
  });
});

describe("el guardián decide qué paso cumple (§4.2)", () => {
  it("un paso de OTRA receta se rechaza paso_de_otra_receta; el mismo tipo de la receta del proceso entra", async () => {
    const p = await abrirCon(await lote("OTRA"), conPasos.versionId);
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, recipeStepId: otra.pulping, occurredAt: cuando }),
    ).rejects.toThrow(new LotProcessError("paso_de_otra_receta"));
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
    // Control: el despulpado de SU receta —el mismo tipo— entra unido a su paso.
    const ok = await registrarIntervencion(gestor, { lotProcessId: p.id, recipeStepId: conPasos.pulping, occurredAt: cuando });
    expect([ok.recipeStepId, ok.stepTypeValueId]).toEqual([conPasos.pulping, tipo.pulping]);
  });

  it("un paso de la misma versión que una intervención no cumple —el secado— se rechaza paso_no_corresponde; el lavado entra", async () => {
    const p = await abrirCon(await lote("NOCORRESPONDE"), conPasos.versionId);
    // De la MISMA versión, para que no lo tape la regla de «otra receta» (diseño §8).
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, recipeStepId: conPasos.drying, occurredAt: cuando }),
    ).rejects.toThrow(new LotProcessError("paso_no_corresponde"));
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
    const ok = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      recipeStepId: conPasos.washing,
      catalogValueId: aguaLimpia,
      occurredAt: cuando,
    });
    expect([ok.recipeStepId, ok.stepTypeValueId, ok.catalogValueId]).toEqual([conPasos.washing, tipo.washing, aguaLimpia]);
  });

  /**
   * El esqueleto: «el stepType del registro se toma del paso». El diseño (§8) admite las dos salidas —acaba con el tipo
   * del paso, o se rechaza— y cuál elige el guardián es de la tarea 7. Lo que NUNCA puede pasar es que quede guardado el
   * tipo declarado: eso se afirma en las dos ramas.
   */
  it("el tipo es el del paso: declarar otro no deja guardado el declarado", async () => {
    const p = await abrirCon(await lote("IGUAL"), conPasos.versionId);
    const r = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      recipeStepId: conPasos.pulping,
      stepTypeValueId: tipo.washing,
      occurredAt: cuando,
    }).catch((e: unknown) => e);
    const guardadas = await prisma.lotProcessIntervention.findMany({
      where: { lotProcessId: p.id },
      select: { recipeStepId: true, stepTypeValueId: true },
    });
    if (r instanceof Error) {
      expect(r).toBeInstanceOf(LotProcessError);
      expect(r.message).toBe("paso_no_corresponde");
      expect(guardadas).toEqual([]);
    } else {
      expect(guardadas).toEqual([{ recipeStepId: conPasos.pulping, stepTypeValueId: tipo.pulping }]);
    }
    // Control: declarar el MISMO tipo que el paso entra, con ese tipo.
    const igual = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      recipeStepId: conPasos.pulping,
      stepTypeValueId: tipo.pulping,
      occurredAt: cuando,
    });
    expect([igual.recipeStepId, igual.stepTypeValueId]).toEqual([conPasos.pulping, tipo.pulping]);
  });
});

describe("desviación (§4.4)", () => {
  it("bajo una receta con pasos, sin paso ni motivo se rechaza desviacion_sin_motivo; con motivo entra marcada", async () => {
    const p = await abrirCon(await lote("DESVIACION"), conPasos.versionId);
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, stepTypeValueId: tipo.washing, occurredAt: cuando }),
    ).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
    // Un motivo en blanco no es un motivo.
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, stepTypeValueId: tipo.washing, motivoDesviacion: "   ", occurredAt: cuando }),
    ).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
    // El valor de catálogo solo, sin tipo, también es un manejo fuera de la receta.
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: cuando }),
    ).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
    // Control: con motivo entra, sin paso y con el motivo guardado. No bloquea (D5).
    const motivo = "TEST llovió: un segundo lavado que la receta no declara";
    const marcada = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      stepTypeValueId: tipo.washing,
      motivoDesviacion: motivo,
      occurredAt: cuando,
    });
    expect([marcada.recipeStepId, marcada.stepTypeValueId, marcada.motivoDesviacion]).toEqual([null, tipo.washing, motivo]);
  });

  it("bajo una receta sin pasos o un proceso viejo sin receta no es desviación: no pide motivo", async () => {
    const p1 = await abrirCon(await lote("SINPASOS"), sinPasos.versionId);
    const a = await registrarIntervencion(gestor, { lotProcessId: p1.id, stepTypeValueId: tipo.pulping, occurredAt: cuando });
    expect([a.recipeStepId, a.stepTypeValueId, a.motivoDesviacion]).toEqual([null, tipo.pulping, null]);
    const p2 = await procesoSinReceta(await lote("SINRECETA"));
    const b = await registrarIntervencion(gestor, { lotProcessId: p2.id, stepTypeValueId: tipo.pulping, occurredAt: cuando });
    expect([b.recipeStepId, b.stepTypeValueId, b.motivoDesviacion]).toEqual([null, tipo.pulping, null]);
    // Control: la MISMA intervención bajo la receta con pasos sí pide motivo; sin él, las dos de arriba no dirían nada.
    const p3 = await abrirCon(await lote("CONPASOS"), conPasos.versionId);
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p3.id, stepTypeValueId: tipo.pulping, occurredAt: cuando }),
    ).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
  });
});

describe("decide dentro de la transacción, con el linaje bloqueado", () => {
  /**
   * La carrera, sin depender de la suerte: una transacción toma el linaje del lote, la intervención se lanza, y el cierre
   * del proceso se escribe y se confirma sólo después. Con la decisión fuera del bloqueo —lo de antes de la 2a— la
   * intervención termina mientras el linaje sigue retenido y se cuelga del proceso que se está cerrando.
   */
  it("espera a un cierre que retiene el linaje y, con el proceso ya cerrado, no se cuelga de él", async () => {
    const l = await lote("CANDADO");
    const p = await abrirCon(l, sinPasos.versionId);
    const humedad = (
      await prisma.measurement.create({
        data: {
          variable: "moisture",
          value: 11,
          unit: "%",
          occurredAt: new Date("2026-05-03T12:00:00Z"),
          lotId: l,
          provenanceClass: "measured_fact",
          createdBy: gestor,
        },
      })
    ).id;
    mediciones.push(humedad);

    let soltar!: () => void;
    const suelta = new Promise<void>((r) => {
      soltar = r;
    });
    let avisar!: () => void;
    const tomado = new Promise<void>((r) => {
      avisar = r;
    });
    const cierre = prisma.$transaction(
      async (tx) => {
        await bloquearLinaje(tx, l);
        avisar();
        await suelta;
        await tx.lotProcess.update({
          where: { id: p.id },
          data: { endedAt: new Date("2026-05-03T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: humedad },
        });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    // Si el cierre falla antes de tomar el linaje, la prueba cae con SU error, sin quedarse esperando.
    await Promise.race([tomado, cierre]);

    let resultado: unknown = "pendiente";
    const intento = registrarIntervencion(gestor, { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: cuando }).then(
      (i) => {
        resultado = i;
      },
      (e: unknown) => {
        resultado = e;
      },
    );
    // Tiempo de sobra para las lecturas de fuera de la transacción: sin el bloqueo, la intervención ya terminó aquí.
    await new Promise((r) => setTimeout(r, 1000));
    const mientrasRetenido = resultado;
    soltar();
    await cierre;
    await intento;

    expect(mientrasRetenido, "la intervención no esperó al linaje: decidió fuera del bloqueo").toBe("pendiente");
    expect(resultado).toBeInstanceOf(LotProcessError);
    expect((resultado as Error).message).toBe("process_already_closed");
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
    // Fila patrón: el cierre ocurrió de verdad; sin él, «no se colgó» no diría nada.
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).closureKind).toBe("moisture");
  });
});

describe("deja rastro y pide permiso", () => {
  it("su AuditEvent lot_process.record_intervention lleva el paso, el tipo y el motivo; un rechazo no deja ni fila ni evento", async () => {
    const p = await abrirCon(await lote("RASTRO"), conPasos.versionId);
    const conPaso = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      recipeStepId: conPasos.washing,
      catalogValueId: aguaLimpia,
      occurredAt: cuando,
    });
    const motivo = "TEST repaso del despulpado fuera de la receta";
    const desviada = await registrarIntervencion(gestor, {
      lotProcessId: p.id,
      stepTypeValueId: tipo.pulping,
      motivoDesviacion: motivo,
      occurredAt: cuando,
    });
    const rastro = async (entityId: string) => {
      const e = await prisma.auditEvent.findFirstOrThrow({
        where: { entityType: "lot_process_intervention", entityId, operation: "lot_process.record_intervention" },
      });
      const after = JSON.parse(JSON.stringify(e.after)) as Record<string, unknown>;
      return [e.actorUserAccountId, after.lotProcessId, after.recipeStepId, after.stepTypeValueId, after.catalogValueId, after.motivoDesviacion];
    };
    expect(await rastro(conPaso.id)).toEqual([gestor, p.id, conPasos.washing, tipo.washing, aguaLimpia, null]);
    expect(await rastro(desviada.id)).toEqual([gestor, p.id, null, tipo.pulping, null, motivo]);

    const eventos = () => prisma.auditEvent.count({ where: { operation: "lot_process.record_intervention", actorUserAccountId: gestor } });
    const antes = await eventos();
    // Control del recuento: ve los dos eventos de arriba; un recuento que no viera nada no distinguiría «no escribió».
    expect(antes).toBeGreaterThanOrEqual(2);
    await expect(
      registrarIntervencion(gestor, { lotProcessId: p.id, stepTypeValueId: tipo.pulping, occurredAt: cuando }),
    ).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
    expect(await eventos()).toBe(antes);
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(2);
  });

  it("sin manage sobre el lote del proceso se rechaza; con él, la misma entra", async () => {
    const p = await abrirCon(await lote("PERMISO"), sinPasos.versionId);
    const intervencion = { lotProcessId: p.id, catalogValueId: aguaLimpia, occurredAt: cuando };
    await expect(registrarIntervencion(sinPermiso, intervencion)).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
    await expect(registrarIntervencion(gestor, intervencion)).resolves.toMatchObject({ lotProcessId: p.id, catalogValueId: aguaLimpia });
  });

  /**
   * Ruling INV (contexto del PR-B, regla 7): «el orden de las comprobaciones se prueba con la cuenta que no debe». El guardián
   * y las demás comprobaciones leen la receta, los pasos y el vocabulario; quien no puede gestionar el lote tiene que recibir el
   * rechazo de acceso y nunca uno que le cuente qué hay en la receta de un proceso que no ve. Cuatro entradas, cada una
   * rechazada por un motivo DISTINTO cuando la manda quien sí gestiona el lote (el control), y por el acceso cuando la manda
   * quien no. La de arriba (con una entrada válida) no distingue «pide el acceso primero» de «lo pide en algún momento».
   */
  it("el acceso al lote se pide ANTES que cualquier otra comprobación: quien no puede gestionarlo no se entera de la receta", async () => {
    const p = await abrirCon(await lote("ORDEN"), conPasos.versionId);
    const entradas = [
      { motivo: "paso_de_otra_receta", datos: { recipeStepId: otra.pulping } },
      { motivo: "intervencion_sin_acto", datos: {} },
      { motivo: "desviacion_sin_motivo", datos: { stepTypeValueId: tipo.washing } },
      { motivo: "catalog_value_wrong_catalog", datos: { catalogValueId: deOtroCatalogo } },
    ];
    for (const { motivo, datos } of entradas) {
      await expect(
        registrarIntervencion(sinPermiso, { lotProcessId: p.id, occurredAt: cuando, ...datos }),
        `sin permiso, ${motivo}`,
      ).rejects.toBeInstanceOf(TraceabilityAccessError);
      // Control: la MISMA entrada, de quien sí gestiona el lote, se rechaza por su motivo propio.
      await expect(
        registrarIntervencion(gestor, { lotProcessId: p.id, occurredAt: cuando, ...datos }),
        `con permiso, ${motivo}`,
      ).rejects.toThrow(new LotProcessError(motivo));
    }
    expect(await prisma.lotProcessIntervention.count({ where: { lotProcessId: p.id } })).toBe(0);
  });
});

describe("opcionesParaProceso", () => {
  it("ofrece los tipos de paso que una intervención cumple, aparte del vocabulario de manejos", async () => {
    const l = await lote("OPCIONES");
    const { tiposDePasoDeIntervencion, intervenciones } = await opcionesParaProceso(gestor, l);
    const fila = [...TIPOS_POR_REGISTRO.lotProcessIntervention];
    expect(fila).toHaveLength(7);
    const sembrados = await prisma.variableCatalogValue.findMany({
      where: { catalog: { key: "tipo_paso" }, value: { in: fila } },
      select: { id: true, value: true },
    });
    // Fila patrón: los siete están sembrados; sin esto, una lista vacía y una lista que falta se leerían igual.
    expect(sembrados).toHaveLength(fila.length);
    expect(tiposDePasoDeIntervencion.map((o) => o.tipo)).toEqual(fila);
    const idDe = new Map(sembrados.map((s) => [s.value, s.id]));
    expect(tiposDePasoDeIntervencion.map((o) => o.id)).toEqual(fila.map((t) => idDe.get(t)));
    // Ningún tipo se cuela en el desplegable de hoy, que manda cada opción como `catalogValueId`.
    const idsDeTipo = new Set(sembrados.map((s) => s.id));
    expect(intervenciones.filter((o) => idsDeTipo.has(o.id))).toEqual([]);
    // Control: ese desplegable sigue trayendo el vocabulario de manejos.
    expect(intervenciones.map((o) => o.id)).toContain(aguaLimpia);
  });

  /**
   * Ruling I7: el desplegable ofrece los valores canónicos y no sus alias (`aliasOfId: null`, como los demás desplegables de la
   * casa). El control es el canónico, que sí sale; y el alias existe de verdad y apunta a él —sin eso, «no sale» podría ser
   * un alias que no se llegó a crear—.
   */
  it("no ofrece un valor alias; su canónico sí", async () => {
    const { intervenciones } = await opcionesParaProceso(gestor, await lote("OPCIONES-ALIAS"));
    const fila = await prisma.variableCatalogValue.findUniqueOrThrow({ where: { id: alias }, select: { aliasOfId: true, value: true } });
    expect([fila.aliasOfId, fila.value]).toEqual([canonico, NOMBRE_DEL_ALIAS]);
    const ids = intervenciones.map((o) => o.id);
    expect(ids).toContain(canonico);
    expect(ids).not.toContain(alias);
  });
});
