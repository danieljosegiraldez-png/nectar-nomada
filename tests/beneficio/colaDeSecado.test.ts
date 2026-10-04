/**
 * La cola de secado: qué dice cada unidad y en qué orden.
 *
 * **Lo que estas pruebas existen para impedir** (2026-09-27). `lib/traceability/ritmo.ts` calculaba
 * demora, lecturas debidas y puntaje de urgencia desde el 2026-09-13, y sus únicos consumidores eran
 * sus propias pruebas: la cola estaba calculada y sin pintar. El riesgo al conectarla no es que no
 * funcione, es que **diga algo tranquilizador sin haberlo medido** — «al día» sobre un lote cuya
 * receta nadie declaró.
 *
 * Grupo `base-sembrada`: necesita base, así que va en `scripts/pruebas-por-compuerta.txt` y no en el
 * carril hermético.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { colaDeSecado, estadoDeUnidad, urgenciaDeUnidad } from "../../lib/beneficio/colaDeSecado";
import { fichaDeUnidad, interpretarReferencia } from "../../lib/beneficio/fichaDeUnidad";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `cola-${Date.now()}`;
const nombre = (etiqueta: string) => `TEST ${etiqueta} (${RUN})`;

const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = [];
const lotIds: string[] = [];
const runIds: string[] = [];
const transformationIds: string[] = [];
const recipeIds: string[] = [];
const processIds: string[] = [];
const catalogValueIds: string[] = [];

let operario: string;
let cuarto: string, cama1: string, cama2: string;
let ahora: Date;

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
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
}

async function lugar(etiqueta: string, tipo: string, extra: Record<string, unknown> = {}) {
  const l = await prisma.location.create({
    data: { name: nombre(etiqueta), locationType: tipo as never, classification: "internal", status: "approved", ...extra },
  });
  locationIds.push(l.id);
  return l.id;
}

/** Un valor de catálogo propio de esta corrida, para no tocar vocabulario de verdad. */
async function valorDeCatalogo(catalogKey: string, valor: string) {
  const catalog = await prisma.variableCatalog.upsert({
    where: { key: catalogKey },
    update: {},
    create: { key: catalogKey, name: catalogKey },
  });
  const v = await prisma.variableCatalogValue.create({ data: { catalogId: catalog.id, value: `${valor} ${RUN}` } });
  catalogValueIds.push(v.id);
  return v.id;
}

/**
 * Un lote secándose en una cama, con su corrida abierta y —si se pide— su receta con fase de secado.
 * Devuelve lo que la prueba necesita citar.
 */
async function loteEnCama(input: {
  etiqueta: string;
  cama: string;
  iniciadoHaceHoras: number;
  ritmo?: { expectedHours?: number; turnEveryHours?: number; humedadMin?: number; humedadMax?: number };
  volteoHaceHoras?: number;
  humedadPct?: number;
}) {
  const lot = await prisma.lot.create({
    data: {
      lotCode: `${input.etiqueta}-${RUN}`,
      lotType: "parchment",
      organizationId: orgIds[0]!,
      locationId: cuarto,
      status: "approved",
      classification: "internal",
    },
  });
  lotIds.push(lot.id);

  let lotProcessId: string | null = null;
  if (input.ritmo) {
    const recipe = await prisma.processRecipe.create({
      data: {
        name: `${input.etiqueta} receta ${RUN}`,
        organizationId: orgIds[0]!,
        status: "approved",
        versions: {
          create: {
            version: 1,
            status: "approved",
            fases: {
              create: [
                {
                  phase: "drying",
                  expectedHours: input.ritmo.expectedHours ?? null,
                  turnEveryHours: input.ritmo.turnEveryHours ?? null,
                  targetMoistureMinPct: input.ritmo.humedadMin ?? null,
                  targetMoistureMaxPct: input.ritmo.humedadMax ?? null,
                },
              ],
            },
          },
        },
      },
      include: { versions: true },
    });
    recipeIds.push(recipe.id);
    const proceso = await prisma.lotProcess.create({
      data: {
        lotId: lot.id,
        sequenceOrder: 1,
        intent: `secado ${RUN}`,
        processGradeValueId: await valorDeCatalogo("grado_proceso", "Lavado"),
        cherryStateValueId: await valorDeCatalogo("estado_cereza", "despulpada"),
        targetMoisturePct: 11,
        startedAt: haceHoras(input.iniciadoHaceHoras),
        provenanceClass: "original_record",
        processRecipeVersionId: recipe.versions[0]!.id,
      },
    });
    processIds.push(proceso.id);
    lotProcessId = proceso.id;
  }

  const corrida = await prisma.dryingRun.create({
    data: {
      startedAt: haceHoras(input.iniciadoHaceHoras),
      dryingBedLocationId: input.cama,
      locationId: cuarto,
      // `DryingRun` NO tiene `provenanceClass`: la procedencia vive en la transformación que la abre.
      // Lo dijo una sonda, no el mensaje de error, que marcaba la línea de al lado.
      lotProcessId,
    },
  });
  runIds.push(corrida.id);

  const t = await prisma.lotTransformation.create({
    data: {
      transformationType: "stage_change",
      occurredAt: haceHoras(input.iniciadoHaceHoras),
      provenanceClass: "original_record",
      dryingRunId: corrida.id,
      inputs: { create: [{ lotId: lot.id, quantity: 60, unit: "kg" }] },
    },
  });
  transformationIds.push(t.id);

  if (input.volteoHaceHoras != null) {
    await prisma.dryingTurnEvent.create({
      data: { dryingRunId: corrida.id, eventType: "turned", occurredAt: haceHoras(input.volteoHaceHoras) },
    });
  }
  if (input.humedadPct != null) {
    await prisma.measurement.create({
      data: {
        variable: "moisture",
        value: input.humedadPct,
        unit: "%",
        occurredAt: haceHoras(Math.max(0, input.iniciadoHaceHoras - 1)),
        lotId: lot.id,
        provenanceClass: "measured_fact",
      },
    });
  }

  return { lotId: lot.id, lotCode: lot.lotCode, dryingRunId: corrida.id };
}

beforeAll(async () => {
  ahora = new Date();
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("Finca"), status: "approved", classification: "internal" },
  });
  orgIds.push(org.id);

  const finca = await lugar("Finca", "site", { organizationId: org.id });
  cuarto = await lugar("Cuarto", "drying_facility", { parentLocationId: finca });
  cama1 = await lugar("Cama 1", "drying_bed", { parentLocationId: cuarto });
  cama2 = await lugar("Cama 2", "drying_bed", { parentLocationId: cuarto });

  // Farm Operator de SU finca, no Platform Admin: con ámbito de plataforma la cola vería la base
  // entera y estas cuentas serían las de todas las sesiones (la trampa del CLAUDE.md, 2026-09-17).
  operario = await cuenta("Operario");
  await asignar(operario, "Farm Operator", finca);
}, 60_000);

afterAll(async () => {
  await prisma.dryingTurnEvent.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: runIds } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformationIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformationIds } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: runIds } }) });
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ id: { in: processIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  await prisma.processRecipeVersion.deleteMany({ where: assertDefinedWhere({ recipeId: { in: recipeIds } }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recipeIds } }) });
  await prisma.variableCatalogValue.deleteMany({ where: assertDefinedWhere({ id: { in: catalogValueIds } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: accountIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: accountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: accountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgIds } }) });
}, 60_000);

describe("la cola de secado", () => {
  it("agrupa por área y sólo trae corridas abiertas del ámbito de quien mira", async () => {
    const conRitmo = await loteEnCama({
      etiqueta: "LOTE-A",
      cama: cama1,
      iniciadoHaceHoras: 50,
      ritmo: { expectedHours: 192, turnEveryHours: 4, humedadMin: 9, humedadMax: 12 },
      volteoHaceHoras: 19,
      humedadPct: 14,
    });

    const cola = await colaDeSecado(operario, ahora);

    expect(cola.sinAmbito).toBe(false);
    const area = cola.areas.find((a) => a.locationId === cuarto);
    expect(area, "el cuarto de secado no aparece como área").toBeDefined();
    const unidad = area!.unidades.find((u) => u.lotId === conRitmo.lotId);
    expect(unidad, "el lote en la cama no aparece en su área").toBeDefined();
    expect(unidad!.tipo).toBe("cama");
    expect(unidad!.lotCode).toBe(conRitmo.lotCode);
    // 19 h sin voltear con un ritmo de 4 h: le toca, y lo dice con esa palabra.
    expect(unidad!.estado).toBe("le toca volteo");
    expect(unidad!.ritmo.turnEveryHours).toBe(4);
  });

  it("un lote sin receta declarada NO dice «al día»", async () => {
    const sinRitmo = await loteEnCama({ etiqueta: "LOTE-B", cama: cama2, iniciadoHaceHoras: 30 });

    const cola = await colaDeSecado(operario, ahora);
    const unidad = cola.areas.flatMap((a) => a.unidades).find((u) => u.lotId === sinRitmo.lotId);

    expect(unidad, "el lote sin receta desapareció de la cola").toBeDefined();
    // La regla de la casa: ausencia no es cero. `ritmo.ts` devuelve `demora: null` —«no se sabe»— y
    // la fila tiene que decirlo con palabras en vez de parecer puntual.
    expect(unidad!.estado).toBe("sin receta declarada");
    expect(unidad!.ritmoDelLote.demora).toBeNull();
  });

  /**
   * Parte 1, R7 (tarea 9, 2026-10-02). La cola busca el proceso HACIA ARRIBA por el linaje, no por la FK de la corrida: una
   * corrida de antes de la Parte 1 no está unida (`lotProcessId` nulo, R9), y el secado ocurre en un HIJO del lote donde vive
   * el proceso. Y con un proceso CON receta que no declara fase de secado, la etiqueta no es «sin receta»: lo sería mentir.
   */
  it("ve el proceso del ancestro aunque la corrida no esté unida, y con receta sin fase de secado dice «receta sin ritmo de secado»", async () => {
    const crear = (codigo: string, lotType: "cherry" | "parchment") =>
      prisma.lot.create({ data: { lotCode: `${codigo}-${RUN}`, lotType, organizationId: orgIds[0]!, locationId: cuarto, status: "approved", classification: "internal" } });
    const padre = await crear("LOTE-PADRE", "cherry");
    const hijo = await crear("LOTE-HIJO", "parchment");
    lotIds.push(padre.id, hijo.id);
    const enlace = await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: haceHoras(20), provenanceClass: "original_record",
      inputs: { create: [{ lotId: padre.id }] }, outputs: { create: [{ lotId: hijo.id }] },
    } });
    transformationIds.push(enlace.id);
    // Una receta con versión y SIN fase de secado: hay receta, no hay ritmo.
    const receta = await prisma.processRecipe.create({
      data: { name: `SIN-RITMO receta ${RUN}`, organizationId: orgIds[0]!, status: "approved", versions: { create: { version: 1, status: "approved" } } },
      include: { versions: true },
    });
    recipeIds.push(receta.id);
    const grado = await valorDeCatalogo("grado_proceso", "Natural");
    const proceso = await prisma.lotProcess.create({ data: {
      lotId: padre.id, sequenceOrder: 1, intent: `secado ${RUN}`, processGradeValueId: grado,
      cherryStateValueId: await valorDeCatalogo("estado_cereza", "entera"), targetMoisturePct: 11, startedAt: haceHoras(30),
      provenanceClass: "original_record", processRecipeVersionId: receta.versions[0]!.id,
    } });
    processIds.push(proceso.id);
    // La corrida, sobre el HIJO y sin `lotProcessId`.
    const corrida = await prisma.dryingRun.create({ data: { startedAt: haceHoras(5), locationId: cuarto } });
    runIds.push(corrida.id);
    const t = await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: haceHoras(5), provenanceClass: "original_record",
      dryingRunId: corrida.id, inputs: { create: [{ lotId: hijo.id, quantity: 20, unit: "kg" }] },
    } });
    transformationIds.push(t.id);

    const cola = await colaDeSecado(operario, ahora);
    const unidad = cola.areas.flatMap((a) => a.unidades).find((u) => u.lotId === hijo.id);
    expect(unidad, "la corrida del hijo no aparece en la cola").toBeDefined();
    expect(unidad!.proceso, "la cola no vio el proceso que vive en el padre").toBe(`Natural ${RUN}`);
    expect(unidad!.estado).toBe("receta sin ritmo de secado");
  });

  /**
   * Tarea 9, ronda de arreglo 1 (2026-10-02). Las dos etiquetas de «no hay ritmo» las separa la RECETA del proceso que cubre
   * al lote, no que haya proceso: un proceso abierto «Sin receta» cubre al lote y no tiene receta que declare nada. Hasta esta
   * prueba sólo se contrastaba «proceso con receta» contra «sin proceso», y una regla que mirara si hay proceso pasaba igual
   * (lo cazó la revisión). Las dos corridas van sin cama: la cola las enseña como `corrida`.
   */
  it("un proceso abierto SIN receta dice «sin receta declarada»; uno CON receta sin fase de secado, «receta sin ritmo de secado»", async () => {
    const conProceso = async (codigo: string, grado: string, processRecipeVersionId: string | null) => {
      const lot = await prisma.lot.create({ data: {
        lotCode: `${codigo}-${RUN}`, lotType: "parchment", organizationId: orgIds[0]!, locationId: cuarto, status: "approved", classification: "internal",
      } });
      lotIds.push(lot.id);
      const proceso = await prisma.lotProcess.create({ data: {
        lotId: lot.id, sequenceOrder: 1, intent: `secado ${RUN}`, processGradeValueId: await valorDeCatalogo("grado_proceso", grado),
        cherryStateValueId: await valorDeCatalogo("estado_cereza", `${grado} cereza`), targetMoisturePct: 11, startedAt: haceHoras(30),
        provenanceClass: "original_record", processRecipeVersionId,
      } });
      processIds.push(proceso.id);
      const corrida = await prisma.dryingRun.create({ data: { startedAt: haceHoras(4), locationId: cuarto, lotProcessId: proceso.id } });
      runIds.push(corrida.id);
      const t = await prisma.lotTransformation.create({ data: {
        transformationType: "stage_change", occurredAt: haceHoras(4), provenanceClass: "original_record",
        dryingRunId: corrida.id, inputs: { create: [{ lotId: lot.id, quantity: 20, unit: "kg" }] },
      } });
      transformationIds.push(t.id);
      return lot.id;
    };
    const sinReceta = await conProceso("PROC-SIN-RECETA", "SinReceta", null);
    const receta = await prisma.processRecipe.create({
      data: { name: `SIN-SECADO receta ${RUN}`, organizationId: orgIds[0]!, status: "approved", versions: { create: { version: 1, status: "approved" } } },
      include: { versions: true },
    });
    recipeIds.push(receta.id);
    const conReceta = await conProceso("PROC-RECETA-SIN-SECADO", "ConReceta", receta.versions[0]!.id);

    const unidades = (await colaDeSecado(operario, ahora)).areas.flatMap((a) => a.unidades);
    const deSinReceta = unidades.find((u) => u.lotId === sinReceta);
    expect(deSinReceta, "la corrida del proceso sin receta no aparece en la cola").toBeDefined();
    // Control: la cola VIO el proceso —su grado sale—, así que «sin receta» aquí no es «sin proceso».
    expect(deSinReceta!.proceso, "la cola no vio el proceso sin receta").toBe(`SinReceta ${RUN}`);
    expect(deSinReceta!.estado, "un proceso sin receta no tiene receta sin ritmo: no tiene receta").toBe("sin receta declarada");
    const deConReceta = unidades.find((u) => u.lotId === conReceta);
    expect(deConReceta, "la corrida del proceso con receta no aparece en la cola").toBeDefined();
    expect(deConReceta!.estado).toBe("receta sin ritmo de secado");
  });

  /**
   * Tarea 9, ronda de arreglo 1 (2026-10-02). Diseño R1: «las pantallas atrapan lineage_too_deep y lo dicen». La cola recorre el
   * resolvedor corrida por corrida, y un solo lote con más de 64 generaciones tumbaba la página ENTERA para todos (un 500). Ahora
   * esa fila lo dice y las demás salen. 66 lotes, cada uno hijo del anterior y ninguno con proceso: desde el último, el
   * resolvedor sube 65 generaciones y lanza. La ficha de la unidad lee la cola, así que sale con ella.
   */
  it("un lote con más de 64 generaciones no tumba la cola: su fila dice «linaje demasiado hondo» y las demás salen", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 66; i++) {
      const l = await prisma.lot.create({ data: {
        lotCode: `HONDO${i}-${RUN}`, lotType: "parchment", organizationId: orgIds[0]!, locationId: cuarto, status: "approved", classification: "internal",
      } });
      lotIds.push(l.id);
      ids.push(l.id);
    }
    for (let i = 1; i < ids.length; i++) {
      const t = await prisma.lotTransformation.create({ data: {
        transformationType: "stage_change", occurredAt: haceHoras(40), provenanceClass: "original_record",
        inputs: { create: [{ lotId: ids[i - 1]! }] }, outputs: { create: [{ lotId: ids[i]! }] },
      } });
      transformationIds.push(t.id);
    }
    // Dos corridas sin cama: la del lote hondo y una normal, que tiene que seguir saliendo.
    const corridaSobre = async (lotId: string) => {
      const corrida = await prisma.dryingRun.create({ data: { startedAt: haceHoras(3), locationId: cuarto } });
      runIds.push(corrida.id);
      const t = await prisma.lotTransformation.create({ data: {
        transformationType: "stage_change", occurredAt: haceHoras(3), provenanceClass: "original_record",
        dryingRunId: corrida.id, inputs: { create: [{ lotId, quantity: 20, unit: "kg" }] },
      } });
      transformationIds.push(t.id);
    };
    const hondo = ids[ids.length - 1]!;
    await corridaSobre(hondo);
    const normal = await prisma.lot.create({ data: {
      lotCode: `LOTE-NORMAL-JUNTO-AL-HONDO-${RUN}`, lotType: "parchment", organizationId: orgIds[0]!, locationId: cuarto, status: "approved", classification: "internal",
    } });
    lotIds.push(normal.id);
    await corridaSobre(normal.id);

    const unidades = (await colaDeSecado(operario, ahora)).areas.flatMap((a) => a.unidades);
    const deHondo = unidades.find((u) => u.lotId === hondo);
    expect(deHondo, "la corrida del lote hondo desapareció de la cola").toBeDefined();
    expect(deHondo!.estado).toBe("linaje demasiado hondo");
    expect(deHondo!.proceso, "sin poder resolver el proceso no hay grado que enseñar").toBeNull();
    const deNormal = unidades.find((u) => u.lotId === normal.id);
    expect(deNormal, "la fila normal no salió junto a la honda").toBeDefined();
    expect(deNormal!.estado).toBe("sin receta declarada");

    // La ficha de la unidad lee la cola: sale, y dice lo mismo.
    const ficha = await fichaDeUnidad(operario, deHondo!.clave, ahora);
    expect(ficha?.unidad.estado).toBe("linaje demasiado hondo");
  }, 120_000);

  it("ordena lo más urgente arriba", async () => {
    const cola = await colaDeSecado(operario, ahora);
    const unidades = cola.areas.flatMap((a) => a.unidades);
    expect(unidades.length, "hacen falta al menos dos unidades para que el orden signifique algo").toBeGreaterThanOrEqual(2);

    const urgencias = cola.areas.flatMap((a) => a.unidades.map((u) => u.urgencia));
    const ordenadas = [...urgencias].sort((x, y) => y - x);
    expect(urgencias).toEqual(ordenadas);
  });

  /**
   * **Medido contra la base de demostración el 2026-09-29, y era un defecto mío.** Una corrida en
   * BANDEJAS no tiene cama y puede no tener `locationId`, así que agrupaba bajo «Sin área»: cuatro
   * zarandas con café y ninguna área que las contuviera. El área se resuelve subiendo por los padres
   * desde la cama, el lugar de la corrida o el del lote, y si no hay cuarto arriba se usa el lugar
   * más concreto CON SU NOMBRE — agrupar bajo «Sin área» esconde el café en vez de ubicarlo.
   */
  it("una corrida en bandejas sin lugar propio encuentra su área por el lote", async () => {
    const lot = await prisma.lot.create({
      data: {
        lotCode: `LOTE-EN-ZARANDA-${RUN}`,
        lotType: "parchment",
        organizationId: orgIds[0]!,
        locationId: cuarto,
        status: "approved",
        classification: "internal",
      },
    });
    lotIds.push(lot.id);
    // Sin cama y sin `locationId`: exactamente la forma que producía «Sin área».
    const corrida = await prisma.dryingRun.create({ data: { startedAt: haceHoras(10) } });
    runIds.push(corrida.id);
    const t = await prisma.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt: haceHoras(10),
        provenanceClass: "original_record",
        dryingRunId: corrida.id,
        inputs: { create: [{ lotId: lot.id, quantity: 20, unit: "kg" }] },
      },
    });
    transformationIds.push(t.id);

    const cola = await colaDeSecado(operario, ahora);
    // Se busca por SU unidad, no por el cuarto: el cuarto ya existe como área por los otros lotes,
    // así que buscarlo pasaría igual aunque esta corrida cayera en «Sin área» (medido: el flip-test
    // no discriminaba hasta escribirlo así).
    const suArea = cola.areas.find((a) => a.unidades.some((u) => u.lotId === lot.id));
    expect(suArea, "la corrida en bandejas no aparece en ninguna área").toBeDefined();
    expect(suArea!.locationId, "no encontró el cuarto subiendo desde el lote").toBe(cuarto);
    expect(suArea!.nombre).not.toBe("Sin área");
  });

  it("quien no tiene ámbito recibe «sin ámbito», no una cola vacía", async () => {
    const forastero = await cuenta("Forastero");
    const cola = await colaDeSecado(forastero, ahora);

    // Sin esto, una cuenta recién dada de alta leería «el beneficio no tiene café secándose».
    expect(cola.sinAmbito).toBe(true);
    expect(cola.areas).toEqual([]);
  });
});

/**
 * Las dos funciones puras, con las entradas hostiles que la base no produce fácilmente. Es lo que
 * permite probar el criterio sin montar seis corridas — y lo que `ritmo.ts` hizo bien desde el día
 * uno: la lógica separada de la consulta.
 */
describe("el criterio, en aislamiento", () => {
  const ritmo = { expectedHours: 192, turnEveryHours: 4, humedadMinPct: 9, humedadMaxPct: 12 };

  it("dentro del rango está «listo», aunque le toque volteo", () => {
    expect(estadoDeUnidad({ ritmo, horasSinVoltear: 99, demora: true, debidas: 3, humedadPct: 10.5, tieneReceta: true })).toBe("listo");
  });

  it("a dos puntos del máximo está «cerca del objetivo»", () => {
    expect(estadoDeUnidad({ ritmo, horasSinVoltear: 1, demora: false, debidas: 0, humedadPct: 13.5, tieneReceta: true })).toBe("cerca del objetivo");
  });

  it("pasarse de seco pesa más que cualquier volteo vencido", () => {
    const pasado = urgenciaDeUnidad({ base: 0, ritmo, horasSinVoltear: 0, humedadPct: 8 });
    const volteoVencido = urgenciaDeUnidad({ base: 0, ritmo, horasSinVoltear: 8, humedadPct: 20 });
    expect(pasado).toBeGreaterThan(volteoVencido);
  });

  it("con receta pero sin ritmo de secado, la cola lo dice así y no «sin receta»", () => {
    const ritmo = { expectedHours: null, turnEveryHours: null, humedadMinPct: null, humedadMaxPct: null };
    const base = { ritmo, horasSinVoltear: null, demora: null, debidas: 0, humedadPct: null };
    expect(estadoDeUnidad({ ...base, tieneReceta: true })).toBe("receta sin ritmo de secado");
    expect(estadoDeUnidad({ ...base, tieneReceta: false })).toBe("sin receta declarada");
  });

  it("tres volteos vencidos pesan más que uno", () => {
    const uno = urgenciaDeUnidad({ base: 0, ritmo, horasSinVoltear: 5, humedadPct: null });
    const tres = urgenciaDeUnidad({ base: 0, ritmo, horasSinVoltear: 13, humedadPct: null });
    expect(tres).toBeGreaterThan(uno);
  });
});

/**
 * La ficha de una unidad (§B.3). Lo que se prueba aquí NO es que pinte bien: es que su
 * autorización **venga de la cola** y que no haya un segundo camino que pueda divergir.
 */
describe("la ficha de una unidad", () => {
  it("interpreta las dos formas de nombrar una unidad, y rechaza lo que no lo es", () => {
    expect(interpretarReferencia("B-001")).toEqual({ tipo: "bandeja", numero: "B-001" });
    // Minúsculas también: es lo que sale de teclear deprisa con una mano.
    expect(interpretarReferencia("b-007")).toEqual({ tipo: "bandeja", numero: "B-007" });
    const id = "11111111-2222-3333-4444-555555555555";
    expect(interpretarReferencia(id)).toEqual({ tipo: "cama", locationId: id });
    expect(interpretarReferencia(`cama:${id}`)).toEqual({ tipo: "cama", locationId: id });
    expect(interpretarReferencia(`corrida:${id}`)).toEqual({ tipo: "corrida", dryingRunId: id });
    // Y el control negativo, sin el cual lo de arriba sólo dice que acepta cosas:
    expect(interpretarReferencia("no-soy-una-unidad")).toBeNull();
    expect(interpretarReferencia("B-1")).toBeNull();
    expect(interpretarReferencia("")).toBeNull();
  });

  it("devuelve la unidad a quien la tiene en su cola, y NADA a quien no", async () => {
    const cola = await colaDeSecado(operario, ahora);
    const primera = cola.areas[0]?.unidades[0];
    expect(primera, "el fixture tiene que dar al menos una unidad, o esto no mide nada").toBeDefined();

    const ficha = await fichaDeUnidad(operario, primera!.clave, ahora);
    expect(ficha, "la unidad de su propia cola").not.toBeNull();
    expect(ficha!.unidad.clave).toBe(primera!.clave);
    expect(ficha!.unidad.lotCode).toBe(primera!.lotCode);

    // **El control que le da sentido**: una cuenta sin ámbito no la ve. Sin esta mitad, «la
    // devuelve» no distingue una ficha correcta de una que enseña cualquier unidad a cualquiera.
    const forastero = await cuenta("Forastero");
    expect(await fichaDeUnidad(forastero, primera!.clave, ahora), "sin ámbito, nada").toBeNull();
  });
});
