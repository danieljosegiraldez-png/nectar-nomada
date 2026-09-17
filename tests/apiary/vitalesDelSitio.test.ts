/**
 * A9.8 — vitales del sitio y las reglas de alerta del Anexo C §1.2.
 *
 * Dos mitades a propósito. Las reglas se prueban sobre la función pura, porque
 * construir un fixture de base por cada una de las cinco convierte el test en
 * algo que nadie vuelve a tocar. La lectura contra Postgres se prueba una vez,
 * de punta a punta, con las tres columnas nuevas de la migración
 * `20260907214500_a9_vitales_del_sitio` — que es lo que ninguna prueba de la
 * función pura puede afirmar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createColony, createHive } from "../../lib/apiary/hives";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { jornadaAbiertaDe, HORAS_DE_JORNADA_VIEJA } from "../../lib/traceability/fieldSessions";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import {
  DIAS_DE_AVISO_DE_ALIMENTO,
  DIAS_DE_GRACIA_DE_VISITA,
  HORAS_DE_BORRADOR_VIEJO,
  alertasDe,
  pesoDeAlerta,
  vitalesDeSitios,
  type VitalesDeSitio,
} from "../../lib/apiary/vitalesDelSitio";

const RUN_ID = `a98-vit-${Date.now()}`;
const MS_POR_DIA = 86_400_000;
const AHORA = new Date("2026-09-07T12:00:00Z");

function sitioSano(): Omit<VitalesDeSitio, "alertas"> {
  return {
    locationId: "x",
    ultimaVisita: new Date(AHORA.getTime() - 3 * MS_POR_DIA),
    diasDesdeUltimaVisita: 3,
    proximaVisita: new Date(AHORA.getTime() + 20 * MS_POR_DIA),
    coloniasVivasDeclaradas: 10,
    fechaDelConteoDeclarado: new Date(AHORA.getTime() - 3 * MS_POR_DIA),
    coloniasActivas: 10,
    cajas: 12,
    // Un sitio sano no tiene recuento declarado de cajas: «sin recuento» es el estado por
    // omisión, y NO «coinciden» (ADR-150). Si este fixture dijera «coinciden», las pruebas de
    // alertas pasarían sobre un sitio que afirma algo que nadie midió.
    cajasComparadas: { declaradas: null, enSistema: 12, estado: "sin_recuento" as const, diferencia: null },
    alimentoHasta: new Date(AHORA.getTime() + 30 * MS_POR_DIA),
    ultimaCosecha: null,
    ultimaCosechaKg: null,
    borradorAbiertoDesde: null,
    // Anexo E §4 — un sitio sano tiene el protocolo al día y ninguna aspersión anunciada.
    // El compilador obligó a declarar los tres al añadirlos a `VitalesDeSitio`, que es
    // exactamente lo que se quería: un campo nuevo no puede colarse sin que este fixture
    // diga qué vale en un sitio sano.
    ultimaConsultaAVecinos: new Date(AHORA.getTime() - 5 * MS_POR_DIA),
    diasHastaConsulta: 25,
    aspersionAnunciadaEn: null,
  };
}

const SIN_NADA = { perdidaSinReposicion: false, alimentoRepuesto: false };

describe("A9.8 — las reglas de alerta", () => {
  it("un sitio sano no alerta — el control positivo de todo lo demás", () => {
    expect(alertasDe(sitioSano(), SIN_NADA, AHORA)).toEqual([]);
  });

  it("una visita vencida dentro de la gracia todavía no es crítica", () => {
    const v = sitioSano();
    v.proximaVisita = new Date(AHORA.getTime() - (DIAS_DE_GRACIA_DE_VISITA - 1) * MS_POR_DIA);
    expect(alertasDe(v, SIN_NADA, AHORA)).toEqual([]);
  });

  it("pasada la gracia, la visita vencida es crítica", () => {
    const v = sitioSano();
    v.proximaVisita = new Date(AHORA.getTime() - (DIAS_DE_GRACIA_DE_VISITA + 1) * MS_POR_DIA);
    expect(alertasDe(v, SIN_NADA, AHORA)).toEqual([{ nivel: "critico", motivo: "visita_vencida" }]);
  });

  it("el alimento vencido es crítico, pero no si ya se repuso", () => {
    const v = sitioSano();
    v.alimentoHasta = new Date(AHORA.getTime() - 2 * MS_POR_DIA);
    expect(alertasDe(v, SIN_NADA, AHORA)).toEqual([{ nivel: "critico", motivo: "alimento_vencido" }]);
    expect(alertasDe(v, { ...SIN_NADA, alimentoRepuesto: true }, AHORA)).toEqual([]);
  });

  it("el alimento por vencer avisa dentro de la ventana y calla fuera de ella", () => {
    const dentro = sitioSano();
    dentro.alimentoHasta = new Date(AHORA.getTime() + (DIAS_DE_AVISO_DE_ALIMENTO - 1) * MS_POR_DIA);
    expect(alertasDe(dentro, SIN_NADA, AHORA)).toEqual([{ nivel: "aviso", motivo: "alimento_por_vencer" }]);

    const fuera = sitioSano();
    fuera.alimentoHasta = new Date(AHORA.getTime() + (DIAS_DE_AVISO_DE_ALIMENTO + 1) * MS_POR_DIA);
    expect(alertasDe(fuera, SIN_NADA, AHORA)).toEqual([]);
  });

  it("CAJAS QUE NO CUADRAN: avisa cuando divergen, y con nivel aviso, no crítico", () => {
    // `aviso` y no `critico` a propósito: la divergencia es AMBIGUA —una caja que se fue, o un
    // recuento mal hecho—. Subir una señal ambigua a crítica enseña a ignorar lo crítico.
    const v = sitioSano();
    v.cajasComparadas = { declaradas: 8, enSistema: 12, estado: "divergen", diferencia: -4 };
    expect(alertasDe(v, SIN_NADA, AHORA)).toEqual([{ nivel: "aviso", motivo: "cajas_no_cuadran" }]);
  });

  it("y avisa igual cuando SOBRAN, no sólo cuando faltan", () => {
    const v = sitioSano();
    v.cajasComparadas = { declaradas: 14, enSistema: 12, estado: "divergen", diferencia: 2 };
    expect(alertasDe(v, SIN_NADA, AHORA)).toEqual([{ nivel: "aviso", motivo: "cajas_no_cuadran" }]);
  });

  it("CONTROL NEGATIVO: sin recuento NO alerta, y coincidir tampoco", () => {
    // Es la mitad que hace falsable lo de arriba. Avisar de «nadie contó» sería avisar de una
    // ausencia que el propio protocolo marca como opcional; y avisar de «coinciden» es ruido.
    const sinRecuento = sitioSano();
    expect(sinRecuento.cajasComparadas.estado).toBe("sin_recuento");
    expect(alertasDe(sinRecuento, SIN_NADA, AHORA)).toEqual([]);

    const cuadran = sitioSano();
    cuadran.cajasComparadas = { declaradas: 12, enSistema: 12, estado: "coinciden", diferencia: 0 };
    expect(alertasDe(cuadran, SIN_NADA, AHORA)).toEqual([]);
  });

  it("un borrador viejo avisa; uno reciente no", () => {
    const viejo = sitioSano();
    viejo.borradorAbiertoDesde = new Date(AHORA.getTime() - (HORAS_DE_BORRADOR_VIEJO + 1) * 3_600_000);
    expect(alertasDe(viejo, SIN_NADA, AHORA)).toEqual([{ nivel: "aviso", motivo: "visita_sin_cerrar" }]);

    const reciente = sitioSano();
    reciente.borradorAbiertoDesde = new Date(AHORA.getTime() - 2 * 3_600_000);
    expect(alertasDe(reciente, SIN_NADA, AHORA)).toEqual([]);
  });

  it("el borde toma su color de la PRIMERA regla — sin aspersión, manda la pérdida", () => {
    // **El comentario que había aquí decía «el Anexo fija que manda la pérdida de
    // colonias», y desde el 2026-09-14 eso sólo es cierto CUANDO NO HAY ASPERSIÓN
    // ANUNCIADA.** Se corrige en vez de dejarlo: un comentario viejo desorienta más que
    // ninguno. El caso con aspersión está en el `it` siguiente.
    const v = sitioSano();
    v.proximaVisita = new Date(AHORA.getTime() - 40 * MS_POR_DIA);
    v.alimentoHasta = new Date(AHORA.getTime() - 5 * MS_POR_DIA);
    v.borradorAbiertoDesde = new Date(AHORA.getTime() - 200 * 3_600_000);
    const alertas = alertasDe(v, { perdidaSinReposicion: true, alimentoRepuesto: false }, AHORA);
    expect(alertas[0]).toEqual({ nivel: "critico", motivo: "perdida_sin_reposicion" });
    expect(alertas.map((a) => a.motivo)).toEqual([
      "perdida_sin_reposicion",
      "visita_vencida",
      "alimento_vencido",
      "visita_sin_cerrar",
    ]);
  });

  it("una aspersión anunciada manda sobre TODO lo demás — decisión del dueño, 2026-09-14", () => {
    // ADR-127 planteó la pregunta y no la resolvió; el dueño la subió al primer puesto.
    // La razón: es la única fecha del tablero que impone alguien de fuera y que **no se
    // puede atender después**. Una pérdida sin reposición ya ocurrió.
    //
    // Este `it` es el sitio nombrado donde aterriza ese veredicto: sin él, «subir la
    // aspersión» sería un cambio que ninguna búsqueda distingue de «no hacerlo».
    const v = sitioSano();
    v.proximaVisita = new Date(AHORA.getTime() - 40 * MS_POR_DIA);
    v.alimentoHasta = new Date(AHORA.getTime() - 5 * MS_POR_DIA);
    v.aspersionAnunciadaEn = new Date(AHORA.getTime() + 3 * MS_POR_DIA);
    const alertas = alertasDe(v, { perdidaSinReposicion: true, alimentoRepuesto: false }, AHORA);
    expect(alertas[0]).toEqual({ nivel: "critico", motivo: "aspersion_anunciada" });
    expect(alertas.map((a) => a.motivo)).toEqual([
      "aspersion_anunciada",
      "perdida_sin_reposicion",
      "visita_vencida",
      "alimento_vencido",
    ]);

    // Y una aspersión que YA PASÓ no adelanta a nada: vuelve a mandar la pérdida.
    v.aspersionAnunciadaEn = new Date(AHORA.getTime() - MS_POR_DIA);
    const pasada = alertasDe(v, { perdidaSinReposicion: true, alimentoRepuesto: false }, AHORA);
    expect(pasada[0]!.motivo).toBe("perdida_sin_reposicion");
  });

  it("un sitio sin medir pesa MENOS urgente que uno con aviso, y no se confunde con sano", () => {
    const sinMedir = { ...sitioSano(), alertas: [] } as VitalesDeSitio;
    const conAviso = { ...sitioSano(), alertas: [{ nivel: "aviso", motivo: "visita_sin_cerrar" }] } as VitalesDeSitio;
    const critico = { ...sitioSano(), alertas: [{ nivel: "critico", motivo: "visita_vencida" }] } as VitalesDeSitio;
    expect(pesoDeAlerta(critico)).toBeLessThan(pesoDeAlerta(conAviso));
    expect(pesoDeAlerta(conAviso)).toBeLessThan(pesoDeAlerta(sinMedir));
  });
});

describe("A9.8 — la lectura contra Postgres", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let personId: string;
  let colonyId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Vitales", displayName: `TEST Vitales (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    const userAccount = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    userAccountId = userAccount.id;

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });

    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `N-${RUN_ID.slice(-4)}` });
    const colony = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    colonyId = colony.id;
  });

  // Cada `where` pasa por `assertDefinedWhere`, que es el idioma del resto de
  // la suite y no un adorno: Prisma DESCARTA en silencio las claves `undefined`,
  // así que un `beforeAll` que falla a mitad convierte
  // `deleteMany({ where: { id: colonyId } })` en un borrado SIN filtro de la
  // tabla entera — sobre la base COMPARTIDA del puerto 55433, que usan las
  // demás sesiones. Escribí este bloque sin el ayudante, un enum mal puesto
  // rompió el `beforeAll`, y la limpieza se llevó la colmena, la colonia y el
  // evento que traía el restore. El ayudante lanza en vez de borrar.
  afterAll(async () => {
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: colonyId }) });
    // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
    // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    // Assignment.scopeId es RESTRICT: el Scope sólo se puede borrar después.
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("un sitio sin visitas dice «sin registro», no cero", async () => {
    const v = (await vitalesDeSitios([locationId], AHORA)).get(locationId)!;
    expect(v.ultimaVisita).toBeNull();
    expect(v.diasDesdeUltimaVisita).toBeNull();
    expect(v.proximaVisita).toBeNull();
    expect(v.coloniasVivasDeclaradas).toBeNull();
    // Y a la vez sabe lo que sí tiene fila: la colonia existe.
    expect(v.coloniasActivas).toBe(1);
    expect(v.cajas).toBe(1);
  });

  it("lee las tres columnas nuevas y alerta con ellas", async () => {
    await prisma.fieldSession.create({
      data: {
        locationId,
        operatorPersonId: personId,
        startedAt: new Date(AHORA.getTime() - 30 * MS_POR_DIA),
        status: "completed",
        completedAt: new Date(AHORA.getTime() - 30 * MS_POR_DIA),
        // Vencida hace 25 días: más allá de los 14 de gracia.
        nextVisitDueAt: new Date(AHORA.getTime() - 25 * MS_POR_DIA),
        coloniesAliveCount: 8,
        provenanceClass: "original_record",
      },
    });
    await recordColonyEvent(userAccountId, {
      colonyId,
      eventType: "feeding",
      occurredAt: new Date(AHORA.getTime() - 30 * MS_POR_DIA),
      feedingMaterial: "jarabe 1:1",
      coverageUntil: new Date(AHORA.getTime() - 10 * MS_POR_DIA),
    });

    const v = (await vitalesDeSitios([locationId], AHORA)).get(locationId)!;
    expect(v.coloniasVivasDeclaradas).toBe(8);
    expect(v.proximaVisita).not.toBeNull();
    expect(v.alimentoHasta).not.toBeNull();
    expect(v.alertas.map((a) => a.motivo)).toEqual(["visita_vencida", "alimento_vencido"]);
  });

  it("`coverageUntil` sólo se guarda en una alimentación", async () => {
    const tratamiento = await recordColonyEvent(userAccountId, {
      colonyId,
      eventType: "treatment",
      treatmentTarget: "varroa",
      treatmentProduct: "Apivar",
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
      treatmentWithdrawalDays: 14,
      coverageUntil: new Date(AHORA.getTime() + 90 * MS_POR_DIA),
    });
    expect(tratamiento.coverageUntil).toBeNull();
  });

  /**
   * Anexo E §5 — «Una jornada abierta es visible en todas las pantallas hasta que se
   * cierra», y «si lleva más de un día abierta, la app lo reclama».
   *
   * **El umbral bajó de 72 h a 24 h el 2026-09-14**, por las palabras del dueño. Tres días
   * de gracia convertían «la app lo reclama» en «lo reclama pasado mañana», y la jornada
   * del 13 de septiembre que él nombró seguía sin reclamarse por eso.
   */
  it("la jornada abierta se encuentra sin saber el sitio, y a más de un día se RECLAMA", async () => {
    // Nada abierto: no hay nada que reclamar, y eso no es un error.
    expect(await jornadaAbiertaDe(userAccountId, AHORA)).toBeNull();

    const deHoy = await prisma.fieldSession.create({
      data: {
        locationId, operatorPersonId: personId, createdBy: userAccountId,
        startedAt: new Date(AHORA.getTime() - 3 * 3_600_000),
        status: "draft", provenanceClass: "original_record",
      },
    });
    const hoy = await jornadaAbiertaDe(userAccountId, AHORA);
    expect(hoy?.fieldSessionId).toBe(deHoy.id);
    expect(hoy?.diasAbierta, "tres horas no son un día").toBe(0);
    expect(hoy?.reclamable, "una de hoy se recuerda, no se reclama").toBe(false);
    // Y trae el nombre del sitio, que es lo que el banner necesita para decir dónde.
    expect(hoy?.sitio).toContain("TEST");

    // Justo en el borde del umbral: todavía no.
    await prisma.fieldSession.update({
      where: { id: deHoy.id },
      data: { startedAt: new Date(AHORA.getTime() - HORAS_DE_JORNADA_VIEJA * 3_600_000) },
    });
    expect((await jornadaAbiertaDe(userAccountId, AHORA))?.reclamable, "en el borde exacto todavía no").toBe(false);

    // Un minuto más allá: sí.
    await prisma.fieldSession.update({
      where: { id: deHoy.id },
      data: { startedAt: new Date(AHORA.getTime() - HORAS_DE_JORNADA_VIEJA * 3_600_000 - 60_000) },
    });
    const vieja = await jornadaAbiertaDe(userAccountId, AHORA);
    expect(vieja?.reclamable).toBe(true);
    expect(vieja?.diasAbierta).toBe(1);

    // CONTROL: una jornada CERRADA no se reclama, aunque sea antigua.
    await prisma.fieldSession.update({
      where: { id: deHoy.id },
      data: { status: "completed", completedAt: AHORA, endedAt: AHORA },
    });
    expect(await jornadaAbiertaDe(userAccountId, AHORA)).toBeNull();

    // CONTROL QUE DISCRIMINA: otra cuenta con su PROPIA jornada abierta en el mismo sitio.
    // Un UUID inventado no serviría —cualquier filtro devuelve vacío para quien no existe—;
    // lo que hay que probar es que dos jornadas reales no se confunden. Es lo que hace a
    // este lector «acotado por construcción» y por lo que no necesita guardia.
    await prisma.fieldSession.update({
      where: { id: deHoy.id },
      data: { status: "draft", completedAt: null, endedAt: null },
    });
    const otraPersona = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Otra", displayName: `TEST Otra (${RUN_ID})`, locale: "es" },
    });
    const otraCuenta = await prisma.userAccount.create({
      data: { personId: otraPersona.id, authProvider: "credentials", status: "active" },
    });
    const suya = await prisma.fieldSession.create({
      data: {
        locationId, operatorPersonId: otraPersona.id, createdBy: otraCuenta.id,
        startedAt: new Date(AHORA.getTime() - 2 * 3_600_000),
        status: "draft", provenanceClass: "original_record",
      },
    });
    expect((await jornadaAbiertaDe(otraCuenta.id, AHORA))?.fieldSessionId, "cada cuenta ve la suya").toBe(suya.id);
    expect((await jornadaAbiertaDe(userAccountId, AHORA))?.fieldSessionId, "y no la de la otra").toBe(deHoy.id);

    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: [deHoy.id, suya.id] } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: otraCuenta.id }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: otraPersona.id }) });
  });
});
