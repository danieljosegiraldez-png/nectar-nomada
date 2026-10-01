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
import { datosDelTablero, pidenDecisionPorEtapa } from "../../lib/beneficio/datosDelTablero";
import type { EntradaDeLoteParaTablero } from "../../lib/beneficio/tablero";
import { CATALOGO_ESTADO_CEREZA, CATALOGO_GRADO_PROCESO } from "../../lib/traceability/lotProcess";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { borrarVinculosDeLote } from "../helpers/borrarVinculosDeLote";

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
const recepcionIds: string[] = [];
const procesoIds: string[] = [];
const storageIds: string[] = [];
const medicionIds: string[] = [];
const recetaIds: string[] = [];
const versionIds: string[] = [];
const catalogoValorIds: string[] = [];
const secadoIds: string[] = [];

let miOrgId: string, otraOrgId: string;
let valorGrado: string, valorCereza: string;

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
    // El vínculo lote↔recepción es inmutable a propósito: sólo el ayudante lo borra sin apagar el guardia para todos.
    ["loteDesdeRecepcion", () => borrarVinculosDeLote(recepcionIds)],
    ["recepcionDeCereza", () => prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ id: { in: recepcionIds } }) })],
    // Las transformaciones apuntan a sus corridas de secado y las corridas a su proceso: en este orden.
    ["transformationInput", () => prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformationIds } }) })],
    ["lotTransformation", () => prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformationIds } }) })],
    ["dryingRun", () => prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: secadoIds } }) })],
    ["lotProcess", () => prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ id: { in: procesoIds } }) })],
    ["processTarget", () => prisma.processTarget.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) })],
    ["processRecipePhase", () => prisma.processRecipePhase.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) })],
    ["processRecipeVersion", () => prisma.processRecipeVersion.deleteMany({ where: assertDefinedWhere({ id: { in: versionIds } }) })],
    ["processRecipe", () => prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recetaIds } }) })],
    // Sólo los valores de ESTA corrida: el catálogo es real y borrar el suyo entero se llevaría vocabulario de verdad.
    ["variableCatalogValue", () => prisma.variableCatalogValue.deleteMany({ where: assertDefinedWhere({ id: { in: catalogoValorIds } }) })],
    ["correctiveAction", () => prisma.correctiveAction.deleteMany({ where: assertDefinedWhere({ id: { in: correctiveIds } }) })],
    ["deviation", () => prisma.deviation.deleteMany({ where: assertDefinedWhere({ id: { in: deviationIds } }) })],
    ["fermentationRun", () => prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: runIds } }) })],
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
// (2) algo MÍO que no cuenta —cerrado, anulado, de otro tipo— no lo mueve; (3) lo mío que sí cuenta
// lo sube en uno. Sin el paso (3) los dos ceros anteriores se leen como «funciona» cuando pueden ser
// «no miré».
// ---------------------------------------------------------------------------------------------

let secuencia = 0;

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

async function recepcionDe(lotId: string, beneficioId: string, estado: "recibida" | "anulada") {
  secuencia += 1;
  const r = await prisma.recepcionDeCereza.create({
    data: {
      claveDeEnvio: `${RUN}-r${secuencia}`,
      beneficioId,
      // La base exige UN origen —una entrega o un proveedor—; aquí basta el proveedor.
      proveedorId: miOrgId,
      recibidaPor: operario,
      recibidaAt: haceHoras(2),
      brutoKg: 10,
      recipientes: 1,
      taraPorRecipienteKg: 1,
      netoKg: 9,
      // Nace SIEMPRE recibida: la base rechaza vincular un lote a una recepción ya anulada, y eso
      // es lo correcto. Una anulada de verdad es una recibida que después se anuló.
      estado: "recibida",
      lotes: { create: [{ lotId, kg: 9 }] },
    },
  });
  if (estado === "anulada") {
    // **Este estado la base lo IMPIDE por los dos lados**: no deja vincular un lote a una recepción
    // anulada, y no deja anular una que ya tiene lote (`recepcion_de_cereza_ya_tiene_lotes`). Por eso
    // el filtro `estado: "recibida"` del cargador es una segunda barrera, y para probarla hay que
    // fabricar el estado imposible. `SET LOCAL` en una transacción apaga los disparadores sólo ahí
    // —es lo que hace `borrarVinculosDeLote`—, y la anulación sigue viniendo COMPLETA (cuándo, quién
    // y por qué), que eso es un CHECK y no un disparador.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
      await tx.recepcionDeCereza.update({
        where: { id: r.id },
        data: { estado: "anulada", anuladaAt: haceHoras(1), anuladaPor: operario, motivoAnulacion: nombre("anulada") },
      });
    });
  }
  recepcionIds.push(r.id);
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

async function procesoDe(lotId: string, o: { cerrado?: boolean; versionId?: string } = {}) {
  const p = await prisma.lotProcess.create({
    data: {
      lotId,
      sequenceOrder: 1,
      intent: nombre("intención"),
      processGradeValueId: valorGrado,
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
  it("trae las seis etapas en orden, y la flotación dice «sin registro», no cero", async () => {
    const { etapas } = await datosDelTablero(operario, ahora);
    expect(etapas.map((e) => e.clave)).toEqual(["recepcion", "flotacion", "seleccion", "proceso", "secado", "almacen"]);
    expect(etapas.find((e) => e.clave === "flotacion")!.estado).toEqual({ tipo: "sin_registro" });
    // Control: las otras cinco SÍ cuentan. Sin esto, «la flotación dice sin_registro» también
    // pasaría si TODA la línea dijera sin_registro.
    const otras = etapas.filter((e) => e.clave !== "flotacion");
    expect(otras).toHaveLength(5);
    expect(otras.every((e) => e.estado.tipo === "cuenta")).toBe(true);
  });

  it("recepción: sólo lotes visibles con una recepción RECIBIDA, y un lote con dos cuenta una vez", async () => {
    const antes = await lotesEn("recepcion");

    const ajeno = await loteSimple("R-AJENO", otroSitio, otraOrgId);
    await recepcionDe(ajeno, otroSitio, "recibida");
    expect(await lotesEn("recepcion")).toBe(antes);

    const mio = await loteSimple("R-MIO", miSitio, miOrgId);
    await recepcionDe(mio, miSitio, "anulada");
    expect(await lotesEn("recepcion")).toBe(antes);

    await recepcionDe(mio, miSitio, "recibida");
    expect(await lotesEn("recepcion")).toBe(antes + 1);

    await recepcionDe(mio, miSitio, "recibida");
    expect(await lotesEn("recepcion")).toBe(antes + 1);
  });

  it("selección: sólo la transformación de tipo `selection`, de un lote visible", async () => {
    const antes = await lotesEn("seleccion");

    const ajeno = await loteSimple("S-AJENO", otroSitio, otraOrgId);
    await transformacionDe(ajeno, "selection");
    expect(await lotesEn("seleccion")).toBe(antes);

    const mio = await loteSimple("S-MIO", miSitio, miOrgId);
    await transformacionDe(mio, "stage_change");
    expect(await lotesEn("seleccion")).toBe(antes);

    await transformacionDe(mio, "selection");
    expect(await lotesEn("seleccion")).toBe(antes + 1);

    await transformacionDe(mio, "selection");
    expect(await lotesEn("seleccion")).toBe(antes + 1);
  });

  it("proceso: sólo el que sigue abierto, de un lote visible", async () => {
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
  });

  it("secado: sólo la corrida abierta, de un lote visible", async () => {
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
  });

  it("almacén: sólo la asignación vigente, de un lote visible", async () => {
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
  });
});

describe("«pide decisión» por etapa", () => {
  // Hermético dentro de un archivo con base: armar un lote con veredicto crítico por la base exige
  // receta, un grado con perfil y lecturas, y la regla a probar es sólo a qué etapa va cada grupo.
  // Por eso se le dan a la función ENTRADAS ya armadas, que ninguna base sembrada produce.
  const AHORA = new Date("2026-09-30T12:00:00Z");
  const dictamen = (status: string, severity: "INFO" | "WARNING" | "CRITICAL") => ({ status, severity });
  const entrada = (lotId: string, ph: ReturnType<typeof dictamen>): EntradaDeLoteParaTablero => ({
    lotId,
    lotCode: lotId,
    veredicto: { ph, brix: null, secado: null },
    faseIniciada: new Date("2026-09-30T02:00:00Z"),
    expectedHours: null,
    metas: [],
    ultimaLectura: null,
  });
  const critico = (id: string) => entrada(id, dictamen("OUT_OF_RANGE", "CRITICAL"));
  const listo = (id: string) => entrada(id, dictamen("TERMINATION_READY", "INFO"));
  const aviso = (id: string) => entrada(id, dictamen("DRIFTING", "WARNING"));
  const enCurso = (id: string) => entrada(id, dictamen("ON_TRACK", "INFO"));
  const sinDesviaciones = new Map<string, number>();

  it("cuenta crítico y listo para decidir, y cada grupo cae en la etapa de SU fase", () => {
    const r = pidenDecisionPorEtapa({
      // Fermentación: 2 piden decisión (crítico + listo) y 2 no (aviso, en curso).
      fermentacion: [critico("f1"), listo("f2"), aviso("f3"), enCurso("f4")],
      // Secado: 1 pide decisión. **Distinto de 2 a propósito**: con el mismo número en las dos, cruzar
      // las fases pasaría la prueba.
      secado: [critico("s1"), enCurso("s2")],
      desviacionesAbiertasPorLote: sinDesviaciones,
      ahora: AHORA,
    });
    // Mutaciones que la hacen caer: contar `aviso`; cruzar fermentación con secado; contar sólo
    // `critico`; devolver sólo una de las dos claves.
    expect(r).toEqual({ proceso: 2, secado: 1 });
  });

  it("una desviación abierta sube a aviso, y aviso no pide decisión", () => {
    const r = pidenDecisionPorEtapa({
      fermentacion: [enCurso("f1")],
      secado: [],
      desviacionesAbiertasPorLote: new Map([["f1", 1]]),
      ahora: AHORA,
    });
    expect(r).toEqual({ proceso: 0, secado: 0 });
  });

  it("sin entradas es 0 — y ese 0 sí es cierto, porque la etapa sí tiene cola", () => {
    expect(
      pidenDecisionPorEtapa({ fermentacion: [], secado: [], desviacionesAbiertasPorLote: sinDesviaciones, ahora: AHORA }),
    ).toEqual({ proceso: 0, secado: 0 });
  });
});

describe("cuándo se libera la próxima unidad", () => {
  let cama: string, camaAjena: string, versionCon48h: string;

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
        targets: {
          create: [
            { variable: "moisture", moment: "during", phase: "drying", minValue: 10, maxValue: 12, targetValue: 11, unit: "%" },
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
  });

  it("dibuja las lecturas de la fase contra la banda de su receta, sin la anterior y sin la corregida", async () => {
    const { curva } = await datosDelTablero(operario, ahora, { curva: { lotId: lotK, variable: "moisture", ...LIENZO } });
    expect(curva).not.toBeNull();
    // Banda 10–12: 12 → y=0, 10 → y=100, objetivo 11 → y=50.
    expect(curva!.banda).toEqual({ tipo: "banda", yMin: 100, yMax: 0, yObjetivo: 50 });
    // Exactamente tres puntos, en x = 0, 150, 300 (8, 6 y 4 h) y y = -100, -50, 0 (14, 13, 12).
    // **Los valores discriminan**: sumar la lectura de hace 20 h (30) o la equivocada (99) cambia el
    // número de puntos, y usar la equivocada en vez de su corrección cambia el último y.
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
    // El lote ajeno TIENE una lectura: si el filtro faltara, saldría una curva con un punto.
    await medicionDe(loteAjeno, "moisture", 11, haceHoras(2));
    const { curva } = await datosDelTablero(operario, ahora, { curva: { lotId: loteAjeno, variable: "moisture", ...LIENZO } });
    expect(curva).toBeNull();
    // Control positivo de que la llamada funciona cuando el lote SÍ se ve.
    const propia = await datosDelTablero(operario, ahora, { curva: { lotId: lotK, variable: "moisture", ...LIENZO } });
    expect(propia.curva).not.toBeNull();
  });

  it("sin pedir curva, no hay curva", async () => {
    expect((await datosDelTablero(operario, ahora)).curva).toBeNull();
  });
});
