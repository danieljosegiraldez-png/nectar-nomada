/**
 * La lista de lotes enseña exactamente lo que `can()` deja abrir — ni más ni menos.
 *
 * Dos decisiones de Daniel del 2026-10-14, que caen en la misma función (`resolveLotVisibility`):
 *
 * 1. **Los ajustes de permiso por asignación** (#357, 2026-09-16). `can()` usa los permisos
 *    EFECTIVOS —los del perfil, más los añadidos y menos los quitados— y la lista leía sólo los del
 *    perfil. Quitarle a alguien `lot:view` le impedía abrir un lote y la lista, el tablero y el CSV
 *    se lo seguían enseñando; añadírselo le dejaba abrirlo y la lista salía vacía.
 * 2. **La clasificación** (`PENDING_IMPLEMENTATIONS/014`, ADR-063). `can()` exige además
 *    `classification:clear_<nivel>`; la lista filtraba sólo por proyecto y ubicación.
 *
 * **La semántica que hay que reproducir es la de `can()`, y es por OBJETIVO.** Un lote se ve si
 * alguno de sus objetivos —su proyecto, su ubicación o un ancestro de ella— reúne, sumando las
 * asignaciones de plataforma y las de ESE objetivo exacto, el permiso y la autorización de su
 * clasificación. No se suma a lo largo de la cadena: `fincaYLeadEnParcela` lo fija.
 *
 * Cada cuenta afirma dos cosas: que `can()` contesta lo que dice la tabla (si eso cae, la tabla está
 * mal, no la lista), y que la lista trae exactamente eso.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { getApiaryList } from "../../lib/apiary/hives";
import { buildProducerExport } from "../../lib/traceability/export";
import {
  getActiveOperations,
  getLotList,
  lotWhereFromVisibility,
  requireLotAccess,
  resolveLotVisibility,
  TraceabilityAccessError,
} from "../../lib/traceability/lots";
import { listRoastSessions } from "../../lib/traceability/roasting";
import type { ClassificationLevel } from "../../lib/rbac/types";
import { ambitoDePlataforma } from "../helpers/ambitoDePlataforma";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `listacan-${Date.now()}`;
const MARCA = `TEST ${RUN_ID}`;

type Clave = "P_int" | "P_conf" | "X_int" | "X_conf" | "Y_int" | "Q_int";
const CLAVES: Clave[] = ["P_conf", "P_int", "Q_int", "X_conf", "X_int", "Y_int"];
type Lote = { id: string; projectId: string | null; locationId: string | null; classification: ClassificationLevel };

const lotes = {} as Record<Clave, Lote>;
const cuentas: Record<string, string> = {};
let proyectoP: string;
let finca: string;
let parcela: string;
let apiario: string;

/** Lo que `can()` deja ver a cada cuenta entre los seis lotes de esta prueba. */
const ESPERADO: Record<string, Clave[]> = {
  // Farm Operator limpia `partner` e `internal`: el confidencial de su proyecto no.
  operario: ["P_int"],
  // Research Lead no da `lot:view`, pero sí `clear_confidential` sobre el MISMO proyecto.
  operarioYLead: ["P_conf", "P_int"],
  // Lo mismo, con la autorización añadida a mano en vez de por un segundo perfil.
  operarioConConfAnadido: ["P_conf", "P_int"],
  // Quitado `lot:view`: no abre nada, y la lista tampoco puede enseñarlo.
  operarioSinVer: [],
  // Coffee Process Manager no lleva `lot:view` (V16); añadido a mano, ve lo que su perfil limpia.
  procesoConVerAnadido: ["P_int"],
  // Un ámbito de finca alcanza a sus parcelas (ADR-144); el sitio hermano Y queda fuera.
  finca: ["X_int"],
  // La autorización está en la PARCELA y el permiso en la FINCA: ningún objetivo reúne las dos.
  fincaYLeadEnParcela: ["X_int"],
  // Las dos en la finca: ahí sí.
  fincaYLeadEnFinca: ["X_conf", "X_int"],
  // Ámbito de plataforma SIN autorización de `confidential`: todo lo interno, nada confidencial.
  plataforma: ["P_int", "Q_int", "X_int", "Y_int"],
  // Y un proyecto donde además limpia `confidential`.
  plataformaYLeadEnP: ["P_conf", "P_int", "Q_int", "X_int", "Y_int"],
  admin: ["P_conf", "P_int", "Q_int", "X_conf", "X_int", "Y_int"],
};

async function cuenta(nombre: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: nombre, displayName: `${MARCA} ${nombre}`, locale: "es" },
  });
  const id = (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  cuentas[nombre] = id;
  return id;
}

async function asignar(userAccountId: string, perfil: string, scopeId: string) {
  const rol = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  return (await prisma.assignment.create({ data: { userAccountId, roleProfileId: rol.id, scopeId } })).id;
}

async function ajuste(assignmentId: string, resourceType: string, action: string, effect: "grant" | "deny") {
  const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType, action } });
  await prisma.assignmentPermissionOverride.create({
    data: { assignmentId, permissionId: permiso.id, effect, reason: effect === "grant" ? `${MARCA}: prueba de la lista` : null },
  });
}

async function ambito(scopeType: "project" | "location", scopeRefId: string) {
  return (await prisma.scope.create({ data: { scopeType, scopeRefId } })).id;
}

async function puedeVer(userAccountId: string, lote: Lote) {
  try {
    await requireLotAccess(userAccountId, "view", [lote]);
    return true;
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return false;
    throw error;
  }
}

const claveDe = (id: string) => CLAVES.find((c) => lotes[c].id === id);
const propias = (ids: string[]) => ids.map(claveDe).filter((c): c is Clave => c != null).sort();

beforeAll(async () => {
  const organizationId = await createTestOrganization(RUN_ID);
  proyectoP = (await prisma.project.create({ data: { name: `${MARCA} P`, status: "approved", classification: "internal" } })).id;
  const proyectoQ = (await prisma.project.create({ data: { name: `${MARCA} Q`, status: "approved", classification: "internal" } })).id;
  finca = (await prisma.location.create({ data: { name: `${MARCA} finca`, locationType: "site", organizationId, status: "approved" } })).id;
  parcela = (await prisma.location.create({
    data: { name: `${MARCA} parcela`, locationType: "plot", parentLocationId: finca, organizationId, status: "approved" },
  })).id;
  const otroSitio = (await prisma.location.create({ data: { name: `${MARCA} otro sitio`, locationType: "site", organizationId, status: "approved" } })).id;
  apiario = (await prisma.location.create({ data: { name: `${MARCA} apiario`, locationType: "apiary_site", organizationId, status: "approved" } })).id;

  const lote = async (clave: Clave, donde: { projectId?: string; locationId?: string }, classification: ClassificationLevel) => {
    const fila = await prisma.lot.create({
      data: { lotCode: `${RUN_ID}-${clave}`, lotType: "green", organizationId, classification, ...donde },
      select: { id: true, projectId: true, locationId: true, classification: true },
    });
    lotes[clave] = fila;
  };
  await lote("P_int", { projectId: proyectoP }, "internal");
  await lote("P_conf", { projectId: proyectoP }, "confidential");
  await lote("Q_int", { projectId: proyectoQ }, "internal");
  await lote("X_int", { locationId: parcela }, "internal");
  await lote("X_conf", { locationId: parcela }, "confidential");
  await lote("Y_int", { locationId: otroSitio }, "internal");

  const enP = await ambito("project", proyectoP);
  const enFinca = await ambito("location", finca);
  const enParcela = await ambito("location", parcela);
  const enApiario = await ambito("location", apiario);
  const plataforma = await ambitoDePlataforma();

  await asignar(await cuenta("operario"), "Farm Operator", enP);
  const oyl = await cuenta("operarioYLead");
  await asignar(oyl, "Farm Operator", enP);
  await asignar(oyl, "Research Lead", enP);
  await ajuste(await asignar(await cuenta("operarioConConfAnadido"), "Farm Operator", enP), "classification", "clear_confidential", "grant");
  await ajuste(await asignar(await cuenta("operarioSinVer"), "Farm Operator", enP), "lot", "view", "deny");
  await ajuste(await asignar(await cuenta("procesoConVerAnadido"), "Coffee Process Manager", enP), "lot", "view", "grant");
  await asignar(await cuenta("finca"), "Farm Operator", enFinca);
  const fp = await cuenta("fincaYLeadEnParcela");
  await asignar(fp, "Farm Operator", enFinca);
  await asignar(fp, "Research Lead", enParcela);
  const ff = await cuenta("fincaYLeadEnFinca");
  await asignar(ff, "Farm Operator", enFinca);
  await asignar(ff, "Research Lead", enFinca);
  await asignar(await cuenta("plataforma"), "Farm Operator", plataforma);
  const pl = await cuenta("plataformaYLeadEnP");
  await asignar(pl, "Farm Operator", plataforma);
  await asignar(pl, "Research Lead", enP);
  await asignar(await cuenta("admin"), "Platform Admin", plataforma);

  // El apiario: un Farm Operator al que se le quita `apiary:view`, y un Coffee Process Manager —que no
  // lo lleva— al que se le añade.
  await ajuste(await asignar(await cuenta("apiarioSinVer"), "Farm Operator", enApiario), "apiary", "view", "deny");
  await ajuste(await asignar(await cuenta("apiarioConVerAnadido"), "Coffee Process Manager", enApiario), "apiary", "view", "grant");
  await asignar(await cuenta("apiarioControl"), "Farm Operator", enApiario);

  // Para las superficies que no son la lista: una muestra confidencial de un lote interno, un secado
  // abierto y un tueste por cada lote del proyecto P.
  for (const [codigo, classification] of [["S_int", "internal"], ["S_conf", "confidential"]] as const) {
    await prisma.sample.create({
      data: { sampleCode: `${RUN_ID}-${codigo}`, sampleType: "green", sourceLotId: lotes.P_int.id, projectId: proyectoP, classification, materialState: "GREEN" },
    });
  }
  for (const clave of ["P_int", "P_conf"] as const) {
    const secado = await prisma.dryingRun.create({ data: { startedAt: new Date("2026-10-01T09:00:00Z"), method: `${MARCA} ${clave}` } });
    await prisma.lotTransformation.create({
      data: { transformationType: "stage_change", occurredAt: new Date("2026-10-01T09:00:00Z"), provenanceClass: "original_record", dryingRunId: secado.id, inputs: { create: [{ lotId: lotes[clave].id }] } },
    });
    const tueste = await prisma.roastSession.create({ data: { startedAt: new Date("2026-10-02T09:00:00Z"), purpose: "sample", notes: `${MARCA} ${clave}` } });
    await prisma.lotTransformation.create({
      data: { transformationType: "stage_change", occurredAt: new Date("2026-10-02T09:00:00Z"), provenanceClass: "original_record", roastSessionId: tueste.id, inputs: { create: [{ lotId: lotes[clave].id }] } },
    });
  }
}, 120000);

/** Todo se descubre por la marca. La auditoría (la exportación audita) va antes que las cuentas. */
afterAll(async () => {
  const ids = Object.values(cuentas);
  if (ids.length) await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: ids } }) });
  const secados = await prisma.dryingRun.findMany({ where: { method: { startsWith: MARCA } }, select: { id: true } });
  const tuestes = await prisma.roastSession.findMany({ where: { notes: { startsWith: MARCA } }, select: { id: true } });
  const ts = await prisma.lotTransformation.findMany({
    where: { OR: [{ dryingRunId: { in: secados.map((s) => s.id) } }, { roastSessionId: { in: tuestes.map((t) => t.id) } }] },
    select: { id: true },
  });
  if (ts.length) {
    await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: ts.map((t) => t.id) } }) });
    await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: ts.map((t) => t.id) } }) });
  }
  if (secados.length) await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: secados.map((s) => s.id) } }) });
  if (tuestes.length) await prisma.roastSession.deleteMany({ where: assertDefinedWhere({ id: { in: tuestes.map((t) => t.id) } }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ lotCode: { startsWith: RUN_ID } }) });
  if (ids.length) {
    // Los ajustes cuelgan de la asignación con `onDelete: Cascade`.
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  }
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { startsWith: MARCA } }) });
  const lugares = await prisma.location.findMany({ where: { name: { startsWith: MARCA } }, select: { id: true } });
  const proyectos = await prisma.project.findMany({ where: { name: { startsWith: MARCA } }, select: { id: true } });
  const referentes = [...lugares, ...proyectos].map((r) => r.id);
  // Sólo los ámbitos de lo que esta prueba creó: el de plataforma es compartido y no se toca.
  if (referentes.length) await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: referentes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ name: { startsWith: MARCA }, parentLocationId: { not: null } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ name: { startsWith: MARCA } }) });
  if (proyectos.length) await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: proyectos.map((p) => p.id) } }) });
  await deleteTestOrganizations(RUN_ID);
}, 120000);

describe.each(Object.keys(ESPERADO))("la cuenta «%s»", (nombre) => {
  it("can() deja ver lo que dice la tabla (si esto cae, la tabla está mal, no la lista)", async () => {
    const ve: Clave[] = [];
    for (const clave of CLAVES) if (await puedeVer(cuentas[nombre]!, lotes[clave])) ve.push(clave);
    expect(ve).toEqual(ESPERADO[nombre]);
  });

  it("y la visibilidad de las listas trae exactamente eso", async () => {
    const where = lotWhereFromVisibility(await resolveLotVisibility(cuentas[nombre]!));
    const ids = CLAVES.map((c) => lotes[c].id);
    const filas = where === null ? [] : await prisma.lot.findMany({ where: { AND: [where, { id: { in: ids } }] }, select: { id: true } });
    expect(propias(filas.map((f) => f.id))).toEqual(ESPERADO[nombre]);
  });
});

describe("las superficies que la usan", () => {
  it("/lots", async () => {
    expect(propias((await getLotList(cuentas.operario!)).items.map((l) => l.id))).toEqual(["P_int"]);
    expect(propias((await getLotList(cuentas.operarioSinVer!)).items.map((l) => l.id))).toEqual([]);
    expect(propias((await getLotList(cuentas.procesoConVerAnadido!)).items.map((l) => l.id))).toEqual(["P_int"]);
  });

  it("las operaciones en curso, que filtran con el predicado y no con el where", async () => {
    const secadosDe = async (nombre: string) =>
      propias((await getActiveOperations(cuentas[nombre]!)).activeDryingRuns.map((e) => (e.lot as { id: string }).id));
    expect(await secadosDe("operario")).toEqual(["P_int"]);
    expect(await secadosDe("plataforma")).toEqual(["P_int"]);
    expect(await secadosDe("operarioYLead")).toEqual(["P_conf", "P_int"]);
  });

  it("la exportación: ni el lote confidencial ni la muestra confidencial de un lote interno", async () => {
    const { files } = await buildProducerExport(cuentas.operario!);
    const json = JSON.parse(Object.entries(files).find(([nombre]) => nombre.endsWith(".json"))![1]) as {
      lots: Array<{ lot_code: string; samples: Array<{ sample_code: string }> }>;
    };
    const propiosDelJson = json.lots.filter((l) => l.lot_code.startsWith(RUN_ID));
    expect(propiosDelJson.map((l) => l.lot_code).sort()).toEqual([`${RUN_ID}-P_int`]);
    expect(propiosDelJson[0]!.samples.map((s) => s.sample_code)).toEqual([`${RUN_ID}-S_int`]);
  });

  it("los tuestes, también para quien tiene ámbito de plataforma", async () => {
    const tuestesDe = async (nombre: string) =>
      (await listRoastSessions(cuentas[nombre]!, {}))
        .items.map((t) => t.notes)
        .filter((n): n is string => n != null && n.startsWith(MARCA))
        .map((n) => n.slice(MARCA.length + 1))
        .sort();
    expect(await tuestesDe("operario")).toEqual(["P_int"]);
    expect(await tuestesDe("plataforma")).toEqual(["P_int"]);
    expect(await tuestesDe("plataformaYLeadEnP")).toEqual(["P_conf", "P_int"]);
  });
});

describe("la lista de apiarios, con los mismos ajustes", () => {
  const apiariosDe = async (nombre: string) => (await getApiaryList(cuentas[nombre]!)).items.map((l) => l.id).filter((id) => id === apiario);

  it("quitado apiary:view, no lo lista", async () => {
    expect(await apiariosDe("apiarioSinVer")).toEqual([]);
  });

  it("añadido apiary:view a quien no lo lleva, lo lista", async () => {
    expect(await apiariosDe("apiarioConVerAnadido")).toEqual([apiario]);
  });

  it("control: con el perfil tal cual, lo lista", async () => {
    expect(await apiariosDe("apiarioControl")).toEqual([apiario]);
  });
});
