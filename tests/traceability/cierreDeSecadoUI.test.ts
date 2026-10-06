import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = new URL("../..", import.meta.url).pathname;
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

describe("cierre de secado — opciones honestas y consistentes", () => {
  it("la fuente única sólo permite pergamino y cereza seca", () => {
    const servicio = leer("lib/traceability/drying.ts");
    expect(servicio).toContain('DRYING_OUTPUT_LOT_TYPES = ["parchment", "dry_cherry"]');
  });

  it("ninguno de los dos formularios preselecciona café verde", () => {
    for (const ruta of ["app/lots/[id]/page.tsx", "app/components/traceability/BandejasDelSecado.tsx"]) {
      const fuente = leer(ruta);
      expect(fuente).not.toContain('name="outputLotType" defaultValue="green"');
      expect(fuente).toContain('name="outputLotType" defaultValue="" required');
    }
  });

  // Auditoría farm-to-green R10 (2026-10-04): ninguno de los dos formularios pedía CÓMO terminó el
  // secado, y sin `target_reached` el reposo no arranca. Que lo pidan, sin valor preseleccionado,
  // lo vigila esta prueba; que la acción lo entregue al servicio, `desenlaceDelSecado.test.ts`.
  it("los dos formularios piden el desenlace, sin preseleccionar ninguno", () => {
    for (const ruta of ["app/lots/[id]/page.tsx", "app/components/traceability/BandejasDelSecado.tsx"]) {
      // Sin comentarios: un bloque JSX comentado conserva sus cadenas y dejaría esta prueba verde
      // con el campo quitado (revisión de Codex, 2026-10-04).
      const fuente = leer(ruta).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(fuente).toContain('name="endedOutcome" defaultValue="" required');
      expect(fuente).toContain("DESENLACES_DEL_SECADO.map(");
    }
  });

  it.each(["es", "en"])("%s explica que sólo el objetivo alcanzado arranca el reposo", (idioma) => {
    const ayuda = JSON.parse(leer(`messages/${idioma}.json`)).BandejasDelSecado.desenlaceAyuda as string;
    // La exclusividad («sólo») es lo que importa; y la muestra verde se nombra como requisito, no
    // como lo único que la habilita (la muestra pide además el proceso cerrado por humedad).
    expect(ayuda.toLowerCase()).toMatch(
      idioma === "es"
        ? /^sólo «llegó a la humedad objetivo» arranca el reposo; sin él, el lote no puede dar muestra verde\.$/
        : /^only “reached target moisture” starts the resting clock; without it, the lot cannot give a green sample\.$/,
    );
  });

  it.each(["es", "en"])("%s explica que el verde requiere trilla", (idioma) => {
    const mensajes = JSON.parse(leer(`messages/${idioma}.json`));
    const ayuda = `${mensajes.Traceability.dryingOutputMaterialHelp} ${mensajes.BandejasDelSecado.tipoSalidaAyuda}`;
    expect(ayuda.toLowerCase()).toMatch(idioma === "es" ? /verde.*trilla/ : /green.*hulling/);
  });
});
