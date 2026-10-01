/**
 * Corregir una lectura de ambiente, renderizado: lo que el formulario manda.
 *
 * **Por qué se renderiza y no basta el servicio.** El motor de corregir existía
 * completo y probado desde el 2026-09-21 —`supersedesId`, motivo obligatorio,
 * sellado en transacción, con auditoría— y **ninguna pantalla lo llamaba**. Lo
 * encontró recorrer la pantalla en un navegador el 2026-10-01, no leer el
 * código: `PENDING_IMPLEMENTATIONS/020`. Una prueba del servicio no puede ver
 * esa clase de hueco, porque el servicio estaba bien.
 *
 * Lo que esta prueba SÍ puede ver es la última pulgada: que el `FormData` que
 * sale del formulario lleve `supersedesId`, que el motivo sea obligatorio desde
 * el navegador y no sólo desde el servidor, y que la corrección precargue TODO
 * lo de la original — una corrección es una fila nueva, así que lo que no se
 * reenvía se pierde en silencio.
 *
 * Lo que NO puede ver: el efecto que escribe la hora. `useEffect` no corre en
 * `renderToStaticMarkup`. Eso lo vigilan
 * `tests/arquitectura/desfase-horario-sobrevive-al-render.test.ts` y el
 * recorrido en navegador.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mensajes = JSON.parse(readFileSync("messages/es.json", "utf8")).Secado as Record<string, string>;

vi.mock("next-intl", () => ({
  useTranslations: () => (clave: string, valores?: Record<string, unknown>) => {
    const m = mensajes[clave];
    if (m === undefined) throw new Error(`falta la clave «${clave}» en messages/es.json`);
    // Sin ICU: ninguna clave de este formulario lleva plural, y una sustitución
    // simple basta para que un texto que falte reviente en vez de pintarse.
    return Object.entries(valores ?? {}).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), m);
  },
}));
vi.mock("../../app/actions/instalaciones", () => ({ registrarAmbienteFormAction: () => ({}) }));

const { FormularioAmbiente } = await import("../../app/instalaciones/FormularioAmbiente");

const BASE = {
  facilityId: "la-instalacion",
  estantes: [{ id: "el-estante", name: "Estante A", niveles: 3 }],
  nivelesSinEstante: [] as number[],
  personas: [{ id: "una-persona", nombre: "Quien tomó la muestra" }] as never,
};

const LECTURA = {
  id: "la-lectura-vieja",
  occurredAt: "2026-10-01T15:38:00.000Z",
  rackId: "el-estante",
  rackLevel: 2,
  airTemperatureC: 310,
  relativeHumidityPct: 48,
  skyCondition: "sunny",
  ventilation: "semi_open",
  notaCielo: "Sol de media mañana",
  notaVentilacion: "Cortinas laterales arriba",
  operadorPersonId: "una-persona",
};

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(FormularioAmbiente, { ...BASE, ...props } as never));

describe("el formulario de ambiente, corrigiendo", () => {
  it("sin corregir no manda supersedesId ni pide motivo", () => {
    // Cae si el formulario pinta los campos de corrección siempre: registrar
    // una lectura nueva empezaría pidiendo por qué se corrige.
    const html = render({});
    expect(html).not.toContain('name="supersedesId"');
    expect(html).not.toContain('name="correctionReason"');
    // Control positivo del render: el formulario normal sí está ahí.
    expect(html).toContain('name="facilityLocationId"');
    expect(html).toContain('name="occurredAt"');
  });

  it("corrigiendo manda la lectura que supersede y exige el motivo en el navegador", () => {
    const html = render({ corrigiendo: LECTURA });
    // Cae si falta el campo oculto: es lo único que distingue una corrección de
    // una lectura nueva, y sin él se guardarían las dos.
    expect(html).toContain('name="supersedesId"');
    expect(html).toContain('value="la-lectura-vieja"');
    // `required` en el navegador además del servidor: el motor lanza
    // `motivo_obligatorio`, y llegar al servidor para enterarse es un viaje de más.
    expect(html).toMatch(/<textarea[^>]*name="correctionReason"[^>]*required/);
    expect(html).toContain(mensajes.ambienteMotivo);
    // Y dice qué va a pasar: no edita, reemplaza.
    expect(html).toContain(mensajes.ambienteCorrigiendo);
  });

  it("precarga TODO lo de la original, porque una corrección es una fila nueva", () => {
    const html = render({ corrigiendo: LECTURA });
    // Cada uno de estos cae por separado, y cada uno es un dato que se perdería
    // en silencio al corregir: el operario arregla la temperatura y se lleva por
    // delante la nota del cielo que escribió ayer.
    for (const [campo, valor] of [
      ["rackLocationId", "el-estante"],
      ["rackLevel", "2"],
      ["temperatura", "310"],
      ["humedadRelativaPct", "48"],
      ["skyCondition", "sunny"],
      ["ventilation", "semi_open"],
      ["skyNote", "Sol de media mañana"],
      ["ventilationNote", "Cortinas laterales arriba"],
      ["operatorPersonId", "una-persona"],
    ] as const) {
      expect(html, `el campo ${campo} no llega precargado con «${valor}»`).toContain(valor);
    }
    // La unidad se precarga en °C, que es la canónica y la que la pantalla
    // enseña. No se reconstruye la que se tecleó: la fila guarda el valor en °C
    // y sólo CUÁL unidad se usó, así que volver atrás sería una conversión que
    // nadie pidió.
    expect(html).toMatch(/name="unidadTemperatura"/);
  });

  it("la hora NO sale precargada del servidor", () => {
    // El reloj de pared depende de la zona del DISPOSITIVO. Precargarlo en el
    // servidor escribiría el desfase del servidor —0 en producción—, que es el
    // fallo de cinco horas en silencio de `paraCampoLocal`. Sale vacío y lo
    // rellena un efecto en el navegador.
    const html = render({ corrigiendo: LECTURA });
    expect(html).not.toContain("2026-10-01T15:38");
    expect(html).not.toContain("2026-10-01T10:38");
  });
});
