/**
 * El formulario completo de ajustes/transcripción (`RevisionDeTrampaForm`,
 * restaurado en la Tarea 10 fix round 1 y montado en
 * `/plots/[id]/ajustes`) — el contraparte de
 * `recordRoundTrapCheckFormAction.test.ts`: ahí la acción IGNORA cualquier
 * observador/procedencia que llegue en el `FormData` porque el formulario
 * corto de la ronda nunca los ofrece; aquí, en cambio, `RevisionDeTrampaForm`
 * SÍ los ofrece como selectores, y `recordTrapCheckFormAction` debe guardar
 * lo que el formulario manda — no un valor de la sesión ni uno fijo.
 *
 * Base real (`base-sembrada`, ver scripts/pruebas-por-compuerta.txt). Mismo
 * patrón que el archivo hermano: sólo se mockea lo que la acción necesita
 * del contexto de request y que un test no tiene (`lib/auth/session`,
 * `next/cache`, `next/navigation`, `next-intl/server`); `lib/traceability/traps`
 * corre contra la base de verdad, para que la aserción sobre la fila
 * guardada sea real.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
import { createTrap } from "../../lib/traceability/traps";
import { crearUsuarioConAcceso, crearParcela } from "../helpers/traceability";
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

import { recordTrapCheckFormAction } from "../../app/actions/traceability";

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
  const base = {
    locationId: "",
    specimenId: "",
    observedAt: "2026-09-15",
    brocaLevel: "pocos",
    provenanceClass: "direct_observation",
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) data.set(k, v);
  return data;
}

describe("recordTrapCheckFormAction — observador y procedencia elegibles", () => {
  it("guarda el observador y la procedencia elegidos en el formulario, no los de la sesión", async () => {
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

    // Quien de verdad miró la tela — distinto de `usuario`, que es quien
    // transcribe la nota de papel a la aplicación.
    const observador = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Observador", displayName: "TEST Observador (transcrito)", locale: "es" },
    });
    personIds.push(observador.id);

    const resultado = await recordTrapCheckFormAction(
      {},
      form({
        locationId: parcela.id,
        specimenId: trampa.id,
        brocaLevel: "algunos",
        observerPersonId: observador.id,
        // `original_record`, no `direct_observation`: quien transcribe no
        // vio la trampa — lo apuntó quien la miró.
        provenanceClass: "original_record",
      }),
    );

    expect(resultado.error).toBeUndefined();
    const revision = await prisma.specimenObservation.findFirstOrThrow({
      where: { specimenId: trampa.id, observationType: "trap_check" },
    });
    expect(revision.observerPersonId).toBe(observador.id);
    expect(revision.observerPersonId).not.toBe(usuario.personId);
    expect(revision.provenanceClass).toBe("original_record");
  });
});
