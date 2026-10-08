import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "../../lib/db";
import { objectStorageProvider } from "../../lib/integrations/storage";
import { listFieldSessions } from "../../lib/traceability/fieldSessions";
import { listLandAssets } from "../../lib/traceability/landMedia";
import { createMicrolot } from "../../lib/traceability/locations";
import { listSoilProfilesForLocation } from "../../lib/traceability/soilProfiles";
import { listSamplesForLocation } from "../../lib/traceability/soilSamples";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";

/**
 * **ADR-196 §2.2 — el lado de «NO enrolla».** Una muestra, una calicata, una foto
 * y una jornada «se toman en un punto y son de ese punto»: el lote NO responde
 * por ellas, al contrario que por sus cosechas, cohortes y especímenes.
 *
 * **LAS CUATRO PASAN DESDE EL PRIMER DÍA, Y ES A PROPÓSITO: SON UNA RED PARA
 * MAÑANA, NO UN DEFECTO DE HOY.** Las cuatro funciones ya filtran por
 * `locationId` pelado, que es lo correcto para ellas. Lo que esta red atrapa es a
 * la sesión que las enrolle **por simetría** con las cinco de §3.1, creyendo que
 * completa el trabajo. No contarlas como guardia de un camino vivo: lo que
 * demuestra que la red está armada es su flip-test, no su verde.
 *
 * Cada caso lleva su control positivo pegado, y sin él no mediría nada: una
 * prueba que sólo comprueba que algo NO aparece pasa igual si la función
 * devuelve siempre una lista vacía.
 */

let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let madre: Awaited<ReturnType<typeof crearParcela>>;
let hija: Awaited<ReturnType<typeof createMicrolot>>;

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  madre = await crearParcela();
  hija = await createMicrolot(usuario.userAccountId, {
    name: `TEST Micro sin enrollar (${Date.now()})`,
    parentLocationId: madre.id,
    motivoDeLaSeleccion: "other",
  });
}, 30000);

afterAll(async () => {
  const ubicaciones = [hija?.id, madre?.id].filter(Boolean) as string[];
  if (ubicaciones.length === 0) return;
  await prisma.soilHorizon.deleteMany({ where: assertDefinedWhere({ soilProfile: { locationId: { in: ubicaciones } } }) });
  await prisma.soilProfile.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  await prisma.soilSample.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicaciones } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) });
}, 30000);

const crearCalicataEn = (locationId: string) =>
  prisma.soilProfile.create({
    data: { locationId, describedAt: new Date("2026-05-01"), provenanceClass: "original_record" },
  });

const crearMuestraEn = (locationId: string) =>
  prisma.soilSample.create({
    data: {
      sampleCode: `TEST-SUELO-${locationId.slice(0, 8)}-${Date.now()}`,
      locationId,
      sampledAt: new Date("2026-05-02"),
      provenanceClass: "original_record",
    },
  });

const crearFotoEn = (locationId: string) =>
  prisma.asset.create({
    data: {
      locationId,
      assetType: "land_photo",
      storageKey: `test/enrollado/${locationId}-${Date.now()}.jpg`,
      storageBucket: "test-bucket",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      provenanceClass: "original_record",
    },
  });

const crearJornadaEn = (locationId: string, personId: string) =>
  prisma.fieldSession.create({
    data: {
      locationId,
      operatorPersonId: personId,
      startedAt: new Date("2026-05-03T08:00:00Z"),
      provenanceClass: "original_record",
    },
  });

describe("lo que NO enrolla (ADR-196 §2.2): se toma en un punto y es de ese punto", () => {
  it("una calicata de la microparcela NO sale al pedir las de su madre", async () => {
    await crearCalicataEn(hija.id);
    expect(await listSoilProfilesForLocation(usuario.userAccountId, madre.id)).toHaveLength(0);

    // CONTROL POSITIVO: una de la MADRE sí sale. Sin esta mitad, la aserción de
    // arriba pasaría con una función que devolviera siempre [].
    await crearCalicataEn(madre.id);
    expect(await listSoilProfilesForLocation(usuario.userAccountId, madre.id)).toHaveLength(1);
  });

  it("una muestra de suelo de la microparcela NO sale al pedir las de su madre", async () => {
    // Devuelve `{ soil, foliar }`, no un array: la forma se miró antes de
    // comparar. Son DOS consultas con `locationId` pelado, y las dos se quedan así.
    await crearMuestraEn(hija.id);
    expect((await listSamplesForLocation(usuario.userAccountId, madre.id)).soil).toHaveLength(0);

    await crearMuestraEn(madre.id);
    expect((await listSamplesForLocation(usuario.userAccountId, madre.id)).soil).toHaveLength(1);
  });

  it("una foto de la microparcela NO sale al pedir las de su madre", async () => {
    // `listLandAssets` pide URL firmadas y no hay credenciales de R2 en el
    // entorno de prueba. Se espía el firmado, que es lo que hace
    // `tests/traceability/landMedia.test.ts` y lo dice en su cabecera: depender
    // de que falten las credenciales no es una prueba, es un accidente.
    const firmar = vi
      .spyOn(objectStorageProvider, "getSignedUrl")
      .mockResolvedValue("https://ejemplo.invalido/firmada");
    try {
      await crearFotoEn(hija.id);
      expect(await listLandAssets(usuario.userAccountId, madre.id)).toHaveLength(0);

      await crearFotoEn(madre.id);
      expect(await listLandAssets(usuario.userAccountId, madre.id)).toHaveLength(1);
    } finally {
      firmar.mockRestore();
    }
  });

  it("una jornada de campo de la microparcela NO sale al pedir las de su madre", async () => {
    await crearJornadaEn(hija.id, usuario.personId);
    expect(await listFieldSessions(usuario.userAccountId, madre.id)).toHaveLength(0);

    await crearJornadaEn(madre.id, usuario.personId);
    expect(await listFieldSessions(usuario.userAccountId, madre.id)).toHaveLength(1);
  });
});
