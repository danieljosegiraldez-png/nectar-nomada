/**
 * «Alcanza hasta» y el aviso que faltó en Toabré.
 *
 * **Lo que cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §3 marca el campo
 * **obligatorio** y subraya por qué con el caso real: *«el campo que faltó en
 * Toabré. El alimento del 22 de julio cubría seis semanas: vencía cerca del 2 de
 * septiembre, el día en que se encontró todo vacío. Con este campo, el aviso llega
 * antes y no después»*.
 *
 * **Y lo que NO es este trabajo:** la columna `coverage_until` ya existía desde
 * `20260907214500_a9_vitales_del_sitio` y `vitalesDeSitios` ya la leía. Medido el
 * 2026-09-13: **1 alimentación en la copia local y ninguna con ese valor**, porque
 * ninguna pantalla podía escribirlo. Lo que falta y esto trae es el camino —
 * formulario, cola, y un aviso POR COLONIA— no la columna.
 *
 * **Ningún dato real ha pasado por aquí.** Los fixtures crean las alimentaciones,
 * así que las reglas se ejercitan; es una red para el día que lleguen.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony, registrarFinDeColonia } from "../../lib/apiary/hives";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { alcanceDelAlimento } from "../../lib/apiary/alcanceDelAlimento";
import { AlimentacionInvalida, clasificarAlcance, diasDeAlcance } from "../../lib/apiary/alimentacion";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `alcance-${Date.now()}`;
const DIA = 24 * 60 * 60 * 1000;

/** Un día a medianoche UTC, que es como se guarda `coverageUntil`. */
function dia(offsetDias: number): Date {
  const d = new Date(Date.now() + offsetDias * DIA);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);
}

describe("la regla pura del alcance", () => {
  const ahora = new Date("2026-09-02T14:00:00Z");

  it("EL DÍA DEL VENCIMIENTO TODAVÍA CUBRE", () => {
    // «Alcanza hasta el 2 de septiembre» significa que el 2 hay alimento. Un `<`
    // a secas lo daría por vencido a las 00:01 de ese día, un día antes de lo que
    // dijo quien alimentó — y este aviso existe para llegar ANTES, no para
    // adelantarse mintiendo.
    expect(clasificarAlcance(new Date("2026-09-02T00:00:00Z"), ahora, 14)).toBe("por_vencer");
    expect(clasificarAlcance(new Date("2026-09-01T00:00:00Z"), ahora, 14)).toBe("vencido");
  });

  it("sin fecha NO es «cubierto»: es «no se puede avisar»", () => {
    // La distinción entera del ticket. Devolver «cubierto» aquí volvería invisible
    // exactamente la colonia de Toabré.
    expect(clasificarAlcance(null, ahora, 14)).toBe("sin_fecha");
    expect(clasificarAlcance(undefined, ahora, 14)).toBe("sin_fecha");
  });

  it("lo que alcanza de sobra no molesta, y la ventana la decide quien pregunta", () => {
    const dentroDeUnMes = new Date("2026-10-02T00:00:00Z");
    expect(clasificarAlcance(dentroDeUnMes, ahora, 14)).toBe("cubierto");
    // Control positivo: con la ventana ancha, la MISMA fecha sí avisa. Sin esto,
    // «cubierto» podría ser que la función no mire la ventana.
    expect(clasificarAlcance(dentroDeUnMes, ahora, 60)).toBe("por_vencer");
  });

  it("los días se cuentan hacia arriba, y en negativo cuando ya venció", () => {
    // Medio día que queda sigue siendo un día con alimento: `floor` diría cero
    // justo cuando alguien decide si vuelve al sitio.
    expect(diasDeAlcance(new Date("2026-09-03T00:00:00Z"), ahora)).toBe(2);
    expect(diasDeAlcance(new Date("2026-08-28T00:00:00Z"), ahora)).toBeLessThan(0);
  });
});

describe("el aviso de alimento por colonia", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let scopeId: string;
  let personId: string;

  async function nuevaColonia(sufijo: string) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `A${sufijo}-${RUN_ID.slice(-4)}` });
    const colony = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    return colony.id;
  }

  async function alimentar(colonyId: string, coverageUntil: Date | null, occurredAt: Date) {
    return recordColonyEvent(userAccountId, {
      colonyId,
      eventType: "feeding",
      occurredAt,
      feedingMaterial: "jarabe 1:1",
      feedingQuantity: 2,
      feedingUnit: "L",
      coverageUntil,
    });
  }

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
      })
    ).id;
    projectId = (
      await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })
    ).id;
    locationId = (
      await prisma.location.create({
        data: {
          locationType: "apiary_site",
          name: `TEST Sitio (${RUN_ID})`,
          organizationId,
          status: "approved",
          classification: "internal",
        },
      })
    ).id;
    personId = (
      await prisma.person.create({
        data: { givenName: "TEST", familyName: "Alcance", displayName: `TEST Alcance (${RUN_ID})`, locale: "es" },
      })
    ).id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId, authProvider: "credentials", status: "active" } })
    ).id;
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  });

  afterEach(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("EL CASO DE TOABRÉ: una alimentación sin fecha sale como `sin_fecha`, no desaparece", async () => {
    const c = await nuevaColonia("1");
    await alimentar(c, null, new Date(Date.now() - 40 * DIA));
    const filas = await alcanceDelAlimento(locationId);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.estado).toBe("sin_fecha");
    expect(filas[0]!.diasRestantes).toBeNull();
    // Y trae el identificador de la colmena, que es lo que se lee en el campo.
    expect(filas[0]!.hiveIdentifier).toContain("A1-");
  });

  it("lo vencido y lo que está por vencer salen; lo cubierto no", async () => {
    const vencida = await nuevaColonia("2");
    const porVencer = await nuevaColonia("3");
    const cubierta = await nuevaColonia("4");
    await alimentar(vencida, dia(-10), new Date(Date.now() - 50 * DIA));
    await alimentar(porVencer, dia(3), new Date(Date.now() - 10 * DIA));
    await alimentar(cubierta, dia(90), new Date(Date.now() - 2 * DIA));

    const filas = await alcanceDelAlimento(locationId, new Date(), 14);
    // Lo urgente primero: vencido antes que por vencer.
    expect(filas.map((f) => f.estado)).toEqual(["vencido", "por_vencer"]);
    expect(filas.map((f) => f.colonyId)).toEqual([vencida, porVencer]);
    // Control positivo de que la cubierta EXISTE y se omitió por estar cubierta,
    // no por no haberse creado.
    expect(await prisma.colonyEvent.count({ where: { colonyId: cubierta } })).toBe(1);
  });

  it("manda la ÚLTIMA alimentación, no la de plazo más largo", async () => {
    // Volver a alimentar reemplaza el plazo. Quedarse con el máximo dejaría vigente
    // una estimación que quien volvió ya corrigió — y es justo lo que hace el
    // resumen por sitio de `vitalesDeSitios`, que por eso no sirve como aviso.
    const c = await nuevaColonia("5");
    await alimentar(c, dia(90), new Date(Date.now() - 30 * DIA));
    await alimentar(c, dia(-2), new Date(Date.now() - 1 * DIA));
    const filas = await alcanceDelAlimento(locationId);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.estado).toBe("vencido");
  });

  it("una colonia que nunca se alimentó no sale, y una terminada tampoco", async () => {
    await nuevaColonia("6"); // nunca alimentada
    const terminada = await nuevaColonia("7");
    await alimentar(terminada, dia(-30), new Date(Date.now() - 60 * DIA));
    // Control positivo primero: con la colonia activa, SÍ sale.
    expect(await alcanceDelAlimento(locationId)).toHaveLength(1);

    await registrarFinDeColonia(userAccountId, {
      colonyId: terminada,
      status: "dead",
      endedAt: new Date(),
      causas: [],
    });
    expect(await alcanceDelAlimento(locationId)).toEqual([]);
  });

  it("el método se guarda, y sólo alimentando", async () => {
    const c = await nuevaColonia("8");
    const alimentacion = await recordColonyEvent(userAccountId, {
      colonyId: c,
      eventType: "feeding",
      feedingMaterial: "torta",
      coverageUntil: dia(20),
      feedingMethod: "bolsa_sobre_cabezales",
    });
    expect(alimentacion.feedingMethod).toBe("bolsa_sobre_cabezales");
    // Un tratamiento con «bolsa sobre cabezales» es un dato que nadie podría leer.
    await expect(
      recordColonyEvent(userAccountId, {
        colonyId: c,
        eventType: "treatment",
        treatmentProduct: "Apivar",
        treatmentBatchLabel: "L-1",
        treatmentWithdrawalDays: 14,
        feedingMethod: "bolsa_sobre_cabezales",
      }),
    ).rejects.toThrow(/feeding_method_solo_en_alimentacion/);
  });

  it("el SERVICIO rechaza un método inventado", async () => {
    const c = await nuevaColonia("9");
    await expect(
      recordColonyEvent(userAccountId, {
        colonyId: c,
        eventType: "feeding",
        feedingMaterial: "jarabe",
        feedingMethod: "telepatia",
      }),
    ).rejects.toThrow(AlimentacionInvalida);
    expect(await prisma.colonyEvent.count({ where: { colonyId: c } })).toBe(0);
  });

  it("y el servicio NO exige la fecha: una alimentación de urgencia se registra igual", async () => {
    // Decisión previa, con su razón escrita en `colonyEvents.ts`, y se mantiene:
    // perder el registro es peor que no poder avisar. Lo que cambia es que la
    // ausencia se VE — el primer caso de este archivo.
    const c = await nuevaColonia("10");
    const urgencia = await alimentar(c, null, new Date());
    expect(urgencia.coverageUntil).toBeNull();
    expect(urgencia.id).toBeTruthy();
  });
});
