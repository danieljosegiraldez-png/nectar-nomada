/**
 * La unidad de lo que se dio de comer: lista cerrada, sin «kg» puesto por omisión, y el servicio la
 * guarda en la forma de la lista. ADR-200 §5, pregunta 17 (Daniel, 2026-10-12): L, kg, g, ml, lb y
 * «Otra (cuál)», se guarda lo tecleado, y libras y kilos se suman al leer.
 *
 * **El defecto.** Hasta el 2026-10-14 la unidad era texto libre en las dos pantallas, y la entrada
 * rápida de la colmena arrancaba en «kg». Así, 3 libras que nadie corregía se guardaban como 3 kg, y
 * esa fila ya no se distingue de un kilo de verdad.
 *
 * Hermética: las funciones son puras y los formularios se pintan en el servidor con los textos
 * reales (`traductorDePrueba` revienta si falta una clave). Lo que llega a la base por las dos
 * puertas lo prueban `colonyEvents.test.ts` y `eventoEnLote.test.ts`, en el carril con base.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { traductorDePrueba } = await import("../helpers/traductorDePrueba");
  return { useTranslations: (espacio: string) => traductorDePrueba(espacio) };
});
// La acción de servidor arrastra la sesión y la base: aquí sólo se pinta el formulario.
vi.mock("../../app/actions/apiary", () => ({ aplicarManejoEnLoteFormAction: async () => {} }));

import { ColonyEventQuickEntry } from "../../app/components/apiary/ColonyEventQuickEntry";
import { ManejoEnLoteForm } from "../../app/components/apiary/ManejoEnLoteForm";
import { normalizarEventoDeColonia } from "../../lib/apiary/colonyEvents";
import { UNIDAD_OTRA, UNIDADES_DE_ALIMENTACION, canonizaUnidad } from "../../lib/apiary/vocabularioDeAlimentacion";
import { formDataDeHtml } from "../helpers/htmlDePrueba";

/** El `<select>` cuyo `id` es éste, con sus opciones: valor y si viene marcada. */
function selectPorId(html: string, id: string) {
  const m = new RegExp(`<select\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
  if (m === null) return null;
  return [...m[1]!.matchAll(/<option\b([^>]*)>/g)].map((o) => ({
    valor: /value="([^"]*)"/.exec(o[1]!)?.[1] ?? "",
    marcada: /\sselected(?:=""|\s|$)/.test(o[1]!),
  }));
}

describe("la lista de unidades", () => {
  it("es la del protocolo del dueño MÁS la libra, en ese orden", () => {
    expect([...UNIDADES_DE_ALIMENTACION]).toEqual(["L", "kg", "g", "ml", "lb"]);
    // Las cuatro del protocolo están todas, y en su orden: la libra se añade, no reemplaza nada.
    const protocolo = JSON.parse(readFileSync(join(process.cwd(), "protocolos/apiario-campo-v2.json"), "utf8"));
    const buscar = (nodo: unknown): string[] | null => {
      if (Array.isArray(nodo)) {
        for (const x of nodo) {
          const r = buscar(x);
          if (r) return r;
        }
        return null;
      }
      if (nodo && typeof nodo === "object") {
        const o = nodo as Record<string, unknown>;
        if (o.key === "unit" && o.coversExistingColumn === "ColonyEvent.feedingUnit") return o.options as string[];
        for (const v of Object.values(o)) {
          const r = buscar(v);
          if (r) return r;
        }
      }
      return null;
    };
    const delProtocolo = buscar(protocolo);
    expect(delProtocolo, "no se encontró la unidad de alimentación en el protocolo v2").not.toBeNull();
    expect(UNIDADES_DE_ALIMENTACION.slice(0, delProtocolo!.length)).toEqual(delProtocolo);
  });

  it("«Otra» no es una unidad: es la puerta del «¿cuál?»", () => {
    expect((UNIDADES_DE_ALIMENTACION as readonly string[]).includes(UNIDAD_OTRA)).toBe(false);
  });
});

describe("lo tecleado se guarda sin convertir, pero en la forma de la lista", () => {
  it("las de la lista, salvo mayúsculas o espacios, quedan como en la lista", () => {
    expect(canonizaUnidad("KG")).toBe("kg");
    expect(canonizaUnidad(" lb ")).toBe("lb");
    expect(canonizaUnidad("Lb")).toBe("lb");
    expect(canonizaUnidad("l")).toBe("L");
    expect(canonizaUnidad("ML")).toBe("ml");
  });

  it("lo que no está en la lista queda tal cual: no se adivina que «libras» sea lb", () => {
    expect(canonizaUnidad("libras")).toBe("libras");
    expect(canonizaUnidad("  quintal ")).toBe("quintal");
  });

  it("vacío no es una unidad", () => {
    expect(canonizaUnidad("")).toBeNull();
    expect(canonizaUnidad("   ")).toBeNull();
    expect(canonizaUnidad(null)).toBeNull();
    expect(canonizaUnidad(undefined)).toBeNull();
  });

  it("el servicio la normaliza en las DOS puertas, porque las dos pasan por aquí", () => {
    // `normalizarEventoDeColonia` es la regla que comparten el registro de una colonia y el lote
    // (ADR-136). Que devuelva la unidad canonizada es lo que obliga a las dos.
    expect(normalizarEventoDeColonia({ eventType: "feeding", feedingUnit: "KG" }).feedingUnit).toBe("kg");
    expect(normalizarEventoDeColonia({ eventType: "feeding", feedingUnit: "libras" }).feedingUnit).toBe("libras");
    expect(normalizarEventoDeColonia({ eventType: "feeding", feedingUnit: "" }).feedingUnit).toBeNull();
  });
});

describe("los formularios no proponen ninguna unidad", () => {
  const UNIDADES_Y_OTRA = [...UNIDADES_DE_ALIMENTACION, UNIDAD_OTRA];

  it("la entrada rápida de la colmena: un desplegable, sin «kg» marcado", () => {
    const html = renderToStaticMarkup(createElement(ColonyEventQuickEntry, { colonyId: "c1", selfPersonId: null }));
    const unidad = selectPorId(html, "feed-unit-c1");
    expect(unidad, "la unidad no es un desplegable").not.toBeNull();
    expect(unidad!.map((o) => o.valor)).toEqual(["", ...UNIDADES_Y_OTRA]);
    expect(unidad!.filter((o) => o.marcada && o.valor !== "")).toEqual([]);
    // Control: el desplegable de material SÍ se encuentra con el mismo lector.
    expect(selectPorId(html, "feed-material-kind-c1")?.length).toBeGreaterThan(5);
  });

  it("el lote: un desplegable, y sin elegir no se manda ninguna unidad", () => {
    const html = renderToStaticMarkup(
      createElement(ManejoEnLoteForm, {
        apiaryId: "a1",
        colmenas: [{ hiveId: "h1", identifier: "H-01", colonyId: "c1" }],
        hoy: "2026-10-14",
      }),
    );
    const unidad = selectPorId(html, "lote-unidad");
    expect(unidad, "la unidad del lote no es un desplegable").not.toBeNull();
    expect(unidad!.map((o) => o.valor)).toEqual(["", ...UNIDADES_Y_OTRA]);
    const datos = formDataDeHtml(html);
    expect(datos.get("feedingUnit") ?? "").toBe("");
    // Control: el formulario se leyó entero (el material está, con su nombre de campo).
    expect(datos.has("feedingMaterialKind")).toBe(true);
  });
});
