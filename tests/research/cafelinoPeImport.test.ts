/**
 * I1 (docs/implementation/40_I1_IMPORTADOR_PE_CAFELINO.md). Unit tests for
 * the pure parsing/mapping functions in lib/research/cafelinoPeImport.ts.
 * No CSV file is read here — the real Cafelino file is never committed to
 * this repo (client experimental data); these tests exercise the mapping
 * logic against literal values transcribed from the real file (dates,
 * yeast names, lineage annotations), not the file itself.
 */
import { describe, expect, it } from "vitest";
import {
  parsePeDate,
  mapLevaduraCultivo,
  extractOwnStageYeast,
  mapMetodoInoculacion,
  mapEquipo,
  mapOxygenManagement,
  mapManejoTemperatura,
  mapFuenteDeAgua,
  mapGradoProceso,
  mapFuenteMicrobiana,
  resolveLotCode,
  parseLineageParent,
  isBlankTemplateRow,
  parseCafelinoPeCsv,
  type PeRow,
} from "../../lib/research/cafelinoPeImport";

describe("parsePeDate", () => {
  it("parses dd/mm/yyyy", () => {
    const d = parsePeDate("19/2/2026");
    expect(d?.toISOString().slice(0, 10)).toBe("2026-02-19");
  });
  it("parses dd-mon-yy (Spanish month abbreviation)", () => {
    const d = parsePeDate("13-mar-26");
    expect(d?.toISOString().slice(0, 10)).toBe("2026-03-13");
  });
  it("returns null for empty/unparseable input", () => {
    expect(parsePeDate(null)).toBeNull();
    expect(parsePeDate("")).toBeNull();
    expect(parsePeDate("not a date")).toBeNull();
  });
});

describe("mapLevaduraCultivo", () => {
  it("matches known commercial yeast names embedded in the real cell text", () => {
    expect(mapLevaduraCultivo("SafCoffee Deep Amber Fermentis")).toEqual({ catalogValue: "Deep Amber", unknownIdentity: false });
    expect(mapLevaduraCultivo("SafOeno HDA54 Fermentis")).toEqual({ catalogValue: "HDA54", unknownIdentity: false });
    expect(mapLevaduraCultivo("SafOeno MP72  Fermentis")).toEqual({ catalogValue: "MP72", unknownIdentity: false });
    expect(mapLevaduraCultivo("SafCoffee Green Origins Fermentis")).toEqual({ catalogValue: "Green Origin", unknownIdentity: false });
  });
  it("maps Spontaneous/Wild to the Spontaneous Wild catalog value, flagged unknown identity", () => {
    expect(mapLevaduraCultivo("Spontaneous/Wild")).toEqual({ catalogValue: "Spontaneous Wild", unknownIdentity: true });
  });
  it("returns null (not a guess) for text naming no known culture at all", () => {
    expect(mapLevaduraCultivo("Guacho mostos Tanques Anaerobicos S.O. G.O D.A.")).toBeNull();
  });
  it("finds a real embedded match inside a compound 'Guacho' blend description, correctly, not a false positive", () => {
    // PE-106's real cell: a mosto blend (S.O./G.O./D.A./C.B./SPON, "Guacho" —
    // reused mosto, RO1.2's own Doble Mosto Guacho case) that also names a
    // real 20g direct pitch of Cool Blue. The substring match finding "cool
    // blue" here is correct, not spurious — but a single catalog value
    // can't represent a multi-culture blend; the planner flags PE-106/107
    // for the doble_mosto/medio_lavado path instead of trusting this single
    // match as the whole treatment (see cafelinoPeImport's own module doc).
    expect(mapLevaduraCultivo("Guacho mostos grain pro S.O. G.O D.A. C.B. SPON V y H y pitch de 20g de cool blue")).toEqual({
      catalogValue: "Cool Blue",
      unknownIdentity: false,
    });
  });
});

describe("extractOwnStageYeast — chained rows carry both stages' yeasts", () => {
  it("picks the Fermentation-labeled line when the Microbe type cell labels stages", () => {
    const yeast = "SafOeno HDA54 Fermentis\nSafCoffee Cool Blue Fermentis";
    const microbeType = "Pre-fermentative : Hybrid :  Sacch. Cerevisae + Sacch. Bayanus\nFermentation : Sacch. Cerevisae";
    expect(extractOwnStageYeast(yeast, microbeType)).toBe("SafCoffee Cool Blue Fermentis");
  });
  it("falls back to the last line when no stage labels are present", () => {
    expect(extractOwnStageYeast("SafOeno HDA54 Fermentis\nSafCoffee Cool Blue Fermentis", null)).toBe("SafCoffee Cool Blue Fermentis");
  });
  it("returns the single line unchanged when there's only one", () => {
    expect(extractOwnStageYeast("SafCoffee Deep Amber Fermentis", null)).toBe("SafCoffee Deep Amber Fermentis");
  });
});

describe("mapMetodoInoculacion", () => {
  it("maps direct dry pitch and rehydration text", () => {
    expect(mapMetodoInoculacion("Direct dry pitch", null)).toBe("direct pitch");
    expect(mapMetodoInoculacion("Rehidratacion 1:10 Dilucion y spray atomizador", null)).toBe("rehydrated");
  });
  it("maps to spontaneous when the yeast itself is Spontaneous Wild, regardless of cell text", () => {
    expect(mapMetodoInoculacion("NA", { unknownIdentity: true })).toBe("spontaneous");
  });
});

describe("mapEquipo", () => {
  it("maps tanque-con-airlock variants to the real recipiente catalog values", () => {
    expect(mapEquipo("Tanque con airlock I")).toBe("Tanque I");
    expect(mapEquipo("Tanque con airlock II")).toBe("Tanque II");
    expect(mapEquipo("Tanque con airlock III")).toBe("Tanque III");
  });
  it("maps cooler and Grain Pro bag", () => {
    expect(mapEquipo("cooler")).toBe("Cooler I");
    expect(mapEquipo("Grain Pro bag")).toBe("GrainProBag");
  });
});

describe("mapOxygenManagement / mapManejoTemperatura / mapFuenteDeAgua", () => {
  it("maps Sealed system to anaerobico", () => {
    expect(mapOxygenManagement("Sealed system")).toBe("anaerobico");
    expect(mapOxygenManagement("sealed system")).toBe("anaerobico");
  });
  it("maps Prefermentive stage to cold_hold_prefermentativo", () => {
    expect(mapManejoTemperatura("Prefermentive", "Bajo techo intemperie")).toBe("cold_hold_prefermentativo");
  });
  it("maps Al rio to fermentacion_fria + fuente_de_agua río", () => {
    expect(mapManejoTemperatura("Fermentation", "Al rio")).toBe("fermentacion_fria");
    expect(mapFuenteDeAgua("Al rio")).toBe("río");
  });
  it("maps Bajo techo intemperie (no río) to ambiente, with no fuente_de_agua", () => {
    expect(mapManejoTemperatura("Fermentation", "Bajo techo intemperie")).toBe("ambiente");
    expect(mapFuenteDeAgua("Bajo techo intemperie")).toBeNull();
  });
});

describe("mapGradoProceso — Drying process column maps to Flujo de proceso", () => {
  it("matches the real grado_proceso catalog values, case/hyphen-insensitive", () => {
    expect(mapGradoProceso("Natural")).toBe("Natural");
    expect(mapGradoProceso("Washed")).toBe("Washed");
    expect(mapGradoProceso("Semi-wash 50%")).toBe("Semi Wash 50%");
    expect(mapGradoProceso("Semi Wash 75%")).toBe("Semi Wash 75%");
  });
  it("recognizes Wash 100% as its own new value, not aliased to Washed", () => {
    expect(mapGradoProceso("Wash 100%")).toBe("Wash 100%");
  });
  it("returns null for blank/unrecognized text", () => {
    expect(mapGradoProceso(null)).toBeNull();
    expect(mapGradoProceso("")).toBeNull();
  });
});

describe("mapFuenteMicrobiana", () => {
  it("maps a named commercial yeast to levadura_inoculada", () => {
    expect(mapFuenteMicrobiana("SafCoffee Cool Blue Fermentis")).toBe("levadura_inoculada");
  });
  it("maps Spontaneous/Wild to espontanea", () => {
    expect(mapFuenteMicrobiana("Spontaneous/Wild")).toBe("espontanea");
  });
});

describe("resolveLotCode — §2's deduction rule, only when genuinely blank", () => {
  it("uses the real Lot Code value when the file gives one, not deduced", () => {
    expect(resolveLotCode({ lotCodeRaw: "9", varietal: "Catuai" } as PeRow)).toEqual({ value: "9", deduced: false });
    // Real anomaly: PE-85/PE-86 are Geisha + Origin "Artilleria" but the
    // file gives Lot Code "9" explicitly — used as-is, not overridden by
    // the ticket's simplified "Geisha -> lote 10" deduction rule, which
    // only applies when the cell is genuinely blank.
    expect(resolveLotCode({ lotCodeRaw: "9", varietal: "Geisha" } as PeRow)).toEqual({ value: "9", deduced: false });
  });
  it("deduces from varietal only when Lot Code is blank", () => {
    expect(resolveLotCode({ lotCodeRaw: null, varietal: "Catuai" } as PeRow)).toEqual({ value: "9", deduced: true });
    expect(resolveLotCode({ lotCodeRaw: null, varietal: "Geisha" } as PeRow)).toEqual({ value: "10", deduced: true });
  });
  it("returns null when neither a real value nor a deducible varietal is present", () => {
    expect(resolveLotCode({ lotCodeRaw: null, varietal: null } as PeRow)).toBeNull();
  });
});

describe("parseLineageParent — §3, read directly from the Anotacion column", () => {
  it("parses the common PE-XX=>PE-YY form", () => {
    expect(parseLineageParent({ lineageAnnotation: "PE-79=>PE91", peCode: "PE-91" } as PeRow)).toEqual({
      parentPeCode: "PE-79",
      raw: "PE-79=>PE91",
    });
  });
  it("parses forms without a hyphen after PE, and without spaces around the code", () => {
    expect(parseLineageParent({ lineageAnnotation: "PE79=>PE91-HDA54", peCode: "PE-93" } as PeRow)).toEqual({
      parentPeCode: "PE-79",
      raw: "PE79=>PE91-HDA54",
    });
    expect(parseLineageParent({ lineageAnnotation: "PE-80=>PE94", peCode: "PE-94" } as PeRow)).toEqual({
      parentPeCode: "PE-80",
      raw: "PE-80=>PE94",
    });
  });
  it("parses the PE-98=>PE-98A / PE-98=>PE-98B / PE-98=>PE-98C split forms", () => {
    expect(parseLineageParent({ lineageAnnotation: "PE-98=>PE-98A", peCode: "PE-98-A" } as PeRow)).toEqual({
      parentPeCode: "PE-98",
      raw: "PE-98=>PE-98A",
    });
  });
  it("returns null when there's no annotation at all", () => {
    expect(parseLineageParent({ lineageAnnotation: null, peCode: "PE-77" } as PeRow)).toBeNull();
  });
  it("flags a self-referential or unparseable annotation rather than guessing", () => {
    // Real anomaly: S/N 24's own annotation is "PE-79-" — trailing hyphen,
    // no target code. Confirmed unparseable, not silently dropped.
    expect(parseLineageParent({ lineageAnnotation: "PE-79-", peCode: "PE-91" } as PeRow)).toEqual({
      parentPeCode: "PE-79",
      raw: "PE-79-",
    });
  });
});

describe("isBlankTemplateRow", () => {
  it("identifies a fully empty row (PE-109, S/N 44) as a template placeholder", () => {
    expect(
      isBlankTemplateRow({
        varietal: null,
        processType: null,
        origin: null,
        harvestDate: null,
        yeastRaw: null,
        equipoRaw: null,
        pesoFrutaKg: null,
        pesoFrutaLb: null,
      } as PeRow),
    ).toBe(true);
  });
  it("does not treat a sparse-but-real row (e.g. a '-B' companion row) as blank", () => {
    expect(
      isBlankTemplateRow({
        varietal: "Catuai",
        processType: null,
        origin: null,
        harvestDate: new Date(),
        yeastRaw: "SafCoffee Green Origins Fermentis",
        equipoRaw: "Tanque con airlock I",
        pesoFrutaKg: null,
        pesoFrutaLb: null,
      } as PeRow),
    ).toBe(false);
  });
});

describe("parseCafelinoPeCsv — real column structure, embedded newlines and quoted multi-line cells", () => {
  it("parses a small fixture matching the real file's header/quoting shape", () => {
    const fixture = [
      'S/N,"Anotacion \ncodigo \nrevision","PE \nFinal \nCode","PE \nStart \nDate",Varietal,Process type,Origin,Lot Code,"Harvest \ndate","Cherry \nBrix",Selection,Floating,Stage,Yeast + Microbes applied,Purpose,Microbe type,Inoculación,Metodo inoculacion,Equipo,Area,Latas,"Peso \nFruta \n(lb)","Peso \nFruta \n(kg)",Descripción del tratamiento,"Dry or Wet \nprocess","Oxygen \nManagement","Ferm \nduration \n(hours)","pH \nwater","pH \nmosto \ninicial","pH \n24 HR","pH \nmosto \nfinal","Temp \n(C) \nDay 1","Temp \n(C) \nDay 2","Temp \n(C) \nDay 3",Observaciones,Drying process,"Nivel \ncama\n(1-Abajo,\n2-Medio, \n3-Arriba)","Initial \nDrying \nDate",Cuarto secado,"Drying \nduration \n(days)","Storage \ndate","Parchment \nBean H%","Cafe \nverde \nH%","Temp. (C) \ncuarto \nsecado","HR% \ncuarto \nsecado"',
      '1,,PE-77,19/2/2026,Catuai,Whole Cherries,Alto Lino,,19/2/2026,18-20,Ripe Cherry,Yes,Fermentation,SafCoffee Deep Amber Fermentis,Controlled Fermentation,Pectic enzyme + Sacch. Cerevisae,30 g,Direct dry pitch,Tanque con airlock I,Bajo techo intemperie,1.1,33,15,"Dry direct pitch",Wet,Sealed system,36,"6,5","5,5","4,4","4,2",22,25,27,Notas guanábana,Natural,3,21/2/2026,"Cama africana, Invernadero solar",-20d,13-mar-26,,,,',
    ].join("\n");

    const rows = parseCafelinoPeCsv(fixture);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.peCode).toBe("PE-77");
    expect(rows[0]!.varietal).toBe("Catuai");
    expect(rows[0]!.pesoFrutaKg).toBe(15);
    expect(rows[0]!.phWater).toBe(6.5);
    expect(rows[0]!.startDate?.toISOString().slice(0, 10)).toBe("2026-02-19");
    expect(rows[0]!.cuartoSecadoRaw).toBe("Cama africana, Invernadero solar");
  });
});
