/**
 * La cosecha no registraba quién la operó, aunque el servicio lo guarde
 * (`PENDING_IMPLEMENTATIONS/024`, medido el 2026-10-05).
 *
 * Las 35 filas de `traceability.harvest_event` tenían `operator_person_id` nulo
 * en las 35. No era el modelo: `recordHarvestEvent` acepta el campo, lo pasa por
 * `exigirPersonaPermitida` —o sea comprueba el permiso de la persona que se
 * nombra— y lo escribe. **La cadena se rompía en la acción**, que no lo mandaba.
 *
 * **Y por eso este guardia es de CONDUCTA y no de fuente.** Un test que buscara
 * la cadena `operatorPersonId` en `app/actions/traceability.ts` ya pasaba antes
 * del arreglo: el archivo la menciona **seis** veces, todas de OTRAS acciones
 * —medición, apiario, jornada—. Contar un token fuera de su bloque es
 * exactamente la lectura que dejó la ficha `009` cerrada con el defecto vivo.
 *
 * Mismo patrón que `recordTrapCheckFormAction.test.ts`: la acción es la de
 * verdad, los servicios son los de verdad contra la base, y sólo se mockean la
 * sesión y lo que Next aporta. Va al grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
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

import { recordHarvestAction } from "../../app/actions/traceability";

const RUN = `ope-${randomUUID().slice(0, 8)}`;

let userAccountIds: string[] = [];
let personIds: string[] = [];
let scopeIds: string[] = [];
let locationIds: string[] = [];
let organizationIds: string[] = [];

// La limpieza DESCUBRE lo que borra por el `RUN`, en vez de heredarlo de una
// variable del fixture: una corrida que muera a mitad se limpia igual. Lo
// aprendimos el 2026-10-05, cuando un `beforeAll` roto dejó diez filas y la
// salida decía `Tests 4 passed`.
afterEach(async () => {
  const lotes = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN } }, select: { id: true } });
  const loteIds = lotes.map((l) => l.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: { in: loteIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: loteIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds }, scopeType: { not: "platform" as const } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.organizationMembership.deleteMany({ where: assertDefinedWhere({ personId: { in: personIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  userAccountIds = [];
  personIds = [];
  scopeIds = [];
  locationIds = [];
  organizationIds = [];
});

/** El fixture: quien teclea, la parcela, y la persona que de verdad cosechó. */
async function montar() {
  const usuario = await crearUsuarioConAcceso();
  userAccountIds.push(usuario.userAccountId);
  personIds.push(usuario.personId);
  scopeIds.push(usuario.scopeId);
  deps.user.mockResolvedValue({ userAccountId: usuario.userAccountId });

  const parcela = await crearParcela();
  locationIds.push(parcela.id, parcela.parentLocationId!);
  organizationIds.push(parcela.organizationId!);

  // Quien cosechó, distinto de quien teclea. `exigirPersonaPermitida` sólo deja
  // figurar a quien pertenece a la finca del registro, así que la membresía no
  // es adorno: sin ella el servicio lo rechaza.
  const recolector = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Recolector", displayName: `TEST Recolector (${RUN})`, locale: "es" },
  });
  personIds.push(recolector.id);
  await prisma.organizationMembership.create({
    data: { personId: recolector.id, organizationId: parcela.organizationId! },
  });

  return { usuario, parcela, recolector };
}

function form(campos: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(campos)) data.set(k, v);
  return data;
}

/** La acción redirige al salir bien, y el mock de `redirect` lanza. */
async function cosechar(data: FormData) {
  try {
    const estado = await recordHarvestAction({}, data);
    return { redirigio: false, error: estado.error };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    if (mensaje.startsWith("redirect:")) return { redirigio: true, error: undefined };
    throw err;
  }
}

describe("la cosecha registra quién la operó", () => {
  it("el operario que se nombra en el formulario llega a la fila", async () => {
    const { parcela, recolector } = await montar();
    const lotCode = `${RUN}-con`;

    const r = await cosechar(
      form({
        lotCode,
        locationId: parcela.id,
        organizationId: parcela.organizationId!,
        harvestedAt: "2026-10-06T07:30",
        tzOffsetMinutes: "300",
        brix: "18.5",
        operatorPersonId: recolector.id,
      }),
    );
    expect(r.error).toBeUndefined();
    expect(r.redirigio).toBe(true);

    const lote = await prisma.lot.findFirstOrThrow({ where: { lotCode } });
    const cosecha = await prisma.harvestEvent.findFirstOrThrow({ where: { resultingLotId: lote.id } });

    // **El control positivo va en la MISMA fila, a propósito.** `brix` sí viajaba
    // antes del arreglo, así que si llega bien y el operario sale nulo, el
    // defecto está en ese campo y no en «la acción no escribió nada».
    expect(cosecha.brix?.toString()).toBe("18.5");
    expect(cosecha.operatorPersonId).toBe(recolector.id);
  });

  it("sin operario en el formulario la fila queda nula, que es lo que hace discriminar al caso de arriba", async () => {
    const { parcela } = await montar();
    const lotCode = `${RUN}-sin`;

    const r = await cosechar(
      form({
        lotCode,
        locationId: parcela.id,
        organizationId: parcela.organizationId!,
        harvestedAt: "2026-10-06T07:30",
        tzOffsetMinutes: "300",
        brix: "18.5",
      }),
    );
    expect(r.error).toBeUndefined();

    const lote = await prisma.lot.findFirstOrThrow({ where: { lotCode } });
    const cosecha = await prisma.harvestEvent.findFirstOrThrow({ where: { resultingLotId: lote.id } });
    expect(cosecha.brix?.toString()).toBe("18.5");
    expect(cosecha.operatorPersonId).toBeNull();
  });

  it("una persona ajena a la finca se rechaza, así que el campo no abre una puerta", async () => {
    const { parcela } = await montar();
    const ajena = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Ajena", displayName: `TEST Ajena (${RUN})`, locale: "es" },
    });
    personIds.push(ajena.id);

    const r = await cosechar(
      form({
        lotCode: `${RUN}-ajena`,
        locationId: parcela.id,
        organizationId: parcela.organizationId!,
        harvestedAt: "2026-10-06T07:30",
        tzOffsetMinutes: "300",
        operatorPersonId: ajena.id,
      }),
    );
    expect(r.redirigio).toBe(false);
    expect(r.error).toBeTruthy();
    expect(await prisma.lot.findFirst({ where: { lotCode: `${RUN}-ajena` } })).toBeNull();
  });
});
