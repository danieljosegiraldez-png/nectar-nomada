import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **Lo que se pinta en la colmena tiene que casar con lo que la acción permite.**
 *
 * Hasta el 2026-09-17 esta pantalla pintaba los seis formularios a todo el
 * mundo y la acción decidía al enviar. Para un `Apiary Colony Event Recorder`
 * —el perfil de Kenis, que registra alimentaciones y tratamientos pero NO crea
 * inspecciones formales— eso era un formulario que se rellena entero y revienta
 * al final. Una promesa rota es peor que una ausencia explicada.
 *
 * Este guardia compara los DOS lados: qué permiso exige cada servicio y qué
 * permiso comprueba la pantalla antes de pintar su formulario. Si alguien
 * relaja uno de los dos sin el otro, cae.
 */
const RAIZ = join(__dirname, "..", "..");
const PANTALLA = readFileSync(join(RAIZ, "app/apiaries/[id]/hives/[hiveId]/page.tsx"), "utf8");

/** `<Componente` seguido de espacio, `/` o `>` — no una subcadena de otro nombre. */
const seUsa = (componente: string) => new RegExp(`<${componente}[\\s/>]`).test(PANTALLA);

describe("los formularios de la colmena respetan el permiso", () => {
  it("la pantalla calcula los DOS niveles de autoridad", () => {
    // `colony_event:manage` no es un escalón de `apiary:manage`: es una
    // autoridad más pequeña, y el guardia del servicio lo dice con esas
    // palabras. Si la pantalla colapsara los dos en uno, Kenis perdería lo
    // único que sí puede hacer.
    expect(PANTALLA).toContain('granted.has("apiary:manage")');
    expect(PANTALLA).toContain('granted.has("colony_event:manage")');
  });

  it("la inspección se pinta SÓLO con apiary:manage", () => {
    expect(PANTALLA).toMatch(/puedeGestionar \? \(\s*<InspectionForm/);
  });

  it("los eventos de colmena se pintan con la autoridad PEQUEÑA también", () => {
    // El caso de Kenis. Si esto cayera, el perfil se quedaría sin su única
    // acción y la pantalla no serviría para nada a quien la usa a diario.
    expect(PANTALLA).toMatch(/puedeRegistrarEventos \? \(\s*<ColonyEventQuickEntry/);
  });

  it("los cuatro de gestión siguen exigiendo gestión", () => {
    for (const c of ["ConteoDeVarroaForm", "HarvestForm", "NewColonyForm", "FinDeColoniaForm"]) {
      expect(seUsa(c), `${c} ya no se usa en esta pantalla`).toBe(true);
      expect(PANTALLA).toMatch(new RegExp(`puedeGestionar \\?[\\s\\S]{0,60}<${c}[\\s/>]`));
    }
  });

  it("y cuando falta el permiso se DICE por qué, no se esconde a secas", () => {
    // Un formulario que desaparece sin explicación se lee como una pantalla
    // rota. Misma doctrina que las limitaciones del veredicto.
    expect(PANTALLA).toContain('t("sinPermisoInspeccion")');
    expect(PANTALLA).toContain('t("sinPermisoGestion")');
  });

  it("dividir, reinas y unir (spec 2026-09-18) exigen gestión, y dicen por qué cuando falta", () => {
    // Los servicios (`genealogia.ts`, `reinas.ts`) exigen apiary:manage. Kenis las VE con su razón.
    for (const faena of ["dividir", "reinas", "unir"]) {
      const inicio = PANTALLA.indexOf(`id="faena-${faena}"`);
      expect(inicio, `no está la sección faena-${faena}`).toBeGreaterThan(-1);
      const seccion = PANTALLA.slice(inicio, PANTALLA.indexOf("</section>", inicio));
      const primerForm = seccion.indexOf("<form");
      expect(primerForm, `faena-${faena} no tiene formulario`).toBeGreaterThan(-1);
      expect(seccion.slice(0, primerForm), `faena-${faena} pinta su formulario sin comprobar gestión`).toContain("puedeGestionar &&");
      expect(seccion, `faena-${faena} esconde el formulario sin decir por qué`).toContain('t("sinPermisoGestion")');
    }
  });

  it("control del propio guardia: un nombre parecido NO cuela", () => {
    expect(new RegExp(`<HarvestForm[\\s/>]`).test("<HarvestFormOtro />")).toBe(false);
    expect(new RegExp(`<HarvestForm[\\s/>]`).test("<HarvestForm a />")).toBe(true);
  });
});
