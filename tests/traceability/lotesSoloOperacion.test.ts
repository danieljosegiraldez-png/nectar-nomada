/**
 * `/lots` es la pantalla de TRABAJO del operador, no una segunda barra de navegación.
 *
 * **Decisión de Daniel, 2026-09-27.** Lotes sirve para gestionar y ver lotes en sus procesos y
 * estados — lo que un operario usa a diario en el beneficio. Editar, agregar, registrar, activar
 * o dar de baja **son configuración**, y viven bajo `/beneficio/ajustes` y `/instalaciones`, a los
 * que se llega por el índice de `/beneficio`.
 *
 * **Por qué quitarlos no pierde nada, medido antes de tocar:** `destinosDelBeneficio`
 * (`app/beneficio/destinos.ts`) ya lista los dos, con los mismos permisos. La barra de `/lots`
 * eran duplicados que quedaron atrás — el propio comentario de ese archivo dice que las recetas
 * «estaban en la barra de Lotes antes del #383, y el índice lo perdió».
 *
 * **Y el filtro sólo ofrece etapas de CAFÉ.** El beneficio se vincula a café, así que `honey` y
 * `other` sobraban: confundían sin devolver nada. Medido el 2026-09-27 sobre la base restaurada
 * del último backup verificado: de 45 lotes, 35 `cherry` y 10 `processing`, **cero** de esos dos.
 *
 * Esto es un guardia de FUENTE: no prueba que la pantalla se vea bien, prueba que nadie devuelva
 * los enlaces ni los chips sin que caiga algo. Su flip-test está en el mensaje del commit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = new URL("../..", import.meta.url).pathname;
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

describe("/lots es operación, no configuración", () => {
  it("no enlaza a instalaciones ni a los ajustes del beneficio", () => {
    const pagina = leer("app/lots/page.tsx");
    expect(pagina, "instalaciones es configuración: vive en el índice de /beneficio").not.toContain('href="/instalaciones"');
    expect(pagina, "los ajustes del beneficio son configuración: viven en el índice de /beneficio").not.toContain('href="/beneficio/ajustes"');
  });

  /**
   * El control positivo de la prueba de arriba. Sin él, borrar el archivo entero —o renombrar la
   * página— dejaría las dos aserciones en verde sobre una cadena vacía, que es el verde vacío de
   * siempre: ausencia de lo malo sobre contenido ausente.
   */
  it("CONTROL: la barra sigue existiendo y conserva lo que es trabajo diario", () => {
    const pagina = leer("app/lots/page.tsx");
    expect(pagina, "el informe de proceso").toContain('href="/reports/proceso"');
    expect(pagina, "las recetas, que se eligen procesando un lote").toContain('href="/recipes"');
    expect(pagina, "registrar una inspección es trabajo de campo, no configuración").toContain('href="/inspecciones/nueva"');
    expect(pagina, "sacar tus propios datos").toContain('href="/api/export"');
  });

  it("y los dos siguen alcanzables desde el índice del beneficio", () => {
    const destinos = leer("app/beneficio/destinos.ts");
    expect(destinos).toContain('href: "/instalaciones"');
    expect(destinos).toContain('href: "/beneficio/ajustes"');
  });

  it("el filtro de tipo de lote sólo ofrece etapas de café", () => {
    const pagina = leer("app/lots/page.tsx");
    const bloque = pagina.slice(pagina.indexOf("const LOT_TYPES"), pagina.indexOf("];", pagina.indexOf("const LOT_TYPES")));
    expect(bloque, "el bloque de LOT_TYPES tiene que haberse encontrado").not.toBe("");
    expect(bloque, "la miel no es café: se cosecha en el apiario").not.toContain('"honey"');
    expect(bloque, '"otro" no es una etapa del beneficio').not.toContain('"other"');
    // Control positivo del recorte: las ocho etapas de café siguen ahí. Sin esto, un `LOT_TYPES`
    // vacío —o un `indexOf` que no casa— pasaría las dos aserciones de arriba sin medir nada.
    for (const etapa of ["cherry", "processing", "drying", "parchment", "dry_cherry", "green", "roast", "sample"]) {
      expect(bloque, `la etapa ${etapa} sigue en el filtro`).toContain(`"${etapa}"`);
    }
  });

  /**
   * Las etiquetas NO se borran: la ficha de un lote de miel tiene que poder decir «Miel».
   * Quitar el chip es una decisión de la pantalla de lista, no del vocabulario.
   */
  it("pero las etiquetas de miel y otro siguen traducidas, porque la ficha las usa", () => {
    for (const idioma of ["es", "en"]) {
      const mensajes = leer(`messages/${idioma}.json`);
      expect(mensajes, `${idioma}: miel`).toContain('"lotType_honey"');
      expect(mensajes, `${idioma}: otro`).toContain('"lotType_other"');
    }
  });
});
