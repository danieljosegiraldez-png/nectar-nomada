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
      const fuente = leer(ruta);
      expect(fuente).toContain('name="endedOutcome" defaultValue="" required');
      expect(fuente).toContain("DESENLACES_DEL_SECADO.map(");
    }
  });

  it.each(["es", "en"])("%s explica que sólo el objetivo alcanzado arranca el reposo", (idioma) => {
    const ayuda = JSON.parse(leer(`messages/${idioma}.json`)).BandejasDelSecado.desenlaceAyuda as string;
    expect(ayuda.toLowerCase()).toMatch(idioma === "es" ? /humedad objetivo.*reposo/ : /target moisture.*resting/);
  });

  it.each(["es", "en"])("%s explica que el verde requiere trilla", (idioma) => {
    const mensajes = JSON.parse(leer(`messages/${idioma}.json`));
    const ayuda = `${mensajes.Traceability.dryingOutputMaterialHelp} ${mensajes.BandejasDelSecado.tipoSalidaAyuda}`;
    expect(ayuda.toLowerCase()).toMatch(idioma === "es" ? /verde.*trilla/ : /green.*hulling/);
  });
});
