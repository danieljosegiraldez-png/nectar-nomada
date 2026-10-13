/**
 * El formulario de empezar una fermentación, renderizado, y la fuente de su página: el tanque se ELIGE y el nombre queda aparte
 * (Parte 2c, arreglos previos §4.1 y decisión D2 de Daniel, 2026-10-04).
 *
 * **Por qué se renderiza.** No hay arnés que renderice páginas de servidor, y una prueba del servicio no puede ver la última pulgada:
 * que el `<select>` se llame `vesselEquipmentId` (si no, la acción no recibe el tanque), que cada opción diga por qué no está libre,
 * y que el nombre escrito quede dentro de «El tanque no está registrado» y no suelto. Patrón de
 * `tests/instalaciones/corregir-una-lectura-de-ambiente.test.ts`: `next-intl` simulado con `messages/es.json`, así que un texto sin clave
 * REVIENTA en vez de pintar la clave cruda, y `renderToStaticMarkup` sobre el componente real.
 *
 * **La página no se renderiza** (es de servidor y `async`): se lee su fuente SIN COMENTARIOS, como hace `mensajesDeProceso.test.ts`
 * con la acción. Dice que la lista se carga en el servidor, sólo si el formulario se va a ofrecer, y que se pasa al formulario.
 *
 * Hermético: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`. Cada prueba lleva anotada la mutación que la hace caer.
 */
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mensajes = JSON.parse(readFileSync("messages/es.json", "utf8")).Traceability as Record<string, string>;

vi.mock("next-intl", () => ({
  useTranslations: () => (clave: string, valores?: Record<string, unknown>) => {
    const m = mensajes[clave];
    if (m === undefined) throw new Error(`falta la clave «${clave}» en messages/es.json`);
    return Object.entries(valores ?? {}).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), m);
  },
}));
vi.mock("../../app/actions/traceability", () => ({ startFermentationAction: () => ({}) }));

const { FermentationForm } = await import("../../app/components/traceability/FermentationForm");

const RECIPIENTES = [
  { id: "t-libre", label: "Tanque libre", libreYSano: true, motivos: [] },
  { id: "t-uso", label: "Tanque en uso", libreYSano: false, motivos: ["EN_USO"] },
  { id: "t-sucio", label: "Tanque sucio", libreYSano: false, motivos: ["CONDICION"] },
  { id: "t-ambos", label: "Tanque ambos", libreYSano: false, motivos: ["EN_USO", "CONDICION"] },
];

const pintar = (recipientes: unknown[] = RECIPIENTES) =>
  renderToStaticMarkup(createElement(FermentationForm, { lotId: "el-lote", recetaDelProceso: null, recipientes } as never));

/** El texto de la opción con ese `value`. El primer `<option>` sale con `selected=""` (el `defaultValue` del select). */
const textoDeLaOpcion = (html: string, id: string) => html.match(new RegExp(`<option value="${id}"[^>]*>([^<]*)</option>`))?.[1];

/** Los comentarios fuera, SALTANDO las cadenas (copia de la de `mensajesDeProceso.test.ts`: importar una prueba registraría sus `describe` aquí). */
function sinComentarios(fuente: string): string {
  return fuente.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`)|\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm,
    (_coincidencia, cadena?: string) => cadena ?? "",
  );
}

describe("el formulario de empezar una fermentación (§4.1, D2)", () => {
  it("ofrece el tanque registrado en un select, con la opción vacía primero", () => {
    // Cae si el select pierde su nombre: la acción lee `vesselEquipmentId` y sin él nunca recibe el tanque.
    const html = pintar();
    expect(html).toMatch(/<select[^>]*name="vesselEquipmentId"[^>]*>\s*<option value=""/);
    expect(textoDeLaOpcion(html, "")).toBe(mensajes.vesselNoneOption);
    for (const r of RECIPIENTES) {
      expect(textoDeLaOpcion(html, r.id), `falta la opción de ${r.id}`).toBeDefined();
    }
  });

  it("cada opción dice por qué no está libre: el estado va detrás del nombre", () => {
    // Cae si se quita el estado «en uso» (o el de condición): quien elige no se entera de que el tanque está ocupado.
    const html = pintar();
    expect(textoDeLaOpcion(html, "t-libre")).toBe("Tanque libre");
    expect(textoDeLaOpcion(html, "t-uso")).toBe(`Tanque en uso · ${mensajes.vesselStateInUse}`);
    expect(textoDeLaOpcion(html, "t-sucio")).toBe(`Tanque sucio · ${mensajes.vesselStateNeedsAttention}`);
    expect(textoDeLaOpcion(html, "t-ambos")).toBe(
      `Tanque ambos · ${mensajes.vesselStateInUse}, ${mensajes.vesselStateNeedsAttention}`,
    );
  });

  it("el nombre escrito va aparte, dentro de «El tanque no está registrado», y sin el placeholder en inglés", () => {
    // Cae si el campo del nombre sale del `<details>`: dejaría de ser la vía para un tanque no registrado y volvería a ser el
    // campo principal, que es lo que D2 cambió.
    const html = pintar();
    const detalle = html.match(/<details[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(detalle).toContain(`<summary>${mensajes.vesselNoteSummary}</summary>`);
    expect(detalle).toContain('name="vesselNote"');
    // Control: fuera del detalle el nombre NO está, y el select tampoco está dentro.
    expect(html.replace(detalle, "")).not.toContain('name="vesselNote"');
    expect(detalle).not.toContain('name="vesselEquipmentId"');
    expect(html).not.toContain("Tank 3");
  });

  it("sin tanques registrados el detalle del nombre sale abierto; con tanques, cerrado", () => {
    // Cae si el detalle no se abre solo cuando no hay nada que elegir: quien opera tendría que adivinar que ahí se escribe el tanque.
    expect(pintar([])).toMatch(/<details open=""/);
    expect(pintar()).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it("sigue mandando el lote y el resto de los campos", () => {
    // Control positivo del render: el formulario entero está ahí, así que las pruebas de arriba no pasan sobre un HTML vacío.
    const html = pintar();
    expect(html).toContain('name="lotId"');
    expect(html).toContain('value="el-lote"');
    for (const campo of ["quantity", "unit", "inoculated", "inoculationNote"]) {
      expect(html, `falta el campo ${campo}`).toContain(`name="${campo}"`);
    }
  });
});

describe("la página de empezar una fermentación", () => {
  const PAGINA = sinComentarios(readFileSync("app/lots/[id]/fermentation/new/page.tsx", "utf8"));

  it("carga los recipientes en el servidor y se los pasa al formulario, sólo si el formulario se va a ofrecer", () => {
    // Cae si se deja de pasar la lista (`recipientes={[]}`): el select saldría vacío y la corrida sólo podría empezar por nombre.
    expect(PAGINA).toMatch(/aviso === null \? await recipientesParaFermentar\(user\.userAccountId, lot\.id\) : \[\]/);
    expect(PAGINA).toContain("recipientes={recipientes}");
    // Control: sigue decidiendo con la misma función que corre el servicio (`corridaConProceso.test.ts:613-617` lo exige también).
    expect(PAGINA).toContain("puedeEmpezarCorrida(");
  });
});
