/**
 * Alta de trampa con número correlativo por finca.
 *
 * Base real, en el grupo `base-sembrada` (ver scripts/pruebas-por-compuerta.txt).
 * Cada `it` crea su propio usuario y parcela con los helpers de
 * `tests/helpers/traceability.ts`, y encola sus ids en los arreglos de este
 * archivo; la limpieza corre en `afterEach` — nunca al final del cuerpo del
 * `it` — para que una aserción fallida no salte el borrado (ver la nota de
 * `polinizacion.test.ts` en CLAUDE.md sobre limpiezas que no llegan a correr).
 *
 * `crearParcela()` (tests/helpers/traceability.ts) cuelga la parcela de una
 * finca de VERDAD: crea (o reutiliza) una `Location` de tipo `site` y hace
 * `parentLocationId` de la parcela apuntar a ella — la misma jerarquía que
 * `tests/traceability/lots.test.ts` usa para sitio→parcela. Cada llamada a
 * `crearParcela()` sin argumento crea su PROPIA finca nueva (dos parcelas de
 * llamadas distintas NO comparten finca); para compartirla hay que pasar la
 * misma finca (de `crearFinca()`) a las dos llamadas — así se prueba en
 * "sigue la numeración de la finca aunque la parcela sea otra", con dos
 * parcelas HERMANAS bajo la misma finca, sin construir nada a mano con
 * `prisma.location.create`.
 *
 * Como `crearParcela()` crea dos filas de `Location` por llamada (la finca Y
 * la parcela) cuando no se le pasa una finca existente, cada `it` que la usa
 * sin argumento encola AMBOS ids —`parcela.id` y `parcela.parentLocationId`—
 * en `locationIds`, o la finca queda huérfana tras el `afterEach`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTrap, recordTrapCheck, TrapAccessError, TrapValidationError } from "../../lib/traceability/traps";
import { createSpecimen, recordSpecimenObservation } from "../../lib/traceability/specimens";
import { getPlotDetail } from "../../lib/traceability/plantingCohorts";
import { saveTrapRule } from "../../lib/traceability/trapRules";
import { prisma } from "../../lib/db";
import { crearUsuarioConAcceso, crearParcela, crearFinca, crearUsuarioSinAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

let userAccountIds: string[] = [];
let personIds: string[] = [];
let scopeIds: string[] = [];
let locationIds: string[] = [];
let organizationIds: string[] = [];

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
  await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
  await prisma.plotBlock.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
  await prisma.trapRule.deleteMany({ where: assertDefinedWhere({ farmLocationId: { in: locationIds } }) });
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

describe("alta de trampa", () => {
  it("numera correlativo por finca, empezando en 1", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    // La parcela cuelga de una finca (Location de tipo site) que NO es ella
    // misma — si esto no se cumple, la aserción de abajo sobre
    // `farmLocationId` no estaría probando la jerarquía real.
    expect(parcela.parentLocationId).not.toBeNull();
    expect(parcela.parentLocationId).not.toBe(parcela.id);

    const a = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const b = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    expect(a.trapNumber).toBe(1);
    expect(b.trapNumber).toBe(2);
    expect(a.farmLocationId).toBe(parcela.parentLocationId);
  });

  it("sigue la numeración de la finca aunque la parcela sea otra", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const finca = await crearFinca();
    locationIds.push(finca.id);
    organizationIds.push(finca.organizationId!);

    // Dos parcelas HERMANAS bajo la misma finca, las dos con el helper —
    // nada de `prisma.location.create` a mano.
    const uno = await crearParcela(finca);
    const otra = await crearParcela(finca);
    locationIds.push(uno.id, otra.id);

    await createTrap(userAccountId, { locationId: uno.id, installedAt: new Date(), provenanceClass: "direct_observation" });
    const segunda = await createTrap(userAccountId, { locationId: otra.id, installedAt: new Date(), provenanceClass: "direct_observation" });
    expect(segunda.trapNumber).toBe(2);
    expect(segunda.farmLocationId).toBe(finca.id);
  });

  it("deja la trampa activa y con su observación de instalación", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-02"), provenanceClass: "direct_observation",
    });
    expect(trampa.status).toBe("active");
    const instalacion = await prisma.specimenObservation.findFirst({
      where: { specimenId: trampa.id, observationType: "installed" },
    });
    expect(instalacion).not.toBeNull();
  });

  it("rechaza una fecha de instalación en el futuro", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const manana = new Date(Date.now() + 86_400_000);
    await expect(createTrap(userAccountId, {
      locationId: parcela.id, installedAt: manana, provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  // F9 fix-final — el escenario exacto del hallazgo: a las 20:00 en Panamá
  // (UTC−5) ya son las 01:00 UTC del día siguiente. Comparar por INSTANTE
  // (el código viejo) dejaba pasar un `installedAt` de "mañana en UTC" porque
  // su medianoche (00:00) no es posterior al "ahora" (01:00). Comparar por
  // DÍA en la zona de la finca lo rechaza: en Panamá, a esa hora, sigue
  // siendo el día anterior. `ahora` se inyecta para que la prueba no dependa
  // de en qué hora UTC corra.
  it("rechaza un día que en la zona de la finca sigue siendo mañana, aunque en UTC ya rodó", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    await prisma.location.update({ where: { id: parcela.id }, data: { timezone: "America/Panama" } });

    // "Ahora": 2026-09-18T01:00Z = 2026-09-17 20:00 en Panamá.
    const ahora = new Date("2026-09-18T01:00:00Z");
    // El operario escribe "18 de septiembre" — ya es esa fecha en UTC, pero
    // en Panamá todavía es el 17: sigue siendo mañana.
    await expect(createTrap(
      userAccountId,
      { locationId: parcela.id, installedAt: new Date("2026-09-18"), provenanceClass: "direct_observation" },
      ahora,
    )).rejects.toThrow(TrapValidationError);

    // Control positivo: la fecha de HOY en Panamá (17 de septiembre) sí pasa,
    // a la misma hora "ahora" — si esto también fallara, el guardia estaría
    // rechazando de más y la prueba de arriba no probaría nada.
    const trampa = await createTrap(
      userAccountId,
      { locationId: parcela.id, installedAt: new Date("2026-09-17"), provenanceClass: "direct_observation" },
      ahora,
    );
    expect(trampa.id).toBeTruthy();
  });

  it("rechaza un bloque de otra parcela", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const otra = await crearParcela();
    locationIds.push(otra.id, otra.parentLocationId!);
    organizationIds.push(otra.organizationId!);

    const { createPlotBlock } = await import("../../lib/traceability/plotBlocks");
    const ajeno = await createPlotBlock(userAccountId, { locationId: otra.id, name: "Norte" });

    await expect(createTrap(userAccountId, {
      locationId: parcela.id, plotBlockId: ajeno.id, installedAt: new Date(), provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  it("rechaza a un usuario sin acceso a specimen en esa parcela", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(createTrap(ajeno.userAccountId, {
      locationId: parcela.id, installedAt: new Date(), provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapAccessError);
  });
});

describe("revisión de trampa", () => {
  it("guarda la lectura, el mantenimiento y los otros insectos", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id,
      observedAt: new Date("2026-09-15"),
      brocaLevel: "algunos",
      otherInsects: true,
      otherInsectsNote: "avispas",
      cleaned: true,
      liquidChanged: true,
      provenanceClass: "direct_observation",
    });
    expect(revision.brocaLevel).toBe("algunos");
    expect(revision.captureCount).toBeNull();      // nadie contó: NO se inventa un 0
    expect(revision.otherInsectsNote).toBe("avispas");
    expect(revision.cleaned).toBe(true);
    // F1 fix-final (ADR-080) — `lureRecharged` no se preguntó en este envío:
    // `null` ("no se preguntó"), nunca `false` ("se preguntó y no se hizo").
    expect(revision.lureRecharged).toBeNull();
  });

  // F1 fix-final — control positivo del caso de arriba: un `false` explícito
  // SÍ se guarda como `false`, para que la prueba de arriba no pase sólo
  // porque el campo quedó vacío por descuido.
  it("guarda un `false` explícito de mantenimiento, y lo distingue de sin registrar", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"), brocaLevel: "pocos",
      cleaned: false, liquidChanged: null, provenanceClass: "direct_observation",
    });
    expect(revision.cleaned).toBe(false);       // se preguntó: no se hizo
    expect(revision.liquidChanged).toBeNull();  // no se preguntó
    expect(revision.lureRecharged).toBeNull();  // ni se mencionó en el envío
  });

  it("acepta el número exacto cuando alguien contó", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "muchos", captureCount: 47, provenanceClass: "direct_observation",
    });
    expect(revision.captureCount).toBe(47);
  });

  it("exige la lectura de la escala", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    await expect(recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: undefined as never, provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  it("no deja la revisión sin su fila de auditoría", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "ninguno", provenanceClass: "direct_observation",
    });
    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "specimen_observation", entityId: revision.id },
    });
    expect(evento).not.toBeNull();
  });

  it("rechaza a un usuario sin acceso a specimen en esa parcela", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(recordTrapCheck(ajeno.userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapAccessError);
  });

  it("rechaza revisar un Specimen que no es una trampa", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const planta = await createSpecimen(userAccountId, {
      locationId: parcela.id,
      specimenType: "plant",
      commonName: "TEST Planta",
      provenanceClass: "direct_observation",
    });

    await expect(recordTrapCheck(userAccountId, {
      specimenId: planta.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  // F4 fix-final — antes esto sólo lo impedía la pantalla (el formulario se
  // oculta si `status !== "active"`); nada en el servicio rechazaba un POST
  // directo con el `specimenId` de una trampa retirada.
  it("rechaza revisar una trampa retirada", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    await recordSpecimenObservation(userAccountId, {
      specimenId: trampa.id, observationType: "removed", observedAt: new Date("2026-09-10"),
      provenanceClass: "direct_observation",
    });

    await expect(recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  // F9 fix-final — la misma regla que ya cubría `installedAt`
  // ("rechaza una fecha de instalación en el futuro"), ahora también para
  // `observedAt`.
  it("rechaza una fecha de revisión en el futuro", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const manana = new Date(Date.now() + 86_400_000);
    await expect(recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: manana, brocaLevel: "pocos", provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  // F3 fix-final (spec §4.6) — "quién observó", cableado igual que
  // `startFieldSession` (fieldSessions.ts): se guarda, y un id que no
  // corresponde a ninguna Person no se guarda en silencio como si observara.
  it("guarda quién observó, y rechaza una persona que no existe", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId, personId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });

    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"), brocaLevel: "pocos",
      observerPersonId: personId, provenanceClass: "direct_observation",
    });
    expect(revision.observerPersonId).toBe(personId);

    await expect(recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-16"), brocaLevel: "pocos",
      observerPersonId: "00000000-0000-0000-0000-000000000000", provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });
});

describe("getPlotDetail — lo que necesitan los avisos de trampas", () => {
  it("devuelve el día de instalación, la última revisión y la regla de la FINCA", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    // Sin regla: `null`, no un plazo por defecto.
    expect((await getPlotDetail(userAccountId, parcela.id)).reglaDeTrampas).toBeNull();

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-02"), provenanceClass: "direct_observation",
    });
    await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"), brocaLevel: "muchos",
      provenanceClass: "direct_observation",
    });
    // La regla va sobre la finca (el padre), no sobre la parcela.
    await saveTrapRule(userAccountId, {
      farmLocationId: parcela.parentLocationId!, triggerLevel: "algunos", normalDays: 14, alertDays: 7,
      suggestedAction: "aplicar Bralic",
    });

    const detalle = await getPlotDetail(userAccountId, parcela.id);
    expect(detalle.reglaDeTrampas).toEqual({
      triggerLevel: "algunos", normalDays: 14, alertDays: 7, suggestedAction: "aplicar Bralic",
      // Tarea 3 — sin producto sugerido, `suggestedMaterial` es null, no ausente.
      suggestedMaterial: null,
    });
    expect(detalle.trampas).toHaveLength(1);
    expect(detalle.trampas[0]!.instaladaEl?.toISOString().slice(0, 10)).toBe("2026-09-02");
    expect(detalle.trampas[0]!.ultimaRevision).toMatchObject({ brocaLevel: "muchos" });
    expect(detalle.trampas[0]!.ultimaRevision?.observedAt.toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  // F2 fix-final — lo que se escribía y nunca se volvía a leer: el conteo,
  // otros insectos, el mantenimiento y quién observó. Antes el `select` de
  // `getPlotDetail` sólo traía `{id, observedAt, brocaLevel}`.
  it("trae el conteo, otros insectos, el mantenimiento y quién observó de la última revisión", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId, personId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"), brocaLevel: "muchos",
      captureCount: 47, otherInsects: true, otherInsectsNote: "hormigas",
      cleaned: true, liquidChanged: true, lureRecharged: false,
      observerPersonId: personId, provenanceClass: "direct_observation",
    });

    const persona = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
    const detalle = await getPlotDetail(userAccountId, parcela.id);
    expect(detalle.trampas[0]!.ultimaRevision).toMatchObject({
      captureCount: 47,
      otherInsects: true,
      otherInsectsNote: "hormigas",
      cleaned: true,
      liquidChanged: true,
      lureRecharged: false,
      observerName: persona.displayName,
    });
  });

  // F6 fix-final — la lista COMPLETA de revisiones (no sólo la última), para
  // que el formulario de foto pueda elegir a cuál cuelga.
  it("trae todas las revisiones de la trampa, no sólo la última", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-05"), brocaLevel: "pocos",
      provenanceClass: "direct_observation",
    });
    await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"), brocaLevel: "muchos",
      provenanceClass: "direct_observation",
    });

    const detalle = await getPlotDetail(userAccountId, parcela.id);
    expect(detalle.trampas[0]!.revisiones).toHaveLength(2);
    expect(detalle.trampas[0]!.revisiones.map((r) => r.observedAt.toISOString().slice(0, 10))).toEqual([
      "2026-09-15", "2026-09-05",
    ]);
  });

  // F7 fix-final — el día de instalación tiene que ser el de la
  // REINSTALACIÓN más reciente, no el de la primera instalación. Sin esto,
  // una trampa retirada y reinstalada meses después seguía contando el plazo
  // desde su primerísima instalación.
  it("el día de instalación es el de la reinstalación más reciente", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-01-01"), provenanceClass: "direct_observation",
    });
    await recordSpecimenObservation(userAccountId, {
      specimenId: trampa.id, observationType: "removed", observedAt: new Date("2026-01-02"),
      provenanceClass: "direct_observation",
    });
    await recordSpecimenObservation(userAccountId, {
      specimenId: trampa.id, observationType: "reinstalled", observedAt: new Date("2026-09-18"),
      provenanceClass: "direct_observation",
    });

    const detalle = await getPlotDetail(userAccountId, parcela.id);
    expect(detalle.trampas[0]!.instaladaEl?.toISOString().slice(0, 10)).toBe("2026-09-18");
  });

  // F5 fix-final — `location:manage_attributes` ya NO basta para leer las
  // trampas: hace falta `specimen:view` sobre esa misma Location. Se
  // reutiliza la cuenta Platform Admin de `crearUsuarioConAcceso` y se le
  // QUITA ese permiso con un `deny` (mismo mecanismo que
  // `tests/rbac/ajustesDePermiso.test.ts`), en vez de construir un perfil sin
  // acceso real: así se prueba el guardia nuevo, no la ausencia total de
  // asignación.
  it("sin `specimen:view` la sección de trampas no se incluye", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });

    // Control positivo: con el permiso completo, la trampa SÍ aparece.
    expect((await getPlotDetail(userAccountId, parcela.id)).trampas).toHaveLength(1);

    const assignment = await prisma.assignment.findFirstOrThrow({ where: { userAccountId } });
    const permisoSpecimenView = await prisma.permission.findFirstOrThrow({
      where: { resourceType: "specimen", action: "view" },
    });
    await prisma.assignmentPermissionOverride.create({
      data: { assignmentId: assignment.id, permissionId: permisoSpecimenView.id, effect: "deny" },
    });

    const detalle = await getPlotDetail(userAccountId, parcela.id);
    expect(detalle.trampas).toEqual([]);
    expect(detalle.reglaDeTrampas).toBeNull();
    // La compuerta del resto del tablero (`location:manage_attributes`) sigue
    // viva: no es un rechazo entero, sólo se omite la sección de trampas.
    expect(detalle.location.id).toBe(parcela.id);
  });
});
