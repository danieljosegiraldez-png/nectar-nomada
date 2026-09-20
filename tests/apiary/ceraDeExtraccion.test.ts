/**
 * La cera de la extracción — spec docs/superpowers/specs/2026-09-19-cera-y-pesada-por-recipiente-design.md §4.
 *
 * Grupo `base-sembrada`: permisos del catálogo sembrado y reglas que hace cumplir Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createColony, createHive } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { completarCierreDeCosecha } from "../../lib/apiary/cierreDeCosecha";
import { procesarMiel } from "../../lib/apiary/mielDelLote";
import { crearSubproducto } from "../../lib/traceability/subproductos";
import { anotarCeraDeExtraccion, ceraDeExtraccionDelApiario } from "../../lib/apiary/ceraDeExtraccion";

const RUN = `cerax-${Date.now()}`;
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

let organizationId: string;
let apiarioId: string;
let apiarioAjeno: string;
let adminId: string;
let operario: string;
let extrano: string;
const scopes: string[] = [];
let projectId: string;
let porProyecto: string;
const cajas: string[] = [];
const personas: string[] = [];
let n = 0;

async function cuenta(nombre: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN})`, locale: "es" } });
  personas.push(p.id);
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}

async function asignar(userAccountId: string, perfil: string, locationId: string) {
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const s =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!scopes.includes(s.id)) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: p.id, scopeId: s.id } });
}

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" } })
  ).id;
  adminId = await cuenta("Admin");
  operario = await cuenta("Operario");
  extrano = await cuenta("Extrano");
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  apiarioAjeno = (await crearApiario(adminId, { name: `TEST Apiario ajeno (${RUN})`, organizationId })).id;
  // Una cuenta que llega al apiario SÓLO por el proyecto de una de sus colmenas: así llega
  // `getApiaryDetail`, y la cera tiene que aceptar el mismo camino (revisión de Codex).
  projectId = (await prisma.project.create({ data: { name: `TEST Proyecto (${RUN})`, organizationId, status: "approved", classification: "internal" } })).id;
  porProyecto = await cuenta("PorProyecto");
  const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scopeProyecto = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
  scopes.push(scopeProyecto.id);
  await prisma.assignment.create({ data: { userAccountId: porProyecto, roleProfileId: farmOperator.id, scopeId: scopeProyecto.id } });
  const cajaDelProyecto = await createHive(adminId, { identifier: `${RUN}-proy`, locationId: apiarioId, projectId });
  cajas.push(cajaDelProyecto.id);
  await asignar(operario, "Farm Operator", apiarioId);
  await asignar(extrano, "Farm Operator", apiarioAjeno);
}, 30000);

/** Una cosecha de miel del apiario que se diga, en el día que se diga. */
async function cosechaEn(cuando: Date, apiario: string = apiarioId) {
  const h = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId: apiario });
  cajas.push(h.id);
  const c = await createColony(adminId, { hiveId: h.id, originType: "purchased", startedAt: dia("2026-01-01"), provenanceClass: "direct_observation" });
  const { harvestEvent } = await recordApiaryHarvest(adminId, {
    colonyId: c.id,
    lotCode: `MIEL-${RUN}-${++n}`,
    occurredAt: cuando,
    provenanceClass: "measured_fact",
  });
  return harvestEvent;
}

afterEach(async () => {
  const cera = (
    await prisma.byproductBatch.findMany({ where: assertDefinedWhere({ producedAtLocationId: { in: [apiarioId, apiarioAjeno] } }), select: { id: true } })
  ).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: cera } }) });
  await prisma.byproductBatch.deleteMany({ where: assertDefinedWhere({ id: { in: cera } }) });
  const eventos = await prisma.apiaryHarvestEvent.findMany({ where: assertDefinedWhere({ colony: { hiveId: { in: cajas } } }), select: { id: true, resultingLotId: true } });
  const ids = eventos.map((e) => e.id);
  const lotes = eventos.map((e) => e.resultingLotId);
  // Colar deja una transformación y un lote hijo: se buscan por la genealogía, no por memoria.
  for (;;) {
    const hijos = await prisma.lotTransformationOutput.findMany({
      where: assertDefinedWhere({ transformation: { inputs: { some: { lotId: { in: lotes } } } }, lotId: { notIn: lotes } }),
      select: { lotId: true },
    });
    if (hijos.length === 0) break;
    lotes.push(...hijos.map((h) => h.lotId));
  }
  const trans = (
    await prisma.lotTransformationInput.findMany({ where: assertDefinedWhere({ lotId: { in: lotes } }), select: { transformationId: true } })
  ).map((x) => x.transformationId);
  await prisma.byproductBatch.deleteMany({ where: assertDefinedWhere({ transformationId: { in: trans } }) });
  await prisma.deviation.deleteMany({ where: assertDefinedWhere({ lotTransformationId: { in: trans } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: trans } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: trans } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: trans } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: ids } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
});

afterAll(async () => {
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  const colonias = (await prisma.colony.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarioId, apiarioAjeno] } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

/** Inserta en crudo dentro de una transacción que se deshace; devuelve «entra» o la regla que lo impidió. */
async function sonda(sql: string): Promise<string> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error("DESHACER");
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes("DESHACER")) return "entra";
    return m.match(/byproduct_batch_[a-z_]+/)?.[0] ?? m.slice(0, 160);
  }
  return "?";
}

describe("las reglas de la cera viven en la base", () => {
  it("cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const fila = (columnas: string, valores: string, destino = "GUARDADA") =>
      `insert into traceability.byproduct_batch (byproduct_type, destination, mass_kg, produced_at_location_id, organization_id, provenance_class${columnas})` +
      ` values ('CERA', '${destino}', 3, '${apiarioId}', '${organizationId}', 'measured_fact'${valores})`;

    // Sin ningún origen: ni transformación ni ventana.
    expect(await sonda(fila("", ""))).toBe("byproduct_batch_un_solo_origen");
    // Media ventana es media trazabilidad, y el CHECK la cuenta como ninguna.
    expect(await sonda(fila(", window_start", `, '2026-05-03'`))).toBe("byproduct_batch_un_solo_origen");
    // Una ventana al revés.
    expect(await sonda(fila(", window_start, window_end", `, '2026-05-05', '2026-05-03'`))).toBe("byproduct_batch_ventana_en_orden");
    // «Otro uso» sin decir cuál.
    expect(await sonda(fila(", window_start, window_end", `, '2026-05-03', '2026-05-05'`, "OTRO"))).toBe("byproduct_batch_otro_dice_por_que");

    // Los dos controles: el apiario con su ventana entra, y «otro uso» CON nota también.
    expect(await sonda(fila(", window_start, window_end", `, '2026-05-03', '2026-05-05'`))).toBe("entra");
    expect(await sonda(fila(", window_start, window_end, notes", `, '2026-05-03', '2026-05-05', 'para cambalache'`, "OTRO"))).toBe("entra");
  });
});

// Spec §4.3 — la cera del desopercular no sale de un lote: se desopercula junto. Su origen es el
// apiario y una ventana, y al leerla se dice qué cosechas de ESE apiario caen dentro, sin afirmar
// que la cera salga de ellas.
describe("la cera de la extracción", () => {
  const ventana = { windowStart: dia("2026-05-03"), windowEnd: dia("2026-05-05") };

  it("SE ANOTA CON SU VENTANA y sin transformación; y dice qué cosechas de ESE apiario caen dentro", async () => {
    const dentro = await cosechaEn(dia("2026-05-04"));
    await cosechaEn(dia("2026-05-09")); // fuera de la ventana
    await cosechaEn(dia("2026-05-04"), apiarioAjeno); // otro apiario, mismo día
    const fila = await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 7.5, destination: "GUARDADA", ...ventana });
    expect(fila.transformationId).toBeNull();

    const leidas = await ceraDeExtraccionDelApiario(operario, apiarioId);
    expect(leidas).toHaveLength(1);
    expect(leidas[0]!.massKg).toBeCloseTo(7.5, 3);
    expect(leidas[0]!.cosechas.map((c) => c.id)).toEqual([dentro.id]); // ni la de otro día ni la de otro apiario
  });

  it("LA VENTANA INCLUYE SUS DOS EXTREMOS: una cosecha del primer día cuenta, y una del día anterior no", async () => {
    const primerDia = await cosechaEn(dia("2026-05-03"));
    const ultimoDia = await cosechaEn(dia("2026-05-05"));
    await cosechaEn(dia("2026-05-02"));
    await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 2, destination: "SALE", ...ventana });
    const [leida] = await ceraDeExtraccionDelApiario(operario, apiarioId);
    expect(leida!.cosechas.map((c) => c.id).sort()).toEqual([primerDia.id, ultimoDia.id].sort());
  });

  it("REGLAS: masa negativa, ventana al revés, OTRO sin nota, y sin permiso no", async () => {
    const base = { apiaryLocationId: apiarioId, destination: "GUARDADA" as const, ...ventana };
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: -1 })).rejects.toThrow(/masa inválida/);
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: "" })).rejects.toThrow(/masa inválida/);
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: 3, windowStart: dia("2026-05-06") })).rejects.toThrow(/ventana_al_reves/);
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: 3, destination: "OTRO" })).rejects.toThrow(/otro_sin_nota/);
    await expect(anotarCeraDeExtraccion(extrano, { ...base, massKg: 3 })).rejects.toThrow(/no_apiary_access/);
    expect(await prisma.byproductBatch.count({ where: { producedAtLocationId: apiarioId } })).toBe(0); // nada entró
  });

  it("CERO KILOS ES UN DATO: se desoperculó y no se recogió cera aprovechable", async () => {
    const fila = await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 0, destination: "GUARDADA", ...ventana });
    expect(Number(fila.massKg)).toBe(0);
  });

  it("QUIEN NO PUEDE VER EL APIARIO no lee su cera", async () => {
    await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 4, destination: "LAMINA_PROPIA", ...ventana });
    await expect(ceraDeExtraccionDelApiario(extrano, apiarioId)).rejects.toThrow(/no_apiary_access/);
    expect(await ceraDeExtraccionDelApiario(operario, apiarioId)).toHaveLength(1); // el control
  });

  it("LA CERA DEL COLADO NO SE MEZCLA con la del desopercular: aquí sólo va la del apiario", async () => {
    // Una cera del colado EN ESTE MISMO APIARIO: su lugar es el del lote, que es este sitio.
    const cosecha = await cosechaEn(dia("2026-05-04"));
    await completarCierreDeCosecha(adminId, { apiaryHarvestEventId: cosecha.id, extractedWeightKg: 30 });
    const colado = await procesarMiel(adminId, {
      lotId: cosecha.resultingLotId, occurredAt: dia("2026-05-06"), acts: ["colado"], inputKg: 30, outputKg: 26,
      ceraKg: 4, ceraDestino: "GUARDADA", provenanceClass: "measured_fact",
    });
    // El control: esa cera SÍ existe y está en este apiario, sólo que con transformación.
    expect(
      await prisma.byproductBatch.count({ where: { transformationId: colado.transformation.id, producedAtLocationId: apiarioId } }),
    ).toBe(1);

    await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 7, destination: "GUARDADA", ...ventana });
    const leidas = await ceraDeExtraccionDelApiario(operario, apiarioId);
    expect(leidas.map((c) => c.massKg)).toEqual([7]); // la del colado no se cuela aquí
  });
});

// Segunda revisión de Codex de esta rebanada: cuatro defectos que las pruebas de arriba no veían
// porque todas cosechaban a medianoche UTC, en un apiario que nunca se movía.
describe("la ventana dice la verdad sobre lugar y tiempo (Codex)", () => {
  const ventana = { windowStart: dia("2026-05-03"), windowEnd: dia("2026-05-05") };

  it("UNA COSECHA DE LAS 10 DE LA MAÑANA del último día cuenta: la ventana es de días, no de medianoches", async () => {
    const tarde = await cosechaEn(new Date("2026-05-05T15:30:00Z"));
    await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 3, destination: "GUARDADA", ...ventana });
    const [leida] = await ceraDeExtraccionDelApiario(operario, apiarioId);
    expect(leida!.cosechas.map((c) => c.id)).toEqual([tarde.id]);
  });

  it("UN TRASLADO NO CAMBIA DE APIARIO UNA COSECHA VIEJA: manda el sitio donde se cosechó", async () => {
    const cosecha = await cosechaEn(dia("2026-05-04"));
    const caja = cajas[cajas.length - 1]!;
    // Lo que mueve una caja en producción es `trasladarColmenas`; aquí se mueve el campo a mano
    // porque lo que se afirma es que la lectura NO depende del sitio actual de la caja, y el
    // traslado exige una fecha posterior a su colocación vigente, que es de hoy.
    await prisma.hive.update({ where: { id: caja }, data: { locationId: apiarioAjeno } });
    expect((await prisma.hive.findUniqueOrThrow({ where: { id: caja } })).locationId).toBe(apiarioAjeno); // el control: la caja sí se movió

    await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 3, destination: "GUARDADA", ...ventana });
    const [aqui] = await ceraDeExtraccionDelApiario(operario, apiarioId);
    expect(aqui!.cosechas.map((c) => c.id)).toEqual([cosecha.id]); // se cosechó aquí, y aquí sigue
    await anotarCeraDeExtraccion(adminId, { apiaryLocationId: apiarioAjeno, massKg: 3, destination: "GUARDADA", ...ventana });
    const [alla] = await ceraDeExtraccionDelApiario(adminId, apiarioAjeno);
    expect(alla!.cosechas).toEqual([]); // y no aparece en el apiario al que llegó la caja
  });

  it("UNA VENTANA A MEDIAS SE RECHAZA, no se completa con hoy", async () => {
    const base = { apiaryLocationId: apiarioId, massKg: 3, destination: "GUARDADA" as const };
    await expect(anotarCeraDeExtraccion(operario, { ...base, windowStart: null, windowEnd: dia("2026-05-05") })).rejects.toThrow(/ventana_incompleta/);
    await expect(anotarCeraDeExtraccion(operario, { ...base, windowStart: dia("2026-05-03"), windowEnd: null })).rejects.toThrow(/ventana_incompleta/);
    expect(await prisma.byproductBatch.count({ where: { producedAtLocationId: apiarioId } })).toBe(0);
  });

  it("LA CERA NO SE AÑADE A UNA TRANSFORMACIÓN YA CUADRADA por el servicio genérico", async () => {
    const cosecha = await cosechaEn(dia("2026-05-04"));
    await completarCierreDeCosecha(adminId, { apiaryHarvestEventId: cosecha.id, extractedWeightKg: 30 });
    const colado = await procesarMiel(adminId, {
      lotId: cosecha.resultingLotId, occurredAt: dia("2026-05-06"), acts: ["colado"], inputKg: 30, outputKg: 30,
      provenanceClass: "measured_fact",
    });
    const comun = { transformationId: colado.transformation.id, destination: "GUARDADA" as const, massKg: 4, producedAtLocationId: apiarioId };
    await expect(crearSubproducto(adminId, { ...comun, byproductType: "CERA" })).rejects.toThrow(/la cera se anota al colar o en el apiario/);
    // El control: la cascarilla sí entra por ahí, que es para lo que existe ese servicio.
    const cascarilla = await crearSubproducto(adminId, { ...comun, byproductType: "CASCARILLA" });
    expect(cascarilla.byproductType).toBe("CASCARILLA");
  });

  it("QUIEN LLEGA POR EL PROYECTO de una colmena del sitio también anota y lee su cera", async () => {
    const fila = await anotarCeraDeExtraccion(porProyecto, { apiaryLocationId: apiarioId, massKg: 5, destination: "GUARDADA", ...ventana });
    expect(Number(fila.massKg)).toBe(5);
    expect(await ceraDeExtraccionDelApiario(porProyecto, apiarioId)).toHaveLength(1);
    // El control: quien no tiene ninguno de los dos caminos sigue fuera.
    await expect(ceraDeExtraccionDelApiario(extrano, apiarioId)).rejects.toThrow(/no_apiary_access/);
  });
});
