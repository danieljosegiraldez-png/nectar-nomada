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

  it.each(["es", "en"])("%s explica que el verde requiere trilla", (idioma) => {
    const mensajes = JSON.parse(leer(`messages/${idioma}.json`));
    const ayuda = `${mensajes.Traceability.dryingOutputMaterialHelp} ${mensajes.BandejasDelSecado.tipoSalidaAyuda}`;
    expect(ayuda.toLowerCase()).toMatch(idioma === "es" ? /verde.*trilla/ : /green.*hulling/);
  });
});
