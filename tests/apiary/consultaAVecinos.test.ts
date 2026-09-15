/**
 * La consulta mensual a las fincas vecinas — y la prueba de que los `CHECK` son reales.
 *
 * **Lo que este archivo sostiene, y es la razón de la rebanada.** El Anexo E §4 pide un
 * protocolo mensual que «el sistema reclama solo». Lo que hacía falta no era una pantalla:
 * medido el 2026-09-14, no había **nada** —cero coincidencias de
 * `vecin|neighbour|aspersi|spray` en el esquema y en `lib/apiary/`, con
 * `carencia|Withdrawal` dando diez como control positivo—. Lo único registrable era la
 * **consecuencia**: «Intoxicación por agroquímicos» como causa de pérdida de colonia.
 *
 * **Las dos invariantes están en la BASE y aquí se comprueba que el servicio las nombra.**
 * Los `CHECK` de `neighbour_consultation` protegen a la tabla de un importador o de SQL
 * directo; el servicio las repite para devolver un error de dominio en vez de uno de
 * Postgres. Que los `CHECK` disparan de verdad se midió con `SAVEPOINT` —tres rechazos y
 * dos aceptaciones, con control positivo— y está en ADR-127.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, ApiaryAccessError } from "../../lib/apiary/hives";
import {
  ConsultaInvalida,
  aplicacionesPrevistas,
  consultasDeSitio,
  estadoDelProtocolo,
  registrarConsultaAVecinos,
  vecinosConsultados,
} from "../../lib/apiary/consultaAVecinos";
import { vitalesDeSitios } from "../../lib/apiary/vitalesDelSitio";
import { leerEnmiendas } from "../../lib/traceability/enmiendas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `vecinos-${Date.now()}`;
const DIA = 86_400_000;
const AHORA = new Date("2026-09-14T12:00:00Z");
const haceDias = (n: number) => new Date(AHORA.getTime() - n * DIA);
const enDias = (n: number) => new Date(AHORA.getTime() + n * DIA);

describe("la consulta mensual a las fincas vecinas", () => {
  let organizationId: string;
  let vecinaAId: string;
  let vecinaBId: string;
  let projectId: string;
  let apiarioId: string;
  let otroApiarioId: string;
  let parcelaId: string;
  let userAccountId: string;
  let sinAccesoUserAccountId: string;
  let scopeId: string;
  const personIds: string[] = [];
  const hiveIds: string[] = [];

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    return (await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })).id;
  }

  async function crearOrg(nombre: string) {
    return (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST ${nombre} (${RUN_ID})`, status: "approved", classification: "internal" },
      })
    ).id;
  }

  async function crearUbicacion(nombre: string, tipo: "apiary_site" | "plot") {
    return (
      await prisma.location.create({
        data: { locationType: tipo, name: `TEST ${nombre} (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
  }

  /** Lo mínimo para que una consulta sea válida. `extra` sobrescribe lo que haga falta. */
  function consultaValida(extra: Record<string, unknown> = {}) {
    return {
      locationId: apiarioId,
      neighbourOrganizationId: vecinaAId,
      occurredAt: haceDias(1),
      outcome: "sin_aplicacion_prevista",
      informantName: "Don Chico",
      provenanceClass: "direct_observation" as const,
      ...extra,
    };
  }

  beforeAll(async () => {
    organizationId = await crearOrg("Farm");
    vecinaAId = await crearOrg("Vecina A");
    vecinaBId = await crearOrg("Vecina B");
    projectId = (
      await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })
    ).id;
    apiarioId = await crearUbicacion("Apiario", "apiary_site");
    otroApiarioId = await crearUbicacion("Otro apiario", "apiary_site");
    parcelaId = await crearUbicacion("Parcela", "plot");

    userAccountId = await crearCuenta("Vecinos");
    sinAccesoUserAccountId = await crearCuenta("SinAcceso");
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });

    // Una colmena en el apiario: `registrarConsultaAVecinos` resuelve el proyecto por ahí,
    // que es cómo autoriza el resto del módulo.
    const hive = await createHive(userAccountId, { projectId, locationId: apiarioId, identifier: `V-${RUN_ID.slice(-4)}` });
    hiveIds.push(hive.id);
  });

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({ actorUserAccountId: { in: [userAccountId, sinAccesoUserAccountId] } }),
    });
    await prisma.neighbourConsultation.deleteMany({
      where: assertDefinedWhere({ locationId: { in: [apiarioId, otroApiarioId] } }),
    });
  });

  afterAll(async () => {
    // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
    // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { id: { in: hiveIds } } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: hiveIds } }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({
      where: assertDefinedWhere({ id: { in: [userAccountId, sinAccesoUserAccountId] } }),
    });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({
      where: assertDefinedWhere({ id: { in: [apiarioId, otroApiarioId, parcelaId] } }),
    });
    await prisma.organization.deleteMany({
      where: assertDefinedWhere({ id: { in: [organizationId, vecinaAId, vecinaBId] } }),
    });
  });

  it("«fuimos y no hay aplicación prevista» se guarda como RESPUESTA, no como hueco", async () => {
    const fila = await registrarConsultaAVecinos(userAccountId, consultaValida({ crop: "sandía" }));
    expect(fila.outcome).toBe("sin_aplicacion_prevista");
    expect(fila.plannedApplicationAt).toBeNull();
    expect(fila.crop).toBe("sandía");
    expect(fila.informantName).toBe("Don Chico");

    // Y la diferencia que sostiene toda la rebanada: el sitio pasa de «nunca se consultó»
    // a «al día», y las dos cosas son distintas de «no hay aplicación».
    const estado = await estadoDelProtocolo(apiarioId, AHORA);
    expect(estado.estado).toBe("al_dia");
    expect(estado.diasQueFaltan).toBe(29);
  });

  it("LA AFIRMACIÓN DE ESTA REBANADA: una aspersión anunciada llega al aviso del sitio", async () => {
    await registrarConsultaAVecinos(
      userAccountId,
      consultaValida({ outcome: "aplicacion_prevista", plannedApplicationAt: enDias(3), crop: "sandía" }),
    );

    const previstas = await aplicacionesPrevistas([apiarioId], AHORA);
    expect(previstas).toHaveLength(1);
    expect(previstas[0]!.diasQueFaltan).toBe(3);
    expect(previstas[0]!.crop).toBe("sandía");

    // Y el tablero del sitio la pinta como CRÍTICA, que es lo que el Anexo E §3 pide.
    const vitales = await vitalesDeSitios([apiarioId], AHORA);
    const alertas = vitales.get(apiarioId)!.alertas;
    expect(alertas.map((a) => a.motivo)).toContain("aspersion_anunciada");
    expect(alertas.find((a) => a.motivo === "aspersion_anunciada")!.nivel).toBe("critico");
    expect(vitales.get(apiarioId)!.aspersionAnunciadaEn).toEqual(enDias(3));
  });

  it("una aspersión que YA PASÓ no avisa de nada", async () => {
    await registrarConsultaAVecinos(
      userAccountId,
      consultaValida({ occurredAt: haceDias(20), outcome: "aplicacion_prevista", plannedApplicationAt: haceDias(5) }),
    );
    // Control positivo de que la fila existe y el lector mira donde debe.
    expect(await consultasDeSitio(apiarioId)).toHaveLength(1);
    // Pero no es un aviso: avisar de algo terminado enseña a ignorar el aviso.
    expect(await aplicacionesPrevistas([apiarioId], AHORA)).toEqual([]);
    const alertas = (await vitalesDeSitios([apiarioId], AHORA)).get(apiarioId)!.alertas;
    expect(alertas.map((a) => a.motivo)).not.toContain("aspersion_anunciada");
  });

  it("el protocolo vencido avisa; nunca consultado NO avisa, y eso es deliberado", async () => {
    // Sin ninguna consulta: el sitio no ha incumplido nada.
    const sinNada = (await vitalesDeSitios([otroApiarioId], AHORA)).get(otroApiarioId)!;
    expect(sinNada.ultimaConsultaAVecinos).toBeNull();
    expect(sinNada.diasHastaConsulta).toBeNull();
    expect(sinNada.alertas.map((a) => a.motivo)).not.toContain("consulta_a_vecinos_vencida");

    // Con una de hace 40 días: vencido.
    await registrarConsultaAVecinos(userAccountId, consultaValida({ occurredAt: haceDias(40) }));
    const vencido = (await vitalesDeSitios([apiarioId], AHORA)).get(apiarioId)!;
    expect(vencido.alertas.map((a) => a.motivo)).toContain("consulta_a_vecinos_vencida");
    expect(vencido.diasHastaConsulta).toBe(-10);
  });

  it("el aviso de «por vencer» sale en su ventana, no antes", async () => {
    await registrarConsultaAVecinos(userAccountId, consultaValida({ occurredAt: haceDias(25) }));
    const alertas = (await vitalesDeSitios([apiarioId], AHORA)).get(apiarioId)!.alertas;
    expect(alertas.map((a) => a.motivo)).toContain("consulta_a_vecinos_por_vencer");
    expect(alertas.map((a) => a.motivo)).not.toContain("consulta_a_vecinos_vencida");
  });

  it("las dos contradicciones se rechazan con nombre de dominio, no con un error de Postgres", async () => {
    await expect(
      registrarConsultaAVecinos(userAccountId, consultaValida({ outcome: "aplicacion_prevista" })),
    ).rejects.toThrow(/fecha_de_aplicacion_requerida/);

    await expect(
      registrarConsultaAVecinos(userAccountId, consultaValida({ plannedApplicationAt: enDias(3) })),
    ).rejects.toThrow(/fecha_de_aplicacion_sin_aplicacion/);

    await expect(
      registrarConsultaAVecinos(userAccountId, consultaValida({ informantName: "   " })),
    ).rejects.toThrow(/informante_requerido/);

    await expect(
      registrarConsultaAVecinos(userAccountId, consultaValida({ outcome: "porque_sí" })),
    ).rejects.toThrow(/resultado_de_consulta_desconocido/);

    // Una aplicación ANTES de la consulta no es una previsión.
    await expect(
      registrarConsultaAVecinos(
        userAccountId,
        consultaValida({ outcome: "aplicacion_prevista", plannedApplicationAt: haceDias(5) }),
      ),
    ).rejects.toThrow(/aplicacion_anterior_a_la_consulta/);

    // Y nada de lo anterior escribió.
    expect(await prisma.neighbourConsultation.count({ where: { locationId: apiarioId } })).toBe(0);
  });

  it("«no se pudo consultar» es válida SIN informante, y ocupa el mes igual", async () => {
    const fila = await registrarConsultaAVecinos(
      userAccountId,
      consultaValida({ outcome: "no_se_pudo_consultar", informantName: null }),
    );
    expect(fila.informantName).toBeNull();
    // El protocolo se cumplió aunque la información no llegara: es la distinción que
    // separa «fui y no había nadie» de «no fui».
    expect((await estadoDelProtocolo(apiarioId, AHORA)).estado).toBe("al_dia");
  });

  it("rechaza un sitio que no es apiario, un vecino inexistente, y a quien no tiene acceso", async () => {
    await expect(
      registrarConsultaAVecinos(userAccountId, consultaValida({ locationId: parcelaId })),
    ).rejects.toThrow(/no_es_apiario/);

    await expect(
      registrarConsultaAVecinos(
        userAccountId,
        consultaValida({ neighbourOrganizationId: "00000000-0000-0000-0000-000000000000" }),
      ),
    ).rejects.toThrow(/vecino_no_encontrado/);

    await expect(registrarConsultaAVecinos(sinAccesoUserAccountId, consultaValida())).rejects.toThrow(
      ApiaryAccessError,
    );
  });

  it("la cadencia se mide por SITIO y no por vecino, y la lista por vecino existe aparte", async () => {
    await registrarConsultaAVecinos(userAccountId, consultaValida({ neighbourOrganizationId: vecinaAId, occurredAt: haceDias(20) }));
    await registrarConsultaAVecinos(userAccountId, consultaValida({ neighbourOrganizationId: vecinaBId, occurredAt: haceDias(2) }));

    // La más reciente del SITIO manda: con cadencia por vecino, la de A —de hace 20 días—
    // habría puesto el sitio en «por vencer» teniendo una consulta de anteayer.
    const estado = await estadoDelProtocolo(apiarioId, AHORA);
    expect(estado.estado).toBe("al_dia");
    expect(estado.ultimaConsulta).toEqual(haceDias(2));

    // Y a quién se le ha preguntado aquí sí se puede saber, sin duplicados.
    const vecinos = await vecinosConsultados(apiarioId);
    expect(vecinos.map((v) => v.id).sort()).toEqual([vecinaAId, vecinaBId].sort());
  });

  it("el rastro dice neighbour_consultation.record", async () => {
    const fila = await registrarConsultaAVecinos(userAccountId, consultaValida());
    const rastro = await leerEnmiendas([{ entityType: "neighbour_consultation", entityId: fila.id }]);
    expect(rastro.map((e) => e.operation)).toContain("neighbour_consultation.record");
    expect(rastro[0]!.sourceInterface).toBe("apiary.service");
  });
});
