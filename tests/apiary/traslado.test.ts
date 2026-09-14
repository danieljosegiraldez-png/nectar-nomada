/**
 * El traslado de colmenas — y la prueba de que la historia NO se reescribe.
 *
 * **Lo que estas pruebas sostienen, y es el punto de toda la rebanada:** que una inspección
 * de marzo en Santa Fe sigue diciendo Santa Fe después de mover la colmena a Sandía. Antes
 * de `HivePlacement` eso era imposible de afirmar, porque el único camino de un evento a su
 * apiario era `hive.locationId` — y ese campo cambia con el traslado.
 *
 * El `it` llamado «LA AFIRMACIÓN DE ESTA REBANADA» es el que lo mide: pregunta por una
 * fecha anterior al traslado y por el día del traslado, y las dos respuestas tienen que ser
 * apiarios distintos.
 *
 * **La invariante «una colmena en un solo sitio» no la sostiene la base** —dos `NULL` no
 * chocan en un índice único de Postgres, medido— así que la sostiene el servicio y la
 * defiende aquí el `it` que cuenta colocaciones abiertas.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony, ApiaryAccessError } from "../../lib/apiary/hives";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import {
  MOTIVOS_DE_TRASLADO,
  TrasladoInvalido,
  apiarioDeColmenaEn,
  avisosDeDestino,
  conteosDeTraslado,
  exigeMotivoDeTraslado,
  historialDeColocaciones,
  trasladarColmenas,
} from "../../lib/apiary/traslado";
import { leerEnmiendas } from "../../lib/traceability/enmiendas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `traslado-${Date.now()}`;
const DIA_DEL_TRASLADO = new Date("2026-06-01T00:00:00Z");
const ANTES_DEL_TRASLADO = new Date("2026-03-15T00:00:00Z");

describe("el traslado de colmenas", () => {
  let organizationId: string;
  let projectId: string;
  let origenId: string;
  let destinoId: string;
  let otroApiarioId: string;
  let noApiarioId: string;
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
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    return cuenta.id;
  }

  // `LocationType` no tiene «laboratory»: sus valores son country, province, district,
  // locality, site, plot, micro_plot y apiary_site. El destino que NO es apiario se prueba
  // con `plot`, que es una ubicación real del dominio y no un valor inventado.
  async function crearUbicacion(nombre: string, tipo: "apiary_site" | "plot") {
    return (
      await prisma.location.create({
        data: { locationType: tipo, name: `TEST ${nombre} (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
  }

  /** Una colmena en el origen, con su colonia activa. Devuelve el id de las dos. */
  async function colmenaConColonia(identifier: string, locationId = origenId) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier });
    hiveIds.push(hive.id);
    const colony = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    // El relleno de la migración no cubre las colmenas que se crean DESPUÉS, así que la
    // colocación inicial la abre esta prueba. Que `createHive` no la cree es una deuda
    // nombrada en ADR-126, no un descuido de aquí.
    await prisma.hivePlacement.create({
      data: { hiveId: hive.id, locationId, startedAt: new Date("2026-01-01T00:00:00Z"), createdBy: userAccountId },
    });
    return { hiveId: hive.id, colonyId: colony.id };
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
    origenId = await crearUbicacion("Origen", "apiary_site");
    destinoId = await crearUbicacion("Destino", "apiary_site");
    otroApiarioId = await crearUbicacion("Otro", "apiary_site");
    noApiarioId = await crearUbicacion("Parcela", "plot");

    userAccountId = await crearCuenta("Traslado");
    sinAccesoUserAccountId = await crearCuenta("SinAcceso");
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  });

  afterEach(async () => {
    // Se limpia en `afterEach` y no al final del cuerpo de cada `it`: una aserción que
    // falla se salta todo lo que venga después, y ésa es la fuga que dejó 284 `Scope`
    // huérfanos en la base compartida.
    const colonias = await prisma.colony.findMany({ where: { hiveId: { in: hiveIds } }, select: { id: true } });
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({ actorUserAccountId: { in: [userAccountId, sinAccesoUserAccountId] } }),
    });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: colonias.map((c) => c.id) } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: hiveIds } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ hiveId: { in: hiveIds } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: hiveIds } }) });
    hiveIds.length = 0;
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({
      where: assertDefinedWhere({ id: { in: [userAccountId, sinAccesoUserAccountId] } }),
    });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({
      where: assertDefinedWhere({ id: { in: [origenId, destinoId, otroApiarioId, noApiarioId] } }),
    });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("mueve varias de una vez, cierra la vigencia del origen y abre la del destino", async () => {
    const a = await colmenaConColonia(`T1-${RUN_ID.slice(-4)}`);
    const b = await colmenaConColonia(`T2-${RUN_ID.slice(-4)}`);

    const r = await trasladarColmenas(userAccountId, {
      hiveIds: [a.hiveId, b.hiveId],
      destinationLocationId: destinoId,
      occurredAt: DIA_DEL_TRASLADO,
      reason: "polinizacion",
      entrancesClosed: true,
    });
    expect(r.trasladadas).toBe(2);
    expect(r.origenLocationId).toBe(origenId);

    // El puntero de la colmena sigue a la colocación: es la invariante.
    for (const id of [a.hiveId, b.hiveId]) {
      const hive = await prisma.hive.findUniqueOrThrow({ where: { id }, select: { locationId: true } });
      expect(hive.locationId).toBe(destinoId);
      const abiertas = await prisma.hivePlacement.findMany({ where: { hiveId: id, endedAt: null } });
      expect(abiertas, "exactamente una colocación abierta").toHaveLength(1);
      expect(abiertas[0]!.locationId).toBe(destinoId);
      expect(abiertas[0]!.entrancesClosed).toBe(true);
      expect(abiertas[0]!.reason).toBe("polinizacion");
      const cerradas = await prisma.hivePlacement.findMany({ where: { hiveId: id, endedAt: { not: null } } });
      expect(cerradas, "la del origen quedó cerrada, no borrada").toHaveLength(1);
      expect(cerradas[0]!.locationId).toBe(origenId);
      expect(cerradas[0]!.endedAt).toEqual(DIA_DEL_TRASLADO);
    }
  });

  it("LA AFIRMACIÓN DE ESTA REBANADA: la historia no se reescribe", async () => {
    const { hiveId } = await colmenaConColonia(`T3-${RUN_ID.slice(-4)}`);
    await trasladarColmenas(userAccountId, {
      hiveIds: [hiveId],
      destinationLocationId: destinoId,
      occurredAt: DIA_DEL_TRASLADO,
      reason: "consolidacion",
    });

    // Antes del traslado estaba en el ORIGEN, aunque su `locationId` diga destino hoy.
    expect(await apiarioDeColmenaEn(hiveId, ANTES_DEL_TRASLADO)).toBe(origenId);
    // El día del traslado ya cuenta en el destino: el intervalo es semiabierto, así que
    // nunca está en los dos.
    expect(await apiarioDeColmenaEn(hiveId, DIA_DEL_TRASLADO)).toBe(destinoId);
    // Control negativo del mecanismo: una fecha anterior a la primera colocación no consta,
    // y «no consta» no es «donde está hoy».
    expect(await apiarioDeColmenaEn(hiveId, new Date("2020-01-01T00:00:00Z"))).toBeNull();

    // Y el control que demuestra que esto NO se podría haber respondido sin la tabla: el
    // puntero actual dice destino para las dos fechas.
    const hive = await prisma.hive.findUniqueOrThrow({ where: { id: hiveId }, select: { locationId: true } });
    expect(hive.locationId).toBe(destinoId);
  });

  it("un identificador ya ocupado en el destino aborta el traslado entero y dice cuál", async () => {
    const a = await colmenaConColonia(`CHOQUE-${RUN_ID.slice(-4)}`);
    const b = await colmenaConColonia(`LIBRE-${RUN_ID.slice(-4)}`);
    // La misma etiqueta, ya en el destino.
    await colmenaConColonia(`CHOQUE-${RUN_ID.slice(-4)}`, destinoId);

    await expect(
      trasladarColmenas(userAccountId, {
        hiveIds: [a.hiveId, b.hiveId],
        destinationLocationId: destinoId,
        occurredAt: DIA_DEL_TRASLADO,
        reason: "rescate",
      }),
    ).rejects.toThrow(/identificador_ocupado_en_destino:CHOQUE/);

    // Todo o nada: la que NO chocaba tampoco se movió.
    const hive = await prisma.hive.findUniqueOrThrow({ where: { id: b.hiveId }, select: { locationId: true } });
    expect(hive.locationId).toBe(origenId);
    expect(await prisma.hivePlacement.count({ where: { hiveId: b.hiveId } })).toBe(1);
  });

  it("rechaza orígenes mezclados, destino igual al origen, y un destino que no es apiario", async () => {
    const a = await colmenaConColonia(`M1-${RUN_ID.slice(-4)}`);
    const b = await colmenaConColonia(`M2-${RUN_ID.slice(-4)}`, otroApiarioId);

    await expect(
      trasladarColmenas(userAccountId, {
        hiveIds: [a.hiveId, b.hiveId],
        destinationLocationId: destinoId,
        occurredAt: DIA_DEL_TRASLADO,
        reason: "consolidacion",
      }),
    ).rejects.toThrow(/origenes_mezclados/);

    await expect(
      trasladarColmenas(userAccountId, {
        hiveIds: [a.hiveId],
        destinationLocationId: origenId,
        occurredAt: DIA_DEL_TRASLADO,
        reason: "consolidacion",
      }),
    ).rejects.toThrow(/destino_igual_al_origen/);

    await expect(
      trasladarColmenas(userAccountId, {
        hiveIds: [a.hiveId],
        destinationLocationId: noApiarioId,
        occurredAt: DIA_DEL_TRASLADO,
        reason: "consolidacion",
      }),
    ).rejects.toThrow(/destino_no_es_apiario/);
  });

  it("rechaza lo vacío, lo repetido, el motivo inventado y una fecha imposible", async () => {
    const { hiveId } = await colmenaConColonia(`V-${RUN_ID.slice(-4)}`);
    const base = { destinationLocationId: destinoId, occurredAt: DIA_DEL_TRASLADO, reason: "rescate" };

    await expect(trasladarColmenas(userAccountId, { ...base, hiveIds: [] })).rejects.toThrow(
      /ninguna_colmena_seleccionada/,
    );
    await expect(trasladarColmenas(userAccountId, { ...base, hiveIds: [hiveId, hiveId] })).rejects.toThrow(
      /colmena_repetida/,
    );
    await expect(
      trasladarColmenas(userAccountId, { ...base, hiveIds: [hiveId], reason: "porque_sí" }),
    ).rejects.toThrow(/motivo_de_traslado_desconocido/);
    // Salir antes de haber llegado: la colocación vigente empieza el 1 de enero.
    await expect(
      trasladarColmenas(userAccountId, { ...base, hiveIds: [hiveId], occurredAt: new Date("2025-12-01T00:00:00Z") }),
    ).rejects.toThrow(/fecha_anterior_a_la_colocacion_vigente/);

    // Y nada de lo anterior escribió: sigue una sola colocación, la original.
    expect(await prisma.hivePlacement.count({ where: { hiveId } })).toBe(1);
  });

  it("quien no tiene acceso no traslada nada", async () => {
    const { hiveId } = await colmenaConColonia(`A-${RUN_ID.slice(-4)}`);
    await expect(
      trasladarColmenas(sinAccesoUserAccountId, {
        hiveIds: [hiveId],
        destinationLocationId: destinoId,
        occurredAt: DIA_DEL_TRASLADO,
        reason: "polinizacion",
      }),
    ).rejects.toThrow(ApiaryAccessError);
    const hive = await prisma.hive.findUniqueOrThrow({ where: { id: hiveId }, select: { locationId: true } });
    expect(hive.locationId).toBe(origenId);
  });

  it("los conteos de antes y después son el control contra un traslado a medias", async () => {
    const a = await colmenaConColonia(`C1-${RUN_ID.slice(-4)}`);
    await colmenaConColonia(`C2-${RUN_ID.slice(-4)}`);

    const antes = await conteosDeTraslado(origenId, destinoId);
    expect(antes.origen.colmenas).toBe(2);
    expect(antes.destino.colmenas).toBe(0);

    const r = await trasladarColmenas(userAccountId, {
      hiveIds: [a.hiveId],
      destinationLocationId: destinoId,
      occurredAt: DIA_DEL_TRASLADO,
      reason: "polinizacion",
    });
    expect(r.conteos.origen.colmenas).toBe(1);
    expect(r.conteos.destino.colmenas).toBe(1);
  });

  it("el destino avisa de su carencia, y DECLARA que las aspersiones no se saben", async () => {
    const enDestino = await colmenaConColonia(`D-${RUN_ID.slice(-4)}`, destinoId);
    await recordColonyEvent(userAccountId, {
      colonyId: enDestino.colonyId,
      eventType: "treatment",
      occurredAt: new Date("2026-05-25T10:00:00Z"),
      treatmentProduct: "Apivar",
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
      treatmentWithdrawalDays: 30,
      treatmentTarget: "varroa",
    });

    const avisos = await avisosDeDestino(destinoId, DIA_DEL_TRASLADO);
    expect(avisos.carencias).toHaveLength(1);
    expect(avisos.carencias[0]!.vigentes[0]!.diasQueFaltan).toBeGreaterThan(0);
    // La mitad que NO existe se declara en vez de callarse: un `false` aquí significa
    // «nadie lo ha preguntado», no «el destino está limpio».
    expect(avisos.aspersionesConsultadas).toBe(false);

    // Control positivo del lector: un apiario sin tratamientos no inventa carencias.
    expect((await avisosDeDestino(otroApiarioId, DIA_DEL_TRASLADO)).carencias).toEqual([]);
  });

  it("el rastro dice hive.transfer con su motivo, y el historial se lee entero", async () => {
    const { hiveId } = await colmenaConColonia(`R-${RUN_ID.slice(-4)}`);
    await trasladarColmenas(userAccountId, {
      hiveIds: [hiveId],
      destinationLocationId: destinoId,
      occurredAt: DIA_DEL_TRASLADO,
      reason: "correccion_de_emplazamiento",
    });

    const rastro = await leerEnmiendas([{ entityType: "hive", entityId: hiveId }]);
    expect(rastro.map((e) => e.operation)).toContain("hive.transfer");
    expect(rastro[0]!.sourceInterface).toBe("apiary.service");
    expect(rastro[0]!.reason).toBe("correccion_de_emplazamiento");

    const historial = await historialDeColocaciones(hiveId);
    expect(historial).toHaveLength(2);
    expect(historial[0]!.locationId).toBe(destinoId);
    expect(historial[0]!.endedAt).toBeNull();
    expect(historial[1]!.locationId).toBe(origenId);
    expect(historial[1]!.endedAt).toEqual(DIA_DEL_TRASLADO);
  });

  it("el vocabulario de motivos es cerrado y no adivina", () => {
    expect([...MOTIVOS_DE_TRASLADO]).toEqual([
      "polinizacion",
      "correccion_de_emplazamiento",
      "consolidacion",
      "rescate",
    ]);
    expect(exigeMotivoDeTraslado("rescate")).toBe("rescate");
    expect(() => exigeMotivoDeTraslado("")).toThrow(TrasladoInvalido);
    expect(() => exigeMotivoDeTraslado(null)).toThrow(TrasladoInvalido);
    expect(() => exigeMotivoDeTraslado("Rescate")).toThrow(TrasladoInvalido);
  });
});
