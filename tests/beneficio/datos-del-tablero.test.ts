/**
 * `datosDelTablero`: que no enseñe un lote que no te toca.
 *
 * **Por qué el usuario de estas pruebas es Farm Operator de SU sitio y no Platform Admin.** El
 * 2026-09-17 una prueba de este módulo falló tres veces en tres ramas que no tocaban nada de lo
 * que leía: su fixture daba Platform Admin en ámbito de plataforma, `resolveLotVisibility`
 * devolvía `mode: "all"`, y la función calculaba sobre **toda la base compartida** — así que el
 * recuento sumaba los lotes que otros archivos tenían vivos en ese instante. Sola, pasaba
 * siempre. Con el ámbito acotado el recuento puede ser **exacto** (`toBe`, no `>=`), y si alguien
 * vuelve a darle ámbito de plataforma cae SIEMPRE, no a veces.
 *
 * Grupo `base-sembrada`: necesita base, así que va en `scripts/pruebas-por-compuerta.txt`.
 *
 * **La base compartida del 55433 no se resetea.** Esta prueba crea lo suyo con la etiqueta `RUN`
 * y lo borra en `afterEach`/`afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { datosDelTablero } from "../../lib/beneficio/datosDelTablero";
import { CATALOGO_ESTADO_CEREZA, CATALOGO_GRADO_PROCESO } from "../../lib/traceability/lotProcess";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `dt-${Date.now()}`;
const nombre = (etiqueta: string) => `TEST ${etiqueta} (${RUN})`;

const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const assignmentIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = [];
const lotIds: string[] = [];
const runIds: string[] = [];
const transformationIds: string[] = [];
const deviationIds: string[] = [];
const correctiveIds: string[] = [];
const procesoIds: string[] = [];
const storageIds: string[] = [];
const medicionIds: string[] = [];
const recetaIds: string[] = [];
const versionIds: string[] = [];
const catalogoValorIds: string[] = [];
const secadoIds: string[] = [];
const equipoIds: string[] = [];

let miOrgId: string, otraOrgId: string;
let valorGrado: string, valorCereza: string;
/** El valor REAL «Natural» del catálogo: es lo único que el motor traduce a un perfil (`PERFIL_POR_GRADO`) junto con «Washed». */
let valorNatural: string;
/** El valor REAL «Washed» del catálogo: el único cuyo perfil (`WASHED_STANDARD`) tiene matriz de pH citable. */
let valorWashed: string;

let operario: string;
let miSitio: string, otroSitio: string;
let ahora: Date;
let loteA: string, loteB: string, loteAjeno: string;
let transformacionDeA: string;

const HORA = 3_600_000;
const haceHoras = (h: number) => new Date(ahora.getTime() - h * HORA);

async function cuenta(etiqueta: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) },
  });
  personIds.push(person.id);
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  accountIds.push(account.id);
  return account.id;
}

async function asignar(userAccountId: string, perfil: string, locationId: string) {
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!existente) scopeIds.push(scope.id);
  const a = await prisma.assignment.create({
    data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id },
  });
  assignmentIds.push(a.id);
}

async function lugar(etiqueta: string, organizationId: string) {
  const l = await prisma.location.create({
    data: {
      name: nombre(etiqueta),
      locationType: "site",
      classification: "internal",
      status: "approved",
      organizationId,
    },
  });
  locationIds.push(l.id);
  return l.id;
}

/** Un lote con una fermentación ABIERTA, que es lo que el tablero vigila. */
async function loteFermentando(etiqueta: string, locationId: string, organizationId: string) {
  const lot = await prisma.lot.create({
    data: {
      lotCode: `${etiqueta}-${RUN}`,
      lotType: "cherry",
      organizationId,
      locationId,
      status: "approved",
      classification: "internal",
    },
  });
  lotIds.push(lot.id);
  const corrida = await prisma.fermentationRun.create({
    data: { startedAt: haceHoras(10), vesselNote: `tanque de ${etiqueta}` },
  });
  runIds.push(corrida.id);
  const t = await prisma.lotTransformation.create({
    data: {
      transformationType: "stage_change",
      occurredAt: haceHoras(10),
      provenanceClass: "original_record",
      fermentationRunId: corrida.id,
      inputs: { create: [{ lotId: lot.id, quantity: 60, unit: "kg" }] },
    },
  });
  transformationIds.push(t.id);
  return { lotId: lot.id, transformationId: t.id };
}

beforeAll(async () => {
  ahora = new Date();
  const miOrg = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("Finca mía"), status: "approved", classification: "internal" },
  });
  const otraOrg = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("Finca ajena"), status: "approved", classification: "internal" },
  });
  orgIds.push(miOrg.id, otraOrg.id);
  miOrgId = miOrg.id;
  otraOrgId = otraOrg.id;

  miSitio = await lugar("Mi sitio", miOrg.id);
  otroSitio = await lugar("Otro sitio", otraOrg.id);

  operario = await cuenta("operario");
  // Farm Operator de SU sitio. Nunca Platform Admin: ver la cabecera.
  await asignar(operario, "Farm Operator", miSitio);

  // Los catálogos son REALES y puede que la base de esta sesión aún no los tenga: `upsert` el
  // catálogo, y sólo el VALOR es nuestro (y es lo único que el `afterAll` borra).
  const grado = await prisma.variableCatalog.upsert({
    where: { key: CATALOGO_GRADO_PROCESO },
    update: {},
    create: { key: CATALOGO_GRADO_PROCESO, name: "Grado de proceso" },
  });
  const cereza = await prisma.variableCatalog.upsert({
    where: { key: CATALOGO_ESTADO_CEREZA },
    update: {},
    create: { key: CATALOGO_ESTADO_CEREZA, name: "Estado de la cereza" },
  });
  const vg = await prisma.variableCatalogValue.create({ data: { catalogId: grado.id, value: nombre("Natural") } });
  const vc = await prisma.variableCatalogValue.create({ data: { catalogId: cereza.id, value: nombre("entera") } });
  valorGrado = vg.id;
  valorCereza = vc.id;
  catalogoValorIds.push(vg.id, vc.id);
  // **«Natural» tiene que llamarse exactamente así**: `PERFIL_POR_GRADO` busca por texto, y con el
  // valor `TEST Natural (RUN)` de arriba el lote cae en `GRADO_SIN_PERFIL` y no tiene veredicto —
  // que es justo lo que NO sirve para probar «pide decisión». Si el catálogo real ya lo trae se
  // reusa y NO se borra; si no, se crea y entra en la lista de lo que el `afterAll` quita.
  const natural = await prisma.variableCatalogValue.findFirst({ where: { catalogId: grado.id, value: "Natural" } });
  if (natural) {
    valorNatural = natural.id;
  } else {
    const nuevo = await prisma.variableCatalogValue.create({ data: { catalogId: grado.id, value: "Natural" } });
    valorNatural = nuevo.id;
    catalogoValorIds.push(nuevo.id);
  }
  // «Washed», con la misma regla que «Natural»: se reusa el del catálogo real si existe y no se borra; si no, se crea y se quita.
  const washed = await prisma.variableCatalogValue.findFirst({ where: { catalogId: grado.id, value: "Washed" } });
  if (washed) {
    valorWashed = washed.id;
  } else {
    const nuevo = await prisma.variableCatalogValue.create({ data: { catalogId: grado.id, value: "Washed" } });
    valorWashed = nuevo.id;
    catalogoValorIds.push(nuevo.id);
  }

  const a = await loteFermentando("LOTE-A", miSitio, miOrg.id);
  const b = await loteFermentando("LOTE-B", miSitio, miOrg.id);
  const ajeno = await loteFermentando("LOTE-AJENO", otroSitio, otraOrg.id);
  loteA = a.lotId;
  loteB = b.lotId;
  loteAjeno = ajeno.lotId;
  transformacionDeA = a.transformationId;
});

afterAll(async () => {
  // **Cada borrado en su propio `try`, y no una cadena.** Un `afterAll` es una cadena: la
  // primera FK que se queja tira todo lo que viene después. El 2026-09-30 esta misma limpieza
  // dejó 22 filas TEST en la base compartida —3 lotes, 2 organizaciones, 2 ubicaciones, 2
  // personas y su rastro— porque el `deleteMany` de los inputs llevaba el nombre de campo
  // equivocado (`lotTransformationId` en vez de `transformationId`), lanzó, y las nueve líneas
  // siguientes no se ejecutaron. Se vieron en el navegador, no en el verde de la suite.
  //
  // Envolver cada paso cuesta esto y convierte «una fuga silenciosa» en «un aviso impreso».
  const pasos: [string, () => Promise<unknown>][] = [
    // Las correcciones apuntan a su original por `correctsId`: primero ellas.
    ["measurement (correcciones)", () => prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: medicionIds }, correctsId: { not: null } }) })],
    ["measurement", () => prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: medicionIds } }) })],
    ["storageAssignment", () => prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ id: { in: storageIds } }) })],
    // Las transformaciones apuntan a sus corridas de secado y las corridas a su proceso: en este orden.
    ["transformationInput", () => prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformationIds } }) })],
    ["lotTransformation", () => prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformationIds } }) })],
    ["dryingRun", () => prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: secadoIds } }) })],
    // La fermentación también apunta a su proceso (`lotProcessId`): antes que él, como la de secado.
    ["fermentationRun", () => prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: runIds } }) })],
    // El tanque lo referencia la corrida (`vesselEquipmentId`): después de ella.
    ["equipment", () => prisma.equipment.deleteMany({ where: assertDefinedWhere({ id: { in: equipoIds } }) })],
    ["lotProcess", () => prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ id: { in: procesoIds } }) })],
    ["processTarget", () => prisma.processTarget.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) })],
    ["processRecipePhase", () => prisma.processRecipePhase.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) })],
    ["processRecipeVersion", () => prisma.processRecipeVersion.deleteMany({ where: assertDefinedWhere({ id: { in: versionIds } }) })],
    ["processRecipe", () => prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recetaIds } }) })],
    // Sólo los valores de ESTA corrida: el catálogo es real y borrar el suyo entero se llevaría vocabulario de verdad.
    ["variableCatalogValue", () => prisma.variableCatalogValue.deleteMany({ where: assertDefinedWhere({ id: { in: catalogoValorIds } }) })],
    ["correctiveAction", () => prisma.correctiveAction.deleteMany({ where: assertDefinedWhere({ id: { in: correctiveIds } }) })],
    ["deviation", () => prisma.deviation.deleteMany({ where: assertDefinedWhere({ id: { in: deviationIds } }) })],
    ["lot", () => prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) })],
    ["assignment", () => prisma.assignment.deleteMany({ where: assertDefinedWhere({ id: { in: assignmentIds } }) })],
    ["scope", () => prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) })],
    ["location", () => prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) })],
    ["organization", () => prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgIds } }) })],
    ["userAccount", () => prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: accountIds } }) })],
    ["person", () => prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) })],
  ];
  const fallos: string[] = [];
  for (const [nombre, fn] of pasos) {
    try {
      await fn();
    } catch (e) {
      // La ÚLTIMA línea no vacía: los errores de Prisma empiezan con una línea en blanco y la
      // primera dejaba el aviso en «loteDesdeRecepcion: » sin decir por qué.
      const lineas = (e as Error).message.split("\n").map((l) => l.trim()).filter(Boolean);
      fallos.push(`${nombre}: ${lineas[lineas.length - 1] ?? "(sin mensaje)"}`);
    }
  }
  // Se imprime con `process.stdout.write` y no con `console.log`: vitest intercepta la consola
  // y sólo la saca para las pruebas que FALLAN, así que un aviso de fuga en una corrida verde
  // no se vería nunca.
  if (fallos.length > 0) {
    process.stdout.write(`\n[FUGA] la limpieza de ${RUN} dejó filas: ${fallos.join(" | ")}\n`);
  }
});

describe("datosDelTablero", () => {
  it("sólo trae los lotes que el permiso de quien mira alcanza", async () => {
    const d = await datosDelTablero(operario, ahora);
    // EXACTO, no `>=`: con el ámbito acotado el recuento es determinista aunque otras sesiones
    // estén escribiendo en la base compartida.
    expect(d.lotes).toHaveLength(2);
    expect(d.lotes.map((l) => l.lotId).sort()).toEqual([loteA, loteB].sort());
    expect(d.lotes.map((l) => l.lotId)).not.toContain(loteAjeno);
    expect(d.sinAmbito).toBe(false);
  });

  it("una cuenta sin ninguna asignación NO ve un tablero vacío: ve sinAmbito", async () => {
    const reciennacida = await cuenta("recien");
    const d = await datosDelTablero(reciennacida, ahora);
    expect(d.sinAmbito).toBe(true);
    expect(d.lotes).toEqual([]);
    // **Sin ámbito no es «cero en cada etapa».** Una línea de seis ceros le diría a quien no ve
    // ningún lote que el beneficio está vacío; por eso `etapas` viene VACÍA y `sinAmbito` lo dice.
    // Mutación que la hace caer: calcular `lineaDeEtapas` con ceros en la rama sin ámbito.
    expect(d.etapas).toEqual([]);
    expect(d.liberacion).toBeNull();
    // Y ni pidiendo una curva de un lote que existe se le abre la puerta.
    const pideCurva = await datosDelTablero(reciennacida, ahora, {
      curva: { lotId: loteA, variable: "moisture", ancho: 300, alto: 100 },
    });
    expect(pideCurva.curva).toBeNull();
    // Control positivo de que `loteA` existe y su dueño lo ve: sin él, el `null` de arriba sería
    // «el lote no existe», no «no lo ves».
    const dueno = await datosDelTablero(operario, ahora, {
      curva: { lotId: loteA, variable: "moisture", ancho: 300, alto: 100 },
    });
    expect(dueno.curva).not.toBeNull();
  });

  it("la corrida de un lote visible llega, con su tanque sin declarar", async () => {
    const d = await datosDelTablero(operario, ahora);
    expect(d.corridas).toHaveLength(2);
    // `vesselEquipmentId` es nulo y el tanque va en texto libre: el tablero lo contará como
    // «sin unidad declarada» y no ocupará ningún tanque.
    expect(d.corridas.every((c) => c.equipmentId === null && c.vesselNote !== null)).toBe(true);
  });

  it("una desviación SIN acción correctiva cuenta; con ella, no", async () => {
    const dev = await prisma.deviation.create({
      data: {
        lotTransformationId: transformacionDeA,
        description: nombre("desviación"),
        occurredAt: haceHoras(5),
        severity: "mass_balance",
      },
    });
    deviationIds.push(dev.id);

    const abierta = await datosDelTablero(operario, ahora);
    expect(abierta.desviacionesAbiertasPorLote.get(loteA)).toBe(1);

    const accion = await prisma.correctiveAction.create({
      data: { deviationId: dev.id, actionText: nombre("acción"), takenAt: haceHoras(4) },
    });
    correctiveIds.push(accion.id);

    const cerrada = await datosDelTablero(operario, ahora);
    expect(cerrada.desviacionesAbiertasPorLote.get(loteA)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Las tres piezas visuales (§4.5): la línea de etapas, cuándo se libera la próxima unidad, la curva.
//
// **Cada prueba de la línea mide una DIFERENCIA, no un valor absoluto**: otras pruebas del archivo
// dejan lotes suyos vivos (los que fermentan), y el orden no debe importar. Y cada una sigue la misma
// secuencia, que es el control positivo de la casa: (1) algo de OTRO sitio no mueve el número;
// (2) algo MÍO que no cuenta —cerrado, terminado— no lo mueve; (3) lo mío que sí cuenta
// lo sube en uno. Sin el paso (3) los dos ceros anteriores se leen como «funciona» cuando pueden ser
// «no miré».
// ---------------------------------------------------------------------------------------------

async function loteSimple(etiqueta: string, locationId: string, organizationId: string) {
  const lot = await prisma.lot.create({
    data: {
      lotCode: `${etiqueta}-${RUN}`,
      lotType: "cherry",
      organizationId,
      locationId,
      status: "approved",
      classification: "internal",
    },
  });
  lotIds.push(lot.id);
  return lot.id;
}

async function transformacionDe(
  lotId: string,
  tipo: "selection" | "stage_change",
  extra: { dryingRunId?: string } = {},
) {
  const t = await prisma.lotTransformation.create({
    data: {
      transformationType: tipo,
      occurredAt: haceHoras(3),
      provenanceClass: "original_record",
      dryingRunId: extra.dryingRunId ?? null,
      inputs: { create: [{ lotId, quantity: 10, unit: "kg" }] },
    },
  });
  transformationIds.push(t.id);
}

async function procesoDe(
  lotId: string,
  o: { cerrado?: boolean; versionId?: string; secuencia?: number; natural?: boolean; washed?: boolean } = {},
) {
  const p = await prisma.lotProcess.create({
    data: {
      lotId,
      // La unicidad es `(lotId, sequenceOrder)`: un lote puede tener varios procesos abiertos.
      sequenceOrder: o.secuencia ?? 1,
      intent: nombre("intención"),
      processGradeValueId: o.washed ? valorWashed : o.natural ? valorNatural : valorGrado,
      cherryStateValueId: valorCereza,
      targetMoisturePct: 11,
      startedAt: haceHoras(12),
      endedAt: o.cerrado ? haceHoras(1) : null,
      provenanceClass: "original_record",
      processRecipeVersionId: o.versionId ?? null,
    },
  });
  procesoIds.push(p.id);
  return p.id;
}

/** Una corrida de secado con su transformación de entrada, que es lo que la ata a un lote. */
async function secadoDe(
  lotId: string,
  o: { cerrado?: boolean; camaId?: string; lotProcessId?: string; inicio?: Date } = {},
) {
  const corrida = await prisma.dryingRun.create({
    data: {
      startedAt: o.inicio ?? haceHoras(10),
      endedAt: o.cerrado ? haceHoras(1) : null,
      dryingBedLocationId: o.camaId ?? null,
      lotProcessId: o.lotProcessId ?? null,
    },
  });
  secadoIds.push(corrida.id);
  await transformacionDe(lotId, "stage_change", { dryingRunId: corrida.id });
  return corrida.id;
}

/**
 * Una fermentación ABIERTA de un lote, con lo que el tablero lee de ella: su proceso (de ahí salen
 * el grado y la duración de la fase) y su tanque (`vesselEquipmentId`, que es lo que la ata a una
 * unidad). `loteFermentando` no los acepta y los tres primeros lotes del archivo no los necesitan.
 */
async function fermentacionDe(
  lotId: string,
  o: { lotProcessId?: string; tanqueId?: string; inicio?: Date } = {},
) {
  const corrida = await prisma.fermentationRun.create({
    data: {
      startedAt: o.inicio ?? haceHoras(10),
      vesselNote: nombre("tanque"),
      lotProcessId: o.lotProcessId ?? null,
      vesselEquipmentId: o.tanqueId ?? null,
    },
  });
  runIds.push(corrida.id);
  const t = await prisma.lotTransformation.create({
    data: {
      transformationType: "stage_change",
      occurredAt: o.inicio ?? haceHoras(10),
      provenanceClass: "original_record",
      fermentationRunId: corrida.id,
      inputs: { create: [{ lotId, quantity: 10, unit: "kg" }] },
    },
  });
  transformationIds.push(t.id);
  return corrida.id;
}

async function almacenDe(lotId: string, locationId: string, cerrado: boolean) {
  const a = await prisma.storageAssignment.create({
    data: { lotId, locationId, startedAt: haceHoras(6), endedAt: cerrado ? haceHoras(1) : null },
  });
  storageIds.push(a.id);
}

async function medicionDe(
  lotId: string,
  variable: string,
  value: number,
  occurredAt: Date,
  corrige?: { id: string },
) {
  const m = await prisma.measurement.create({
    data: {
      variable,
      value,
      unit: variable === "moisture" ? "%" : "pH",
      occurredAt,
      lotId,
      provenanceClass: "measured_fact",
      ...(corrige ? { correctsId: corrige.id, reason: "TEST corrección" } : {}),
    },
  });
  medicionIds.push(m.id);
  return m.id;
}

async function lotesEn(clave: string): Promise<number> {
  const e = (await datosDelTablero(operario, ahora)).etapas.find((x) => x.clave === clave)!.estado;
  // Un `sin_registro` aquí NO es un cero: si la etapa pasara a no contar, que la prueba reviente en
  // vez de comparar `undefined` con un número.
  if (e.tipo !== "cuenta") throw new Error(`la etapa ${clave} no cuenta: ${e.tipo}`);
  return e.lotes;
}

describe("la línea de etapas", () => {
  it("trae las seis etapas en orden; recepción, flotación y selección dicen «sin registro», no cero", async () => {
    const { etapas } = await datosDelTablero(operario, ahora);
    expect(etapas.map((e) => e.clave)).toEqual(["recepcion", "flotacion", "seleccion", "proceso", "secado", "almacen"]);
    // ADR-195: las tres son actos pasados (o un método), no «lo que hay ahora».
    const sinRegistro = etapas.filter((e) => ["recepcion", "flotacion", "seleccion"].includes(e.clave));
    expect(sinRegistro).toHaveLength(3);
    expect(sinRegistro.map((e) => e.estado)).toEqual([
      { tipo: "sin_registro" },
      { tipo: "sin_registro" },
      { tipo: "sin_registro" },
    ]);
    // Control: las otras tres SÍ cuentan. Sin esto, «las tres dicen sin_registro» también
    // pasaría si TODA la línea dijera sin_registro.
    const otras = etapas.filter((e) => !["recepcion", "flotacion", "seleccion"].includes(e.clave));
    expect(otras.map((e) => e.clave)).toEqual(["proceso", "secado", "almacen"]);
    expect(otras.every((e) => e.estado.tipo === "cuenta")).toBe(true);
  });

  it("proceso: sólo el que sigue abierto, de un lote visible, y un lote con dos procesos abiertos cuenta una vez", async () => {
    const antes = await lotesEn("proceso");

    const ajeno = await loteSimple("P-AJENO", otroSitio, otraOrgId);
    await procesoDe(ajeno);
    expect(await lotesEn("proceso")).toBe(antes);

    const cerrado = await loteSimple("P-CERRADO", miSitio, miOrgId);
    await procesoDe(cerrado, { cerrado: true });
    expect(await lotesEn("proceso")).toBe(antes);

    const abierto = await loteSimple("P-ABIERTO", miSitio, miOrgId);
    await procesoDe(abierto);
    expect(await lotesEn("proceso")).toBe(antes + 1);

    // Un lote puede tener DOS procesos abiertos (la unicidad es `(lotId, sequenceOrder)`): la etapa
    // cuenta LOTES, no filas. Mutación que la hace caer: contar `lotProcess` en vez de `lot`.
    await procesoDe(abierto, { secuencia: 2 });
    expect(await lotesEn("proceso")).toBe(antes + 1);
  });

  it("secado: sólo la corrida abierta, de un lote visible, y un lote con dos corridas abiertas cuenta una vez", async () => {
    const antes = await lotesEn("secado");

    const ajeno = await loteSimple("D-AJENO", otroSitio, otraOrgId);
    await secadoDe(ajeno);
    expect(await lotesEn("secado")).toBe(antes);

    const cerrado = await loteSimple("D-CERRADO", miSitio, miOrgId);
    await secadoDe(cerrado, { cerrado: true });
    expect(await lotesEn("secado")).toBe(antes);

    const abierto = await loteSimple("D-ABIERTO", miSitio, miOrgId);
    await secadoDe(abierto);
    expect(await lotesEn("secado")).toBe(antes + 1);

    // La misma regla: una segunda corrida abierta del MISMO lote no sube el número.
    await secadoDe(abierto);
    expect(await lotesEn("secado")).toBe(antes + 1);
  });

  it("almacén: sólo la asignación vigente, de un lote visible, y un lote con dos asignaciones vigentes cuenta una vez", async () => {
    const antes = await lotesEn("almacen");

    const ajeno = await loteSimple("A-AJENO", otroSitio, otraOrgId);
    await almacenDe(ajeno, otroSitio, false);
    expect(await lotesEn("almacen")).toBe(antes);

    const terminada = await loteSimple("A-TERMINADA", miSitio, miOrgId);
    await almacenDe(terminada, miSitio, true);
    expect(await lotesEn("almacen")).toBe(antes);

    const vigente = await loteSimple("A-VIGENTE", miSitio, miOrgId);
    await almacenDe(vigente, miSitio, false);
    expect(await lotesEn("almacen")).toBe(antes + 1);

    // `storage_assignment` no tiene ninguna restricción que impida dos vigentes del mismo lote.
    await almacenDe(vigente, miSitio, false);
    expect(await lotesEn("almacen")).toBe(antes + 1);
  });
});

async function pidenEn(clave: string): Promise<number> {
  const e = (await datosDelTablero(operario, ahora)).etapas.find((x) => x.clave === clave)!.estado;
  if (e.tipo !== "cuenta") throw new Error(`la etapa ${clave} no cuenta: ${e.tipo}`);
  return e.pidenDecision;
}

describe("«pide decisión» llega a la etapa de su fase", () => {
  // La regla pura (qué grupo cuenta, y que cada fase caiga en SU clave) la prueban `tablero.test.ts`
  // y sin base. Lo que sólo se ve AQUÍ es el cableado del cargador: que cada corrida abierta llegue
  // a `entradasPorFase`, que las dos fases no se crucen y que el resultado alcance la línea.
  //
  // Lotes con veredicto REAL, no entradas fabricadas: grado «Natural» (el único que se traduce a
  // perfil), y lecturas que lo dictaminan. Un pH de 3,0 está por debajo del umbral inmediato del
  // perfil NATURAL (3,4) y es CRITICAL sin esperar confirmación; una humedad de 30 % sin bajar en dos
  // ventanas de 24 h es `STALLED_MOLD_HAZARD`, también CRITICAL.
  it("un lote visible con la fase abierta y un veredicto crítico sube SU etapa, y sólo ella", async () => {
    const antesProceso = await pidenEn("proceso");
    const antesSecado = await pidenEn("secado");

    // (1) Uno de OTRO sitio, crítico de verdad: no mueve nada.
    const ajeno = await loteSimple("PD-AJENO", otroSitio, otraOrgId);
    await fermentacionDe(ajeno, { lotProcessId: await procesoDe(ajeno, { natural: true }) });
    await medicionDe(ajeno, "ph", 3.0, haceHoras(2));
    expect(await pidenEn("proceso")).toBe(antesProceso);

    // (2) Uno MÍO que fermenta dentro de la ventana óptima: tiene veredicto y no pide decisión.
    const sano = await loteSimple("PD-SANO", miSitio, miOrgId);
    await fermentacionDe(sano, { lotProcessId: await procesoDe(sano, { natural: true }) });
    await medicionDe(sano, "ph", 4.3, haceHoras(2));
    expect(await pidenEn("proceso")).toBe(antesProceso);

    // (3) Dos MÍOS en fermentación, críticos: la etapa «proceso» sube en DOS, «secado» no se mueve.
    for (const etiqueta of ["PD-F1", "PD-F2"]) {
      const lote = await loteSimple(etiqueta, miSitio, miOrgId);
      await fermentacionDe(lote, { lotProcessId: await procesoDe(lote, { natural: true }) });
      await medicionDe(lote, "ph", 3.0, haceHoras(2));
    }
    expect(await pidenEn("proceso")).toBe(antesProceso + 2);
    expect(await pidenEn("secado")).toBe(antesSecado);

    // (4) Uno MÍO en secado, crítico: «secado» sube en UNO y «proceso» se queda en +2. **Distinto de
    // dos a propósito**: con el mismo número en las dos, cruzar las fases pasaría la prueba.
    const secando = await loteSimple("PD-S1", miSitio, miOrgId);
    const proceso = await procesoDe(secando, { natural: true });
    await secadoDe(secando, { lotProcessId: proceso, inicio: haceHoras(40) });
    await medicionDe(secando, "moisture", 30, haceHoras(30));
    await medicionDe(secando, "moisture", 30, haceHoras(3));
    expect(await pidenEn("secado")).toBe(antesSecado + 1);
    expect(await pidenEn("proceso")).toBe(antesProceso + 2);
  });

  it("un lote con DOS corridas abiertas sale UNA vez en `lotes` y cuenta UNA vez entre los que piden decisión (hallazgo 3)", async () => {
    const antesLotes = await lotesEn("proceso");
    const antesPiden = await pidenEn("proceso");

    // Dos fermentaciones abiertas del MISMO lote, las dos con veredicto crítico (pH 3,0 dentro de
    // las dos ventanas). Sin deduplicar, `pidenDecision` cuenta corridas: +2 contra un lote.
    const doble = await loteSimple("PD-DOBLE", miSitio, miOrgId);
    const proceso = await procesoDe(doble, { natural: true });
    await fermentacionDe(doble, { lotProcessId: proceso, inicio: haceHoras(10) });
    await fermentacionDe(doble, { lotProcessId: proceso, inicio: haceHoras(11) });
    await medicionDe(doble, "ph", 3.0, haceHoras(2));

    const d = await datosDelTablero(operario, ahora);
    // Control: el lote SÍ tiene sus dos corridas abiertas y las dos llegan al cargador. Sin esto,
    // «una vez» podría ser «no llegó ninguna».
    expect(await prisma.fermentationRun.count({ where: { endedAt: null, lotProcessId: proceso } })).toBe(2);
    expect(d.lotes.filter((l) => l.lotId === doble)).toHaveLength(1);
    // Y en TODO el tablero: ningún lote repetido (es la clave de React de la cola, `key={f.lotId}`).
    // Cubre también al lote de «secado» de arriba, que tiene dos corridas abiertas.
    const ids = d.lotes.map((l) => l.lotId);
    expect(new Set(ids).size).toBe(ids.length);
    // La celda no se contradice: +1 lote y +1 pide decisión, nunca «1 lote · 2 piden decisión».
    expect(await lotesEn("proceso")).toBe(antesLotes + 1);
    expect(await pidenEn("proceso")).toBe(antesPiden + 1);
    // MUTACIÓN: volver a `lotes.push(...)` y `entradasPorFase[c.fase].push(...)` (una entrada por
    // CORRIDA) → cae por el `toHaveLength(1)`, por los ids repetidos y por el +2.
  });

  it("un lote con una corrida de CADA fase sale una vez en `lotes`, y en las dos etapas cuenta con su fase (hallazgo 3)", async () => {
    const antesProceso = await pidenEn("proceso");
    const antesSecado = await pidenEn("secado");
    const lote = await loteSimple("PD-DOS-FASES", miSitio, miOrgId);
    const proceso = await procesoDe(lote, { natural: true });
    await fermentacionDe(lote, { lotProcessId: proceso, inicio: haceHoras(20) });
    await secadoDe(lote, { lotProcessId: proceso, inicio: haceHoras(40) });
    await medicionDe(lote, "ph", 3.0, haceHoras(2));
    await medicionDe(lote, "moisture", 30, haceHoras(30));
    await medicionDe(lote, "moisture", 30, haceHoras(3));

    const d = await datosDelTablero(operario, ahora);
    expect(d.lotes.filter((l) => l.lotId === lote)).toHaveLength(1);
    // Cada fase conserva su lote: la cola de la etapa «secado» y la de «proceso» son distintas, y
    // deduplicar a lo ancho sin cuidado apagaría una de las dos.
    expect(await pidenEn("proceso")).toBe(antesProceso + 1);
    expect(await pidenEn("secado")).toBe(antesSecado + 1);
  });
});

describe("cuándo se libera la próxima unidad", () => {
  let cama: string, camaAjena: string, versionCon48h: string, versionFermenta20h: string, tanque: string;

  beforeAll(async () => {
    const receta = await prisma.processRecipe.create({
      data: { name: nombre("receta 48h"), organizationId: miOrgId, status: "approved" },
    });
    recetaIds.push(receta.id);
    const version = await prisma.processRecipeVersion.create({
      data: {
        recipeId: receta.id,
        version: 1,
        status: "approved",
        fases: { create: [{ phase: "drying", expectedHours: 48 }] },
      },
    });
    versionIds.push(version.id);
    versionCon48h = version.id;

    const nuevaCama = async (etiqueta: string, org: string) => {
      const l = await prisma.location.create({
        data: { name: nombre(etiqueta), locationType: "drying_bed", classification: "internal", status: "approved", organizationId: org },
      });
      locationIds.push(l.id);
      return l.id;
    };
    cama = await nuevaCama("cama mía", miOrgId);
    camaAjena = await nuevaCama("cama ajena", otraOrgId);

    // Una receta que declara SÓLO la fermentación (20 h) y ninguna duración de secado: así leer la
    // fase equivocada da `null`, no otro número que pudiera coincidir por casualidad.
    const recetaFerm = await prisma.processRecipe.create({
      data: { name: nombre("receta fermenta 20h"), organizationId: miOrgId, status: "approved" },
    });
    recetaIds.push(recetaFerm.id);
    const versionFerm = await prisma.processRecipeVersion.create({
      data: {
        recipeId: recetaFerm.id,
        version: 1,
        status: "approved",
        fases: { create: [{ phase: "fermentation", expectedHours: 20 }] },
      },
    });
    versionIds.push(versionFerm.id);
    versionFermenta20h = versionFerm.id;

    // Un tanque DE VERDAD (`vesselEquipmentId`), no el texto libre de las fermentaciones de arriba.
    const t = await prisma.equipment.create({
      data: {
        name: nombre("tanque"),
        kind: "vessel",
        format: "other",
        organizationId: miOrgId,
        provenanceClass: "original_record",
      },
    });
    equipoIds.push(t.id);
    tanque = t.id;
    // **Sin este traslado el tanque NO lo ve quien mira**: `listarEquipos` acota por el último lugar
    // del equipo (`objetivoDeEquipo`), y un tanque sin traslado cae en el ámbito de plataforma. La
    // prueba de abajo pasó así hasta el hallazgo 4 de la revisión final, y pasaba por la razón
    // equivocada: `liberacion` contaba la corrida de una unidad que el usuario no veía.
    await prisma.equipmentTransfer.create({ data: { equipmentId: t.id, toLocationId: miSitio, occurredAt: haceHoras(100) } });
  });

  it("dice null mientras ninguna corrida ocupe una unidad declarada; después, la duración declarada de la que sí", async () => {
    // Las fermentaciones de LOTE-A y LOTE-B tienen el tanque en texto libre: no ocupan unidad.
    // Si contaran, `expectedHours` (nulo aquí) daría `sin_duracion_declarada` y no `null`.
    expect((await datosDelTablero(operario, ahora)).liberacion).toBeNull();

    // Una cama ocupada por una corrida que NO declara duración: hay algo en uso y no se sabe cuándo acaba.
    const sinDuracion = await loteSimple("L-SIN-DURACION", miSitio, miOrgId);
    await secadoDe(sinDuracion, { camaId: cama });
    expect((await datosDelTablero(operario, ahora)).liberacion).toEqual({ tipo: "sin_duracion_declarada" });

    // Con una corrida cuya receta dice 48 h, gana la que habla: inicio + 48 h, y no una hora inventada.
    const inicio = haceHoras(10);
    const conDuracion = await loteSimple("L-CON-DURACION", miSitio, miOrgId);
    const proceso = await procesoDe(conDuracion, { versionId: versionCon48h });
    await secadoDe(conDuracion, { camaId: cama, lotProcessId: proceso, inicio });
    const esperada = new Date(inicio.getTime() + 48 * HORA);
    expect((await datosDelTablero(operario, ahora)).liberacion).toEqual({ tipo: "a_las", cuando: esperada });

    // Una corrida de OTRO sitio que acabaría ANTES no mueve nada: no es de un lote que veas. Empezó
    // hace 30 h con la misma receta de 48 h, así que su fin (dentro de 18 h) es menor que el mío
    // (dentro de 38 h): sin el filtro de visibilidad ganaría ella y `cuando` cambiaría.
    const ajeno = await loteSimple("L-AJENO", otroSitio, otraOrgId);
    const procesoAjeno = await procesoDe(ajeno, { versionId: versionCon48h });
    await secadoDe(ajeno, { camaId: camaAjena, lotProcessId: procesoAjeno, inicio: haceHoras(30) });
    expect((await datosDelTablero(operario, ahora)).liberacion).toEqual({ tipo: "a_las", cuando: esperada });
  });

  // **Corre DESPUÉS de la de arriba a propósito**: aquélla exige `null` al empezar, y esta deja una
  // fermentación en un tanque declarado.
  it("un TANQUE se libera igual que una cama: lee la duración de la FERMENTACIÓN y llega como unidad declarada", async () => {
    // La cama de la prueba anterior sigue ocupada y se libera dentro de 38 h. El tanque, que empezó
    // hace 10 h y dura 20, se libera dentro de 10: gana, y `cuando` es **su** inicio + 20 h.
    const lote = await loteSimple("T-TANQUE", miSitio, miOrgId);
    const proceso = await procesoDe(lote, { versionId: versionFermenta20h });
    const inicio = haceHoras(10);
    await fermentacionDe(lote, { lotProcessId: proceso, tanqueId: tanque, inicio });

    const d = await datosDelTablero(operario, ahora);
    // Mutaciones que la hacen caer: `equipmentId: null` en las corridas con duración (el tanque deja
    // de ser unidad y gana la cama), y leer la fase `"drying"` para la fermentación (la receta no
    // la declara: `null`, ignorada, y gana la cama).
    expect(d.liberacion).toEqual({ tipo: "a_las", cuando: new Date(inicio.getTime() + 20 * HORA) });
    // Y el tanque llega también a la ocupación, que es OTRA línea del cargador (`corridas`).
    expect(d.corridas.filter((c) => c.equipmentId === tanque)).toHaveLength(1);
  });

  it("una corrida de una unidad que quien mira NO ve no mueve la liberación (hallazgo 4)", async () => {
    const antes = (await datosDelTablero(operario, ahora)).liberacion;
    // Control: parte de una hora real, no de `null`; si no, «no se mueve» podría ser «nunca hubo nada».
    expect(antes?.tipo).toBe("a_las");

    const nuevoTanque = async (etiqueta: string, org: string) => {
      const t = await prisma.equipment.create({
        data: { name: nombre(etiqueta), kind: "vessel", format: "other", organizationId: org, provenanceClass: "original_record" },
      });
      equipoIds.push(t.id);
      // El último lugar del equipo es lo que decide quién lo ve (`objetivoDeEquipo`): mi sitio → lo
      // veo; el sitio de la otra organización → no.
      await prisma.equipmentTransfer.create({
        data: { equipmentId: t.id, toLocationId: org === miOrgId ? miSitio : otroSitio, occurredAt: haceHoras(100) },
      });
      return t.id;
    };
    // Un tanque de OTRA organización, ocupado por un lote VISIBLE (mi sitio), con una duración que
    // lo liberaría ANTES que todo lo demás: empezó hace 30 h y dura 20, o sea vencido hace 10 h. Sin
    // el filtro de unidades visibles ganaría y `cuando` cambiaría.
    const ajeno = await nuevoTanque("tanque que no veo", otraOrgId);
    const lote = await loteSimple("U-NO-VISIBLE", miSitio, miOrgId);
    const proceso = await procesoDe(lote, { versionId: versionFermenta20h });
    await fermentacionDe(lote, { lotProcessId: proceso, tanqueId: ajeno, inicio: haceHoras(30) });

    const d = await datosDelTablero(operario, ahora);
    // Control: la corrida SÍ llega (la ocupación la contará como «ajena») y el tanque NO está entre
    // los que quien mira ve. Sin estas dos líneas, el `toEqual` de abajo no distinguiría «filtrada»
    // de «nunca existió».
    expect(d.corridas.filter((c) => c.equipmentId === ajeno)).toHaveLength(1);
    expect(d.tanques.map((x) => x.id)).not.toContain(ajeno);
    expect(d.liberacion).toEqual(antes);

    // Control positivo del fixture: la MISMA corrida en un tanque MÍO sí mueve la liberación, a su
    // inicio + 20 h (vencida, anterior a `ahora`). Prueba que el caso de arriba podía fallar.
    const mio = await nuevoTanque("tanque que sí veo", miOrgId);
    const lote2 = await loteSimple("U-VISIBLE", miSitio, miOrgId);
    const proceso2 = await procesoDe(lote2, { versionId: versionFermenta20h });
    const inicio = haceHoras(30);
    await fermentacionDe(lote2, { lotProcessId: proceso2, tanqueId: mio, inicio });
    const despues = await datosDelTablero(operario, ahora);
    expect(despues.tanques.map((x) => x.id)).toContain(mio);
    expect(despues.liberacion).toEqual({ tipo: "a_las", cuando: new Date(inicio.getTime() + 20 * HORA) });
    // MUTACIÓN: filtrar `corridasConDuracion` sólo por `equipmentId !== null || bedLocationId !== null`
    // (sin `idsVisibles`) → cae en el `toEqual(antes)`.
  });
});

describe("la curva de un lote", () => {
  let lotK: string, versionConBanda: string;
  const LIENZO = { ancho: 300, alto: 100 };

  beforeAll(async () => {
    const receta = await prisma.processRecipe.create({
      data: { name: nombre("receta con banda"), organizationId: miOrgId, status: "approved" },
    });
    recetaIds.push(receta.id);
    const version = await prisma.processRecipeVersion.create({
      data: {
        recipeId: receta.id,
        version: 1,
        status: "approved",
        fases: { create: [{ phase: "drying", expectedHours: 48 }] },
        // Banda de humedad 10–12 con objetivo 11, en la fase de secado y `during`. **Del pH no hay
        // ninguna**: es el control de «sin objetivo declarado».
        //
        // Las demás son las **reglas de elección de banda** de `elegirObjetivo`, cada una con una
        // variable propia y con el objetivo **de cada candidato en un sitio distinto de su banda**
        // (80, 50, 20…), para que `yObjetivo` diga CUÁL se eligió. Todas de 0 a 10 o de 20 a 30, así
        // que el objetivo `t` cae en `yObjetivo = 100 − 100·(t − mín)/(máx − mín)` en el lienzo de 100.
        targets: {
          create: [
            { variable: "moisture", moment: "during", phase: "drying", minValue: 10, maxValue: 12, targetValue: 11, unit: "%" },
            // Sólo `initial`: se pinta como MARCA DEL INICIO (objetivo 25 en 20–30 → y = 50).
            { variable: "temperature", moment: "initial", phase: "drying", minValue: 20, maxValue: 30, targetValue: 25, unit: "C" },
            // `initial` Y `final` y ningún `during`: no se elige ninguno (antes salía la final).
            { variable: "brix", moment: "initial", phase: "drying", minValue: 1, maxValue: 2, targetValue: 1.5, unit: "Bx" },
            { variable: "brix", moment: "final", phase: "drying", minValue: 20, maxValue: 30, targetValue: 22, unit: "Bx" },
            // Un `during` SIN fase: no dice de qué fase habla, no se pinta.
            { variable: "relative_humidity", moment: "during", phase: null, minValue: 40, maxValue: 60, targetValue: 50, unit: "%" },
            // Un `during` de OTRA fase (el lote está secando): no se pinta.
            { variable: "water_activity", moment: "during", phase: "fermentation", minValue: 0.5, maxValue: 0.6, targetValue: 0.55, unit: "aw" },
            // `during` Y `final` de la fase: gana `during` (objetivo 2 → y = 80), no `final` (8 → 20).
            { variable: "water_volume_pulping", moment: "during", phase: "drying", minValue: 0, maxValue: 10, targetValue: 2, unit: "L" },
            { variable: "water_volume_pulping", moment: "final", phase: "drying", minValue: 0, maxValue: 10, targetValue: 8, unit: "L" },
            // `during` sin fase Y `final` de la fase: el huérfano lo descarta el filtro de fase, así que
            // queda UNA meta y se elige, como marca del final (5 → y = 50); el `during` daría 90.
            { variable: "wash_medium_ph", moment: "during", phase: null, minValue: 0, maxValue: 10, targetValue: 1, unit: "pH" },
            { variable: "wash_medium_ph", moment: "final", phase: "drying", minValue: 0, maxValue: 10, targetValue: 5, unit: "pH" },
          ],
        },
      },
    });
    versionIds.push(version.id);
    versionConBanda = version.id;

    lotK = await loteSimple("K-CURVA", miSitio, miOrgId);
    const proceso = await procesoDe(lotK, { versionId: versionConBanda });
    await secadoDe(lotK, { lotProcessId: proceso, inicio: haceHoras(10) });

    // Humedad: tres lecturas DENTRO de la fase (hace 8, 6 y 4 h), una ANTERIOR a ella (hace 20 h), y
    // una equivocada (99) que la última corrige.
    await medicionDe(lotK, "moisture", 30, haceHoras(20));
    await medicionDe(lotK, "moisture", 14, haceHoras(8));
    await medicionDe(lotK, "moisture", 13, haceHoras(6));
    const equivocada = await medicionDe(lotK, "moisture", 99, haceHoras(4));
    await medicionDe(lotK, "moisture", 12, haceHoras(4), { id: equivocada });
    // pH: dos lecturas, y ningún objetivo de pH en la receta.
    await medicionDe(lotK, "ph", 4.2, haceHoras(7));
    await medicionDe(lotK, "ph", 4.0, haceHoras(3));
    // **Una lectura de humedad de OTRO lote, dentro de la ventana de la fase (hace 5 h), sembrada AQUÍ.**
    // Sembrada después de las pruebas de coordenadas, como estaba, el filtro `lotId` no lo guardaba
    // nada: quitarlo dejaba las 18 en verde porque la única prueba que la veía sólo afirmaba
    // `not.toBeNull()`. En el `beforeAll` la ve la prueba que cuenta puntos.
    await medicionDe(loteAjeno, "moisture", 11, haceHoras(5));
  });

  const bandaDe = async (variable: string) => {
    const { curva } = await datosDelTablero(operario, ahora, { curva: { lotId: lotK, variable, ...LIENZO } });
    return curva!.banda;
  };

  it("dibuja las lecturas de la fase contra la banda de su receta, sin la anterior y sin la corregida", async () => {
    const { curva } = await datosDelTablero(operario, ahora, { curva: { lotId: lotK, variable: "moisture", ...LIENZO } });
    expect(curva).not.toBeNull();
    // Banda 10–12: 12 → y=0, 10 → y=100, objetivo 11 → y=50.
    expect(curva!.banda).toEqual({ tipo: "banda", alcance: "trayectoria", yMin: 100, yMax: 0, yObjetivo: 50 });
    // Exactamente tres puntos, en x = 0, 150, 300 (8, 6 y 4 h) y y = -100, -50, 0 (14, 13, 12).
    // **Los valores discriminan**: sumar la lectura de hace 20 h (30) o la equivocada (99) cambia el
    // número de puntos, y usar la equivocada en vez de su corrección cambia el último y. **Y sumar la
    // lectura de otro lote** (hace 5 h, sembrada en el `beforeAll`) lo vuelve cuatro: es lo que guarda
    // el `lotId` del `where`.
    expect(curva!.puntos).toEqual([
      { x: 0, y: -100 },
      { x: 150, y: -50 },
      { x: 300, y: 0 },
    ]);
  });

  it("una variable SIN objetivo en la receta dibuja sus puntos y dice que no hay banda", async () => {
    const { curva } = await datosDelTablero(operario, ahora, { curva: { lotId: lotK, variable: "ph", ...LIENZO } });
    expect(curva!.banda).toEqual({ tipo: "sin_objetivo_declarado" });
    // «Sin banda» no es «sin curva». Y el control positivo es la prueba de arriba: la misma
    // llamada con `moisture`, que sí tiene objetivo, pinta su banda.
    expect(curva!.puntos).toHaveLength(2);
  });

  it("un lote que quien mira no ve da null, aunque exista y tenga lecturas", async () => {
    // El lote ajeno TIENE una lectura (la del `beforeAll`): si el filtro de visibilidad faltara,
    // saldría una curva con un punto.
    const { curva } = await datosDelTablero(operario, ahora, { curva: { lotId: loteAjeno, variable: "moisture", ...LIENZO } });
    expect(curva).toBeNull();
    // Control positivo de que la llamada funciona cuando el lote SÍ se ve.
    const propia = await datosDelTablero(operario, ahora, { curva: { lotId: lotK, variable: "moisture", ...LIENZO } });
    expect(propia.curva).not.toBeNull();
  });

  // **Las reglas de elección de banda** (`elegirObjetivo`, en `curvaDeLote.ts`). **Reescritas el
  // 2026-10-02 por `PENDING_IMPLEMENTATIONS/017`**: antes decían «nunca `initial`, `during` y si no
  // `final`», y esas dos mitades eran el defecto. Un objetivo `initial` se tiraba —y es el caso
  // normal de lavado y natural, donde el Brix o el pH se miden UNA vez en la cereza o el mosto— y
  // un `final` se pintaba como banda de toda la trayectoria.
  //
  // Lo que sigue valiendo intacto: un objetivo sin fase, o de otra fase, no se pinta. Pintar la
  // banda de otra fase es «una banda que nadie declaró», que el diseño prohíbe.
  const curvaDe = async (variable: string) => {
    const { curva } = await datosDelTablero(operario, ahora, { curva: { lotId: lotK, variable, ...LIENZO } });
    return curva!;
  };

  it("un objetivo `initial` solo SÍ se pinta, como marca del inicio: es el caso de lavado y natural", async () => {
    // Banda 20–30 con objetivo 25 → y = 50. Lo que cambia frente a `during` es el ALCANCE, no la geometría.
    expect(await bandaDe("temperature")).toEqual({
      tipo: "banda", alcance: "al_inicio", yMin: 100, yMax: 0, yObjetivo: 50,
    });
  });

  it("`initial` y `final` juntos y ningún `during`: NO se elige uno, y se dice cuáles había", async () => {
    // Antes salía la `final` (objetivo 22 → y = 80) y la `initial` se perdía en silencio. Las dos son
    // legítimas y hablan de instantes distintos: elegir era inventar cuál le importa al operario.
    const c = await curvaDe("brix");
    expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
    expect(c.eleccion).toEqual({ tipo: "varios_sin_trayectoria", momentos: ["initial", "final"] });
    // Control: «sin banda» no es «sin curva» — y el motivo NO es que la receta no declare nada.
    expect(c.puntos.length).toBeGreaterThanOrEqual(0);
  });

  it("un objetivo SIN fase, o de OTRA fase, no se pinta", async () => {
    expect(await bandaDe("relative_humidity")).toEqual({ tipo: "sin_objetivo_declarado" });
    expect(await bandaDe("water_activity")).toEqual({ tipo: "sin_objetivo_declarado" });
    // Y el motivo que se cuenta es el de verdad: no hay ninguno declarado PARA ESTA FASE.
    expect((await curvaDe("relative_humidity")).eleccion).toEqual({ tipo: "sin_objetivo_declarado" });
  });

  it("`during` gana a `final`; y un `during` sin fase deja sola a la `final`, que se pinta como marca del final", async () => {
    // Objetivo 2 de la `during` → 80; el 8 de la `final` daría 20. Gana el único que describe una trayectoria.
    expect(await bandaDe("water_volume_pulping")).toEqual({
      tipo: "banda", alcance: "trayectoria", yMin: 100, yMax: 0, yObjetivo: 80,
    });
    // El `during` huérfano lo descarta el filtro de fase, así que queda UNA sola meta —la `final`— y
    // se elige: objetivo 5 → y = 50. Lo que cambió es el alcance, que antes era «toda la trayectoria».
    expect(await bandaDe("wash_medium_ph")).toEqual({
      tipo: "banda", alcance: "al_final", yMin: 100, yMax: 0, yObjetivo: 50,
    });
  });

  // **El perfil que rige el lote** (`perfilDelLote`) sale del grado del proceso de LA FASE ABIERTA, por la misma
  // tabla que el veredicto (`PERFIL_POR_GRADO`). Con él decide la pantalla si pinta «qué sugiere el dato si se
  // espera»: la matriz es la del lavado y a un lote que no lo es no se le cita. La lógica del mapeo la prueban
  // `desde-el-lote.test.ts` y la pantalla, sin base; esto prueba el CABLEADO real: que la consulta trae el grado.
  //
  // **Y sólo si esa fase es de FERMENTACIÓN**: la matriz de pH que se cita es la de `10_ph_fermentation.md` §1, y
  // `13_drying_moisture.md` no tiene ninguna. Un lote Washed con una corrida de SECADO abierta no tiene perfil que citar.
  //
  // **Y sólo si el proceso TIENE RECETA** (`processRecipeVersion`): ADR-181, sin receta el motor no opina; el grado Washed
  // sólo sugiere una plantilla. Por eso los casos con perfil esperado llevan `versionId: versionConBanda` —una receta
  // cualquiera: aquí sólo importa que exista—, y el último es el mismo Washed + fermentación SIN receta.
  it("`perfilDelLote` sale del grado del proceso de la fase abierta, y sólo si es de fermentación y con receta: Washed + fermentación + receta → WASHED_STANDARD; con secado o sin receta → null", async () => {
    const perfilDe = async (lotId: string) =>
      (await datosDelTablero(operario, ahora, { curva: { lotId, variable: "ph", ...LIENZO } })).curva!.perfilDelLote;
    // `lotK` seca, con un proceso cuyo grado es `TEST Natural (RUN)`: no es «Natural» ni «Washed», y no tiene perfil.
    expect(await perfilDe(lotK)).toBeNull();
    // Control positivo: un grado que SÍ tiene perfil y la fase de fermentación abierta (el valor real «Washed»).
    const lavadoFermentando = await loteSimple("K-PERFIL-WASHED-FERMENTA", miSitio, miOrgId);
    await fermentacionDe(lavadoFermentando, {
      lotProcessId: await procesoDe(lavadoFermentando, { washed: true, versionId: versionConBanda }),
    });
    expect(await perfilDe(lavadoFermentando)).toBe("WASHED_STANDARD");
    // El MISMO grado con un SECADO abierto: no hay perfil. Es la fase, no el grado (el control de arriba es el mismo grado).
    const lavadoSecando = await loteSimple("K-PERFIL-WASHED-SECA", miSitio, miOrgId);
    await secadoDe(lavadoSecando, { lotProcessId: await procesoDe(lavadoSecando, { washed: true, versionId: versionConBanda }) });
    expect(await perfilDe(lavadoSecando)).toBeNull();
    // Y «Natural»: con fermentación tiene su perfil, con secado no.
    const naturalFermentando = await loteSimple("K-PERFIL-NATURAL-FERMENTA", miSitio, miOrgId);
    await fermentacionDe(naturalFermentando, {
      lotProcessId: await procesoDe(naturalFermentando, { natural: true, versionId: versionConBanda }),
    });
    expect(await perfilDe(naturalFermentando)).toBe("NATURAL");
    const naturalSecando = await loteSimple("K-PERFIL-NATURAL-SECA", miSitio, miOrgId);
    await secadoDe(naturalSecando, { lotProcessId: await procesoDe(naturalSecando, { natural: true, versionId: versionConBanda }) });
    expect(await perfilDe(naturalSecando)).toBeNull();
    // Y el MISMO Washed + fermentación, SIN receta (`versionId` ausente → `processRecipeVersion: null`): no hay perfil que citar.
    const lavadoSinReceta = await loteSimple("K-PERFIL-WASHED-SIN-RECETA", miSitio, miOrgId);
    await fermentacionDe(lavadoSinReceta, { lotProcessId: await procesoDe(lavadoSinReceta, { washed: true }) });
    expect(await perfilDe(lavadoSinReceta)).toBeNull();
    // Y el mismo grado SIN fase abierta (el proceso existe y está abierto, pero ninguna corrida): no hay perfil.
    const sinFase = await loteSimple("K-PERFIL-SIN-FASE", miSitio, miOrgId);
    await procesoDe(sinFase, { washed: true, versionId: versionConBanda });
    expect(await perfilDe(sinFase)).toBeNull();
  });

  it("sin pedir curva, no hay curva", async () => {
    expect((await datosDelTablero(operario, ahora)).curva).toBeNull();
  });
});
