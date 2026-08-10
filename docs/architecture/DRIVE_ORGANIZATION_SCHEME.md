# Drive Organization Scheme — Addendum to MEDIA_INTELLIGENCE_PIPELINE.md

Grounded in a real audit of `nectarnomada@gmail.com`'s shared Drive
(2026-08-10), not a generic scheme. Specifies the target structure and ID
convention Phase A ingestion should apply — execution waits for real
server-side Drive write access (per `MEDIA_INTELLIGENCE_PIPELINE.md`'s own
credential model), not attempted through an ad-hoc chat connector, which
has no rename/move/delete capability and would only create duplicates via
`copy_file`.

---

## 1. Real findings from the audit (informs the migration, don't re-derive)

- **`VERAGUAS` and `FOTOS DE VERAGUAS` are NOT duplicates** — genuinely
  different content. `VERAGUAS` = province-level (cane honey, a dated
  October 2025 visit, campaign photos). `FOTOS DE VERAGUAS` = specifically
  Santa Fe de Veraguas, cacao-focused, with chef collaboration photos.
  Rename `FOTOS DE VERAGUAS` → `SANTA-FE-VERAGUAS` to make this distinction
  explicit rather than looking like an accidental duplicate.
- **`Fermentfest` (2024) and `Fermentation Fest 2025` are two different
  years of the same recurring event**, not duplicates. This is real
  evidence for the platform's own unaddressed gap (per the gap analysis,
  CLAUDE.md §13 "Events" has zero treatment anywhere) — a recurring annual
  event is exactly what that module needs to model. Rename to
  `FERMENTFEST-2024` / `FERMENTFEST-2025`, establishing the year-suffix
  pattern for all future years.
- **Real structured data already exists outside the platform**: a cupping
  spreadsheet (`ANALISIS SPECIALTY ROBUSTA CUPPING 2026`) with real sample
  codes, scores, and named cuppers (Gabriel Cruz, Kurt, Dennis Passmans) —
  this is exactly what should migrate into live `Sensory`/`Assessment`
  records once that ingestion path exists, not stay a spreadsheet forever.
- **Three real Google Forms are already doing informal consumer sensory
  collection** (beer aged in wood, honey multifloral, general honey info) —
  organic validation that `CONSUMER_SENSORY_FEEDBACK.md` addresses a real,
  already-occurring need. Their historical response data is a candidate for
  backfilling into the platform once that feature ships, not just a
  forward-only feature.
- **Personal/non-Néctar-Nómada content is mixed into the brand Drive**
  (`🏠HOUSE🏠`, `📲 IPhone` raw backup, possibly `Bone Broth project`) —
  explicitly deferred, not a Phase A concern, left as-is per your own
  decision.
- **No consistent sample/content ID scheme exists** — cupping codes mix
  styles (`F3C-SPON2`, `DEEP AMBER HONEY`, `CO-16A`) with no documented
  convention.

## 2. Target folder structure

```
00_PLANTILLAS_Y_RECURSOS/
01_PROYECTOS/
    CRYOBLOOM/
    LAS-NUBES-CERRO-AZUL/
    KIVA-ESTATE-APIARIO/
    [one folder per real Project entity]
02_PRODUCTOS/
    MIEL/
    HIDROMIEL/
    GUARAPO/
    [matching Checklist productos categories]
03_EXPERIENCIAS_Y_EVENTOS/
    FERMENTFEST-2024/
    FERMENTFEST-2025/
    EXPEDICIONES/
04_MEDIOS/
    _SIN-CLASIFICAR/       ← raw camera-roll dumps land here, not scattered at root
    POR-PROYECTO/
05_INVESTIGACION_Y_DATOS/
    CUPPING-Y-SENSORIAL/
    AUDITORIAS-CIENTIFICAS/
06_MARCA_Y_DISENO/
    ARTES-NOMADAS/
    SERIGRAFIA/
07_COLABORADORES/
    [one folder per person — not floating at root as it does today,
    e.g. current "❇️Oliver Chez❇️" moves here]
08_ADMINISTRATIVO/
99_ARCHIVO/                ← superseded/deprecated content, non-NN personal
                              content stays here or gets moved out entirely
```

## 3. ID / naming convention

Extends the real `CRYOBLOOM SERIES GEISHA VOL. I` pattern already in use:

- **Series content**: `[PROYECTO]-[SERIE]-VOL[N]` — e.g.
  `CRYOBLOOM-GEISHA-VOL1`
- **Dated/one-off content**: `[PROYECTO]-[AAAA]-[SEQ]` — e.g.
  `KIVA-2026-003`
- **Sample/cupping codes**: standardize on `[LOTE]-[PROCESO]-[SEQ]`
  (replacing the current inconsistent mix) — e.g. what's currently
  `F3C-SPON2` becomes `F3-SPONT-C2`, applied consistently going forward.
  Historical codes stay as originally recorded (never rewritten
  retroactively) — the new convention applies from adoption forward, with
  old codes remaining valid identifiers for their existing records.

## 4. Execution sequencing

This structure and ID scheme is the target for `MEDIA_INTELLIGENCE_PIPELINE.md`
Phase A ingestion once real server-side Drive credentials exist — not
something to attempt through an ad-hoc read-mostly chat connector, which
cannot rename, move, or delete, and would only create duplicate copies if
used for reorganization. Log acceptance in `DECISIONS.md` when this is
added to the repo, same as every other planning document.
