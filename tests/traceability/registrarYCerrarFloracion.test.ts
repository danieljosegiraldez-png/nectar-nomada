/**
 * Anotar una floración desde la pantalla, y cerrarla después — decisión de Daniel del 2026-10-16.
 *
 * El aviso de polinizadores existía desde el PR #587 y no podía dispararse nunca: `registrarFloracion`
 * no tenía ni pantalla ni acción (SESSION_STATE §3, medido: 0 y 0). Y una floración se anota ABIERTA
 * —el día que se ven las flores— sin ninguna forma de ponerle el fin después, así que una abierta
 * avisaría para siempre. Daniel eligió «anotar el inicio, cerrar después», como se cierra una corrida.
 *
 * **Los dos campos son de DÍA, no instantes** (el esquema: «se parsea con `fechaDeDia`»): medianoche
 * UTC del día que nombran, sin desfase de zona. Es lo que `hayFloracion` compara.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "../../lib/db";
import {
  cerrarFloracion,
  floracionesDeLaFicha,
  floracionesDeLaParcela,
  FloracionValidationError,
  registrarFloracion,
} from "../../lib/traceability/floracion";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearParcela, crearUsuarioConAcceso, crearUsuarioSinAcceso } from "../helpers/traceability";

const deps = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));

import { cerrarFloracionFormAction, registrarFloracionFormAction } from "../../app/actions/floracion";

const RUN = `floracion-ui-${Date.now()}`;
const dia = (d: string) => new Date(`${d}T00:00:00Z`);

let admin: { userAccountId: string; personId: string };
let sinAcceso: string;
let visor: string;
let parcelaId: string;
let fincaId: string;
let organizacionId: string | null;
const cuentas: string[] = [];
const personas: string[] = [];
const ambitos: string[] = [];
const ajenos: { locationId: string; organizationId: string }[] = [];

beforeAll(async () => {
  admin = await crearUsuarioConAcceso(RUN);
  cuentas.push(admin.userAccountId);
  personas.push(admin.personId);
  const parcela = await crearParcela();
  parcelaId = parcela.id;
  fincaId = parcela.parentLocationId!;
  organizacionId = parcela.organizationId;

  // Un Farm Operator de OTRA parcela: tiene `lot:view`, pero no aquí.
  const ajeno = await crearUsuarioSinAcceso(`${RUN}-sin`);
  sinAcceso = ajeno.userAccountId;
  cuentas.push(ajeno.userAccountId);
  personas.push(ajeno.personId);
  ambitos.push(ajeno.scopeId);
  ajenos.push({ locationId: ajeno.locationId, organizationId: ajeno.organizationId });

  // Project Viewer sobre la parcela: `lot:view` y no `lot:manage`. Puede ver la lista, no cerrar.
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Visor", displayName: `TEST Visor (${RUN})`, locale: "es" },
  });
  personas.push(persona.id);
  visor = (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  cuentas.push(visor);
  const ambito = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: parcelaId } });
  ambitos.push(ambito.id);
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Project Viewer" } });
  await prisma.assignment.create({ data: { userAccountId: visor, roleProfileId: perfil.id, scopeId: ambito.id } });
}, 60000);

/** Por los ids que guardó el `beforeAll`; la auditoría va antes que las cuentas (su actor es `SET NULL`). */
afterAll(async () => {
  if (parcelaId) {
    const floraciones = await prisma.plotBloom.findMany({ where: { locationId: parcelaId }, select: { id: true } });
    if (floraciones.length) {
      await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: floraciones.map((f) => f.id) } }) });
      await prisma.plotBloom.deleteMany({ where: assertDefinedWhere({ locationId: parcelaId }) });
    }
  }
  if (cuentas.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  }
  // Sólo el ámbito de la parcela, que es de esta prueba: el de plataforma es compartido.
  if (ambitos.length) await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  if (cuentas.length) await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  if (personas.length) await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  if (parcelaId) await prisma.location.deleteMany({ where: assertDefinedWhere({ id: parcelaId }) });
  if (fincaId) await prisma.location.deleteMany({ where: assertDefinedWhere({ id: fincaId }) });
  if (organizacionId) await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizacionId }) });
  for (const a of ajenos) {
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: a.locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: a.organizationId }) });
  }
}, 60000);

const abierta = async () => (await registrarFloracion(admin.userAccountId, { locationId: parcelaId, startsAt: dia("2026-03-10") })).id;

const formulario = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};

const redirige = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(Error);
  return (e as Error).message;
};

describe("cerrarFloracion", () => {
  it("cierra una abierta, con su auditoría en la misma operación", async () => {
    const id = await abierta();
    await cerrarFloracion(admin.userAccountId, { floracionId: id, endsAt: dia("2026-03-20") });

    const fila = await prisma.plotBloom.findUniqueOrThrow({ where: { id } });
    expect(fila.endsAt).toEqual(dia("2026-03-20"));
    const auditoria = await prisma.auditEvent.findMany({ where: { entityId: id, operation: "plot_bloom.close" } });
    expect(auditoria).toHaveLength(1);
    expect((auditoria[0]!.before as { endsAt: unknown }).endsAt).toBeNull();
    expect((auditoria[0]!.after as { endsAt: string }).endsAt).toBe("2026-03-20T00:00:00.000Z");
  });

  it("no cierra una que ya está cerrada, ni le cambia el fin", async () => {
    const id = await abierta();
    await cerrarFloracion(admin.userAccountId, { floracionId: id, endsAt: dia("2026-03-20") });
    await expect(cerrarFloracion(admin.userAccountId, { floracionId: id, endsAt: dia("2026-03-25") })).rejects.toThrow(
      FloracionValidationError,
    );
    expect((await prisma.plotBloom.findUniqueOrThrow({ where: { id } })).endsAt).toEqual(dia("2026-03-20"));
  });

  it("no la cierra antes de que empiece", async () => {
    const id = await abierta();
    await expect(cerrarFloracion(admin.userAccountId, { floracionId: id, endsAt: dia("2026-03-09") })).rejects.toThrow(
      FloracionValidationError,
    );
  });

  it("el mismo día del inicio sí vale: el borde cuenta", async () => {
    const id = await abierta();
    await cerrarFloracion(admin.userAccountId, { floracionId: id, endsAt: dia("2026-03-10") });
    expect((await prisma.plotBloom.findUniqueOrThrow({ where: { id } })).endsAt).toEqual(dia("2026-03-10"));
  });

  it("quien sólo ve lotes no la cierra, y la floración sigue abierta", async () => {
    const id = await abierta();
    await expect(cerrarFloracion(visor, { floracionId: id, endsAt: dia("2026-03-20") })).rejects.toThrow(
      TraceabilityAccessError,
    );
    expect((await prisma.plotBloom.findUniqueOrThrow({ where: { id } })).endsAt).toBeNull();
  });

  it("un id que no existe, o que ni siquiera es un id, se rechaza sin reventar", async () => {
    for (const malo of ["00000000-0000-4000-8000-000000000000", "esto-no-es-un-id"]) {
      await expect(cerrarFloracion(admin.userAccountId, { floracionId: malo, endsAt: dia("2026-03-20") })).rejects.toThrow(
        FloracionValidationError,
      );
    }
  });
});

describe("las acciones de la pantalla", () => {
  it("anotar una floración abierta la guarda como día y el aviso la ve", async () => {
    deps.user.mockResolvedValue({ userAccountId: admin.userAccountId });
    const destino = await redirige(
      registrarFloracionFormAction(
        {},
        formulario({ locationId: parcelaId, startsAt: "2026-04-02", endsAt: "", plotBlockId: "", observerPersonId: admin.personId, notes: `${RUN} cafetal en flor` }),
      ),
    );
    expect(destino).toBe(`redirect:/plots/${parcelaId}?ok=floracion`);

    const fila = await prisma.plotBloom.findFirstOrThrow({ where: { locationId: parcelaId, notes: `${RUN} cafetal en flor` } });
    expect(fila.startsAt).toEqual(dia("2026-04-02"));
    expect(fila.endsAt).toBeNull();
    expect(fila.observerPersonId).toBe(admin.personId);
    // Lo que el aviso de «Manejo» recibe: la ventana, abierta.
    expect(await floracionesDeLaParcela(parcelaId)).toContainEqual({ startsAt: dia("2026-04-02"), endsAt: null, plotBlockId: null });
  });

  it("con el fin ya puesto, la guarda cerrada", async () => {
    deps.user.mockResolvedValue({ userAccountId: admin.userAccountId });
    await redirige(
      registrarFloracionFormAction({}, formulario({ locationId: parcelaId, startsAt: "2026-05-01", endsAt: "2026-05-09", notes: `${RUN} cerrada` })),
    );
    const fila = await prisma.plotBloom.findFirstOrThrow({ where: { locationId: parcelaId, notes: `${RUN} cerrada` } });
    expect(fila.endsAt).toEqual(dia("2026-05-09"));
  });

  it("un día que no existe vuelve como error de la pantalla, no como un 500", async () => {
    deps.user.mockResolvedValue({ userAccountId: admin.userAccountId });
    const estado = await registrarFloracionFormAction({}, formulario({ locationId: parcelaId, startsAt: "2026-02-31" }));
    expect(estado).toEqual({ error: "error_datetime" });
  });

  it("cerrar desde la ficha pone el fin y confirma qué se hizo", async () => {
    deps.user.mockResolvedValue({ userAccountId: admin.userAccountId });
    const id = await abierta();
    const destino = await redirige(cerrarFloracionFormAction({}, formulario({ floracionId: id, endsAt: "2026-03-25" })));
    expect(destino).toBe(`redirect:/plots/${parcelaId}?ok=floracion_cerrada`);
    expect((await prisma.plotBloom.findUniqueOrThrow({ where: { id } })).endsAt).toEqual(dia("2026-03-25"));
  });

  it("cerrar una ya cerrada vuelve como error de la pantalla", async () => {
    deps.user.mockResolvedValue({ userAccountId: admin.userAccountId });
    const id = await abierta();
    await cerrarFloracion(admin.userAccountId, { floracionId: id, endsAt: dia("2026-03-20") });
    expect(await cerrarFloracionFormAction({}, formulario({ floracionId: id, endsAt: "2026-03-25" }))).toEqual({ error: "error_floracion" });
  });
});

describe("la lista de la ficha", () => {
  it("las abiertas primero, y la ve también quien sólo ve lotes", async () => {
    const lista = await floracionesDeLaFicha(visor, parcelaId);
    expect(lista.length).toBeGreaterThan(1);
    const primeraCerrada = lista.findIndex((f) => f.endsAt !== null);
    const ultimaAbierta = lista.map((f) => f.endsAt === null).lastIndexOf(true);
    expect(ultimaAbierta).toBeLessThan(primeraCerrada);
    // Sólo lo que la pantalla pinta: ni notas ni quién la vio viajan.
    expect(Object.keys(lista[0]!).sort()).toEqual(["bloque", "endsAt", "id", "startsAt"]);
  });

  it("y a quien no tiene acceso a la parcela no se la enseña", async () => {
    await expect(floracionesDeLaFicha(sinAcceso, parcelaId)).rejects.toThrow(TraceabilityAccessError);
  });
});
