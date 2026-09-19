/**
 * Cola offline para captura de parcela — Tarea 1. Ver
 * `.superpowers/sdd/2026-09-16-cola-offline-captura-de-parcela/task-1-brief.md`.
 *
 * Postgres real, fixtures acotadas por RUN_ID, sin mocks — mismo estilo que
 * `tests/sync/pushFieldEvents.test.ts`.
 *
 * Lo que este test defiende: que reintentar una muestra de suelo cuya
 * respuesta se perdió no cree una segunda fila. Se comprueba por rechazo del
 * índice único, no porque la segunda llamada devuelva algo con buena pinta.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { parsearMutaciones } from "../../lib/sync/parsearMutaciones";
import { pushFieldEvents, type MutacionDeRevisionDeTrampa } from "../../lib/sync/pushFieldEvents";
import { createTrap } from "../../lib/traceability/traps";
import { crearUsuarioSinAcceso } from "../helpers/traceability";

const RUN_ID = `parcela-sin-senal-${Date.now()}`;

let organizationId: string;
let locationId: string;
let userAccountId: string;
let personId: string;
let deviceId: string;
let scopeId: string;
// Tarea 11 — trampas creadas por los tests de `trap_check` de más abajo; se
// limpian aquí porque comparten el `afterAll` de arriba, no uno propio.
let trampaIds: string[] = [];

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const location = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Operador", displayName: `TEST Operador (${RUN_ID})`, locale: "es" },
  });
  personId = person.id;
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  userAccountId = account.id;

  // Task 3 — `aplicarCapturaDeParcela` llama a `createSoilSample`, y ésa exige
  // `location:manage_attributes` vía `requireLocationAttributeAccess`. Sin
  // esta asignación, todas las mutaciones de este bloque volverían `rejected`
  // con `no_location_attribute_access` en vez de `applied`.
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } });
  scopeId = scope.id;
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId } });

  // `pushFieldEvents` busca el `deviceId` en la tabla `Device`, cuyo `id` es
  // `@db.Uuid`: un literal como `"dev1"` no es un UUID válido y Prisma lo
  // rechaza antes de llegar a la base. Se necesita un dispositivo real.
  const device = await prisma.device.create({
    data: { label: `TEST PWA (${RUN_ID})`, platform: "pwa", createdBy: userAccountId },
  });
  deviceId = device.id;
});

afterAll(async () => {
  // Tarea 11 — antes que nada: `Specimen`→`SpecimenObservation` no tiene
  // `RESTRICT` (`onDelete: Cascade`, ver schema), pero se borra la
  // observación primero de todos modos, por si alguna vez cambia.
  await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimenId: { in: trampaIds } }) });
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ id: { in: trampaIds } }) });
  await prisma.soilSample.deleteMany({ where: assertDefinedWhere({ locationId }) });
  // Ronda de arreglo de la revisión final: las pruebas de enum crean también
  // muestras foliares y perfiles en este mismo `locationId`.
  await prisma.foliarSample.deleteMany({ where: assertDefinedWhere({ locationId }) });
  await prisma.soilProfile.deleteMany({ where: assertDefinedWhere({ locationId }) });
  // Ronda de arreglo 1 — la prueba de `dataQuality` en siembra crea un
  // `PlantingCohort` en este mismo `locationId`.
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ locationId }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ id: deviceId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("clientDraftId en la captura de parcela", () => {
  it("dos muestras de suelo con el mismo clientDraftId no pueden coexistir", async () => {
    const draft = `draft-${Date.now()}`;
    await prisma.soilSample.create({
      data: {
        locationId,
        sampleCode: `A-${draft}`,
        sampledAt: new Date(),
        provenanceClass: "direct_observation",
        clientDraftId: draft,
        createdBy: userAccountId,
      },
    });
    await expect(
      prisma.soilSample.create({
        data: {
          locationId,
          sampleCode: `B-${draft}`,
          sampledAt: new Date(),
          provenanceClass: "direct_observation",
          clientDraftId: draft,
          createdBy: userAccountId,
        },
      }),
    ).rejects.toThrow();
  });
});

/**
 * Task 2 — el parseo reconoce los cuatro tipos de captura de parcela. Puras:
 * sin base ni fixtures, a diferencia del describe de arriba.
 */
describe("el lote reconoce los cuatro tipos de captura de parcela", () => {
  it("parsea una muestra de suelo encolada", () => {
    const r = parsearMutaciones([
      {
        kind: "soil_sample",
        clientDraftId: "d1",
        locationId: "loc1",
        sampleCode: "S-01",
        sampledAt: "2026-09-16T12:00:00.000Z",
        provenanceClass: "direct_observation",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1); // control: cuántas parseó, no sólo que no falló
    expect(r.mutations[0]).toMatchObject({ kind: "soil_sample", sampledAt: new Date("2026-09-16T12:00:00.000Z") });
  });

  /**
   * **Contrato cambiado por el hallazgo I1/I3 de la revisión final.** Antes esto
   * devolvía `{ ok: false, error: "mutation_malformed" }`, o sea **400 del lote
   * entero**, y `clasificarRespuesta(400)` = `rechazar` marca `error` a TODOS los
   * borradores del lote, los buenos incluidos. Es la misma regla que el spec fija
   * y que la tarea 4 implementó para el `kind` desconocido, aplicada donde
   * faltaba: **con `clientDraftId` hay a quién atribuir el rechazo, así que se
   * rechaza esa mutación y las demás pasan**.
   *
   * Y el caso es alcanzable hoy: el payload hace `.trim()` pero no exige, y el
   * `required` del HTML no bloquea un código de sólo espacios.
   */
  it("una muestra sin sampleCode se rechaza SOLA, no tumba el lote", () => {
    const r = parsearMutaciones([
      { kind: "soil_sample", clientDraftId: "d1", locationId: "loc1", sampledAt: "2026-09-16T12:00:00.000Z" },
      { kind: "soil_sample", clientDraftId: "d-ok", locationId: "loc1", sampleCode: "S-02", sampledAt: "2026-09-16T12:00:00.000Z" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([{ clientDraftId: "d1", reason: "sample_code_required" }]);
    // Control: la buena del mismo lote SÍ pasó, que es la propiedad entera.
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ clientDraftId: "d-ok" });
  });

  it("un sampleCode de sólo espacios se rechaza igual: el `required` del HTML no lo bloquea", () => {
    const r = parsearMutaciones([
      { kind: "soil_sample", clientDraftId: "d1", locationId: "loc1", sampleCode: "   ", sampledAt: "2026-09-16T12:00:00.000Z" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([{ clientDraftId: "d1", reason: "sample_code_required" }]);
  });

  it("una muestra sin sampledAt se rechaza sola, con su propia razón", () => {
    const r = parsearMutaciones([
      { kind: "soil_sample", clientDraftId: "d1", locationId: "loc1", sampleCode: "S-01" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([{ clientDraftId: "d1", reason: "sampled_at_required" }]);
  });

  it("parsea una muestra foliar encolada", () => {
    const r = parsearMutaciones([
      {
        kind: "foliar_sample",
        clientDraftId: "d2",
        locationId: "loc1",
        sampleCode: "F-01",
        sampledAt: "2026-09-16T12:00:00.000Z",
        provenanceClass: "direct_observation",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ kind: "foliar_sample", sampledAt: new Date("2026-09-16T12:00:00.000Z") });
  });

  it("parsea un perfil de suelo encolado", () => {
    const r = parsearMutaciones([
      {
        kind: "soil_profile",
        clientDraftId: "d3",
        locationId: "loc1",
        describedAt: "2026-09-16T12:00:00.000Z",
        provenanceClass: "direct_observation",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ kind: "soil_profile", describedAt: new Date("2026-09-16T12:00:00.000Z") });
  });

  // Es la costura por la que la calicata encolada perdió sus horizontes (C1 de
  // la revisión final), y hasta aquí ninguna prueba la cruzaba: las de base
  // llaman a `pushFieldEvents` directamente y se saltan el parseo.
  //
  // Los horizontes van SUCIOS a propósito. El parseo hace `...m` antes de
  // poner `horizons`, así que si alguien borrara esa línea los crudos pasarían
  // por el spread, y una prueba con datos limpios seguiría en verde. Sólo lo que
  // la normalización arregla —ordinales renumerados, una profundidad en texto,
  // una entrada que no es un objeto— distingue «normalizado» de «crudo».
  it("los horizontes de una calicata llegan del parseo normalizados, no crudos", () => {
    const r = parsearMutaciones([
      {
        kind: "soil_profile",
        clientDraftId: "d-horizontes",
        locationId: "loc1",
        describedAt: "2026-09-16T12:00:00.000Z",
        provenanceClass: "direct_observation",
        horizons: [
          { ordinal: 7, topCm: 0, bottomCm: "20", designation: "Ap", colour: "10YR 3/2", textureByFeel: "franco arenoso", structure: "" },
          "basura",
          null,
          { ordinal: 9, topCm: 20, bottomCm: 55, designation: "Bt", notes: "   " },
        ],
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect((r.mutations[0] as { horizons?: unknown }).horizons).toEqual([
      { ordinal: 1, topCm: 0, bottomCm: 20, designation: "Ap", colour: "10YR 3/2", structure: null, textureByFeel: "franco arenoso", notes: null },
      { ordinal: 2, topCm: 20, bottomCm: 55, designation: "Bt", colour: null, structure: null, textureByFeel: null, notes: null },
    ]);
  });

  // La normalización existe para esto: un `horizons` que no es una lista, pasado
  // crudo a Prisma, lanza fuera de las clases de validación → 500 → `reintentar`
  // → el mismo lote vuelve para siempre.
  it("unos horizontes que no son una lista salen vacíos, sin tumbar el lote", () => {
    const r = parsearMutaciones([
      {
        kind: "soil_profile",
        clientDraftId: "d-horizontes-rotos",
        locationId: "loc1",
        describedAt: "2026-09-16T12:00:00.000Z",
        provenanceClass: "direct_observation",
        horizons: "no es una lista",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([]);
    expect((r.mutations[0] as { horizons?: unknown }).horizons).toEqual([]);
  });

  it("un perfil de suelo sin describedAt se rechaza solo, no tumba el lote", () => {
    const r = parsearMutaciones([
      { kind: "soil_profile", clientDraftId: "d3", locationId: "loc1", provenanceClass: "direct_observation" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([{ clientDraftId: "d3", reason: "described_at_required" }]);
    expect(r.mutations).toHaveLength(0);
  });

  it("parsea una siembra encolada, con plantedAt ausente", () => {
    const r = parsearMutaciones([
      { kind: "planting_cohort", clientDraftId: "d4", locationId: "loc1", provenanceClass: "direct_observation" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ kind: "planting_cohort", plantedAt: null });
  });

  it("una mutación de parcela sin locationId se rechaza sola: tiene a quién atribuirse", () => {
    const r = parsearMutaciones([
      { kind: "soil_sample", clientDraftId: "d1", sampleCode: "S-01", sampledAt: "2026-09-16T12:00:00.000Z" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([{ clientDraftId: "d1", reason: "location_id_required" }]);
  });

  /**
   * **El otro lado de la regla, y por eso va aquí al lado.** Sin `clientDraftId`
   * no hay a quién atribuir el rechazo, así que sigue siendo **400 de lote** —
   * si esto se rechazara por mutación, el resultado no tendría clave con la que
   * el cliente pudiera emparejarlo y el borrador se quedaría pendiente para
   * siempre sin que nadie supiera cuál es.
   *
   * Es también el control positivo de los tres casos de arriba: sin él, un
   * parseo que dijera `ok` a todo los pasaría los tres en verde.
   */
  it("una mutación de parcela SIN clientDraftId sigue siendo 400 de lote", () => {
    const r = parsearMutaciones([
      { kind: "soil_sample", locationId: "loc1", sampleCode: "S-01", sampledAt: "2026-09-16T12:00:00.000Z" },
    ]);
    expect(r).toEqual({ ok: false, error: "mutation_missing_ids" });
  });

  it("un kind desconocido rechaza SOLO esa mutación y deja pasar el resto", () => {
    const r = parsearMutaciones([
      { kind: "lo_que_sea", clientDraftId: "d-raro", locationId: "loc1" },
      { kind: "soil_profile", clientDraftId: "d-ok", locationId: "loc1", describedAt: "2026-09-16T12:00:00.000Z", provenanceClass: "direct_observation" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect(r.rechazos).toEqual([{ clientDraftId: "d-raro", reason: "unknown_kind" }]);
  });
});

/**
 * Tarea 11 — la revisión de la ronda de trampas se suma a la cola de
 * captura de parcela.
 *
 * **El guardia que el ruling del controlador pide explícito.** Sin
 * `"trap_check"` en `KINDS_DE_PARCELA`, esta mutación cae en la rama del
 * `kind` desconocido de más abajo (`unknown_kind`) en vez de en la suya:
 * `aplicarRevisionDeTrampa` quedaría escrita y sin poder alcanzarse nunca,
 * porque el parseo nunca llegaría a construir la mutación tipada que esa
 * rama espera. Flip-test: quitar `"trap_check"` de `KINDS_DE_PARCELA` y esta
 * prueba cae con `{ reason: "unknown_kind" }` en vez de `ok: true` con la
 * mutación parseada.
 */
describe("el lote reconoce la revisión de la ronda de trampas", () => {
  it("parsea una revisión de trampa encolada", () => {
    const r = parsearMutaciones([
      {
        kind: "trap_check",
        clientDraftId: "d-trampa",
        locationId: "loc1",
        specimenId: "specimen1",
        // A10 fix-final — un campo de DÍA, `YYYY-MM-DD` exacto: un instante
        // con hora se rechaza ahora (ver `tests/sync/parsearMutaciones.test.ts`).
        observedAt: "2026-09-18",
        brocaLevel: "pocos",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1); // control: cuántas parseó, no sólo que no falló
    expect(r.rechazos).toEqual([]);
    expect(r.mutations[0]).toMatchObject({
      kind: "trap_check",
      observedAt: new Date("2026-09-18T00:00:00.000Z"),
      brocaLevel: "pocos",
    });
  });

  it("una revisión sin observedAt se rechaza sola, con su propia razón", () => {
    const r = parsearMutaciones([
      { kind: "trap_check", clientDraftId: "d1", locationId: "loc1", specimenId: "specimen1", brocaLevel: "pocos" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([{ clientDraftId: "d1", reason: "observed_at_required" }]);
    expect(r.mutations).toHaveLength(0);
  });

  it("una revisión sin brocaLevel se rechaza sola, no tumba el lote", () => {
    const r = parsearMutaciones([
      { kind: "trap_check", clientDraftId: "d1", locationId: "loc1", specimenId: "specimen1", observedAt: "2026-09-18" },
      { kind: "trap_check", clientDraftId: "d-ok", locationId: "loc1", specimenId: "specimen1", observedAt: "2026-09-18", brocaLevel: "muchos" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([{ clientDraftId: "d1", reason: "broca_level_required" }]);
    // Control: la buena del mismo lote SÍ pasó.
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ clientDraftId: "d-ok" });
  });

  it("una revisión sin specimenId se rechaza sola, con su propia razón", () => {
    const r = parsearMutaciones([
      { kind: "trap_check", clientDraftId: "d1", locationId: "loc1", observedAt: "2026-09-18", brocaLevel: "pocos" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([{ clientDraftId: "d1", reason: "specimen_id_required" }]);
  });

  // Mismo criterio que las otras cuatro: sin `locationId` se rechaza sola,
  // porque hay `clientDraftId` a quien atribuirlo.
  it("una revisión sin locationId se rechaza sola: tiene a quién atribuirse", () => {
    const r = parsearMutaciones([
      { kind: "trap_check", clientDraftId: "d1", specimenId: "specimen1", observedAt: "2026-09-18", brocaLevel: "pocos" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([{ clientDraftId: "d1", reason: "location_id_required" }]);
  });

  // Ruling del controlador: `observerPersonId`/`provenanceClass` forjados en
  // el payload NO llegan a `MutacionDeRevisionDeTrampa` con ningún privilegio
  // especial — el parseo los deja pasar tal cual (los ignora quien aplica la
  // mutación, no el parseo), así que esta prueba sólo confirma que el parseo
  // no los necesita para aceptar la mutación. El rechazo/ignorado real se
  // prueba contra la base, más abajo.
  it("acepta la mutación aunque no traiga observerPersonId ni provenanceClass", () => {
    const r = parsearMutaciones([
      { kind: "trap_check", clientDraftId: "d1", locationId: "loc1", specimenId: "specimen1", observedAt: "2026-09-18", brocaLevel: "pocos" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
  });
});

/**
 * Task 3 — el replay aplica la captura de parcela contra la base, una sola
 * vez. Postgres real, contra el `locationId`/`deviceId`/`userAccountId` del
 * `beforeAll` de arriba.
 */
describe("el replay aplica la captura de parcela y no la duplica", () => {
  it("aplica una vez y la segunda dice duplicate, con UNA sola fila", async () => {
    const m = {
      kind: "soil_sample" as const,
      clientDraftId: `d-${Date.now()}`,
      locationId,
      sampleCode: `S-${Date.now()}`,
      sampledAt: new Date(),
      provenanceClass: "direct_observation",
    };
    const [primera] = await pushFieldEvents(userAccountId, deviceId, [m]);
    const [segunda] = await pushFieldEvents(userAccountId, deviceId, [m]);
    expect(primera).toMatchObject({ status: "applied" });
    expect(segunda).toMatchObject({ status: "duplicate" });
    // El control que pide CLAUDE.md: contar filas, no conformarse con que la
    // segunda llamada diga "duplicate".
    expect(await prisma.soilSample.count({ where: { clientDraftId: m.clientDraftId } })).toBe(1);
  });

  it("un código vacío vuelve como rejected, no como excepción", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "soil_sample" as const,
        clientDraftId: `d-${Date.now()}`,
        locationId,
        sampleCode: "   ",
        sampledAt: new Date(),
        provenanceClass: "direct_observation",
      },
    ]);
    expect(r).toMatchObject({ status: "rejected", reason: "sample_code_required" });
  });
});

/**
 * **I5 de la revisión final: ninguna prueba leía la fila creada.**
 *
 * Hasta aquí este archivo sólo usaba `count()` —cuántas filas hay— y
 * `toMatchObject({ status })` —qué contestó el servidor—. Ninguna de las dos
 * mira lo que se GUARDÓ, y por eso los tres campos que el transporte perdía
 * (`treatmentPlotLabel`, las banderas de anaerobiosis y los horizontes) fueron
 * invisibles a la suite: el `applied` salía igual de verde con el campo dentro
 * que fuera.
 *
 * El patrón es el de `tests/sync/pushFieldEvents.test.ts`, que lo usa cinco
 * veces: `findUniqueOrThrow` por `clientDraftId` y afirmar sobre **un valor que
 * escribió el operador**, no sobre el estado de la respuesta.
 *
 * Una por tipo, y cada una elige un campo que **sólo puede estar ahí si el
 * transporte lo llevó entero**. Comprobado quitando el reenvío de cada uno: cae
 * la prueba de ese tipo, por su nombre. (Ver el informe de la tarea.)
 */
describe("lo que escribió el operador llega a la fila, no sólo un applied", () => {
  it("la muestra de suelo guarda su treatmentPlotLabel", async () => {
    const clientDraftId = `d-fila-suelo-${Date.now()}`;
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "soil_sample" as const,
        clientDraftId,
        locationId,
        sampleCode: `S-fila-${Date.now()}`,
        sampledAt: new Date("2026-04-02T00:00:00.000Z"),
        provenanceClass: "direct_observation",
        treatmentPlotLabel: "T3-repetición-2",
        samplingPointLabel: "P-07",
        subSampleCount: 12,
      },
    ]);
    expect(r).toMatchObject({ status: "applied" });

    const fila = await prisma.soilSample.findUniqueOrThrow({ where: { clientDraftId } });
    expect(fila.treatmentPlotLabel).toBe("T3-repetición-2");
    expect(fila.samplingPointLabel).toBe("P-07");
    expect(fila.subSampleCount).toBe(12);
    // La fecha es la del formulario, no la del reloj de la sincronización.
    expect(fila.sampledAt.toISOString()).toBe("2026-04-02T00:00:00.000Z");
  });

  it("la muestra foliar guarda su treatmentPlotLabel y su canopyPosition", async () => {
    const clientDraftId = `d-fila-foliar-${Date.now()}`;
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "foliar_sample" as const,
        clientDraftId,
        locationId,
        sampleCode: `F-fila-${Date.now()}`,
        sampledAt: new Date("2026-04-02T00:00:00.000Z"),
        provenanceClass: "direct_observation",
        treatmentPlotLabel: "T1-repetición-3",
        canopyPosition: "middle",
        leafPairPosition: 4,
        phenologicalStage: "Prefloración",
        branchBearingFruit: false,
      },
    ]);
    expect(r).toMatchObject({ status: "applied" });

    const fila = await prisma.foliarSample.findUniqueOrThrow({ where: { clientDraftId } });
    expect(fila.treatmentPlotLabel).toBe("T1-repetición-3");
    expect(fila.canopyPosition).toBe("middle");
    expect(fila.leafPairPosition).toBe(4);
    expect(fila.phenologicalStage).toBe("Prefloración");
    // `false` no es `null`: «se miró y la rama no llevaba fruto» es un hecho
    // distinto de «no se miró», que es justo lo que ADR-080 protege.
    expect(fila.branchBearingFruit).toBe(false);
  });

  it("la calicata guarda sus banderas de anaerobiosis y sus horizontes", async () => {
    const clientDraftId = `d-fila-perfil-${Date.now()}`;
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "soil_profile" as const,
        clientDraftId,
        locationId,
        describedAt: new Date("2026-04-02T00:00:00.000Z"),
        provenanceClass: "direct_observation",
        pitDepthCm: 90,
        rootingDepthCm: 45,
        mottling: "present",
        greyColours: "absent",
        rootChannelConcretions: "not_observed",
        sourSmell: "absent",
        horizons: [
          { ordinal: 1, topCm: 0, bottomCm: 20, designation: "Ap", colour: "10YR 3/2", structure: "granular", textureByFeel: "franco arenoso", notes: null },
          { ordinal: 2, topCm: 20, bottomCm: 55, designation: "Bt", colour: null, structure: null, textureByFeel: null, notes: null },
        ],
      },
    ]);
    expect(r).toMatchObject({ status: "applied" });

    const fila = await prisma.soilProfile.findUniqueOrThrow({
      where: { clientDraftId },
      include: { horizons: { orderBy: { ordinal: "asc" } } },
    });
    expect(fila.mottling).toBe("present");
    expect(fila.greyColours).toBe("absent");
    expect(fila.rootChannelConcretions).toBe("not_observed");
    expect(fila.sourSmell).toBe("absent");
    expect(fila.pitDepthCm).toBe(90);
    // Control de cuántos leyó, no sólo de que hay alguno: con un solo horizonte
    // guardado de los dos, el `toBe("Ap")` de abajo pasaría igual.
    expect(fila.horizons).toHaveLength(2);
    expect(fila.horizons[0]!.designation).toBe("Ap");
    expect(fila.horizons[0]!.textureByFeel).toBe("franco arenoso");
    expect(fila.horizons[1]!.designation).toBe("Bt");
    expect(fila.horizons[1]!.bottomCm).toBe(55);
  });

  it("la siembra guarda su plantCount y su dataQuality", async () => {
    const clientDraftId = `d-fila-siembra-${Date.now()}`;
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "planting_cohort" as const,
        clientDraftId,
        locationId,
        provenanceClass: "interpretation",
        plantedAt: new Date("2019-01-01T00:00:00.000Z"),
        plantedPrecision: "year",
        plantCount: 340,
        dataQuality: "unconfirmed",
      },
    ]);
    expect(r).toMatchObject({ status: "applied" });

    const fila = await prisma.plantingCohort.findUniqueOrThrow({ where: { clientDraftId } });
    expect(fila.plantCount).toBe(340);
    expect(fila.dataQuality).toBe("unconfirmed");
    expect(fila.plantedPrecision).toBe("year");
    // `interpretation` sólo la ofrece la pantalla de siembra
    // (`PROCEDENCIA_DE_SIEMBRA`): que llegue a la fila es la prueba de que la
    // cola usa la lista de SU formulario y no la de campo.
    expect(fila.provenanceClass).toBe("interpretation");
    expect(fila.plantedAt?.toISOString()).toBe("2019-01-01T00:00:00.000Z");
  });
});

/**
 * Ronda de arreglo 1 sobre Task 3.
 *
 * CRÍTICO: `aplicarCapturaDeParcela` no reenviaba `dataQuality` a ninguno de
 * los cuatro servicios. No es cosmético en siembra: `createPlantingCohort`
 * EXIGE `dataQuality` cuando el cultivar tiene `impliesUnknownIdentity: true`
 * (`plantingCohorts.ts` `requireDataQualityForUnknownCultivar`), así que toda
 * siembra encolada sin señal con un cultivar de identidad desconocida volvía
 * `rejected` con `data_quality_required_for_unknown_cultivar` — un rechazo
 * que se lee como dato malo del operador y era el transporte descartando el
 * campo.
 */
describe("dataQuality viaja en la siembra, que es donde el servicio lo exige", () => {
  // **Se llamaba «en las cuatro ramas» y ejercía una.** Un nombre que promete
  // más de lo que hace es la misma clase de defecto que un comentario falso:
  // quien lo lea contará cuatro ramas cubiertas donde hay una. Las otras tres
  // las cubre ahora el describe de las filas creadas, que sí lee lo guardado.
  it("una siembra con cultivar de identidad desconocida y su dataQuality puesto vuelve applied, no rejected", async () => {
    const cultivarDesconocido = await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: "desconocido", catalog: { key: "cultivar" } },
    });
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "planting_cohort" as const,
        clientDraftId: `d-${Date.now()}`,
        locationId,
        provenanceClass: "direct_observation",
        cultivarValueId: cultivarDesconocido.id,
        dataQuality: "provisional",
      },
    ]);
    // Sin el reenvío de `dataQuality`, esto cae en `rejected` con
    // `data_quality_required_for_unknown_cultivar` — confirmado en rojo antes
    // de escribir el arreglo (ver task-3-report.md).
    expect(r).toMatchObject({ status: "applied" });
  });
});

/**
 * Ronda de arreglo 2 sobre Task 3.
 *
 * IMPORTANTE: `MutacionDeSiembra` no llevaba `plantedPrecision`.
 * `createPlantingCohort` (`plantingCohorts.ts:120`) exige `plantedPrecision`
 * cuando hay `plantedAt` — «una fecha de siembra sin precisión es una fecha
 * que afirma más de lo que sabe» — así que TODA siembra encolada con fecha
 * puesta, que es el caso normal, volvía `rejected` con
 * `planted_precision_required`.
 */
describe("plantedPrecision viaja junto a plantedAt en la siembra", () => {
  it("una siembra con plantedAt y su plantedPrecision puesto vuelve applied, no rejected", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "planting_cohort" as const,
        clientDraftId: `d-${Date.now()}`,
        locationId,
        provenanceClass: "direct_observation",
        plantedAt: new Date("2026-03-01T00:00:00.000Z"),
        plantedPrecision: "date",
      },
    ]);
    // Sin el reenvío de `plantedPrecision`, esto cae en `rejected` con
    // `planted_precision_required` — confirmado en rojo antes de escribir el
    // arreglo (ver task-3-report.md, ronda 2).
    expect(r).toMatchObject({ status: "applied" });
  });
});

/**
 * Ronda de arreglo de la revisión final — I1 e I2, que son **el mismo defecto
 * con dos caras**: un dato que el servidor SÍ evaluó y no puede guardar sube
 * como excepción, la ruta contesta **500**, y `clasificarRespuesta(500)`
 * (`lib/sync/offlineQueue.ts:206-212`) devuelve `reintentar`. Esa rama de
 * `syncFieldEvents` (`:275-280`) **no toca ni un borrador** —todos quedan
 * `pending`, `serverUnavailable: true`— y como `:257` vuelve a recoger
 * `pending` y `error` en la tanda siguiente, **el mismo lote regresa para
 * siempre** hasta la purga de los 21 días. Y la pantalla dice
 * `fieldSyncUnavailable`, «el servidor no pudo atender», que es mentira: el
 * servidor corrió y el dato era malo.
 *
 * Medido en el código, no supuesto, y citado por línea a propósito.
 */
describe("un dato malo vuelve como rejected con su razón, no como 500 eterno", () => {
  it("un sampleCode repetido en el mismo sitio es rejected, no una excepción", async () => {
    const sampleCode = `S-dup-${Date.now()}`;
    const [primera] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "soil_sample" as const,
        clientDraftId: `d-dup-a-${Date.now()}`,
        locationId,
        sampleCode,
        sampledAt: new Date(),
        provenanceClass: "direct_observation",
      },
    ]);
    expect(primera).toMatchObject({ status: "applied" });

    // MISMO `sampleCode`, `clientDraftId` DISTINTO: no es la carrera de
    // `client_draft_id` —ésa tiene su propia prueba abajo— sino el índice
    // compuesto `@@unique([locationId, sampleCode])`, que sigue vivo en las dos
    // tablas de muestra. `esCarreraDeClientDraftId` no lo reconoce, y hace bien.
    const [segunda] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "soil_sample" as const,
        clientDraftId: `d-dup-b-${Date.now()}`,
        locationId,
        sampleCode,
        sampledAt: new Date(),
        provenanceClass: "direct_observation",
      },
    ]);
    expect(segunda).toMatchObject({ status: "rejected" });
    expect((segunda as { reason: string }).reason).toContain("sample_code");
    // Control: la razón nombra el índice que chocó, no un genérico. Y la fila
    // buena sigue siendo UNA: el rechazo no escribió nada.
    expect(await prisma.soilSample.count({ where: { locationId, sampleCode } })).toBe(1);
  });

  it("un dataQuality que no existe en el enum es rejected, no 500", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "soil_sample" as const,
        clientDraftId: `d-dq-${Date.now()}`,
        locationId,
        sampleCode: `S-dq-${Date.now()}`,
        sampledAt: new Date(),
        provenanceClass: "direct_observation",
        dataQuality: "regularcillo",
      },
    ]);
    expect(r).toMatchObject({ status: "rejected" });
    expect((r as { reason: string }).reason).toContain("dataQuality");
  });

  it("una provenanceClass que la pantalla no ofrece es rejected, como en el camino con señal", async () => {
    // `ai_suggestion` existe en el enum de la base: sin validar, Postgres la
    // aceptaría y quedaría guardada como si alguien lo hubiera visto. El camino
    // con señal la rechaza con `exigeProcedencia`; éste tiene que hacer lo mismo.
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "soil_sample" as const,
        clientDraftId: `d-prov-${Date.now()}`,
        locationId,
        sampleCode: `S-prov-${Date.now()}`,
        sampledAt: new Date(),
        provenanceClass: "ai_suggestion",
      },
    ]);
    expect(r).toMatchObject({ status: "rejected" });
    expect((r as { reason: string }).reason).toContain("provenance");
  });

  it("un canopyPosition inválido es rejected, no 500", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "foliar_sample" as const,
        clientDraftId: `d-cp-${Date.now()}`,
        locationId,
        sampleCode: `F-cp-${Date.now()}`,
        sampledAt: new Date(),
        provenanceClass: "direct_observation",
        canopyPosition: "en la copa",
      },
    ]);
    expect(r).toMatchObject({ status: "rejected" });
    expect((r as { reason: string }).reason).toContain("canopyPosition");
  });

  it("un plantedPrecision inválido es rejected, no 500", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "planting_cohort" as const,
        clientDraftId: `d-pp-${Date.now()}`,
        locationId,
        provenanceClass: "direct_observation",
        plantedAt: new Date("2026-03-01T00:00:00.000Z"),
        plantedPrecision: "por ahi",
      },
    ]);
    expect(r).toMatchObject({ status: "rejected" });
    expect((r as { reason: string }).reason).toContain("plantedPrecision");
  });

  it("una bandera de anaerobiosis inválida es rejected, no 500", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "soil_profile" as const,
        clientDraftId: `d-mot-${Date.now()}`,
        locationId,
        describedAt: new Date(),
        provenanceClass: "direct_observation",
        mottling: "puede",
      },
    ]);
    expect(r).toMatchObject({ status: "rejected" });
    expect((r as { reason: string }).reason).toContain("mottling");
  });

  /**
   * Control positivo de los seis de arriba: si `aplicarCapturaDeParcela`
   * rechazara cualquier cosa, los seis pasarían igual de verdes. Los valores
   * BUENOS de esos mismos cuatro campos tienen que seguir aplicándose.
   */
  it("está midiendo: los mismos campos con valores válidos SÍ se aplican", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "foliar_sample" as const,
        clientDraftId: `d-ok-enum-${Date.now()}`,
        locationId,
        sampleCode: `F-ok-${Date.now()}`,
        sampledAt: new Date(),
        provenanceClass: "original_record",
        dataQuality: "provisional",
        canopyPosition: "middle",
      },
    ]);
    expect(r).toMatchObject({ status: "applied" });
  });
});

/**
 * IMPORTANTE: dos llamadas concurrentes con el mismo `clientDraftId` pueden
 * pasar las dos el `findUnique` antes de que la primera termine su `create`.
 * La perdedora chocaba contra el índice único con un `P2002` que ninguna de
 * las cuatro clases de error reconocía, así que subía como excepción no
 * controlada en vez de resolver a `duplicate`.
 *
 * `Promise.all` con la MISMA mutación ejerce el camino concurrente de
 * verdad — no es la llamada secuencial de la prueba de arriba. Si la
 * excepción no controlada volviera, esta prueba fallaría con ella (no con un
 * `expect` roto), que es justo la forma en que se descubrió el defecto.
 */
describe("una carrera de push con el mismo clientDraftId no lanza excepción", () => {
  it("de las dos llamadas concurrentes, una aplica y la otra dice duplicate, con UNA sola fila", async () => {
    const draft = `d-race-${Date.now()}`;
    // MISMO `clientDraftId`, `sampleCode` DISTINTO: si las dos llamadas
    // llevaran también el mismo `sampleCode`, la perdedora podría chocar
    // contra `@@unique([locationId, sampleCode])` en vez de contra
    // `client_draft_id` —medido: eso es exactamente lo que pasó al escribir
    // esta prueba, con las dos mutaciones idénticas—, y entonces la prueba no
    // ejercería la carrera que el arreglo cubre.
    const base = {
      kind: "soil_sample" as const,
      clientDraftId: draft,
      locationId,
      sampledAt: new Date(),
      provenanceClass: "direct_observation",
    };
    const [[a], [b]] = await Promise.all([
      pushFieldEvents(userAccountId, deviceId, [{ ...base, sampleCode: `S-race-a-${Date.now()}` }]),
      pushFieldEvents(userAccountId, deviceId, [{ ...base, sampleCode: `S-race-b-${Date.now()}` }]),
    ]);
    expect([a!.status, b!.status].sort()).toEqual(["applied", "duplicate"]);
    expect(await prisma.soilSample.count({ where: { clientDraftId: draft } })).toBe(1);
  });
});

/**
 * Tarea 11 — la revisión de la ronda de trampas, aplicada contra la base.
 * Postgres real, mismos `locationId`/`deviceId`/`userAccountId` del `beforeAll`.
 */
describe("el replay aplica la revisión de trampa y no la duplica", () => {
  it("aplica una vez y la segunda dice duplicate, con UNA sola fila", async () => {
    const trampa = await createTrap(userAccountId, {
      locationId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    trampaIds.push(trampa.id);

    const m: MutacionDeRevisionDeTrampa = {
      kind: "trap_check",
      clientDraftId: `d-trampa-${Date.now()}`,
      locationId,
      specimenId: trampa.id,
      observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos",
    };
    const [primera] = await pushFieldEvents(userAccountId, deviceId, [m]);
    const [segunda] = await pushFieldEvents(userAccountId, deviceId, [m]);
    expect(primera).toMatchObject({ status: "applied" });
    expect(segunda).toMatchObject({ status: "duplicate" });
    expect(await prisma.specimenObservation.count({ where: { clientDraftId: m.clientDraftId } })).toBe(1);
  });

  it("guarda el conteo y los tres tri-estados de mantenimiento que trajo", async () => {
    const trampa = await createTrap(userAccountId, {
      locationId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    trampaIds.push(trampa.id);

    const clientDraftId = `d-trampa-fila-${Date.now()}`;
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "trap_check",
        clientDraftId,
        locationId,
        specimenId: trampa.id,
        observedAt: new Date("2026-09-15"),
        brocaLevel: "muchos",
        captureCount: 12,
        otherInsects: true,
        otherInsectsNote: "avispas",
        cleaned: true,
        liquidChanged: false,
        // `lureRecharged` deliberadamente ausente: "no se preguntó", nunca `false`.
      } satisfies MutacionDeRevisionDeTrampa,
    ]);
    expect(r).toMatchObject({ status: "applied" });

    const fila = await prisma.specimenObservation.findUniqueOrThrow({ where: { clientDraftId } });
    expect(fila.brocaLevel).toBe("muchos");
    expect(fila.captureCount).toBe(12);
    expect(fila.otherInsectsNote).toBe("avispas");
    expect(fila.cleaned).toBe(true);
    expect(fila.liquidChanged).toBe(false); // se preguntó: no se hizo
    expect(fila.lureRecharged).toBeNull();  // ni se mencionó (ADR-080)
  });

  it("un brocaLevel que no existe en el enum es rejected, no 500", async () => {
    const trampa = await createTrap(userAccountId, {
      locationId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    trampaIds.push(trampa.id);

    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "trap_check",
        clientDraftId: `d-broca-${Date.now()}`,
        locationId,
        specimenId: trampa.id,
        observedAt: new Date("2026-09-15"),
        brocaLevel: "un montón",
      } satisfies MutacionDeRevisionDeTrampa,
    ]);
    expect(r).toMatchObject({ status: "rejected" });
    expect((r as { reason: string }).reason).toContain("brocaLevel");
  });
});

/**
 * Tarea 11, ruling del controlador — el camino sin señal aplica la MISMA
 * regla que `recordRoundTrapCheckFormAction` (Tarea 10): procedencia y
 * observador se fijan en el SERVIDOR, nunca desde lo que trae la mutación.
 * Un payload de cola es tan falsificable como un `<input type="hidden">`
 * (SECURITY.md §2), así que aunque la mutación forjada trajera un observador
 * o una procedencia distintos, `aplicarRevisionDeTrampa` los ignora.
 *
 * **Flip-test, corrido durante la implementación (ver task-11-report.md).**
 * Cambiar `observerPersonId: cuenta.personId, provenanceClass:
 * "direct_observation"` por `observerPersonId: (m as unknown as {
 * observerPersonId?: string }).observerPersonId ?? cuenta.personId,
 * provenanceClass: (m as unknown as { provenanceClass?: string
 * }).provenanceClass ?? "direct_observation"` en `aplicarRevisionDeTrampa`
 * (`lib/sync/pushFieldEvents.ts`) hizo caer exactamente la primera prueba de
 * este describe — «un observerPersonId y una provenanceClass forjados en la
 * mutación se ignoran» — con la fila guardando el observador forjado en vez
 * del de la cuenta del dispositivo, y las otras 40 de `parcelaSinSenal.test.ts`
 * siguieron en verde. Restaurado y confirmado de nuevo en verde antes de
 * commitear.
 */
describe("ruling del controlador: procedencia y observador NUNCA salen del payload", () => {
  it("un observerPersonId y una provenanceClass forjados en la mutación se ignoran", async () => {
    const trampa = await createTrap(userAccountId, {
      locationId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    trampaIds.push(trampa.id);

    // Una Person real, DISTINTA de la de la cuenta del dispositivo — no un
    // uuid al azar, para que "se ignoró" no se confunda con "no existía y
    // por eso no se pudo guardar".
    const otraPersona = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Forjado", displayName: `TEST Forjado (${RUN_ID})`, locale: "es" },
    });

    const clientDraftId = `d-forjado-${Date.now()}`;
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "trap_check",
        clientDraftId,
        locationId,
        specimenId: trampa.id,
        observedAt: new Date("2026-09-15"),
        brocaLevel: "pocos",
        // Ninguno de los dos existe en `MutacionDeRevisionDeTrampa`: viajan
        // igual, como los llevaría un payload JSON hostil que el tipo no
        // puede impedir en tiempo de ejecución.
        ...({ observerPersonId: otraPersona.id, provenanceClass: "interpretation" } as Record<string, unknown>),
      } as MutacionDeRevisionDeTrampa,
    ]);
    expect(r).toMatchObject({ status: "applied" });

    const fila = await prisma.specimenObservation.findUniqueOrThrow({ where: { clientDraftId } });
    // Lo que el servidor fijó, no lo que la mutación traía.
    expect(fila.observerPersonId).toBe(personId);
    expect(fila.observerPersonId).not.toBe(otraPersona.id);
    expect(fila.provenanceClass).toBe("direct_observation");

    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: otraPersona.id }) });
  });

  // `UserAccount.personId` es `String` sin `?` en el esquema (línea 159):
  // NOT NULL y `@unique`, así que Prisma no deja crear una cuenta sin
  // persona — «cuenta sin persona vinculada» no es alcanzable con una fila
  // real. La única forma de ejercer la misma guardia
  // (`if (!cuenta?.personId)`) es que `cuenta` sea `null`, es decir, un
  // `userAccountId` que no resuelva a ninguna cuenta — el mismo `if`, la
  // otra mitad de la condición.
  it("con un userAccountId que no resuelve a ninguna cuenta, se rechaza explícito", async () => {
    const trampa = await createTrap(userAccountId, {
      locationId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    trampaIds.push(trampa.id);

    const [r] = await pushFieldEvents(crypto.randomUUID(), deviceId, [
      {
        kind: "trap_check",
        clientDraftId: `d-sin-cuenta-${Date.now()}`,
        locationId,
        specimenId: trampa.id,
        observedAt: new Date("2026-09-15"),
        brocaLevel: "pocos",
      } satisfies MutacionDeRevisionDeTrampa,
    ]);
    expect(r).toMatchObject({ status: "rejected", reason: "observer_self_missing" });
    // Control: no quedó ninguna revisión — un rechazo no escribe nada a
    // medias. Filtrado por `observationType`: `createTrap` ya deja su propia
    // observación `installed` en este mismo `specimenId`.
    expect(
      await prisma.specimenObservation.count({ where: { specimenId: trampa.id, observationType: "trap_check" } }),
    ).toBe(0);
  });
});

/**
 * Tarea 11, fix round 1 (revisión, hallazgo Importante #2) —
 * `restricciones-globales.md`: «las pruebas de cada operación de escritura
 * […] incluyen un caso de denegación». `aplicarRevisionDeTrampa` no tenía
 * ninguna a nivel de push: sólo "sin cuenta" (`observer_self_missing`), que
 * es un rechazo distinto —no llega ni a mirar el acceso—.
 *
 * `crearUsuarioSinAcceso` (mismo helper que ya usa
 * `tests/traceability/traps.test.ts`, "rechaza a un usuario sin acceso a
 * specimen en esa parcela") da una cuenta y una persona REALES, con Farm
 * Operator, pero escopadas a SU PROPIA parcela — no a la de la trampa. Es
 * justo el `locationId` cableado mal (o el descuido de autorización) que el
 * helper existe para ejercer.
 */
describe("aplicarRevisionDeTrampa deniega el acceso a quien no tiene specimen:manage ahí", () => {
  it("una cuenta y persona reales sin acceso a esa parcela: rejected, y ninguna fila", async () => {
    const trampa = await createTrap(userAccountId, {
      locationId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    trampaIds.push(trampa.id);

    const ajeno = await crearUsuarioSinAcceso();
    try {
      const clientDraftId = `d-sin-acceso-${Date.now()}`;
      // Se reutiliza el `deviceId` del `beforeAll`: `pushFieldEvents` sólo
      // comprueba que el APARATO exista y no esté revocado, nunca que sea el
      // mismo que registró la cuenta — así que no hace falta un segundo.
      const [r] = await pushFieldEvents(ajeno.userAccountId, deviceId, [
        {
          kind: "trap_check",
          clientDraftId,
          locationId,
          specimenId: trampa.id,
          observedAt: new Date("2026-09-15"),
          brocaLevel: "pocos",
        } satisfies MutacionDeRevisionDeTrampa,
      ]);
      expect(r).toMatchObject({ status: "rejected" });
      // La razón exacta que `requireTrapAccess` lanza cuando `can()` niega el
      // ámbito — no `observer_self_missing`, que es del guardia anterior y
      // esta prueba no debe poder confundir con éste.
      expect((r as { reason: string }).reason).toBe("no_specimen_access");
      // El control que pide CLAUDE.md: contar la fila por su clientDraftId,
      // no conformarse con el `status` de la respuesta.
      expect(await prisma.specimenObservation.count({ where: { clientDraftId } })).toBe(0);
    } finally {
      await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: ajeno.userAccountId }) });
      await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: ajeno.scopeId }) });
      await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: ajeno.userAccountId }) });
      await prisma.person.deleteMany({ where: assertDefinedWhere({ id: ajeno.personId }) });
      await prisma.location.deleteMany({ where: assertDefinedWhere({ id: ajeno.locationId }) });
      await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: ajeno.organizationId }) });
    }
  });
});

/**
 * A9 fix-final (M2), ruling del controlador — el mismo `clientDraftId`
 * colisionado con OTRA trampa se rechaza, nunca se lee como «ya se aplicó».
 * Antes de este arreglo, `aplicarRevisionDeTrampa` buscaba por
 * `clientDraftId` sin comprobar `specimenId`: un cliente que reenviara la
 * clave de la trampa A al aplicar una mutación de la trampa B habría
 * recibido `duplicate` con el id de la fila de A, y el cliente habría
 * descartado como sincronizado un envío que nunca se guardó bajo esa clave.
 */
describe("aplicarRevisionDeTrampa: la misma clave con otra trampa se rechaza, no se confunde con duplicado", () => {
  it("dos trampas, la misma clave: la segunda es rejected, y B se queda sin fila", async () => {
    const trampaA = await createTrap(userAccountId, {
      locationId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const trampaB = await createTrap(userAccountId, {
      locationId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    trampaIds.push(trampaA.id, trampaB.id);

    const clientDraftId = `d-colision-${Date.now()}`;
    const [primera] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "trap_check", clientDraftId, locationId, specimenId: trampaA.id,
        observedAt: new Date("2026-09-15"), brocaLevel: "pocos",
      } satisfies MutacionDeRevisionDeTrampa,
    ]);
    expect(primera).toMatchObject({ status: "applied" });

    const [segunda] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "trap_check", clientDraftId, locationId, specimenId: trampaB.id,
        observedAt: new Date("2026-09-15"), brocaLevel: "pocos",
      } satisfies MutacionDeRevisionDeTrampa,
    ]);
    expect(segunda).toMatchObject({ status: "rejected", reason: "client_draft_id_used_by_other_specimen" });

    expect(
      await prisma.specimenObservation.count({ where: { specimenId: trampaB.id, observationType: "trap_check" } }),
    ).toBe(0);
    // Control: A sigue con su ÚNICA fila, sin que el intento de B la tocara.
    expect(await prisma.specimenObservation.count({ where: { clientDraftId } })).toBe(1);
  });
});
