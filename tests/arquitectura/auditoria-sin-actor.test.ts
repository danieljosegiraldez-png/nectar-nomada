/**
 * El guardia de auditoría sin actor (`scripts/auditoria-sin-actor.mjs`) distingue «no pude
 * medir» de «la corrida no dejó nada».
 *
 * Lo que vigila de verdad —que una corrida con una limpieza mala salga en rojo— necesita una
 * base y una corrida entera, y se probó así al escribirlo (ver el PR que lo trae). Lo que se
 * fija aquí es lo que una edición puede romper sin que nadie lo note: que un `contar` fallido,
 * que deja la cifra de partida vacía, no se lea como 0 y pase en verde. Sale 2 antes de
 * conectarse a nada, así que esta prueba no necesita base.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const raiz = new URL("../..", import.meta.url).pathname;
const guardia = `${raiz}scripts/auditoria-sin-actor.mjs`;

function correr(args: string[], env: Record<string, string> = {}) {
  const { DATABASE_URL: _sinBase, ...resto } = process.env;
  const r = spawnSync("node", [guardia, ...args], { env: { ...resto, ...env }, encoding: "utf8" });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

// Cada caso exige SU motivo, no sólo el 2: con una base inalcanzable, un guion que dejara
// pasar la cifra vacía también saldría 2 —por no poder conectarse—, y una prueba que sólo
// mirara el código seguiría verde. Medido al escribirla: aceptando la cifra vacía, las seis
// pasaban.
describe("auditoria-sin-actor: «no pude medir» nunca sale 0", () => {
  it.each([
    ["una cifra de partida vacía (el `contar` de antes falló)", ["comprobar", ""], "la cifra de partida no es un entero"],
    ["una cifra de partida que no es un entero", ["comprobar", "12a"], "la cifra de partida no es un entero"],
    ["sin cifra de partida", ["comprobar"], "la cifra de partida no es un entero"],
    ["un modo desconocido", ["medir"], "modo desconocido"],
  ])("%s → 2", (_caso, args, motivo) => {
    const r = correr(args, { DATABASE_URL: "postgresql://nadie@127.0.0.1:1/ninguna" });
    expect(r.codigo, r.salida).toBe(2);
    expect(r.salida).toContain(motivo);
  });

  it("sin DATABASE_URL → 2, también al contar", () => {
    const r = correr(["contar"]);
    expect(r.codigo, r.salida).toBe(2);
    expect(r.salida).toContain("falta DATABASE_URL");
  });

  it("una base a la que no se llega → 2, no un recuento", () => {
    const r = correr(["comprobar", "0"], { DATABASE_URL: "postgresql://nadie@127.0.0.1:1/ninguna" });
    expect(r.codigo, r.salida).toBe(2);
    expect(r.salida).not.toContain("Auditoría sin actor en");
  });
});
