/**
 * El formulario corto de la ronda (Tarea 10, ruling del controlador) — no
 * tiene campo de procedencia ni de observador, ni siquiera oculto, así que
 * la única forma de comprobar «un campo forjado se ignora» es contra la
 * ACCIÓN de verdad, no contra `recordTrapCheck` directamente: es la acción
 * la que decide qué lee del `FormData`.
 *
 * Base real, en el grupo `base-sembrada` (ver scripts/pruebas-por-compuerta.txt).
 * Se mockean sólo `lib/auth/session`, `next/cache`, `next/navigation` y
 * `next-intl/server` — lo que la acción necesita del contexto de request,
 * que un test no tiene—. `lib/traceability/traps` y `lib/traceability/lots`
 * NO se mockean: `recordTrapCheck` y `getObserverCandidates` corren contra
 * la base de verdad, para que la aserción sobre la fila guardada sea real.
 *
 * Mismo patrón de limpieza que `traps.test.ts`: cada `it` encola sus ids y
 * `afterEach` los borra, nunca al final del cuerpo del `it` (ver la nota de
 * `polinizacion.test.ts` en CLAUDE.md).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
import { createTrap } from "../../lib/traceability/traps";
import { crearUsuarioConAcceso, crearParcela, crearUsuarioSinAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const deps = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));

import { recordRoundTrapCheckFormAction } from "../../app/actions/traceability";

let userAccountIds: string[] = [];
let personIds: string[] = [];
let scopeIds: string[] = [];
let locationIds: string[] = [];
let organizationIds: string[] = [];

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
  await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  userAccountIds = [];
  personIds = [];
  scopeIds = [];
  locationIds = [];
  organizationIds = [];
});

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const base = { locationId: "", specimenId: "", observedAt: "2026-09-15", brocaLevel: "pocos" };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) data.set(k, v);
  return data;
}

describe("recordRoundTrapCheckFormAction", () => {
  it("ignora la procedencia y el observador forjados: guarda direct_observation y la persona de la sesión", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    deps.user.mockResolvedValue({ userAccountId: usuario.userAccountId });

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(usuario.userAccountId, {
      locationId: parcela.id,
      installedAt: new Date("2026-09-01"),
      provenanceClass: "direct_observation",
    });

    // Un tercero cualquiera: su id viaja en el FormData como si el cliente
    // lo hubiera forjado, y no debe llegar a la fila guardada.
    const otraPersona = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Otra", displayName: "TEST Otra Persona (ronda)", locale: "es" },
    });
    personIds.push(otraPersona.id);

    const resultado = await recordRoundTrapCheckFormAction(
      {},
      form({
        locationId: parcela.id,
        specimenId: trampa.id,
        brocaLevel: "algunos",
        provenanceClass: "ai_suggestion",
        observerPersonId: otraPersona.id,
      }),
    );

    expect(resultado.error).toBeUndefined();
    const revision = await prisma.specimenObservation.findFirstOrThrow({
      where: { specimenId: trampa.id, observationType: "trap_check" },
    });
    expect(revision.provenanceClass).toBe("direct_observation");
    expect(revision.observerPersonId).toBe(usuario.personId);
    expect(revision.observerPersonId).not.toBe(otraPersona.id);
  });

  it("rechaza una cuenta sin persona vinculada, y no guarda ninguna revisión", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    // Con acceso real, para que el rechazo sea por falta de persona y no
    // por falta de acceso a la trampa (`getObserverCandidates` corre antes).
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const trampa = await createTrap(usuario.userAccountId, {
      locationId: parcela.id,
      installedAt: new Date("2026-09-01"),
      provenanceClass: "direct_observation",
    });

    // Una cuenta que ya no existe: `getObserverCandidates` no encuentra fila
    // y devuelve `selfPersonId: null` — el mismo resultado que tendría una
    // cuenta sin persona vinculada, sin depender de un estado que el
    // esquema (personId NOT NULL) no permite construir de otro modo.
    await prisma.assignment.deleteMany({ where: { userAccountId: usuario.userAccountId } });
    await prisma.userAccount.delete({ where: { id: usuario.userAccountId } });
    deps.user.mockResolvedValue({ userAccountId: usuario.userAccountId });

    const resultado = await recordRoundTrapCheckFormAction(
      {},
      form({ locationId: parcela.id, specimenId: trampa.id }),
    );

    expect(resultado.error).toBe("error_trap_no_observer");
    const revision = await prisma.specimenObservation.findFirst({
      where: { specimenId: trampa.id, observationType: "trap_check" },
    });
    expect(revision).toBeNull();

    // La cuenta ya se borró: no queda en `userAccountIds` para el
    // `afterEach`, y la persona SÍ sigue viva (nunca se le vinculó ninguna
    // fila con `personId` NOT NULL apuntando a una cuenta que ya no existe).
  });

  it("rechaza a un usuario sin acceso a specimen en esa parcela", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const dueno = await crearUsuarioConAcceso();
    userAccountIds.push(dueno.userAccountId);
    personIds.push(dueno.personId);
    scopeIds.push(dueno.scopeId);

    const trampa = await createTrap(dueno.userAccountId, {
      locationId: parcela.id,
      installedAt: new Date("2026-09-01"),
      provenanceClass: "direct_observation",
    });

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);
    deps.user.mockResolvedValue({ userAccountId: ajeno.userAccountId });

    const resultado = await recordRoundTrapCheckFormAction(
      {},
      form({ locationId: parcela.id, specimenId: trampa.id }),
    );

    expect(resultado.error).toBeTruthy();
    const revision = await prisma.specimenObservation.findFirst({
      where: { specimenId: trampa.id, observationType: "trap_check" },
    });
    expect(revision).toBeNull();
  });

  it("un conteo en blanco guarda `null`, nunca `0`", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    deps.user.mockResolvedValue({ userAccountId: usuario.userAccountId });

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(usuario.userAccountId, {
      locationId: parcela.id,
      installedAt: new Date("2026-09-01"),
      provenanceClass: "direct_observation",
    });

    // `captureCount` no se manda: mismo criterio que un envío real donde el
    // operario dejó el campo vacío.
    const resultado = await recordRoundTrapCheckFormAction(
      {},
      form({ locationId: parcela.id, specimenId: trampa.id, brocaLevel: "muchos" }),
    );

    expect(resultado.error).toBeUndefined();
    const revision = await prisma.specimenObservation.findFirstOrThrow({
      where: { specimenId: trampa.id, observationType: "trap_check" },
    });
    expect(revision.captureCount).toBeNull();
  });
});
