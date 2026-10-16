/**
 * Parte 2a, §4.5 — los avisos de recepción se CALCULAN al leer: desde TODAS las recepciones de la ascendencia del lote, contra el
 * paso `reception` de la versión del proceso que lo cubre. Nada se guarda.
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md (y su §12).
 *
 * **La receta declara todo lo que el motor usa, y si falta algo el motor no opina y lo dice (PE-77/78, Daniel, 2026-10-05 a 08).** Una
 * versión sin paso `reception`, o un paso `reception` sin banda de Brix (ni mínimo ni máximo), no se juzga con una banda de respaldo —ni la
 * del veredicto fijo 18–24 de la recepción, ni una por grado o por ejes—: el aviso dice que no hay con qué comparar. Cada una de esas dos
 * ramas lleva aquí su caso con una recepción que el 18–24 habría juzgado, y su control: la misma recepción, bajo una receta que sí
 * declara la banda, sí avisa.
 *
 * Las recepciones, los lotes, las divisiones y las fusiones se hacen por los SERVICIOS (`recibirCereza`, `armarLote`,
 * `recordTransformation`, `abrirProceso`): la ascendencia que `avisosDeRecepcion` recorre es la que ellos escriben. Las
 * recepciones son de un PROVEEDOR (organización `producer`), que no necesita jornada, entrega ni recolector; el Brix y la fecha de
 * recibo los pone cada prueba. Las recetas se insertan CRUDAS —en borrador, con sus pasos y metas, y publicadas después—, como en
 * `avance.test.ts`: la autoría por pasos es de la tarea 3, y sólo la última prueba con base de abajo la usa («lo que el editor
 * escribe es lo que el aviso lee»), para que el contrato entre las dos tareas tenga dueño.
 *
 * Cada aviso lleva al lado su control: el caso válido, o el mismo caso con la respuesta contraria, que pasa. Un «ninguno» sin él se
 * lee igual que «no miré».
 *
 * Usuario con ámbito acotado (Farm Manager de su finca), no Platform Admin: nada de aquí cuenta filas de toda la base. El
 * administrador sólo escribe por el editor en la prueba del contrato, que no cuenta nada global (CLAUDE.md del repositorio, «Un
 * admin de plataforma ve la base compartida entera»). Escribe porque la autoría de recetas (`exigeAutoriaDeReceta`, tarea 3) es el
 * permiso del Coffee Process Manager, que el Platform Admin tiene por llevar el catálogo entero; el Farm Manager de arriba NO lo tiene
 * (Ruling A) y por eso no escribe recetas aquí.
 *
 * **La autorización NO es de esta función ni de este archivo** (Ruling INV, T06-INV): `avisosDeRecepcion` no recibe quién pregunta y
 * devuelve ids, fechas y Brix de las recepciones de TODA la ascendencia, incluidas las de lotes que quien mira no ve. Quién la importa lo
 * fija `tests/arquitectura/avisos-de-recepcion-por-una-puerta.test.ts`; que esa puerta pida `requireLotAccess(view)` antes, con su prueba del
 * lote oculto, es de la tarea 13.
 *
 * El catálogo `tipo_paso` es el REAL de la base sembrada (tarea 2). Si la base no se resembró después de la tarea 2, cada prueba
 * cae con un mensaje que lo dice, en vez de caer por otra cosa.
 *
 * **«Calcular no escribe nada» se prueba con `SET TRANSACTION READ ONLY`, no contando filas** (R15, revisión adversaria del
 * 2026-10-05): un recuento antes y después no ve un `UPDATE` que deja los mismos recuentos, y la base sí lo rechaza dentro de una
 * transacción de sólo lectura. Su control son las dos mitades de la misma escritura (rechazada ahí, aceptada fuera), y su flip una
 * escritura de prueba dentro del módulo.
 *
 * **La limpieza descubre lo que borra** (CLAUDE.md del repositorio, «Una limpieza que se apoya en una variable del fixture no corre si el
 * `beforeAll` muere antes»): todo sale de la marca del RUN y de las organizaciones de la corrida, no de las variables que llena el
 * `beforeAll`; y al final cuenta lo que queda, de modo que un borrado que no llegó rompe el archivo en vez de dejarse leer como un verde. Su
 * control (`armado` y organizaciones > 0) vale para cualquier subconjunto de pruebas (`-t`): el `beforeAll` corre siempre que corre una.
 *
 * Las pruebas de `juzgarBrix` no tocan la base, pero viven aquí: el `beforeAll` es de todo el archivo y el archivo va entero
 * al grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { recordTransformation } from "../../lib/traceability/lots";
import { recibirCereza } from "../../lib/traceability/recepcionesDeCereza";
import { armarLote, origenDelLote } from "../../lib/traceability/lotesDeBeneficio";
import { agregarPaso, publicarVersion } from "../../lib/recetas/pasos";
import { TIPOS_DE_AVISO_DE_RECEPCION, avisosDeRecepcion, juzgarBrix, type BandaDeBrix } from "../../lib/recetas/recepcion";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { borrarVinculosDeLote } from "../helpers/borrarVinculosDeLote";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `recep2a-${Date.now()}`;
let orgId: string, proveedorId: string, fincaId: string, beneficioId: string, scopeId: string;
let gestor: string, admin: string;
let gradoId: string, cerezaId: string;
/** `true` cuando el `beforeAll` terminó: el control del `afterAll` (descubrió lo que el `beforeAll` creó) sólo vale entonces. */
let armado = false;
/** `value` → `id` del catálogo `tipo_paso`. */
const tipoDePaso = new Map<string, string>();
/** Lo que las pruebas crean y la limpieza tiene que encontrar aunque una aserción falle: los ids que cada ayudante apunta. */
const recepciones: string[] = [];
const lotes: string[] = [];
const transformaciones: string[] = [];

/** El 2026-03-`d`, a mediodía UTC. */
const dia = (d: number) => new Date(Date.UTC(2026, 2, d, 12));

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function valor(catalogo: string, v: string): Promise<string> {
  return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: v, catalog: { key: catalogo } }, select: { id: true } })).id;
}
function idDelTipo(tipo: string): string {
  const id = tipoDePaso.get(tipo);
  if (id === undefined) throw new Error(`el catálogo tipo_paso no tiene «${tipo}»: ¿se resembró la base propia después de la tarea 2?`);
  return id;
}

let n = 0;
const codigo = () => `TEST-${RUN}-${++n}`;

/** Una recepción de `kg` netos (bruto = kg + 1, con 2 recipientes de 0,5) de un proveedor, con su Brix, o sin él si es `null`. */
async function recibir(kg: number, brix: number | null, recibidaAt: Date) {
  const r = await recibirCereza(gestor, {
    claveDeEnvio: randomUUID(), beneficioId, origen: { proveedorId }, recibidaAt,
    brutoKg: kg + 1, recipientes: 2, taraPorRecipienteKg: 0.5,
    brix: brix === null ? null : { valor: brix, puntoDeMuestreo: "CHERRY_PULP" },
  });
  recepciones.push(r.id);
  return r;
}
/** Un lote de nivel 1, armado por el servicio con kilos de esas recepciones: sin proceso, con su vínculo a cada una. */
async function loteDe(partes: ReadonlyArray<{ recepcionId: string; kg: number }>) {
  const lote = await armarLote(gestor, { beneficioId, codigo: codigo(), recepciones: partes });
  lotes.push(lote.id);
  return lote.id;
}
/** Un lote que no nació de ninguna recepción: sin vínculo, y sin transformación que lo produjera. */
async function loteSinRecepcion() {
  const id = (await prisma.lot.create({ data: {
    lotCode: codigo(), lotType: "cherry", organizationId: orgId, locationId: beneficioId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  lotes.push(id);
  return id;
}
/** Divide el lote ENTERO (`kg`) en `partes` por el servicio, que cierra su proceso y da a cada parte una copia. Ids de las partes. */
async function dividir(lotId: string, kg: number, partes: number[]): Promise<string[]> {
  const r = await recordTransformation(gestor, {
    transformationType: "split", occurredAt: new Date(), provenanceClass: "original_record",
    inputs: [{ lotId, quantity: kg, unit: "kg" }],
    outputs: partes.map((p) => ({ lotCode: codigo(), lotType: "processing" as const, quantity: p, unit: "kg" })),
  });
  transformaciones.push(r.transformation.id);
  const ids = r.outputLots.map((l) => l.id);
  lotes.push(...ids);
  return ids;
}
/** Junta lotes de `kgCadaUno` en uno solo. Id del lote fusionado. */
async function fusionar(entradas: readonly string[], kgCadaUno: number): Promise<string> {
  const r = await recordTransformation(gestor, {
    transformationType: "merge", occurredAt: new Date(), provenanceClass: "direct_observation",
    inputs: entradas.map((lotId) => ({ lotId, quantity: kgCadaUno, unit: "kg" })),
    outputs: [{ lotCode: codigo(), lotType: "cherry" as const, quantity: kgCadaUno * entradas.length, unit: "kg" }],
  });
  transformaciones.push(r.transformation.id);
  const d = r.outputLots[0];
  if (!d) throw new Error("la fusión tiene que dar un lote");
  lotes.push(d.id);
  return d.id;
}
/** Un lote hijo de `padres` por un enlace de linaje CRUDO (cereza → cereza), sin libro de masa: lo que se prueba no es la transformación. */
async function hijoDe(padres: readonly string[]): Promise<string> {
  const hijo = await loteSinRecepcion();
  const t = await prisma.lotTransformation.create({ data: {
    transformationType: "stage_change", occurredAt: dia(5), provenanceClass: "original_record", createdBy: gestor,
    inputs: { create: padres.map((lotId) => ({ lotId })) }, outputs: { create: [{ lotId: hijo }] },
  } });
  transformaciones.push(t.id);
  return hijo;
}

interface MetaDePrueba { moment: "initial" | "during" | "final"; min?: number; max?: number; objetivo?: number; variable?: string; unit?: string }
interface PasoDePrueba { tipo: string; metas?: readonly MetaDePrueba[] }

/** La banda de Brix del ejemplo del diseño (§4.5): 18–24, como meta INICIAL. */
const BANDA = { moment: "initial", min: 18, max: 24 } as const;
const laBanda = (stepId: string, seq = 1): BandaDeBrix => ({ stepId, seq, min: 18, max: 24 });

/**
 * Una versión PUBLICADA de una receta de la organización, con un paso por elemento de `pasos`, en ese orden (`seq` desde 1) y con
 * sus metas (por omisión, de `brix` en `Bx`). Se crea en BORRADOR, se le ponen los pasos y las metas, y después se publica, para
 * no depender de si la base deja añadir pasos a una versión publicada. Devuelve el id de la versión y los ids de sus pasos.
 */
async function version(nombre: string, pasos: readonly PasoDePrueba[]) {
  const receta = await prisma.processRecipe.create({ data: { name: `TEST ${nombre} ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor } });
  const v = await prisma.processRecipeVersion.create({ data: { recipeId: receta.id, version: 1, status: "draft", createdBy: gestor } });
  const ids: string[] = [];
  for (const [i, p] of pasos.entries()) {
    const paso = await prisma.processRecipeStep.create({ data: { recipeVersionId: v.id, seq: i + 1, stepTypeValueId: idDelTipo(p.tipo) } });
    ids.push(paso.id);
    for (const m of p.metas ?? []) {
      await prisma.processTarget.create({ data: {
        recipeVersionId: v.id, recipeStepId: paso.id, phase: null, variable: m.variable ?? "brix", moment: m.moment, unit: m.unit ?? "Bx",
        minValue: m.min ?? null, maxValue: m.max ?? null, targetValue: m.objetivo ?? null,
      } });
    }
  }
  await prisma.processRecipeVersion.update({ where: { id: v.id }, data: { status: "approved" } });
  return { id: v.id, pasos: ids };
}
/** Abre el proceso de `lotId` con la versión `v`. */
const abrir = (lotId: string, v: { id: string }) => abrirProcesoDePrueba(gestor, lotId, { processRecipeVersionId: v.id });
/** El `tipo` de cada aviso, en el orden en que salen. */
const tiposDe = (avisos: ReadonlyArray<{ tipo: string }> | undefined) => (avisos ?? []).map((a) => a.tipo);

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" } })).id;
  proveedorId = (await prisma.organization.create({ data: { organizationType: "producer", name: `TEST Proveedor (${RUN})`, status: "approved", classification: "internal" } })).id;
  fincaId = (await prisma.location.create({ data: { name: `TEST Finca (${RUN})`, locationType: "site", classification: "internal", organizationId: orgId } })).id;
  beneficioId = (await prisma.location.create({ data: { name: `TEST Beneficio (${RUN})`, locationType: "beneficio", classification: "internal", parentLocationId: fincaId } })).id;
  gestor = await cuenta("Gestor");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: fincaId } })).id;
  const manager = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: manager.id, scopeId } });
  admin = (await prisma.assignment.findFirstOrThrow({
    where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
    select: { userAccountId: true },
  })).userAccountId;
  gradoId = await valor("grado_proceso", "Washed");
  cerezaId = await valor("estado_cereza", "despulpada");
  for (const v of await prisma.variableCatalogValue.findMany({ where: { catalog: { key: "tipo_paso" } }, select: { id: true, value: true } })) {
    tipoDePaso.set(v.value, v.id);
  }
  armado = true;
}, 60000);

afterAll(async () => {
  // La limpieza DESCUBRE lo que borra, no lo hereda del `beforeAll`: si éste muere antes de asignar `orgId`, `fincaId`, `gestor`… esas
  // variables siguen `undefined`, `assertDefinedWhere` lanza y abandona las filas que quedan. Todo sale de la marca del RUN: las
  // organizaciones por su nombre, de ellas sus ubicaciones y sus lotes; las personas por su `displayName` y de ellas las cuentas; de
  // las ubicaciones, los ámbitos y las recepciones. Las listas que llenan las pruebas se suman a lo descubierto.
  const ids = <T extends { id: string }>(filas: T[]) => filas.map((f) => f.id);
  const organizaciones = ids(await prisma.organization.findMany({ where: assertDefinedWhere({ name: { contains: RUN } }), select: { id: true } }));
  const ubicaciones = ids(await prisma.location.findMany({
    where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }), select: { id: true },
  }));
  const personas = ids(await prisma.person.findMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }), select: { id: true } }));
  const cuentas = ids(await prisma.userAccount.findMany({ where: assertDefinedWhere({ personId: { in: personas } }), select: { id: true } }));
  const ambitos = ids(await prisma.scope.findMany({
    where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: ubicaciones } }), select: { id: true },
  }));
  // Todo lo de la organización, no sólo lo apuntado: una división o una fusión que sale bien sin esperarlo (en rojo, o con una
  // mutación del flip) crea lotes que ninguna lista conoce, y `lot_organization_id_fkey` es RESTRICT.
  const deLaOrganizacion = ids(await prisma.lot.findMany({
    where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { lotCode: { contains: RUN } }] }), select: { id: true },
  }));
  const todos = [...new Set([...lotes, ...deLaOrganizacion])];
  const ts = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: todos } } } }, { outputs: { some: { lotId: { in: todos } } } }] }),
    select: { id: true },
  });
  const idsT = [...new Set([...transformaciones, ...ts.map((t) => t.id)])];
  const delBeneficio = ids(await prisma.recepcionDeCereza.findMany({
    where: assertDefinedWhere({ OR: [{ beneficioId: { in: ubicaciones } }, { proveedorId: { in: organizaciones } }] }), select: { id: true },
  }));
  const idsR = [...new Set([...recepciones, ...delBeneficio])];
  const recetas = ids(await prisma.processRecipe.findMany({
    where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }), select: { id: true },
  }));
  const idsV = ids(await prisma.processRecipeVersion.findMany({ where: assertDefinedWhere({ recipeId: { in: recetas } }), select: { id: true } }));
  const idsP = ids(await prisma.processRecipeStep.findMany({ where: assertDefinedWhere({ recipeVersionId: { in: idsV } }), select: { id: true } }));
  const idsDeProcesos = ids(await prisma.lotProcess.findMany({ where: assertDefinedWhere({ lotId: { in: todos } }), select: { id: true } }));

  // 1. La auditoría, que cuelga de ids y no de una clave ajena: la de las recepciones, los lotes y las transformaciones, la de lo que el editor
  //    escribió (cuelga del paso y de la versión) y todo lo que firmó el gestor. Antes que su cuenta: el actor es SET NULL y después ya no
  //    se encontraría.
  const auditoria = () => assertDefinedWhere({
    OR: [{ entityId: { in: [...idsR, ...todos, ...idsT, ...idsV, ...idsP, ...recetas] } }, { actorUserAccountId: { in: cuentas } }],
  });
  await prisma.auditEvent.deleteMany({ where: auditoria() });
  // 2. Los procesos, con su auditoría y sus devoluciones: antes que las transformaciones (`divided_by_transformation_id`) y que las
  //    recetas (`process_recipe_version_id`), que son RESTRICT.
  await borrarProcesosDeLotesDonde({ id: { in: todos } });
  // 3. El libro de masa y las transformaciones, antes que los lotes.
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: todos } }) });
  await prisma.deviation.deleteMany({ where: assertDefinedWhere({ lotTransformationId: { in: idsT } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: idsT } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: idsT } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: idsT } }) });
  // 4. Los vínculos lote↔recepción son inmutables: el ayudante los borra con el disparador apagado sólo dentro de su transacción.
  //    Después las recepciones, y por fin los lotes.
  await borrarVinculosDeLote(idsR);
  await prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ id: { in: idsR } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: todos } }) });
  // 5. Las recetas de la organización (sus versiones, pasos y metas se van con ellas: CASCADE). Por organización y no por nombre, y
  //    ANTES de borrar la organización: desde la tarea 1, `process_recipe.organization_id` es RESTRICT (Ruling FK-ORG: con SET NULL,
  //    borrar una organización convertía en silencio sus recetas en plantillas de todas), así que borrarla con una receta viva FALLA y
  //    el `afterAll` abandonaría los borrados de abajo.
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recetas } }) });
  // 6. Las cuentas, las personas, las ubicaciones —el beneficio cuelga de la finca— y las dos organizaciones.
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones }, parentLocationId: { not: null } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });

  // 7. Contar lo que queda del RUN: «limpió» y «pasó» no son lo mismo, y un borrado que no llegó se leería como un verde. Si algo
  //    sobra, el archivo FALLA aquí, con la tabla y la cuenta.
  const restos: [string, number][] = [
    ["organization", await prisma.organization.count({ where: { OR: [{ id: { in: organizaciones } }, { name: { contains: RUN } }] } })],
    ["location", await prisma.location.count({ where: { OR: [{ id: { in: ubicaciones } }, { name: { contains: RUN } }] } })],
    ["scope", await prisma.scope.count({ where: { id: { in: ambitos } } })],
    ["person", await prisma.person.count({ where: { OR: [{ id: { in: personas } }, { displayName: { contains: RUN } }] } })],
    ["userAccount", await prisma.userAccount.count({ where: { id: { in: cuentas } } })],
    ["assignment", await prisma.assignment.count({ where: { OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] } })],
    ["lot", await prisma.lot.count({ where: { OR: [{ id: { in: todos } }, { lotCode: { contains: RUN } }] } })],
    ["lotProcess", await prisma.lotProcess.count({ where: { lotId: { in: todos } } })],
    ["recepcionDeCereza", await prisma.recepcionDeCereza.count({ where: { id: { in: idsR } } })],
    ["loteDesdeRecepcion", await prisma.loteDesdeRecepcion.count({ where: { OR: [{ recepcionId: { in: idsR } }, { lotId: { in: todos } }] } })],
    ["quantityEvent", await prisma.quantityEvent.count({ where: { lotId: { in: todos } } })],
    ["lotTransformation", await prisma.lotTransformation.count({ where: { id: { in: idsT } } })],
    ["processRecipe", await prisma.processRecipe.count({ where: { OR: [{ id: { in: recetas } }, { name: { contains: RUN } }] } })],
    ["processRecipeStep", await prisma.processRecipeStep.count({ where: { recipeVersionId: { in: idsV } } })],
    ["processTarget", await prisma.processTarget.count({ where: { recipeVersionId: { in: idsV } } })],
    ["auditEvent", await prisma.auditEvent.count({ where: auditoria() })],
    ["auditEvent (procesos)", await prisma.auditEvent.count({ where: { entityType: "lot_process", entityId: { in: idsDeProcesos } } })],
  ];
  const sobran = restos.filter(([, cuantas]) => cuantas > 0);
  if (sobran.length > 0) throw new Error(`recepcion.test: la limpieza dejó filas del RUN ${RUN}: ${sobran.map(([tabla, cuantas]) => `${tabla}=${cuantas}`).join(", ")}`);
  // Control del descubrimiento, que vale para cualquier subconjunto de pruebas: si el `beforeAll` terminó, creó dos organizaciones con la
  // marca del RUN, y la limpieza tuvo que encontrarlas. Sin él, un descubrimiento roto que no encuentra nada «limpia» con un cero.
  if (armado) expect(organizaciones.length, "el afterAll no encontró las organizaciones que el beforeAll creó: el descubrimiento está roto").toBe(2);
}, 60000);

describe("Parte 2a, §4.5 — los avisos de recepción se calculan al leer", () => {
  it("dos recepciones, de Brix 26 y 20: un aviso, que nombra la de 26", async () => {
    const v = await version("DOS", [{ tipo: "reception", metas: [BANDA] }]);
    const alta = await recibir(20, 26, dia(1));
    const buena = await recibir(20, 20, dia(2));
    const lote = await loteDe([{ recepcionId: alta.id, kg: 20 }, { recepcionId: buena.id, kg: 20 }]);
    await abrir(lote, v);

    const r = await avisosDeRecepcion(prisma, lote);
    expect(r?.recipeVersionId).toBe(v.id);
    expect(r?.declaraRecepcion).toBe(true);
    expect(r?.bandas).toEqual([laBanda(v.pasos[0]!)]);
    // Control: se compararon LAS DOS, una por una, así que el único aviso no es un «no miré».
    expect(r?.recepciones).toEqual([
      { recepcionId: alta.id, recibidaAt: dia(1), brix: 26 },
      { recepcionId: buena.id, recibidaAt: dia(2), brix: 20 },
    ]);
    expect(r?.avisos).toEqual([
      { tipo: "brix_fuera_de_la_banda", recepcionId: alta.id, recibidaAt: dia(1), brix: 26, lado: "alto", banda: laBanda(v.pasos[0]!) },
    ]);
  }, 60000);

  it("las recepciones salen por su fecha de recibo, y cada aviso dice de qué lado de la banda se salió", async () => {
    const v = await version("ORDEN", [{ tipo: "reception", metas: [BANDA] }]);
    // Se reciben en el orden CONTRARIO al de su fecha: el orden en que se crearon no puede hacerse pasar por el de recibo.
    const tarde = await recibir(10, 14, dia(5));
    const temprano = await recibir(10, 26, dia(3));
    const medio = await recibir(10, 21, dia(4));
    const lote = await loteDe([tarde, temprano, medio].map((x) => ({ recepcionId: x.id, kg: 10 })));
    await abrir(lote, v);

    const r = await avisosDeRecepcion(prisma, lote);
    expect(r?.recepciones.map((x) => x.recepcionId)).toEqual([temprano.id, medio.id, tarde.id]);
    // La de 21 está dentro (control): sale en la lista de comparadas y no en la de avisos.
    expect(r?.avisos.map((a) => (a.tipo === "brix_fuera_de_la_banda" ? [a.recepcionId, a.lado] : a.tipo))).toEqual([
      [temprano.id, "alto"],
      [tarde.id, "bajo"],
    ]);
  }, 60000);

  it("la banda es la de la receta y no el 18–24 fijo de la recepción: son dos juicios, y ninguno toca al otro", async () => {
    // La banda de ESTA receta es 20–30. Con el 18–24 fijo de la recepción (`evaluarBrixDeRecepcion`) el veredicto sería el contrario.
    const v = await version("OTRA-BANDA", [{ tipo: "reception", metas: [{ moment: "initial", min: 20, max: 30 }] }]);
    const diecinueve = await recibir(20, 19, dia(1)); // óptima para el 18–24 fijo; FUERA de 20–30
    const veintiocho = await recibir(20, 28, dia(2)); // sin veredicto para el 18–24 fijo; DENTRO de 20–30
    const lote = await loteDe([{ recepcionId: diecinueve.id, kg: 20 }, { recepcionId: veintiocho.id, kg: 20 }]);
    await abrir(lote, v);

    const r = await avisosDeRecepcion(prisma, lote);
    expect(r?.bandas).toEqual([{ stepId: v.pasos[0]!, seq: 1, min: 20, max: 30 }]);
    expect(r?.avisos.map((a) => (a.tipo === "brix_fuera_de_la_banda" ? [a.recepcionId, a.lado] : a.tipo))).toEqual([[diecinueve.id, "bajo"]]);
    // El veredicto guardado de cada recepción es el suyo, el fijo, y calcular los avisos no lo movió.
    const guardadas = await prisma.recepcionDeCereza.findMany({
      where: assertDefinedWhere({ id: { in: [diecinueve.id, veintiocho.id] } }),
      orderBy: { recibidaAt: "asc" },
      select: { veredictoBrix: true },
    });
    expect(guardadas.map((g) => g.veredictoBrix)).toEqual(["INTAKE_OPTIMAL", "SIN_VEREDICTO"]);
  }, 60000);

  it("una recepción de Brix 20, dentro de la banda, no avisa", async () => {
    const v = await version("DENTRO", [{ tipo: "reception", metas: [BANDA] }]);
    const buena = await recibir(20, 20, dia(1));
    const dentro = await loteDe([{ recepcionId: buena.id, kg: 20 }]);
    await abrir(dentro, v);

    const r = await avisosDeRecepcion(prisma, dentro);
    expect(r?.declaraRecepcion).toBe(true);
    expect(r?.recepciones.map((x) => x.brix)).toEqual([20]);
    expect(r?.avisos).toEqual([]);

    // Control: la MISMA receta avisa con una recepción de 26. Sin él, el «ninguno» de arriba se leería igual que «no miré».
    const alta = await recibir(20, 26, dia(2));
    const fuera = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    await abrir(fuera, v);
    expect(tiposDe((await avisosDeRecepcion(prisma, fuera))?.avisos)).toEqual(["brix_fuera_de_la_banda"]);
  }, 60000);

  it("sin ninguna recepción en la ascendencia: un aviso propio", async () => {
    const v = await version("SIN-RECEPCION", [{ tipo: "reception", metas: [BANDA] }]);
    const crudo = await loteSinRecepcion();
    await abrir(crudo, v);

    const r = await avisosDeRecepcion(prisma, crudo);
    expect(r?.declaraRecepcion).toBe(true);
    expect(r?.recepciones).toEqual([]);
    expect(r?.avisos).toEqual([{ tipo: "sin_recepcion" }]);

    // Control: con una recepción dentro de la banda, ese aviso no sale.
    const buena = await recibir(20, 20, dia(1));
    const conRecepcion = await loteDe([{ recepcionId: buena.id, kg: 20 }]);
    await abrir(conRecepcion, v);
    expect((await avisosDeRecepcion(prisma, conRecepcion))?.avisos).toEqual([]);
  }, 60000);

  it("una recepción sin Brix: un aviso propio; con Brix, ninguno", async () => {
    const v = await version("SIN-BRIX", [{ tipo: "reception", metas: [BANDA] }]);
    const sin = await recibir(20, null, dia(1));
    const lote = await loteDe([{ recepcionId: sin.id, kg: 20 }]);
    await abrir(lote, v);

    const r = await avisosDeRecepcion(prisma, lote);
    expect(r?.recepciones).toEqual([{ recepcionId: sin.id, recibidaAt: dia(1), brix: null }]);
    expect(r?.avisos).toEqual([{ tipo: "recepcion_sin_brix", recepcionId: sin.id, recibidaAt: dia(1), banda: laBanda(v.pasos[0]!) }]);

    // Control: la misma receta con una recepción que SÍ trae Brix (20, dentro) no trae ningún aviso.
    const con = await recibir(20, 20, dia(2));
    const medido = await loteDe([{ recepcionId: con.id, kg: 20 }]);
    await abrir(medido, v);
    expect((await avisosDeRecepcion(prisma, medido))?.avisos).toEqual([]);
  }, 60000);

  it("la parte de una división compara las recepciones del lote que se dividió", async () => {
    const v = await version("DIVISION", [{ tipo: "reception", metas: [BANDA] }]);
    const alta = await recibir(20, 26, dia(1));
    const buena = await recibir(20, 20, dia(2));
    const a = await loteDe([{ recepcionId: alta.id, kg: 20 }, { recepcionId: buena.id, kg: 20 }]);
    await abrir(a, v);
    // Control: el lote de nivel 1 ve sus dos recepciones y un aviso.
    expect(tiposDe((await avisosDeRecepcion(prisma, a))?.avisos)).toEqual(["brix_fuera_de_la_banda"]);

    const [b, c] = await dividir(a, 40, [20, 20]);
    // La parte NO tiene vínculo propio con ninguna recepción: lo que compara le llega sólo de arriba.
    expect(await prisma.loteDesdeRecepcion.count({ where: { lotId: b! } })).toBe(0);
    const rb = await avisosDeRecepcion(prisma, b!);
    expect(rb?.recipeVersionId).toBe(v.id);
    expect(rb?.recepciones.map((x) => x.recepcionId)).toEqual([alta.id, buena.id]);
    expect(tiposDe(rb?.avisos)).toEqual(["brix_fuera_de_la_banda"]);
    expect(tiposDe((await avisosDeRecepcion(prisma, c!))?.avisos)).toEqual(["brix_fuera_de_la_banda"]);
  }, 60000);

  it("una recepción que llega por dos lotes de nivel 1 fusionados se compara UNA vez", async () => {
    const v = await version("DEDUPLICAR", [{ tipo: "reception", metas: [BANDA] }]);
    const r = await recibir(40, 26, dia(1));
    const a1 = await loteDe([{ recepcionId: r.id, kg: 20 }]);
    const a2 = await loteDe([{ recepcionId: r.id, kg: 20 }]);
    const d = await fusionar([a1, a2], 20);
    // Control del escenario: la ascendencia de D trae la recepción por los DOS lotes de nivel 1, y `origenDelLote` la da dos
    // veces. Sin deduplicar, el aviso saldría repetido (y la ficha ya usa `key={o.recepcionId}`). No es el caso de la prueba que
    // ya existe, «A sale de R, A se divide en B y C, B y C se fusionan en D: origenDelLote(D) devuelve R UNA vez»
    // (`lotesDeBeneficio.test.ts`): ahí hay UN solo lote de nivel 1, que `origenDelLote` sí cuenta una vez; aquí son DOS lotes de
    // nivel 1 de la misma recepción, y ése es el escenario que esa prueba no cubre.
    expect((await origenDelLote(d)).filter((o) => o.recepcionId === r.id)).toHaveLength(2);
    await abrir(d, v);

    const res = await avisosDeRecepcion(prisma, d);
    expect(res?.recepciones.map((x) => x.recepcionId)).toEqual([r.id]);
    expect(tiposDe(res?.avisos)).toEqual(["brix_fuera_de_la_banda"]);
  }, 60000);

  it("una receta sin paso de recepción no compara nada y lo dice (PE-77/78), aunque otro paso lleve una meta de Brix", async () => {
    // El paso de fermentación lleva una meta de Brix inicial 18–24: sólo un paso `reception` es la recepción.
    const sinPaso = await version("SIN-PASO", [{ tipo: "fermentation", metas: [BANDA] }]);
    const conPaso = await version("CON-PASO", [{ tipo: "reception", metas: [BANDA] }]);
    const sinPasos = await version("SIN-PASOS", []);
    const alta = await recibir(40, 26, dia(1));
    const a = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    const b = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    await abrir(a, sinPaso);
    await abrir(b, conPaso);

    // La recepción de 26 que el 18–24 habría juzgado NO se juzga: la receta no declara la recepción, y el aviso lo dice.
    expect(await avisosDeRecepcion(prisma, a)).toEqual({
      recipeVersionId: sinPaso.id, declaraRecepcion: false, bandas: [], recepciones: [], avisos: [{ tipo: "receta_sin_paso_de_recepcion" }],
    });
    // Control: la MISMA recepción, bajo la receta que sí declara el paso, avisa de su Brix.
    expect(tiposDe((await avisosDeRecepcion(prisma, b))?.avisos)).toEqual(["brix_fuera_de_la_banda"]);

    // Una receta sin ningún paso (como la que usa `abrirProcesoDePrueba` por omisión) tampoco declara la recepción, y también lo dice, en
    // vez de callar. Control: la que declara el paso, sobre el mismo tipo de lote, avisa otra cosa (que no hay recepción).
    const crudo = await loteSinRecepcion();
    await abrir(crudo, sinPasos);
    expect(await avisosDeRecepcion(prisma, crudo)).toEqual({
      recipeVersionId: sinPasos.id, declaraRecepcion: false, bandas: [], recepciones: [], avisos: [{ tipo: "receta_sin_paso_de_recepcion" }],
    });
    const otroCrudo = await loteSinRecepcion();
    await abrir(otroCrudo, conPaso);
    expect((await avisosDeRecepcion(prisma, otroCrudo))?.avisos).toEqual([{ tipo: "sin_recepcion" }]);
  }, 60000);

  it("un paso de recepción sin banda no inventa un umbral: no juzga el Brix y lo dice (PE-77/78)", async () => {
    const sinMetas = await version("SIN-METAS", [{ tipo: "reception" }]);
    // Una meta con sólo valor objetivo y ningún límite no es una banda: sin límites no hay «fuera».
    const soloObjetivo = await version("SOLO-OBJETIVO", [{ tipo: "reception", metas: [{ moment: "initial", objetivo: 20 }] }]);
    const conBanda = await version("CON-BANDA", [{ tipo: "reception", metas: [BANDA] }]);
    const alta = await recibir(60, 26, dia(1)); // fuera de 18–24, y fuera de cualquier umbral que la casa pudiera inventarse
    const sinMedir = await recibir(20, null, dia(2));
    const l1 = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    const l2 = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    const l3 = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    const l4 = await loteDe([{ recepcionId: sinMedir.id, kg: 20 }]);
    await abrir(l1, sinMetas);
    await abrir(l2, soloObjetivo);
    await abrir(l3, conBanda);
    await abrir(l4, sinMetas);

    for (const [lote, v] of [[l1, sinMetas], [l2, soloObjetivo]] as const) {
      const r = await avisosDeRecepcion(prisma, lote);
      expect(r?.recipeVersionId).toBe(v.id);
      expect(r?.declaraRecepcion).toBe(true);
      expect(r?.bandas).toEqual([]);
      // La recepción SÍ se miró (una, de Brix 26), y no se juzga porque la receta no dice qué Brix espera: el aviso es el del paso, no el de un Brix.
      expect(r?.recepciones.map((x) => x.brix)).toEqual([26]);
      expect(r?.avisos).toEqual([{ tipo: "paso_de_recepcion_sin_banda", stepId: v.pasos[0]!, seq: 1 }]);
    }
    // Una recepción que llegó sin Brix tampoco da su aviso: sin banda no hay nada que no se haya podido comparar.
    expect((await avisosDeRecepcion(prisma, l4))?.avisos).toEqual([{ tipo: "paso_de_recepcion_sin_banda", stepId: sinMetas.pasos[0]!, seq: 1 }]);
    // Control: con banda, la MISMA recepción avisa de su Brix.
    expect(tiposDe((await avisosDeRecepcion(prisma, l3))?.avisos)).toEqual(["brix_fuera_de_la_banda"]);

    // Y sin banda sigue avisando la falta de recepción, después del aviso del paso.
    const crudo = await loteSinRecepcion();
    await abrir(crudo, sinMetas);
    expect(tiposDe((await avisosDeRecepcion(prisma, crudo))?.avisos)).toEqual(["paso_de_recepcion_sin_banda", "sin_recepcion"]);
  }, 60000);

  it("con varios pasos de recepción hay una banda por paso: cada aviso lleva la suya, y el paso sin banda lo dice", async () => {
    // Tres pasos `reception`: 18–24, 20–30 y uno sin banda. Raw: el editor no impide repetir el tipo, y el lector tiene que saber qué hacer.
    const v = await version("VARIOS-PASOS", [
      { tipo: "reception", metas: [{ moment: "initial", min: 18, max: 24 }] },
      { tipo: "reception", metas: [{ moment: "initial", min: 20, max: 30 }] },
      { tipo: "reception" },
    ]);
    const diecinueve = await recibir(20, 19, dia(1)); // dentro de 18–24; FUERA de 20–30 por abajo
    const veintiocho = await recibir(20, 28, dia(2)); // FUERA de 18–24 por arriba; dentro de 20–30
    const lote = await loteDe([{ recepcionId: diecinueve.id, kg: 20 }, { recepcionId: veintiocho.id, kg: 20 }]);
    await abrir(lote, v);

    const r = await avisosDeRecepcion(prisma, lote);
    const [b1, b2] = [{ stepId: v.pasos[0]!, seq: 1, min: 18, max: 24 }, { stepId: v.pasos[1]!, seq: 2, min: 20, max: 30 }];
    expect(r?.bandas).toEqual([b1, b2]);
    expect(r?.avisos).toEqual([
      // Primero lo de la receta, por paso; después lo de cada recepción, por fecha de recibo y, dentro de ella, por paso.
      { tipo: "paso_de_recepcion_sin_banda", stepId: v.pasos[2]!, seq: 3 },
      { tipo: "brix_fuera_de_la_banda", recepcionId: diecinueve.id, recibidaAt: dia(1), brix: 19, lado: "bajo", banda: b2 },
      { tipo: "brix_fuera_de_la_banda", recepcionId: veintiocho.id, recibidaAt: dia(2), brix: 28, lado: "alto", banda: b1 },
    ]);
  }, 60000);

  it("sólo vale la meta de Brix del momento inicial, y sólo la de Brix: lo demás no es una banda y el paso lo dice", async () => {
    // Filas CRUDAS a propósito: la escritura ya no deja guardar en un paso `reception` una meta que no sea `brix` inicial (tarea 3,
    // `meta_de_recepcion_no_se_vigila`, adjudicación I9). Lo que se fija aquí es qué hace el LECTOR si una así llegara por un
    // importador o un SQL directo: la ignora, y la receta no juzga nada que no declaró.
    const final = await version("SOLO-FINAL", [{ tipo: "reception", metas: [{ moment: "final", min: 18, max: 24 }] }]);
    // Un pH inicial 3–4 sobre el paso de recepción: es otra variable, y la recepción de 26 no puede salir «fuera» de él.
    const otraVariable = await version("OTRA-VARIABLE", [
      { tipo: "reception", metas: [{ moment: "initial", variable: "ph", unit: "pH", min: 3, max: 4 }] },
    ]);
    const inicial = await version("SOLO-INICIAL", [{ tipo: "reception", metas: [BANDA] }]);
    const alta = await recibir(60, 26, dia(1));
    const l1 = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    const l2 = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    const l3 = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    await abrir(l1, final);
    await abrir(l2, otraVariable);
    await abrir(l3, inicial);

    for (const [lote, v] of [[l1, final], [l2, otraVariable]] as const) {
      const r = await avisosDeRecepcion(prisma, lote);
      expect(r?.bandas).toEqual([]);
      expect(r?.avisos).toEqual([{ tipo: "paso_de_recepcion_sin_banda", stepId: v.pasos[0]!, seq: 1 }]);
    }
    // Control: la meta de Brix INICIAL sobre la misma recepción sí es una banda, y avisa.
    const r3 = await avisosDeRecepcion(prisma, l3);
    expect(r3?.bandas).toEqual([laBanda(inicial.pasos[0]!)]);
    expect(tiposDe(r3?.avisos)).toEqual(["brix_fuera_de_la_banda"]);
  }, 60000);

  it("sin proceso, o con una mezcla de procesos, no hay UNA receta y se devuelve null; un proceso de antes de la receta obligatoria no tiene qué comparar", async () => {
    const sinProceso = await loteSinRecepcion();
    expect(await avisosDeRecepcion(prisma, sinProceso)).toBeNull();

    // R9: un proceso de antes de la receta obligatoria, crudo (desde la tarea 5b, `abrirProceso` ya no abre sin receta).
    const viejo = await loteSinRecepcion();
    await prisma.lotProcess.create({ data: {
      lotId: viejo, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11.5, startedAt: dia(1),
      provenanceClass: "original_record", processGradeValueId: gradoId, cherryStateValueId: cerezaId,
    } });
    expect(await avisosDeRecepcion(prisma, viejo)).toEqual({ recipeVersionId: null, declaraRecepcion: false, bandas: [], recepciones: [], avisos: [] });

    // Control: el MISMO lote, sin recepción, bajo una receta que declara el paso, sí avisa; y así «nada que comparar» no es un
    // «no avisa nunca».
    const v = await version("PROCESO-NUEVO", [{ tipo: "reception", metas: [BANDA] }]);
    const conReceta = await loteSinRecepcion();
    await abrir(conReceta, v);
    expect((await avisosDeRecepcion(prisma, conReceta))?.avisos).toEqual([{ tipo: "sin_recepcion" }]);

    // Una MEZCLA: un lote hijo de dos padres que tienen procesos DISTINTOS. No hay una receta contra la que comparar, y no se elige la de ninguno.
    const v2 = await version("PROCESO-OTRO", [{ tipo: "reception", metas: [BANDA] }]);
    const alta = await recibir(40, 26, dia(1));
    const p1 = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    const p2 = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    await abrir(p1, v);
    await abrir(p2, v2);
    const mezcla = await hijoDe([p1, p2]);
    expect(await avisosDeRecepcion(prisma, mezcla)).toBeNull();
    // Control: el mismo hijo con UN solo padre sí resuelve el proceso del padre, y trae sus recepciones.
    const hijo = await hijoDe([p1]);
    const sola = await avisosDeRecepcion(prisma, hijo);
    expect(sola?.recipeVersionId).toBe(v.id);
    expect(sola?.recepciones.map((x) => x.recepcionId)).toEqual([alta.id]);
  }, 60000);

  it("calcular no escribe nada: en una transacción de SÓLO LECTURA da lo mismo que con el cliente global, y una escritura sí la rompe (R15)", async () => {
    const v = await version("LECTURA", [{ tipo: "reception", metas: [BANDA] }]);
    const alta = await recibir(20, 26, dia(1));
    const lote = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    await abrir(lote, v);

    // **La transacción de sólo lectura es la prueba; un recuento de filas no.** El que había aquí —filas antes y después— no veía un `UPDATE`
    // (deja los mismos recuentos) ni un disparador que cambiara una columna: era una red y no un guardia. `SET TRANSACTION READ ONLY` hace que
    // la BASE rechace cualquier INSERT, UPDATE o DELETE de la transacción, sea cual sea su efecto sobre los recuentos. Va como PRIMERA sentencia
    // de la transacción, así que vale para todo lo que corre dentro (el adaptador de Prisma sólo envía antes el `BEGIN`), y sólo hasta que ella
    // acaba: no cambia la conexión del resto de pruebas, que vuelve al pool en modo de lectura y escritura.
    //
    // **Control, en dos mitades** —sin ellas, «no escribe» se leería igual que «el SET no se aplicó»—: una escritura que no cambia ningún valor
    // (el estado que la cuenta ya tiene) la rechaza la base DENTRO de la transacción de sólo lectura, y la MISMA escritura en una transacción
    // corriente pasa y toca una fila. No se afirma el texto del error de la base —depende de su idioma—: la prueba es que rechaza aquí y acepta allá.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return tx.userAccount.updateMany({ where: { id: gestor }, data: { status: "active" } });
      }),
    ).rejects.toThrow();
    expect((await prisma.$transaction((tx) => tx.userAccount.updateMany({ where: { id: gestor }, data: { status: "active" } }))).count).toBe(1);

    const conElGlobal = await avisosDeRecepcion(prisma, lote);
    const soloLectura = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return avisosDeRecepcion(tx, lote);
    });
    // Control: la función calculó de verdad (un aviso), así que «da lo mismo» no es un null contra un null.
    expect(tiposDe(conElGlobal?.avisos)).toEqual(["brix_fuera_de_la_banda"]);
    expect(soloLectura).toEqual(conElGlobal);

    // La rama de «la receta no declara la recepción» también calcula sin escribir: es la que, al escribirse, alguien podría haber dejado con un UPDATE.
    const sinPaso = await version("LECTURA-SIN-PASO", [{ tipo: "fermentation" }]);
    const otro = await loteSinRecepcion();
    await abrir(otro, sinPaso);
    const soloLecturaSinPaso = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return avisosDeRecepcion(tx, otro);
    });
    expect(tiposDe(soloLecturaSinPaso?.avisos)).toEqual(["receta_sin_paso_de_recepcion"]);
  }, 60000);

  it("cada tipo de aviso que la función devuelve está en TIPOS_DE_AVISO_DE_RECEPCION, y la lista no trae ninguno que no devuelva", async () => {
    // Adjudicación I1: la lista es lo que la tarea 13 recorre para exigir que cada tipo tenga texto. Un lote por tipo, cada uno con la entrada
    // que lo produce: cuatro recetas (la banda 18–24 como meta inicial del paso de recepción, la misma sin banda, y una sin paso de recepción).
    const v = await version("TIPOS", [{ tipo: "reception", metas: [BANDA] }]);
    const vSinBanda = await version("TIPOS-SIN-BANDA", [{ tipo: "reception" }]);
    const vSinPaso = await version("TIPOS-SIN-PASO", [{ tipo: "fermentation" }]);
    const sinNinguna = await loteSinRecepcion(); // sin_recepcion: nada en la ascendencia
    const sinMedir = await recibir(20, null, dia(1)); // recepcion_sin_brix: llegó sin Brix
    const loteSinMedir = await loteDe([{ recepcionId: sinMedir.id, kg: 20 }]);
    const alta = await recibir(20, 26, dia(2)); // brix_fuera_de_la_banda, por arriba
    const baja = await recibir(20, 14, dia(3)); // y por abajo
    const loteFuera = await loteDe([{ recepcionId: alta.id, kg: 20 }, { recepcionId: baja.id, kg: 20 }]);
    const buena = await recibir(20, 20, dia(4)); // control: dentro de la banda, y por tanto sin aviso
    const loteDentro = await loteDe([{ recepcionId: buena.id, kg: 20 }]);
    const delPasoSinBanda = await loteSinRecepcion(); // paso_de_recepcion_sin_banda: la receta declara el paso y no la banda (y, además, no hay recepción)
    const delSinPaso = await loteSinRecepcion(); // receta_sin_paso_de_recepcion: la receta no declara el paso
    for (const lote of [sinNinguna, loteSinMedir, loteFuera, loteDentro]) await abrir(lote, v);
    await abrir(delPasoSinBanda, vSinBanda);
    await abrir(delSinPaso, vSinPaso);

    const tipos = async (lote: string) => tiposDe((await avisosDeRecepcion(prisma, lote))?.avisos);
    const porLote = {
      sinNinguna: await tipos(sinNinguna),
      sinMedir: await tipos(loteSinMedir),
      fuera: await tipos(loteFuera),
      dentro: await tipos(loteDentro),
      pasoSinBanda: await tipos(delPasoSinBanda),
      sinPaso: await tipos(delSinPaso),
    };
    // Cada lote produce SU tipo, y el de dentro ninguno: sin esto, «lo observado está en la lista» saldría de una función que no distingue nada.
    expect(porLote).toEqual({
      sinNinguna: ["sin_recepcion"],
      sinMedir: ["recepcion_sin_brix"],
      fuera: ["brix_fuera_de_la_banda", "brix_fuera_de_la_banda"],
      dentro: [],
      pasoSinBanda: ["paso_de_recepcion_sin_banda", "sin_recepcion"],
      sinPaso: ["receta_sin_paso_de_recepcion"],
    });
    const observados = new Set(Object.values(porLote).flat());
    // 1. Todo lo que devuelve está en la lista (el compilador también lo exige: la unión se deriva de ella).
    for (const t of observados) expect(TIPOS_DE_AVISO_DE_RECEPCION).toContain(t);
    // 2. La lista no trae ninguno de más: cada uno de sus tipos lo produce alguna entrada.
    expect([...observados].sort()).toEqual([...TIPOS_DE_AVISO_DE_RECEPCION].sort());
    // Y es la lista que la tarea 13 espera: los tres de la adjudicación I1 en su orden y, detrás, los dos de «la receta no declara» (PE-77/78), sin repetir.
    expect(TIPOS_DE_AVISO_DE_RECEPCION).toEqual([
      "sin_recepcion", "recepcion_sin_brix", "brix_fuera_de_la_banda", "receta_sin_paso_de_recepcion", "paso_de_recepcion_sin_banda",
    ]);
  }, 60000);

  it("lo que el editor escribe es lo que el aviso lee", async () => {
    // La autoría de recetas (`exigeAutoriaDeReceta`, tarea 3; la comprueba `agregarPaso`, y `publicarVersion` también) comprueba el alcance
    // por la organización a través de un lote suyo —sin ninguno es `RecipeError("organizacion_sin_lotes")`—: el lote se arma antes.
    // Escribe el Platform Admin, que lleva el permiso del Coffee Process Manager por tener el catálogo entero.
    const alta = await recibir(20, 26, dia(1));
    const lote = await loteDe([{ recepcionId: alta.id, kg: 20 }]);
    const receta = await prisma.processRecipe.create({ data: { name: `TEST EDITOR ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor } });
    const borrador = await prisma.processRecipeVersion.create({ data: { recipeId: receta.id, version: 1, status: "draft", createdBy: gestor } });
    const paso = await agregarPaso(admin, {
      recipeVersionId: borrador.id,
      despuesDeSeq: null,
      paso: { stepTypeValueId: idDelTipo("reception"), metas: [{ variable: "brix", moment: "initial", unit: "Bx", minValue: 18, maxValue: 24 }] },
    });
    await publicarVersion(admin, borrador.id);
    await abrir(lote, borrador);

    const r = await avisosDeRecepcion(prisma, lote);
    // La meta que escribió `agregarPaso` (variable `brix`, unidad `Bx`, momento inicial, fase nula: el tipo `reception` no tiene
    // fase) es la banda que lee el aviso.
    expect(r?.bandas).toEqual([{ stepId: paso.id, seq: 1, min: 18, max: 24 }]);
    expect(tiposDe(r?.avisos)).toEqual(["brix_fuera_de_la_banda"]);
  }, 60000);
});

describe("juzgarBrix — el juicio de un Brix contra una banda, sin base", () => {
  const banda = { min: 18, max: 24 };

  it("los límites son de la banda: 18 y 24 están dentro; un centésimo fuera de cada lado, no", () => {
    expect(juzgarBrix(20, banda)).toBe("dentro"); // control: el caso del medio
    expect(juzgarBrix(18, banda)).toBe("dentro");
    expect(juzgarBrix(24, banda)).toBe("dentro");
    expect(juzgarBrix(17.99, banda)).toBe("bajo");
    expect(juzgarBrix(24.01, banda)).toBe("alto");
  });

  it("media banda: con sólo mínimo no hay «alto», y con sólo máximo no hay «bajo»", () => {
    expect(juzgarBrix(30, { min: 18, max: null })).toBe("dentro");
    expect(juzgarBrix(10, { min: 18, max: null })).toBe("bajo"); // control
    expect(juzgarBrix(10, { min: null, max: 24 })).toBe("dentro");
    expect(juzgarBrix(30, { min: null, max: 24 })).toBe("alto"); // control
  });

  it("sin Brix, o con un Brix que no es un número, es «sin_brix»: un NaN nunca queda dentro", () => {
    expect(juzgarBrix(20, banda)).toBe("dentro"); // control
    expect(juzgarBrix(null, banda)).toBe("sin_brix");
    expect(juzgarBrix(Number.NaN, banda)).toBe("sin_brix");
    expect(juzgarBrix(Number.POSITIVE_INFINITY, banda)).toBe("sin_brix");
  });
});
