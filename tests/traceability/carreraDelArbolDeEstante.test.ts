import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { prisma } from "../../lib/db";

/**
 * F1 (revisión final 2 del plan 2a de secado): `exigir_arbol_de_estante` leía
 * el tipo del PADRE sin bloquearlo — la misma carrera que
 * `carreraDeOrganizacionDeBandeja.test.ts` cerró para el pesaje, dejada
 * abierta aquí. Migración `20260918191900_bloquear_el_padre_del_estante`
 * añade `FOR SHARE` a esa lectura.
 *
 * Dos conexiones RAW de `pg`, mismo patrón que la prueba hermana: una
 * mantiene un `UPDATE` del tipo del padre abierto 1,5 s; la otra intenta
 * insertar un estante hijo mientras tanto y se mide cuánto esperó.
 */

function nombre(etiqueta: string) {
  return `TEST ${etiqueta}-${randomUUID().slice(0, 8)}`;
}

const locationIds: string[] = [];

let sitio: string;
let instalacion: string;

beforeAll(async () => {
  const s = await prisma.location.create({ data: { locationType: "site", name: nombre("sitio-carrera-estante"), status: "approved", classification: "internal" } });
  sitio = s.id;
  locationIds.push(sitio);
  const inv = await prisma.location.create({ data: { locationType: "drying_facility", name: nombre("instalacion-carrera"), parentLocationId: sitio, classification: "internal" } });
  instalacion = inv.id;
  locationIds.push(instalacion);
});

afterAll(async () => {
  // Hijos antes que padres (parentLocationId con FK RESTRICT).
  await prisma.location.deleteMany({ where: { parentLocationId: { in: locationIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
});

it("un INSERT de estante espera a un UPDATE concurrente del tipo del padre, y entonces rechaza (no cuelga de un tipo viejo)", async () => {
  const clientA = new Client({ connectionString: process.env.DATABASE_URL });
  const clientB = new Client({ connectionString: process.env.DATABASE_URL });
  await clientA.connect();
  await clientB.connect();
  try {
    await clientA.query("BEGIN");
    // Cambia el tipo de la instalación a `site` sin confirmar todavía —
    // válido aquí porque todavía no tiene ningún hijo `drying_rack`.
    await clientA.query('UPDATE "core"."location" SET "location_type" = \'site\' WHERE "id" = $1', [instalacion]);
    const cierre = clientA.query("SELECT pg_sleep(1.5)").then(() => clientA.query("COMMIT"));

    await new Promise((r) => setTimeout(r, 150));

    const inicio = Date.now();
    let error: unknown = null;
    try {
      await clientB.query(
        `INSERT INTO "core"."location" ("location_type","name","parent_location_id","classification")
         VALUES ('drying_rack', $1, $2, 'internal')`,
        [nombre("estante-carrera"), instalacion],
      );
    } catch (e) {
      error = e;
    }
    const esperoMs = Date.now() - inicio;
    await cierre;

    expect(esperoMs).toBeGreaterThanOrEqual(1000);
    expect(error).toBeTruthy();
    expect(String((error as Error).message)).toMatch(/estante debe colgar de una instalacion/);
  } finally {
    await clientA.query("ROLLBACK").catch(() => {});
    await clientA.end();
    await clientB.end();
  }
}, 15_000);
