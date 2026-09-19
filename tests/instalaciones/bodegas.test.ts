import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { BodegaError, crearBodega, detalleBodega, listarBodegas, padresParaBodega } from "../../lib/traceability/bodegas";
import { createMicrolot, LocationAccessError, LocationValidationError } from "../../lib/traceability/locations";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let finca: string;
let beneficio: string;
const creadas: string[] = [];

beforeAll(async () => {
  f = await montarFixtures("bod");
  // Hijos del sitio A: el permiso de jefeA (Farm Manager en sitioA) se hereda.
  finca = (await prisma.location.create({ data: { locationType: "site", name: `TEST finca ${f.run}`, parentLocationId: f.sitioA, organizationId: f.orgA, status: "approved", classification: "internal" } })).id;
  beneficio = (await prisma.location.create({ data: { locationType: "beneficio", name: `TEST ben ${f.run}`, parentLocationId: finca, organizationId: f.orgA, status: "approved", classification: "internal" } })).id;
});
afterAll(async () => {
  const ids = (await prisma.location.findMany({ where: { name: { contains: f.run }, locationType: "storage_facility" }, select: { id: true } })).map((l) => l.id);
  await prisma.location.deleteMany({ where: { id: { in: [...ids, ...creadas] } } });
  await prisma.location.deleteMany({ where: { id: beneficio } });
  await prisma.location.deleteMany({ where: { id: finca } });
  await f.limpiar();
});

describe("crear una bodega", () => {
  it("el jefe la crea bajo el beneficio, con su AuditEvent y la organización del padre", async () => {
    const b = await crearBodega(f.jefeA, { parentLocationId: beneficio, name: `TEST bodega ${f.run}` });
    const row = await prisma.location.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.locationType).toBe("storage_facility");
    expect(row.organizationId).toBe(f.orgA);
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "location", entityId: b.id, operation: "location.create_storage" } });
    expect(ev?.actorUserAccountId).toBe(f.jefeA);
  });
  it("el operario no la crea (no tiene edit_beneficio)", async () => {
    await expect(crearBodega(f.operarioA, { parentLocationId: finca, name: `TEST bodega op ${f.run}` })).rejects.toThrow(LocationAccessError);
  });
  it("bajo el sitio de pruebas (una parcela) no: padre_invalido", async () => {
    await expect(crearBodega(f.jefeA, { parentLocationId: f.sitioA, name: `TEST bodega p ${f.run}` })).rejects.toThrow(new BodegaError("padre_invalido"));
  });
  it("un nombre repetido bajo el mismo padre sale legible", async () => {
    await crearBodega(f.jefeA, { parentLocationId: finca, name: `TEST rep ${f.run}` });
    await expect(crearBodega(f.jefeA, { parentLocationId: finca, name: ` test REP ${f.run} ` })).rejects.toThrow(new BodegaError("nombre_repetido"));
  });
  it("sin nombre: datos_invalidos", async () => {
    await expect(crearBodega(f.jefeA, { parentLocationId: finca, name: "  " })).rejects.toThrow(new BodegaError("datos_invalidos"));
  });
  // Ronda 1: un `parentLocationId` que no existe no puede distinguirse, desde
  // fuera, de uno que existe pero al que no se tiene edit_beneficio — las dos
  // negativas caen en el MISMO tipo de error, `LocationAccessError`, sin
  // importar si quien pregunta tiene el permiso en algún otro lado (jefeA) o
  // en ninguno (ajeno). Si `crearBodega` mirara el padre antes de exigir el
  // permiso, esto sería un `BodegaError("padre_invalido")` para los dos, y
  // eso sí sería un oráculo de existencia entre organizaciones.
  it("un padre que no existe no se distingue de uno sin permiso: LocationAccessError para cualquiera", async () => {
    const inexistente = "00000000-0000-4000-8000-000000000000";
    await expect(crearBodega(f.ajeno, { parentLocationId: inexistente, name: `TEST fantasma ${f.run}` })).rejects.toThrow(LocationAccessError);
    await expect(crearBodega(f.jefeA, { parentLocationId: inexistente, name: `TEST fantasma ${f.run}` })).rejects.toThrow(LocationAccessError);
  });
});

describe("ver bodegas", () => {
  it("padresParaBodega ofrece la finca y el beneficio al jefe, y nada al ajeno", async () => {
    const ids = (await padresParaBodega(f.jefeA)).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([finca, beneficio]));
    expect(ids).not.toContain(f.sitioA);
    expect(await padresParaBodega(f.ajeno)).toEqual([]);
  });
  it("listarBodegas: el jefe las ve, el operario de B no", async () => {
    const b = await crearBodega(f.jefeA, { parentLocationId: finca, name: `TEST vis ${f.run}` });
    expect((await listarBodegas(f.jefeA)).map((x) => x.id)).toContain(b.id);
    expect((await listarBodegas(f.operarioB)).map((x) => x.id)).not.toContain(b.id);
  });
  it("detalleBodega de un lugar que no es bodega: no_es_bodega", async () => {
    await expect(detalleBodega(f.jefeA, beneficio)).rejects.toThrow(new BodegaError("no_es_bodega"));
  });
});

describe("una bodega es configuración del beneficio", () => {
  it("no se subdivide en microlotes", async () => {
    const b = await crearBodega(f.jefeA, { parentLocationId: finca, name: `TEST micro ${f.run}` });
    await expect(
      createMicrolot(f.jefeA, { parentLocationId: b.id, name: `TEST m ${f.run}`, subdivisionReason: "other", subdivisionReasonNote: "x" } as never),
    ).rejects.toThrow(new LocationValidationError("bodega_no_se_subdivide"));
  });

  it("editar sus atributos por el camino genérico exige edit_beneficio", async () => {
    const { exigeEditarBeneficioSiLoEs } = await import("../../lib/traceability/locations");
    const b = await crearBodega(f.jefeA, { parentLocationId: finca, name: `TEST attr ${f.run}` });
    await expect(exigeEditarBeneficioSiLoEs(f.operarioA, b.id)).rejects.toThrow(LocationAccessError);
    await expect(exigeEditarBeneficioSiLoEs(f.jefeA, b.id)).resolves.toBeUndefined();
  });
});
