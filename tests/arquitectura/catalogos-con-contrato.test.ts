/**
 * Toda tabla de catálogo de referencia cumple el contrato del spec de catálogos
 * (§2): dueño anulable, procedencia, retiro — y nadie la borra desde el código.
 *
 * Lee `lib/catalogos/registro.ts`: una tabla que no se registra no queda
 * protegida, y el comentario del registro lo dice.
 *
 * Mira formas escritas, como sus vecinos: un suelo, no un techo.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGOS } from "../../lib/catalogos/registro";

const RAIZ = new URL("../..", import.meta.url).pathname;
const ESQUEMA = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");

function cuerpoDelModelo(esquema: string, modelo: string): string | null {
  const m = esquema.match(new RegExp(`\\nmodel ${modelo} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1]! : null;
}

function faltasDelContrato(cuerpo: string): string[] {
  const faltas: string[] = [];
  if (!/\n\s*organizationId\s+String\?/.test(cuerpo)) faltas.push("organizationId anulable");
  if (!/\n\s*provenanceClass\s+ProvenanceClass\b/.test(cuerpo)) faltas.push("provenanceClass");
  if (!/\n\s*retiredAt\s+DateTime\?/.test(cuerpo)) faltas.push("retiredAt");
  return faltas;
}

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir)) {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (/\.(ts|tsx)$/.test(e)) salida.push(ruta);
  }
  return salida;
}

function borrados(src: string, delegado: string): number {
  return (src.match(new RegExp(`\\.${delegado}\\s*\\.\\s*delete(Many)?\\s*\\(`, "g")) ?? []).length;
}

describe("catálogos de referencia: el contrato común", () => {
  it("cada tabla registrada tiene dueño anulable, procedencia y retiro", () => {
    const culpables: string[] = [];
    for (const c of CATALOGOS) {
      const cuerpo = cuerpoDelModelo(ESQUEMA, c.modelo);
      if (cuerpo === null) culpables.push(`${c.modelo}: no existe en schema.prisma`);
      else for (const f of faltasDelContrato(cuerpo)) culpables.push(`${c.modelo}: falta ${f}`);
    }
    expect(culpables).toEqual([]);
  });

  it("ningún archivo de lib/ ni app/ borra una tabla de catálogo", () => {
    const culpables: string[] = [];
    for (const f of [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app"))]) {
      const src = readFileSync(f, "utf8");
      for (const c of CATALOGOS) if (borrados(src, c.delegado) > 0) culpables.push(`${relative(RAIZ, f)}: ${c.delegado}`);
    }
    expect(culpables, "se retira (retiredAt), no se borra").toEqual([]);
  });

  /** Control positivo: sin esto, un registro vacío o un lector roto dan cero culpables. */
  it("está mirando de verdad", () => {
    expect(CATALOGOS.length).toBeGreaterThan(0);
    expect(cuerpoDelModelo(ESQUEMA, "EquipmentModel")).not.toBeNull();
    expect(faltasDelContrato("\n  name String\n")).toEqual(["organizationId anulable", "provenanceClass", "retiredAt"]);
    expect(borrados("await prisma.equipmentModel.deleteMany({})", "equipmentModel")).toBe(1);
    expect(borrados("await prisma.equipmentModel.update({})", "equipmentModel")).toBe(0);
  });
});
