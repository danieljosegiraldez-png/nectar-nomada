/**
 * El emplazamiento temporal — Anexo E §9.
 *
 * **Lo que este archivo sostiene:** que «las colmenas que estuvieron y los días efectivos»
 * es una pregunta que el módulo **no podía contestar hasta ADR-126**. El único camino de una
 * colmena a su apiario era `hive.locationId`, que dice dónde está **ahora**. El `it` llamado
 * «LA AFIRMACIÓN DE ESTA REBANADA» lo mide: una colmena que se fue a mitad de la ventana
 * cuenta sus días y no más, aunque hoy esté en otro sitio.
 *
 * Todo lo puro se prueba sin base; sólo el lector cruza `HivePlacement`.
 */
import { describe, expect, it } from "vitest";
import { avisoDeFloracion, diasEfectivosDe, DIAS_DE_AVISO_DE_FLORACION } from "../../lib/apiary/emplazamiento";

const DIA = 86_400_000;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const VENTANA_INI = d("2026-10-01");
const VENTANA_FIN = d("2026-10-31");

describe("los días efectivos dentro de la ventana", () => {
  it("una colocación que cubre toda la ventana cuenta la ventana entera, no la colocación", () => {
    // Llegó en agosto y sigue: lo que se factura son los 30 días de octubre.
    expect(diasEfectivosDe([{ startedAt: d("2026-08-01"), endedAt: null }], VENTANA_INI, VENTANA_FIN)).toBe(30);
  });

  it("LA AFIRMACIÓN DE ESTA REBANADA: una que se fue a mitad cuenta sólo hasta que se fue", () => {
    // Esto es lo que `hive.locationId` no puede contestar: hoy esta colmena está en otro
    // apiario, y aun así sus días en la ventana son 15.
    expect(
      diasEfectivosDe([{ startedAt: d("2026-09-20"), endedAt: d("2026-10-16") }], VENTANA_INI, VENTANA_FIN),
    ).toBe(15);
  });

  it("dos estancias de la misma colmena se suman, y el hueco de en medio no cuenta", () => {
    const cols = [
      { startedAt: d("2026-10-01"), endedAt: d("2026-10-06") },
      { startedAt: d("2026-10-21"), endedAt: d("2026-10-26") },
    ];
    expect(diasEfectivosDe(cols, VENTANA_INI, VENTANA_FIN)).toBe(10);
  });

  it("una colocación FUERA de la ventana cuenta cero, y no resta", () => {
    const fuera = [{ startedAt: d("2026-06-01"), endedAt: d("2026-07-01") }];
    expect(diasEfectivosDe(fuera, VENTANA_INI, VENTANA_FIN)).toBe(0);
    // Y el control que importa: mezclada con una buena, no le resta días. Sin el
    // `Math.max(0, …)` antes de sumar, el solape negativo saldría restando y el total
    // sería plausible y falso.
    const mezcla = [...fuera, { startedAt: d("2026-10-01"), endedAt: d("2026-10-11") }];
    expect(diasEfectivosDe(mezcla, VENTANA_INI, VENTANA_FIN)).toBe(10);
  });

  it("ninguna colocación son cero días, no un error", () => {
    expect(diasEfectivosDe([], VENTANA_INI, VENTANA_FIN)).toBe(0);
  });

  it("medio día cuenta como día: media jornada polinizando es polinizar", () => {
    const medio = [{ startedAt: new Date(VENTANA_INI.getTime()), endedAt: new Date(VENTANA_INI.getTime() + DIA / 2) }];
    expect(diasEfectivosDe(medio, VENTANA_INI, VENTANA_FIN)).toBe(1);
  });
});

describe("el aviso de floración con la meta incompleta", () => {
  const base = { bloomStartsAt: d("2026-10-10"), committedHives: 80, committedHectares: 17, targetHivesPerHectareMin: 4 };
  const ahora = d("2026-10-01");

  it("avisa cuando la floración se acerca y faltan colmenas", () => {
    const r = avisoDeFloracion(base, 50, ahora);
    expect(r.avisa).toBe(true);
    expect(r.diasHastaFloracion).toBe(9);
    expect(r.faltan).toBe(30);
  });

  it("NO avisa si la meta está cubierta, aunque la floración esté encima", () => {
    expect(avisoDeFloracion(base, 80, ahora).avisa).toBe(false);
    expect(avisoDeFloracion(base, 95, ahora).faltan).toBe(0);
  });

  it("NO avisa sin ventana de floración declarada — una ausencia no es un incumplimiento", () => {
    const r = avisoDeFloracion({ ...base, bloomStartsAt: null }, 0, ahora);
    expect(r.avisa).toBe(false);
    expect(r.diasHastaFloracion).toBeNull();
    // Pero el déficit se sigue diciendo: lo que no se sabe es CUÁNDO, no cuántas faltan.
    expect(r.faltan).toBe(80);
  });

  it("NO avisa cuando la floración YA abrió: entonces no «se acerca»", () => {
    const tarde = avisoDeFloracion(base, 10, d("2026-10-20"));
    expect(tarde.avisa).toBe(false);
    expect(tarde.diasHastaFloracion).toBe(-10);
    expect(tarde.faltan).toBe(70);
  });

  it("fuera de la antelación no avisa, y en el borde exacto sí", () => {
    const lejos = avisoDeFloracion(base, 0, d("2026-09-01"));
    expect(lejos.avisa).toBe(false);
    expect(lejos.diasHastaFloracion).toBeGreaterThan(DIAS_DE_AVISO_DE_FLORACION);
    const borde = avisoDeFloracion(base, 0, new Date(base.bloomStartsAt.getTime() - DIAS_DE_AVISO_DE_FLORACION * DIA));
    expect(borde.diasHastaFloracion).toBe(DIAS_DE_AVISO_DE_FLORACION);
    expect(borde.avisa).toBe(true);
  });

  it("sin número comprometido, la meta sale del cociente — y se redondea HACIA ARRIBA", () => {
    // 17 ha × 4 = 68. Con 60 presentes faltan 8.
    const sinNumero = { ...base, committedHives: null };
    expect(avisoDeFloracion(sinNumero, 60, ahora).faltan).toBe(8);
    // Y con una fracción: 17,5 × 4 = 70 exactos; 17,6 × 4 = 70,4 → 71, porque 70 colmenas
    // no cubren 70,4 y redondear hacia abajo diría que la meta está cumplida.
    expect(avisoDeFloracion({ ...sinNumero, committedHectares: 17.6 }, 70, ahora).faltan).toBe(1);
  });
});
