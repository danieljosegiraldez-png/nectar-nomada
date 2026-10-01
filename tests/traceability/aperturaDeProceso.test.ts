/**
 * R2 de la Parte 1: un solo proceso abierto por café, comprobado en el linaje y no sólo en el lote.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde, tieneCondicion } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `apertura-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string;
const lotes: string[] = [];
const transformaciones: string[] = [];
const mediciones: string[] = [];

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function lote(codigo: string, lotType: "cherry" | "honey" = "cherry") {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType, organizationId: orgId, locationId: plotId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  lotes.push(id);
  return id;
}
async function enlazar(tipo: "stage_change" | "split" | "merge", padres: string[], hijos: string[]) {
  const t = await prisma.lotTransformation.create({ data: {
    transformationType: tipo, occurredAt: new Date("2026-03-05T12:00:00Z"), provenanceClass: "original_record", createdBy: gestor,
    inputs: { create: padres.map((lotId) => ({ lotId })) }, outputs: { create: hijos.map((lotId) => ({ lotId })) },
  } });
  transformaciones.push(t.id);
  return t.id;
}
/** Un proceso cerrado por humedad, insertado crudo. */
async function cerradoCrudo(lotId: string) {
  const [g, c] = await Promise.all([
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
  ]);
  const m = (await prisma.measurement.create({ data: { variable: "moisture", value: 10.5, unit: "%", occurredAt: new Date("2026-03-20T12:00:00Z"), lotId, provenanceClass: "measured_fact", createdBy: gestor } })).id;
  mediciones.push(m);
  return (await prisma.lotProcess.create({ data: {
    lotId, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
    endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: m,
  } })).id;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
}, 60000);

afterAll(async () => {
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformaciones } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: gestor }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: gestor }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R2 — un solo proceso abierto por café", () => {
  it("no se abre en el hijo si el padre tiene uno abierto", async () => {
    const padre = await lote("P1-PADRE");
    const hijo = await lote("P1-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    await abrirProcesoDePrueba(gestor, padre);
    await expect(abrirProcesoDePrueba(gestor, hijo)).rejects.toThrow(new LotProcessError("process_already_open"));
  });

  it("no se abre en el padre si un hijo tiene uno abierto", async () => {
    const padre = await lote("P2-PADRE");
    const hijo = await lote("P2-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    await abrirProcesoDePrueba(gestor, hijo);
    await expect(abrirProcesoDePrueba(gestor, padre)).rejects.toThrow(new LotProcessError("process_already_open"));
  });

  it("sí se abre un reproceso bajo un proceso CERRADO", async () => {
    const padre = await lote("P3-PADRE");
    const hijo = await lote("P3-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    await cerradoCrudo(padre);
    const p = await abrirProcesoDePrueba(gestor, hijo);
    expect(p.endedAt).toBeNull();
  });

  it("rechaza dividido, en bodega, mezcla y miel, cada uno con su código", async () => {
    // Dividido: la entrada de una división que cerró un proceso.
    const x = await lote("P4-DIV");
    const x1 = await lote("P4-DIV1");
    const t = await enlazar("split", [x], [x1]);
    const [g, c] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
    ]);
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
      endedAt: new Date("2026-03-05T12:00:00Z"), closureKind: "divided", dividedByTransformationId: t,
    } });
    await expect(abrirProcesoDePrueba(gestor, x)).rejects.toThrow(new LotProcessError("lote_dividido"));

    // En bodega.
    const b = await lote("P4-BODEGA");
    await prisma.storageAssignment.create({ data: { lotId: b, locationId: plotId, startedAt: new Date("2026-03-22T12:00:00Z") } });
    await expect(abrirProcesoDePrueba(gestor, b)).rejects.toThrow(new LotProcessError("lote_en_bodega"));

    // Mezcla.
    const a1 = await lote("P4-MA");
    const a2 = await lote("P4-MB");
    await cerradoCrudo(a1);
    await cerradoCrudo(a2);
    const m = await lote("P4-MEZCLA");
    await enlazar("merge", [a1, a2], [m]);
    await expect(abrirProcesoDePrueba(gestor, m)).rejects.toThrow(new LotProcessError("lote_mezclado"));

    // Miel.
    const miel = await lote("P4-MIEL", "honey");
    await expect(abrirProcesoDePrueba(gestor, miel)).rejects.toThrow(new LotProcessError("proceso_no_aplica_a_miel"));
  });

  it("un descendiente a más de 12 generaciones con proceso abierto impide abrir arriba", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 15; i++) ids.push(await lote(`P6-${i}`));
    for (let i = 1; i < 15; i++) await enlazar("stage_change", [ids[i - 1]!], [ids[i]!]);
    await abrirProcesoDePrueba(gestor, ids[14]!);
    await expect(abrirProcesoDePrueba(gestor, ids[0]!)).rejects.toThrow(new LotProcessError("process_already_open"));
  }, 60000);

  it("dos aperturas a la vez en padre e hijo: sólo una sale bien, y la otra con nombre", async () => {
    const padre = await lote("P5-PADRE");
    const hijo = await lote("P5-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    const res = await Promise.allSettled([abrirProcesoDePrueba(gestor, padre), abrirProcesoDePrueba(gestor, hijo)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const fallo = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(fallo.reason).toBeInstanceOf(LotProcessError);
    expect((fallo.reason as Error).message).toBe("process_already_open");
  }, 20000);

  it("no se abre bajo un ancestro abierto aunque haya uno cerrado más cerca", async () => {
    // G (raíz, sin proceso) → P (con un proceso CERRADO) → C. G abre sin problema, porque P está
    // cerrado; desde entonces C no puede: su proceso vigente es el cerrado de P, que no ve el
    // abierto de G, y sólo el recorrido del linaje entero lo encuentra.
    const g = await lote("P7-G");
    const p = await lote("P7-P");
    const c = await lote("P7-C");
    await enlazar("stage_change", [g], [p]);
    await enlazar("stage_change", [p], [c]);
    await cerradoCrudo(p);
    const deG = await abrirProcesoDePrueba(gestor, g);
    expect(deG.endedAt).toBeNull();
    await expect(abrirProcesoDePrueba(gestor, c)).rejects.toThrow(new LotProcessError("process_already_open"));
  });

  it("abrir un proceso escribe su evento de auditoría lot_process.open", async () => {
    // Las tareas 6 y 8 reutilizan el núcleo de apertura y cuentan con este evento.
    const l = await lote("P8-AUDITORIA");
    const p = await abrirProcesoDePrueba(gestor, l);
    const evento = await prisma.auditEvent.findFirst({
      where: { operation: "lot_process.open", entityType: "lot_process", entityId: p.id },
    });
    expect(evento, "abrir un proceso no dejó su evento lot_process.open").not.toBeNull();
  });
});

describe("tieneCondicion, la guarda del ayudante de limpieza (función pura: no toca la base)", () => {
  // Medido el 2026-10-01 en `nectar_test_recetas` (104 lotes), con `count` y sólo lectura
  // (`.superpowers/sdd/…/out/r2-formas-vacias.txt`):
  //   casan con TODOS los lotes:  {}, { id: {} }, { id: undefined }, { AND: [] }, { NOT: [] },
  //                               { AND: [{}] }, { AND: {} }, { NOT: {} }, { NOT: [{}] }
  //   no casan con NINGUNO:       { OR: [] }, { OR: [{}] }, { id: { in: [] } }
  // Los peligrosos son los primeros; `{ AND: [] }` y `{ NOT: [] }` son los que la guarda de la ronda 1 dejaba
  // pasar (una lista vacía contaba como condición). `{ OR: [] }` y `{ OR: [{}] }` no borrarían nada, pero se
  // rechazan igual por conservadores. En la ronda 1 se creyó que `{ OR: [{}] }` casaba con todos: es falso.
  //
  // **Por qué se prueba la función y NO el ayudante.** El ayudante hace un `deleteMany` real, y una prueba que lo
  // llamara con estos filtros dependería sólo de esta guarda para no borrar los procesos de todas las sesiones
  // en una base compartida: el día que alguien la rompa, la prueba que la vigila sería la que borra. La función
  // es pura; el cableado lo vigila la prueba de fuente de abajo.
  const sinCondicion: [string, unknown][] = [
    ["{}", {}],
    ["{ id: {} }", { id: {} }],
    // `undefined` no es una condición: Prisma lo descarta y el filtro queda como `{}`. Aquí lo rechaza esta
    // guarda; en el ayudante salta ANTES de que `assertDefinedWhere` llegue a verlo.
    ["{ id: undefined }", { id: undefined }],
    ["{ AND: [] }", { AND: [] }],
    ["{ NOT: [] }", { NOT: [] }],
    ["{ OR: [] }", { OR: [] }],
    ["{ OR: [{}] }", { OR: [{}] }],
    ["{ AND: [{}] }", { AND: [{}] }],
    ["{ AND: [{}, { id: undefined }] }", { AND: [{}, { id: undefined }] }],
    ["{ AND: {} }", { AND: {} }],
    ["{ NOT: {} }", { NOT: {} }],
    ["{ NOT: [{}] }", { NOT: [{}] }],
    ["{ AND: [{ OR: [] }] }", { AND: [{ OR: [] }] }],
    ["{ lot: { AND: [] } } (anidado)", { lot: { AND: [] } }],
    ["{ lot: { NOT: [] } } (anidado)", { lot: { NOT: [] } }],
    ["{ lot: { id: undefined } } (anidado)", { lot: { id: undefined } }],
    ["{ id: { in: [undefined] } }", { id: { in: [undefined] } }],
  ];
  it.each(sinCondicion)("rechaza %s: no es una condición", (_etiqueta, filtro) => {
    expect(tieneCondicion(filtro)).toBe(false);
  });

  // Controles positivos: sin ellos, una función que devolviera siempre `false` pasaría todo lo de arriba.
  const conCondicion: [string, unknown][] = [
    ["{ id: 'x' }", { id: "x" }],
    ["{ id: { in: ['x'] } }", { id: { in: ["x"] } }],
    ["{ lotCode: { startsWith: 'TEST' } }", { lotCode: { startsWith: "TEST" } }],
    ["{ AND: [{ id: 'x' }] }", { AND: [{ id: "x" }] }],
    ["{ OR: [{ id: 'x' }] }", { OR: [{ id: "x" }] }],
    ["{ AND: [], id: 'x' } (una lista vacía junto a una condición real)", { AND: [], id: "x" }],
    ["{ lot: { id: 'x' } } (anidado)", { lot: { id: "x" } }],
    // `in: []` SÍ es una condición: no casa con nada, y es lo que queda en el `afterAll` cuando el `beforeAll`
    // no llegó a crear ningún lote. Si la guarda lo rechazara, esa limpieza lanzaría y abandonaría las líneas
    // siguientes (un `afterAll` es una cadena).
    ["{ id: { in: [] } } (lista de valores vacía)", { id: { in: [] } }],
  ];
  it.each(conCondicion)("acepta %s: sí es una condición", (_etiqueta, filtro) => {
    expect(tieneCondicion(filtro)).toBe(true);
  });
});

describe("borrarProcesosDeLotesDonde llama a la guarda antes de cualquier borrado (prueba de FUENTE)", () => {
  // La guarda de arriba no sirve si el ayudante deja de llamarla, o la llama después de borrar. Se lee el
  // archivo en vez de ejecutar el ayudante con filtros hostiles (ver la nota del bloque anterior).
  const RAIZ = new URL("../..", import.meta.url).pathname;
  const fuente = readFileSync(`${RAIZ}tests/helpers/procesoDePrueba.ts`, "utf8");

  const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  /** El cuerpo de `export async function <nombre>(…) {…}`, cerrado por llaves y no por indentación. */
  function cuerpoDe(texto: string, nombre: string): string {
    const ini = texto.indexOf(`export async function ${nombre}(`);
    if (ini < 0) return "";
    let i = texto.indexOf("(", ini);
    for (let nivel = 0; i < texto.length; i++) {
      if (texto[i] === "(") nivel++;
      else if (texto[i] === ")" && --nivel === 0) break;
    }
    const abre = texto.indexOf("{", i);
    let nivel = 0;
    for (let j = abre; j < texto.length; j++) {
      if (texto[j] === "{") nivel++;
      else if (texto[j] === "}" && --nivel === 0) return texto.slice(abre, j + 1);
    }
    return "";
  }

  const cuerpo = sinComentarios(cuerpoDe(fuente, "borrarProcesosDeLotesDonde"));
  const primerBorrado = cuerpo.search(/\.deleteMany\(/);
  const guarda = /if\s*\(\s*!\s*tieneCondicion\(\s*lot\s*\)\s*\)\s*\{?\s*throw\s+new\s+UnsafeWhereClauseError\(/.exec(cuerpo);

  it("el análisis encuentra el cuerpo del ayudante y sus dos borrados (control del propio análisis)", () => {
    expect(cuerpo.length, "no se encontró el cuerpo de borrarProcesosDeLotesDonde").toBeGreaterThan(50);
    expect(cuerpo.match(/\.deleteMany\(/g) ?? [], "el ayudante hace dos deleteMany: devoluciones y procesos").toHaveLength(2);
    expect(primerBorrado).toBeGreaterThan(0);
  });

  it("lanza UnsafeWhereClauseError si !tieneCondicion(lot), y lo hace ANTES de su primer deleteMany", () => {
    expect(guarda, "el ayudante no llama a `if (!tieneCondicion(lot)) throw new UnsafeWhereClauseError(…)`").not.toBeNull();
    expect(guarda!.index, "la guarda va después del primer deleteMany").toBeLessThan(primerBorrado);
  });
});
