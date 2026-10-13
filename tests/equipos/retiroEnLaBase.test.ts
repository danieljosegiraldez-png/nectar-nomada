import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

/**
 * `equipment_retiro_completo` (Parte 2c §4.5): un equipo `retired` dice cuándo y por qué. **Vive en la base y no sólo en
 * `retirarEquipo`**, porque una restricción que vive en TypeScript no existe para un importador ni para SQL directo —regla
 * de la casa—. Esta prueba escribe por SQL, saltándose el servicio.
 *
 * **Cada rechazo lleva al lado su control positivo, en OTRA prueba**: lo válido SÍ entra. Sin él, «no entró» no prueba nada
 * (CLAUDE.md, «Ocho guardias falsos en un día»: una sonda cuya fila ni siquiera se construyó se lee igual que un rechazo).
 * Y por eso la mutación que quita el CHECK de la base hace caer SÓLO la primera prueba: la segunda sigue pasando y demuestra
 * que la sonda mide algo.
 *
 * Cada sentencia corre dentro de una transacción que SIEMPRE se deshace (el mismo recurso que `tests/apiary/alzas.test.ts`):
 * si la regla la rechaza, sale con el nombre de la restricción; si entra, lanza a propósito para deshacerla. Nada queda escrito.
 */
const RUN_ID = `retb-${Date.now()}`;
const RECHAZADO = "equipment_retiro_completo";
let organizationId: string;
let equipoId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const e = await prisma.equipment.create({
    data: { name: `TEST retiro en la base (${RUN_ID})`, kind: "vessel", format: "other", organizationId, provenanceClass: "original_record" },
  });
  equipoId = e.id;
});

afterAll(async () => {
  const pasos: [string, () => Promise<unknown>][] = [
    ["equipment", () => prisma.equipment.deleteMany({ where: assertDefinedWhere({ organizationId }) })],
    ["organization", () => deleteTestOrganizations(RUN_ID)],
  ];
  const fallos: string[] = [];
  for (const [nombre, paso] of pasos) {
    try {
      await paso();
    } catch (e) {
      const lineas = (e as Error).message.split("\n").map((l) => l.trim()).filter(Boolean);
      fallos.push(`${nombre}: ${lineas[lineas.length - 1] ?? "(sin mensaje)"}`);
    }
  }
  if (fallos.length > 0) process.stdout.write(`\n[FUGA] la limpieza de ${RUN_ID} dejó filas: ${fallos.join(" | ")}\n`);
});

/** Corre una sentencia y dice «entra» o el nombre de la regla que la rechazó. Siempre se deshace. */
async function sonda(sql: string): Promise<string> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error("DESHACER");
    });
  } catch (e) {
    const mensaje = (e as Error).message;
    if (mensaje.includes("DESHACER")) return "entra";
    return mensaje.includes(RECHAZADO) ? RECHAZADO : mensaje.slice(0, 240);
  }
  return "?";
}

const poner = (set: string) => `UPDATE core.equipment SET ${set} WHERE id = '${equipoId}'`;
const alta = (columnas: string, valores: string) =>
  `INSERT INTO core.equipment (name, kind, organization_id, provenance_class${columnas})
   VALUES ('TEST sonda ${RUN_ID}', 'vessel', '${organizationId}', 'original_record'${valores})`;

describe("el CHECK equipment_retiro_completo", () => {
  it("un retirado sin fecha, sin motivo o con el motivo en blanco no entra, ni por UPDATE ni por INSERT", async () => {
    expect(await sonda(poner(`lifecycle_status = 'retired'`)), "sin fecha ni motivo").toBe(RECHAZADO);
    expect(await sonda(poner(`lifecycle_status = 'retired', retired_at = now()`)), "sin motivo").toBe(RECHAZADO);
    expect(await sonda(poner(`lifecycle_status = 'retired', retiro_motivo = 'se rompió'`)), "sin fecha").toBe(RECHAZADO);
    expect(await sonda(poner(`lifecycle_status = 'retired', retired_at = now(), retiro_motivo = ''`)), "motivo vacío").toBe(RECHAZADO);
    expect(await sonda(poner(`lifecycle_status = 'retired', retired_at = now(), retiro_motivo = '   '`)), "motivo en blanco").toBe(RECHAZADO);
    expect(await sonda(alta(", lifecycle_status", ", 'retired'")), "INSERT sin fecha ni motivo").toBe(RECHAZADO);
    expect(await sonda(alta(", lifecycle_status, retired_at", ", 'retired', now()")), "INSERT sin motivo").toBe(RECHAZADO);
  });

  it("lo válido SÍ entra (control positivo de la sonda): retirado completo, y un equipo activo sin nada", async () => {
    expect(await sonda(poner(`lifecycle_status = 'retired', retired_at = now(), retiro_motivo = 'se rompió la válvula'`)), "UPDATE completo").toBe("entra");
    expect(await sonda(alta("", "")), "INSERT activo").toBe("entra");
    expect(await sonda(alta(", lifecycle_status, retired_at, retiro_motivo", ", 'retired', now(), 'se vendió'")), "INSERT retirado completo").toBe("entra");
  });
});
