/**
 * Ubicaciones emparentadas — spec fitosanitario §3.3, Tarea 3 del plan.
 *
 * Árbol: finca → parcela A → micro A1; y parcela B, hermana de A. La función
 * no autoriza nada — sólo dice qué ubicaciones comparten genealogía para que
 * la carencia de una intervención en la microparcela alcance también a una
 * cosecha registrada en la parcela madre, y viceversa. Un HERMANO no.
 *
 * Mismo andamiaje que `tests/inventario/consumo-descuenta.test.ts`: RUN_ID,
 * `createTestOrganization`, limpieza con `assertDefinedWhere` en `afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/db";
import { ubicacionesEmparentadas } from "../../lib/traceability/ubicacionesEmparentadas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `ue-${Date.now()}`;

let organizationId: string;
let finca: string;
let parcelaA: string;
let parcelaB: string;
let microA1: string;
let cicloX: string;
let cicloY: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);

  const f = await prisma.location.create({
    data: { name: `TEST Finca (${RUN_ID})`, locationType: "site", classification: "internal", organizationId },
  });
  finca = f.id;

  const a = await prisma.location.create({
    data: { name: `TEST Parcela A (${RUN_ID})`, locationType: "plot", classification: "internal", organizationId, parentLocationId: finca },
  });
  parcelaA = a.id;

  const b = await prisma.location.create({
    data: { name: `TEST Parcela B (${RUN_ID})`, locationType: "plot", classification: "internal", organizationId, parentLocationId: finca },
  });
  parcelaB = b.id;

  const a1 = await prisma.location.create({
    data: { name: `TEST Micro A1 (${RUN_ID})`, locationType: "micro_plot", classification: "internal", organizationId, parentLocationId: parcelaA },
  });
  microA1 = a1.id;

  // El ciclo: dos `create` y luego un `update` del primero para cerrarlo.
  // El esquema no lo impide — nada obliga a que `parentLocationId` forme un
  // árbol.
  const x = await prisma.location.create({
    data: { name: `TEST Ciclo X (${RUN_ID})`, locationType: "site", classification: "internal", organizationId },
  });
  cicloX = x.id;
  const y = await prisma.location.create({
    data: { name: `TEST Ciclo Y (${RUN_ID})`, locationType: "plot", classification: "internal", organizationId, parentLocationId: cicloX },
  });
  cicloY = y.id;
  await prisma.location.update({ where: { id: cicloX }, data: { parentLocationId: cicloY } });
}, 30000);

afterAll(async () => {
  // Romper el ciclo ANTES de borrar: con `parentLocationId` apuntando el uno
  // al otro, ninguno de los dos se puede borrar primero.
  await prisma.location.update({ where: { id: cicloX }, data: { parentLocationId: null } });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [microA1, parcelaA, parcelaB, cicloY, cicloX, finca] } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("ubicacionesEmparentadas", () => {
  it("desde la parcela: ella, su finca y su microparcela; NO la hermana", async () => {
    const r = await ubicacionesEmparentadas(parcelaA);
    expect(new Set(r)).toEqual(new Set([parcelaA, finca, microA1]));
  });

  it("desde la microparcela: sube a la parcela y a la finca", async () => {
    expect(new Set(await ubicacionesEmparentadas(microA1))).toEqual(new Set([microA1, parcelaA, finca]));
  });

  it("un ciclo de parentLocationId termina", async () => {
    const r = await ubicacionesEmparentadas(cicloX);
    expect(new Set(r)).toEqual(new Set([cicloX, cicloY]));
  });

  it("subir corta el ciclo pronto: no gasta las 12 vueltas del tope", async () => {
    // El resultado final da igual con o sin la guarda `vistos.has(padre)` al
    // subir — el tope de 12 y el `Set` idempotente convergen al mismo par—,
    // así que lo único que demuestra que la guarda hace algo es CONTAR: sin
    // ella, cicloX↔cicloY se recorre las 12 vueltas enteras.
    let llamadas = 0;
    // Cliente acotado: delega en `prisma` y sólo añade el contador sobre
    // `findUnique`, que es lo único que el ascenso llama. Nada de mocks de
    // módulo — es el mismo cliente real, envuelto.
    const contador = {
      location: {
        findUnique: (args: Prisma.LocationFindUniqueArgs) => {
          llamadas += 1;
          return prisma.location.findUnique(args);
        },
        findMany: (args: Prisma.LocationFindManyArgs) => prisma.location.findMany(args),
      },
    } as unknown as Prisma.TransactionClient;

    const r = await ubicacionesEmparentadas(cicloX, contador);
    expect(new Set(r)).toEqual(new Set([cicloX, cicloY]));
    expect(llamadas).toBeLessThanOrEqual(3);
  });
});
