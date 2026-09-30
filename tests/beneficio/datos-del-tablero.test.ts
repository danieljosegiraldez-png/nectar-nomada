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

  miSitio = await lugar("Mi sitio", miOrg.id);
  otroSitio = await lugar("Otro sitio", otraOrg.id);

  operario = await cuenta("operario");
  // Farm Operator de SU sitio. Nunca Platform Admin: ver la cabecera.
  await asignar(operario, "Farm Operator", miSitio);

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
    ["correctiveAction", () => prisma.correctiveAction.deleteMany({ where: assertDefinedWhere({ id: { in: correctiveIds } }) })],
    ["deviation", () => prisma.deviation.deleteMany({ where: assertDefinedWhere({ id: { in: deviationIds } }) })],
    ["transformationInput", () => prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformationIds } }) })],
    ["lotTransformation", () => prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformationIds } }) })],
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
      fallos.push(`${nombre}: ${(e as Error).message.split("\n")[0]}`);
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
