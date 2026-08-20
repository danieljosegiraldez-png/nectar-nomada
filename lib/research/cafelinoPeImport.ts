/**
 * I1 (docs/implementation/40_I1_IMPORTADOR_PE_CAFELINO.md). Imports the
 * real Cafelino PE (Procesos Especiales) protocol data — 41 real
 * experimental treatments (44 CSV rows minus 3 empty template rows: PE-96-B/
 * PE-100-B/PE-101-B duplicate "B" rows carry no data beyond equipment and
 * PE-109 is entirely blank) — into RO1's schema.
 *
 * The CSV file itself is never committed to this repo (real client
 * experimental data) — this module only ever receives already-read file
 * contents or a filesystem path a caller supplies at runtime
 * (scripts/import-cafelino-pe.ts reads the real file from the operator's
 * own machine).
 *
 * Column mapping is derived from the REAL file's actual columns, not the
 * ticket's own simplified paraphrase of them — the real "PE Data-Table
 * 2025-26.csv" has 47 columns, richer and more structured than the
 * ticket's summary ("PE ID Code, Fecha cosecha, Varietal, Lote, ...,
 * Comentarios") suggested. Trusting the real source over a summary of it
 * is the same discipline this platform applies everywhere else — never
 * fabricate, never assume a description is more authoritative than the
 * thing it describes.
 *
 * §2's rules, followed exactly:
 * - `Lote` (here: "Lot Code") is genuinely populated on many rows in the
 *   real file (contrary to the ticket's "está vacío en todas las filas") —
 *   used directly when present; deduced (Catuai -> lote 9, Geisha -> lote
 *   10) ONLY when blank, and marked as deduced via provenanceClass
 *   "estimated" + a note, never silently treated as measured.
 * - PE-77's date typo (the ticket says "19/2/2023" should read 2026) does
 *   not appear in the actual "PE Start Date"/"Harvest date" cells (both
 *   already read "19/2/2026") — noted as not reproducible against the real
 *   file, not silently "corrected" against a date that was never wrong
 *   here.
 * - §3's lineage: the real file's own "Anotacion codigo revision" column
 *   states the parent->child relationship explicitly (e.g.
 *   "PE-79=>PE91") — read directly, not re-derived by regex-parsing PE ID
 *   suffixes, which is strictly more reliable than the ticket's own
 *   suggested approach.
 */
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

export class CafelinoImportError extends Error {}

// ---------------------------------------------------------------------
// §2/§4 — raw row shape (real CSV column names, embedded newlines and all)
// ---------------------------------------------------------------------

interface RawPeRow {
  "S/N": string;
  "Anotacion \ncodigo \nrevision": string;
  "PE \nFinal \nCode": string;
  "PE \nStart \nDate": string;
  Varietal: string;
  "Process type": string;
  Origin: string;
  "Lot Code": string;
  "Harvest \ndate": string;
  "Cherry \nBrix": string;
  Selection: string;
  Floating: string;
  Stage: string;
  "Yeast + Microbes applied": string;
  Purpose: string;
  "Microbe type": string;
  Inoculación: string;
  "Metodo inoculacion": string;
  Equipo: string;
  Area: string;
  Latas: string;
  "Peso \nFruta \n(lb)": string;
  "Peso \nFruta \n(kg)": string;
  "Descripción del tratamiento": string;
  "Dry or Wet \nprocess": string;
  "Oxygen \nManagement": string;
  "Ferm \nduration \n(hours)": string;
  "pH \nwater": string;
  "pH \nmosto \ninicial": string;
  "pH \n24 HR": string;
  "pH \nmosto \nfinal": string;
  "Temp \n(C) \nDay 1": string;
  "Temp \n(C) \nDay 2": string;
  "Temp \n(C) \nDay 3": string;
  Observaciones: string;
  "Drying process": string;
  "Nivel \ncama\n(1-Abajo,\n2-Medio, \n3-Arriba)": string;
  "Initial \nDrying \nDate": string;
  "Cuarto secado": string;
  "Drying \nduration \n(days)": string;
  "Storage \ndate": string;
  "Parchment \nBean H%": string;
  "Cafe \nverde \nH%": string;
  "Temp. (C) \ncuarto \nsecado": string;
  "HR% \ncuarto \nsecado": string;
}

export interface PeRow {
  sn: number;
  lineageAnnotation: string | null;
  peCode: string;
  startDate: Date | null;
  varietal: string | null;
  processType: string | null;
  origin: string | null;
  lotCodeRaw: string | null;
  harvestDate: Date | null;
  cherryBrixRaw: string | null;
  selectionRaw: string | null;
  floatingRaw: string | null;
  stage: string | null;
  yeastRaw: string | null;
  purposeRaw: string | null;
  microbeTypeRaw: string | null;
  inoculationDoseRaw: string | null;
  metodoInoculacionRaw: string | null;
  equipoRaw: string | null;
  areaRaw: string | null;
  latasRaw: string | null;
  pesoFrutaLb: number | null;
  pesoFrutaKg: number | null;
  descripcionTratamiento: string | null;
  dryOrWet: string | null;
  oxygenManagementRaw: string | null;
  fermDurationHours: number | null;
  phWater: number | null;
  phMostoInicial: number | null;
  ph24hr: number | null;
  phMostoFinal: number | null;
  tempDay1: number | null;
  tempDay2: number | null;
  tempDay3: number | null;
  observaciones: string | null;
  dryingProcessRaw: string | null;
  nivelCama: number | null;
  initialDryingDate: Date | null;
  cuartoSecadoRaw: string | null;
  dryingDurationDaysRaw: string | null;
  storageDate: Date | null;
  parchmentBeanHPercent: number | null;
  cafeVerdeHPercent: number | null;
  tempCuartoSecado: number | null;
  hrCuartoSecado: number | null;
}

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length === 0 ? null : t;
}

// dd/mm/yyyy or dd-mon-yy (Spanish month abbreviations appear in "Storage date").
const MONTHS_ES: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

export function parsePeDate(raw: string | null): Date | null {
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }
  const dashMon = raw.match(/^(\d{1,2})-([a-zA-Z]{3})-(\d{2})$/);
  if (dashMon) {
    const [, d, mon, y] = dashMon;
    const month = MONTHS_ES[mon!.toLowerCase()];
    if (month === undefined) return null;
    return new Date(Date.UTC(2000 + Number(y), month, Number(d)));
  }
  return null;
}

function parseEsNumber(raw: string | null): number | null {
  if (!raw) return null;
  if (raw.toUpperCase() === "NA") return null;
  const normalized = raw.replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseCafelinoPeCsv(csvContent: Buffer | string): PeRow[] {
  const raw: RawPeRow[] = parse(csvContent, { columns: true, skip_empty_lines: false, relax_column_count: true });
  return raw.map((r) => ({
    sn: Number(r["S/N"]),
    lineageAnnotation: emptyToNull(r["Anotacion \ncodigo \nrevision"]),
    peCode: (r["PE \nFinal \nCode"] ?? "").trim(),
    startDate: parsePeDate(emptyToNull(r["PE \nStart \nDate"])),
    varietal: emptyToNull(r.Varietal),
    processType: emptyToNull(r["Process type"]),
    origin: emptyToNull(r.Origin),
    lotCodeRaw: emptyToNull(r["Lot Code"]),
    harvestDate: parsePeDate(emptyToNull(r["Harvest \ndate"])),
    cherryBrixRaw: emptyToNull(r["Cherry \nBrix"]),
    selectionRaw: emptyToNull(r.Selection),
    floatingRaw: emptyToNull(r.Floating),
    stage: emptyToNull(r.Stage),
    yeastRaw: emptyToNull(r["Yeast + Microbes applied"]),
    purposeRaw: emptyToNull(r.Purpose),
    microbeTypeRaw: emptyToNull(r["Microbe type"]),
    inoculationDoseRaw: emptyToNull(r["Inoculación"]),
    metodoInoculacionRaw: emptyToNull(r["Metodo inoculacion"]),
    equipoRaw: emptyToNull(r.Equipo),
    areaRaw: emptyToNull(r.Area),
    latasRaw: emptyToNull(r.Latas),
    pesoFrutaLb: parseEsNumber(emptyToNull(r["Peso \nFruta \n(lb)"])),
    pesoFrutaKg: parseEsNumber(emptyToNull(r["Peso \nFruta \n(kg)"])),
    descripcionTratamiento: emptyToNull(r["Descripción del tratamiento"]),
    dryOrWet: emptyToNull(r["Dry or Wet \nprocess"]),
    oxygenManagementRaw: emptyToNull(r["Oxygen \nManagement"]),
    fermDurationHours: parseEsNumber(emptyToNull(r["Ferm \nduration \n(hours)"])),
    phWater: parseEsNumber(emptyToNull(r["pH \nwater"])),
    phMostoInicial: parseEsNumber(emptyToNull(r["pH \nmosto \ninicial"])),
    ph24hr: parseEsNumber(emptyToNull(r["pH \n24 HR"])),
    phMostoFinal: parseEsNumber(emptyToNull(r["pH \nmosto \nfinal"])),
    tempDay1: parseEsNumber(emptyToNull(r["Temp \n(C) \nDay 1"])),
    tempDay2: parseEsNumber(emptyToNull(r["Temp \n(C) \nDay 2"])),
    tempDay3: parseEsNumber(emptyToNull(r["Temp \n(C) \nDay 3"])),
    observaciones: emptyToNull(r.Observaciones),
    dryingProcessRaw: emptyToNull(r["Drying process"]),
    nivelCama: parseEsNumber(emptyToNull(r["Nivel \ncama\n(1-Abajo,\n2-Medio, \n3-Arriba)"])),
    initialDryingDate: parsePeDate(emptyToNull(r["Initial \nDrying \nDate"])),
    cuartoSecadoRaw: emptyToNull(r["Cuarto secado"]),
    dryingDurationDaysRaw: emptyToNull(r["Drying \nduration \n(days)"]),
    storageDate: parsePeDate(emptyToNull(r["Storage \ndate"])),
    parchmentBeanHPercent: parseEsNumber(emptyToNull(r["Parchment \nBean H%"])),
    cafeVerdeHPercent: parseEsNumber(emptyToNull(r["Cafe \nverde \nH%"])),
    tempCuartoSecado: parseEsNumber(emptyToNull(r["Temp. (C) \ncuarto \nsecado"])),
    hrCuartoSecado: parseEsNumber(emptyToNull(r["HR% \ncuarto \nsecado"])),
  }));
}

export function readCafelinoPeCsvFile(path: string): PeRow[] {
  return parseCafelinoPeCsv(readFileSync(path));
}

// ---------------------------------------------------------------------
// §2 — a row with no PE code and nothing else populated is a blank
// template row (PE-109, S/N 44), not a real record. Excluded, reported.
// ---------------------------------------------------------------------
export function isBlankTemplateRow(row: PeRow): boolean {
  return (
    !row.varietal &&
    !row.processType &&
    !row.origin &&
    !row.harvestDate &&
    !row.yeastRaw &&
    !row.equipoRaw &&
    !row.pesoFrutaKg &&
    !row.pesoFrutaLb
  );
}

// ---------------------------------------------------------------------
// §4 — comment/column -> catalog mapping. Every function here returns
// `null` (not a guess) when the raw text doesn't match a real catalog
// value, so the caller can report it as unmapped rather than force a
// near-match (§4's own explicit rule).
// ---------------------------------------------------------------------

export function mapLevaduraCultivo(raw: string | null): { catalogValue: string; unknownIdentity: boolean } | null {
  if (!raw) return null;
  const norm = raw.replace(/\s+/g, " ").trim();
  if (/spontaneous/i.test(norm) || /wild/i.test(norm)) {
    return { catalogValue: "Spontaneous Wild", unknownIdentity: true };
  }
  const KNOWN = ["Deep Amber", "Sunrise Orange", "Cool Blue", "Green Origin", "MP72", "HDA54"];
  for (const known of KNOWN) {
    if (norm.toLowerCase().includes(known.toLowerCase())) {
      return { catalogValue: known, unknownIdentity: false };
    }
  }
  return null;
}

/**
 * Compound cells on chained rows carry BOTH stages' yeasts, labeled
 * "Pre-fermentative : X" / "Fermentation : Y" — this row's OWN treatment
 * is the "Fermentation" segment; the "Pre-fermentative" segment belongs to
 * the PARENT row (already recorded on the parent's own TreatmentBatch).
 * Falls back to the last line when no explicit label is present.
 */
export function extractOwnStageYeast(yeastRaw: string | null, microbeTypeRaw: string | null): string | null {
  if (!yeastRaw) return null;
  const yeastLines = yeastRaw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (yeastLines.length === 1) return yeastLines[0]!;

  if (microbeTypeRaw) {
    const microbeLines = microbeTypeRaw.split("\n").map((l) => l.trim()).filter(Boolean);
    const fermentationIndex = microbeLines.findIndex((l) => /^fermentation\s*:/i.test(l));
    if (fermentationIndex >= 0 && yeastLines[fermentationIndex]) {
      return yeastLines[fermentationIndex]!;
    }
  }
  return yeastLines[yeastLines.length - 1]!;
}

export function mapMetodoInoculacion(raw: string | null, yeastMapped: { unknownIdentity: boolean } | null): string | null {
  if (yeastMapped?.unknownIdentity) return "spontaneous";
  if (!raw) return null;
  if (/^direct dry pitch/i.test(raw)) return "direct pitch";
  if (/^rehidratacion/i.test(raw)) return "rehydrated";
  return null;
}

export function mapEquipo(raw: string | null): string | null {
  if (!raw) return null;
  const norm = raw.trim();
  const tanque = norm.match(/tanque.*airlock\s*(I{1,3})\b/i);
  if (tanque) return `Tanque ${tanque[1]!.toUpperCase()}`;
  if (/^cooler\b/i.test(norm)) return "Cooler I";
  if (/grain\s*pro\s*bag/i.test(norm)) return "GrainProBag";
  return null;
}

export function mapOxygenManagement(raw: string | null): string | null {
  if (!raw) return null;
  if (/sealed system/i.test(raw)) return "anaerobico";
  return null;
}

export function mapManejoTemperatura(stage: string | null, areaRaw: string | null): string | null {
  if (stage && /prefermentive/i.test(stage)) return "cold_hold_prefermentativo";
  if (areaRaw && /al\s*rio/i.test(areaRaw)) return "fermentacion_fria";
  if (areaRaw && /bajo techo intemperie/i.test(areaRaw)) return "ambiente";
  return null;
}

export function mapFuenteDeAgua(areaRaw: string | null): "río" | null {
  if (areaRaw && /al\s*rio/i.test(areaRaw)) return "río";
  return null;
}

const GRADO_PROCESO_VALUES = ["Natural", "Washed", "Wash 100%", "Semi Wash 75%", "Semi Wash 50%", "Honey"];
export function mapGradoProceso(raw: string | null): string | null {
  if (!raw) return null;
  const norm = raw.replace(/-/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  for (const v of GRADO_PROCESO_VALUES) {
    if (v.toLowerCase() === norm) return v;
  }
  return null;
}

export function mapFuenteMicrobiana(yeastOwnRaw: string | null): string | null {
  if (!yeastOwnRaw) return null;
  if (/spontaneous/i.test(yeastOwnRaw) || /wild/i.test(yeastOwnRaw)) return "espontanea";
  return "levadura_inoculada";
}

/**
 * §2 — Lote (here: "Lot Code") is used directly when the real file gives
 * it. Deduced ONLY when blank, per the ticket's stated rule, and the
 * result is marked deduced (never silently treated as if it were read
 * from the file).
 */
export function resolveLotCode(row: PeRow): { value: string; deduced: boolean } | null {
  if (row.lotCodeRaw) return { value: row.lotCodeRaw, deduced: false };
  if (row.varietal === "Catuai") return { value: "9", deduced: true };
  if (row.varietal === "Geisha") return { value: "10", deduced: true };
  return null;
}

/**
 * §3 — lineage read directly from "Anotacion codigo revision"
 * ("PE-79=>PE91", "PE-80=>PE94", "PE79=>PE91-HDA54"), not re-derived from
 * the PE code's own suffix. Returns the parent PE code, or null when the
 * annotation is empty, unparseable, or self-referential — callers report
 * unparseable cases rather than guessing a parent (§3's own instruction:
 * "si un ID no se puede interpretar con confianza, dejalo como batch
 * independiente y reportalo").
 */
export function parseLineageParent(row: PeRow): { parentPeCode: string; raw: string } | { raw: string; unparseable: true } | null {
  if (!row.lineageAnnotation) return null;
  const match = row.lineageAnnotation.match(/^(PE-?\d+)/i);
  if (!match) return { raw: row.lineageAnnotation, unparseable: true };
  let parent = match[1]!.toUpperCase();
  if (!parent.includes("-")) parent = parent.replace(/^PE/, "PE-");
  if (parent === row.peCode) return { raw: row.lineageAnnotation, unparseable: true };
  return { parentPeCode: parent, raw: row.lineageAnnotation };
}
