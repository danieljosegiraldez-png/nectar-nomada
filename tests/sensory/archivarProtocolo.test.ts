/**
 * Retirar un protocolo no borra nada.
 *
 * **Qué hace y qué no, dicho aquí porque es fácil creer lo contrario.** Poner un
 * protocolo en `archived` conserva la fila y todo lo que cuelga de ella. Medido
 * el 2026-09-06: **hoy nada más en el código filtra por ese estado**, porque no
 * hay ningún sitio donde alguien elija un protocolo. Su efecto real es que el
 * listado de la herramienta deja de mezclarlo con los vivos — que es lo que
 * permitió que cinco protocolos `TEST` llevaran meses en producción sin que
 * nadie los notara.
 *
 * Estas pruebas ejercen el servicio de datos, no el script: lo que importa es
 * que el estado cambie, que sea idempotente y que no se lleve nada por delante.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `arch-${Date.now()}`;
let protocoloId: string, versionId: string, sesionId: string;

beforeAll(async () => {
  const p = await prisma.sensoryProtocol.create({
    data: { domain: "coffee", name: `TEST archivar ${RUN}`, status: "active", standardLicenseStatus: "adapted_original" },
  });
  protocoloId = p.id;
  const v = await prisma.sensoryProtocolVersion.create({
    data: { protocolId: p.id, version: 1, scoreMin: 0, scoreMax: 10, status: "active" },
  });
  versionId = v.id;
  await prisma.sensoryAttribute.create({
    data: { protocolVersionId: v.id, name: "Aroma", displayOrder: 0, scaleMin: 0, scaleMax: 10, section: "descriptive" },
  });
  const s = await prisma.sensorySession.create({
    data: { name: `TEST sesión ${RUN}`, protocolVersionId: v.id, status: "completed", classification: "internal" },
  });
  sesionId = s.id;
});

afterAll(async () => {
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: sesionId }) });
  await prisma.sensoryAttribute.deleteMany({ where: assertDefinedWhere({ protocolVersionId: versionId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: versionId }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: protocoloId }) });
});

/** Lo mismo que hace el script, sin su envoltorio de consola. */
async function archivar(id: string) {
  return prisma.sensoryProtocol.update({ where: { id }, data: { status: "archived" } });
}

describe("retirar un protocolo", () => {
  it("cambia el estado a archived", async () => {
    expect((await prisma.sensoryProtocol.findUniqueOrThrow({ where: { id: protocoloId } })).status).toBe("active");
    await archivar(protocoloId);
    expect((await prisma.sensoryProtocol.findUniqueOrThrow({ where: { id: protocoloId } })).status).toBe("archived");
  });

  /**
   * El control que importa: retirar no es borrar. Si un día alguien cambia esto
   * por un `delete`, la sesión y sus puntajes desaparecerían con él — y un
   * puntaje dado bajo un protocolo retirado sigue significando lo que
   * significaba.
   */
  it("no se lleva por delante ni la versión, ni sus atributos, ni las sesiones", async () => {
    expect(await prisma.sensoryProtocolVersion.findUnique({ where: { id: versionId } })).not.toBeNull();
    expect(await prisma.sensoryAttribute.count({ where: assertDefinedWhere({ protocolVersionId: versionId }) })).toBe(1);
    expect(await prisma.sensorySession.findUnique({ where: { id: sesionId } })).not.toBeNull();
  });

  it("es idempotente: retirarlo dos veces lo deja igual", async () => {
    await archivar(protocoloId);
    expect((await prisma.sensoryProtocol.findUniqueOrThrow({ where: { id: protocoloId } })).status).toBe("archived");
  });

  /**
   * Control positivo del listado: `archived` y `active` se distinguen de verdad
   * en una consulta. Sin esto, un filtro que devolviera siempre todo pasaría las
   * pruebas de arriba.
   */
  it("un filtro por estado los separa de verdad", async () => {
    const retirados = await prisma.sensoryProtocol.findMany({
      where: assertDefinedWhere({ status: "archived" as const, name: { contains: RUN } }),
    });
    const vivos = await prisma.sensoryProtocol.findMany({
      where: assertDefinedWhere({ status: "active" as const, name: { contains: RUN } }),
    });
    expect(retirados).toHaveLength(1);
    expect(vivos, "si el filtro no discriminara, éste también traería uno").toHaveLength(0);
  });
});
