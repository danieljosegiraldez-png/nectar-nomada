/**
 * Ficha 014 — la LISTA de lotes tiene que dejar ver exactamente lo que `can()` deja ver.
 *
 * **El defecto.** `lotWhereFromVisibility` filtraba por proyecto y ubicación y no por la
 * clasificación del lote, y `resolveLotVisibility` leía los permisos del PERFIL sin los ajustes
 * por asignación (`AssignmentPermissionOverride`). `can()` exige las dos cosas: el permiso de lote
 * y `classification:clear_<nivel>` **en el mismo objetivo** (el proyecto del lote, su ubicación o
 * un ancestro de ésta), con los ajustes aplicados. Las listas, el tablero, la cola de secado, las
 * bandejas, la clasificación verde, el reporte de proceso, el tueste y el CSV de exportación pasan
 * por ese filtro. Hoy no se notaba porque todo lote nace `internal`; un lote confidencial habría
 * salido en ellas sin que nada fallara. Decisión de Daniel del 2026-10-14: arreglarlo en el filtro.
 *
 * **Cada cuenta lleva su conjunto esperado escrito a mano**, y se comprueba tres veces contra él:
 * que `can()` (por `requireLotAccess`) da ese conjunto —así el literal no es una suposición—, que
 * la consulta con `lotWhereFromVisibility` da el mismo, y que `lotMatchesVisibility` también.
 *
 * Necesita base: va en el grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/db";
import {
  getLotList,
  lotMatchesVisibility,
  lotWhereFromVisibility,
  requireLotAccess,
  resolveLotVisibility,
} from "../../lib/traceability/lots";
import type { ClassificationLevel } from "../../lib/rbac/types";

const RUN = `TEST-VISCLAS-${randomUUID().slice(0, 8)}`;

type Lote = { id: string; projectId: string | null; locationId: string | null; classification: ClassificationLevel };
const L: Record<string, Lote> = {};
const cuentas: Record<string, string> = {};

let organizacionId: string;
let proyectoId: string;
let sitioId: string;
let camaId: string;
let hermanoId: string;
let farmOperatorId: string;
let permisoVerLote: string;
let permisoConfidencial: string;

async function cuenta(nombre: string): Promise<string> {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: nombre, displayName: `${RUN} ${nombre}` },
  });
  const c = await prisma.userAccount.create({ data: { personId: persona.id, status: "active", authProvider: "credentials" } });
  return c.id;
}

async function asignar(
  cuentaId: string,
  ambito: { scopeType: "location" | "project"; scopeRefId: string },
  ajustes: { permissionId: string; effect: "grant" | "deny" }[] = [],
) {
  const scope =
    (await prisma.scope.findFirst({ where: ambito })) ?? (await prisma.scope.create({ data: ambito }));
  const a = await prisma.assignment.create({
    data: { userAccountId: cuentaId, scopeId: scope.id, roleProfileId: farmOperatorId },
  });
  for (const ajuste of ajustes) {
    await prisma.assignmentPermissionOverride.create({
      data: {
        assignmentId: a.id,
        permissionId: ajuste.permissionId,
        effect: ajuste.effect,
        reason: ajuste.effect === "grant" ? `Prueba de visibilidad por clasificación (${RUN}).` : null,
      },
    });
  }
}

async function lote(clave: string, donde: { projectId?: string; locationId?: string }, classification: ClassificationLevel) {
  const fila = await prisma.lot.create({
    data: {
      lotCode: `${RUN}-${clave}`,
      lotType: "cherry",
      organizationId: organizacionId,
      projectId: donde.projectId ?? null,
      locationId: donde.locationId ?? null,
      classification,
    },
    select: { id: true, projectId: true, locationId: true, classification: true },
  });
  L[clave] = fila as Lote;
}

beforeAll(async () => {
  farmOperatorId = (await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } })).id;
  permisoVerLote = (await prisma.permission.findFirstOrThrow({ where: { resourceType: "lot", action: "view" } })).id;
  permisoConfidencial = (
    await prisma.permission.findFirstOrThrow({ where: { resourceType: "classification", action: "clear_confidential" } })
  ).id;

  organizacionId = (
    await prisma.organization.create({
      data: { organizationType: "farm", name: `${RUN} organización`, status: "approved", classification: "internal" },
    })
  ).id;
  proyectoId = (await prisma.project.create({ data: { name: `${RUN} proyecto` } })).id;
  sitioId = (
    await prisma.location.create({ data: { name: `${RUN} sitio`, locationType: "site", classification: "internal" } })
  ).id;
  camaId = (
    await prisma.location.create({
      data: { name: `${RUN} cama`, locationType: "plot", classification: "internal", parentLocationId: sitioId },
    })
  ).id;
  hermanoId = (
    await prisma.location.create({ data: { name: `${RUN} hermano`, locationType: "site", classification: "internal" } })
  ).id;

  await lote("S_int", { locationId: sitioId }, "internal");
  await lote("S_conf", { locationId: sitioId }, "confidential");
  await lote("B_int", { locationId: camaId }, "internal");
  await lote("B_conf", { locationId: camaId }, "confidential");
  await lote("X_conf", { locationId: hermanoId }, "confidential");
  await lote("P_int", { projectId: proyectoId }, "internal");
  await lote("P_conf", { projectId: proyectoId }, "confidential");

  // A · Farm Operator en el sitio: ve lote y limpia `internal`, no `confidential`.
  cuentas.A = await cuenta("A");
  await asignar(cuentas.A, { scopeType: "location", scopeRefId: sitioId });

  // B · lo mismo, MÁS una asignación en la cama que limpia `confidential` pero NO deja ver lotes.
  // `can()` mira cada objetivo por separado: en la cama hay clearance sin permiso de lote, y en el
  // sitio permiso de lote sin esa clearance. Un filtro que juntara «todo lo que la cuenta limpia»
  // en un solo conjunto dejaría ver los dos confidenciales.
  cuentas.B = await cuenta("B");
  await asignar(cuentas.B, { scopeType: "location", scopeRefId: sitioId });
  await asignar(cuentas.B, { scopeType: "location", scopeRefId: camaId }, [
    { permissionId: permisoVerLote, effect: "deny" },
    { permissionId: permisoConfidencial, effect: "grant" },
  ]);

  // C · Farm Operator en el sitio con `confidential` añadido en la misma asignación.
  cuentas.C = await cuenta("C");
  await asignar(cuentas.C, { scopeType: "location", scopeRefId: sitioId }, [
    { permissionId: permisoConfidencial, effect: "grant" },
  ]);

  // D · Farm Operator en el sitio con el permiso de VER lote quitado.
  cuentas.D = await cuenta("D");
  await asignar(cuentas.D, { scopeType: "location", scopeRefId: sitioId }, [{ permissionId: permisoVerLote, effect: "deny" }]);

  // E · Farm Operator en el proyecto con `confidential` añadido.
  cuentas.E = await cuenta("E");
  await asignar(cuentas.E, { scopeType: "project", scopeRefId: proyectoId }, [
    { permissionId: permisoConfidencial, effect: "grant" },
  ]);
});

afterAll(async () => {
  // La limpieza descubre lo suyo por el RUN, no por variables que un `beforeAll` muerto no llenó.
  const personas = await prisma.person.findMany({ where: { displayName: { startsWith: RUN } }, select: { id: true } });
  const cuentasRun = await prisma.userAccount.findMany({
    where: { personId: { in: personas.map((p) => p.id) } },
    select: { id: true },
  });
  const asignaciones = await prisma.assignment.findMany({
    where: { userAccountId: { in: cuentasRun.map((c) => c.id) } },
    select: { id: true },
  });
  await prisma.assignmentPermissionOverride.deleteMany({ where: { assignmentId: { in: asignaciones.map((a) => a.id) } } });
  await prisma.assignment.deleteMany({ where: { id: { in: asignaciones.map((a) => a.id) } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: cuentasRun.map((c) => c.id) } } });
  await prisma.person.deleteMany({ where: { id: { in: personas.map((p) => p.id) } } });
  await prisma.lot.deleteMany({ where: { lotCode: { startsWith: RUN } } });
  const ubicaciones = await prisma.location.findMany({ where: { name: { startsWith: RUN } }, select: { id: true } });
  const proyectos = await prisma.project.findMany({ where: { name: { startsWith: RUN } }, select: { id: true } });
  // Los ámbitos cuelgan de ubicaciones y proyectos que sólo esta prueba conoce: nadie más puede
  // tener una asignación sobre ellos.
  await prisma.scope.deleteMany({
    where: {
      OR: [
        { scopeType: "location", scopeRefId: { in: ubicaciones.map((u) => u.id) } },
        { scopeType: "project", scopeRefId: { in: proyectos.map((p) => p.id) } },
      ],
    },
  });
  await prisma.location.deleteMany({ where: { id: { in: ubicaciones.map((u) => u.id) }, parentLocationId: { not: null } } });
  await prisma.location.deleteMany({ where: { id: { in: ubicaciones.map((u) => u.id) } } });
  await prisma.project.deleteMany({ where: { id: { in: proyectos.map((p) => p.id) } } });
  await prisma.organization.deleteMany({ where: { name: { startsWith: RUN } } });
});

const ESPERADO: Record<string, string[]> = {
  A: ["B_int", "S_int"],
  B: ["B_int", "S_int"],
  C: ["B_conf", "B_int", "S_conf", "S_int"],
  D: [],
  E: ["P_conf", "P_int"],
};

const claveDe = (id: string) => Object.keys(L).find((k) => L[k]?.id === id) ?? `ajeno:${id}`;

/** Falla en voz alta si la cuenta no se creó, en vez de pasar `undefined` a la consulta. */
function cuentaDe(c: string): string {
  const id = cuentas[c];
  if (!id) throw new Error(`la cuenta ${c} no se creó en el beforeAll`);
  return id;
}

async function segunCan(cuentaId: string): Promise<string[]> {
  const vistos: string[] = [];
  for (const [clave, l] of Object.entries(L)) {
    try {
      await requireLotAccess(cuentaId, "view", [l]);
      vistos.push(clave);
    } catch {
      // denegado
    }
  }
  return vistos.sort();
}

async function segunLaLista(cuentaId: string): Promise<string[]> {
  const where = lotWhereFromVisibility(await resolveLotVisibility(cuentaId, "view"));
  if (where === null) return [];
  const filas = await prisma.lot.findMany({
    where: { AND: [where, { id: { in: Object.values(L).map((l) => l.id) } }] },
    select: { id: true },
  });
  return filas.map((f) => claveDe(f.id)).sort();
}

async function segunLaVersionEnMemoria(cuentaId: string): Promise<string[]> {
  const visibilidad = await resolveLotVisibility(cuentaId, "view");
  return Object.entries(L)
    .filter(([, l]) => lotMatchesVisibility(l, visibilidad))
    .map(([clave]) => clave)
    .sort();
}

describe("ficha 014 · la lista deja ver lo mismo que can()", () => {
  it.each(Object.keys(ESPERADO))("cuenta %s · can() da el conjunto esperado (el literal no es una suposición)", async (c) => {
    expect(await segunCan(cuentaDe(c))).toEqual(ESPERADO[c]);
  });

  it.each(Object.keys(ESPERADO))("cuenta %s · el filtro de la lista da el mismo conjunto", async (c) => {
    expect(await segunLaLista(cuentaDe(c))).toEqual(ESPERADO[c]);
  });

  it.each(Object.keys(ESPERADO))("cuenta %s · la versión en memoria da el mismo conjunto", async (c) => {
    expect(await segunLaVersionEnMemoria(cuentaDe(c))).toEqual(ESPERADO[c]);
  });

  // Una superficie de punta a punta, además del filtro suelto: `/lots`.
  it("la lista de /lots de la cuenta A enseña el lote interno y no el confidencial", async () => {
    const lista = await getLotList(cuentaDe("A"));
    const codigos = JSON.stringify(lista);
    expect(codigos).toContain(`${RUN}-S_int`);
    expect(codigos).not.toContain(`${RUN}-S_conf`);
  });
});
