# External Data Architecture — Néctar Nómada Digital Platform

**Status: approved (see `DECISIONS.md` ADR-017).** No provider is
implemented and no schema is changed yet — approval covers architecture and
sequencing; implementation begins with `MVP_ROADMAP.md` Slice 2 (Location).
Input: `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` (the candidate source catalog you
added to the repo; referenced throughout this document as "the catalog." Note
the actual filename differs from `EXTERNAL_DATA_SOURCES.md` named in your
prompt — see the naming note in the summary reply that follows this doc).

This document extends, and in a few places revises, decisions already made in
`PLATFORM_OVERVIEW.md`, `DOMAIN_MODEL.md`, `DATA_ARCHITECTURE.md`,
`AI_GOVERNANCE.md`, `RBAC.md`, `SECURITY.md`, and `INTEGRATIONS.md`. Where it
revises something already approved, that is called out explicitly and logged
as a decision needing your sign-off in §30 — nothing here silently overrides
prior architecture.

---

## 1. Executive Summary

The catalog lists roughly 70 external providers across 18 domains. The
temptation with a list this size is to treat it as a checklist. It isn't one
— per its own §0 and §28, and per your instructions. This document's core
position: **external data is context, not evidence.** It can enrich a
Location, a Project, a Field Visit, a public story — but it can never become
a `measured_fact` or `direct_observation` in Néctar Nómada's own provenance
hierarchy (`PLATFORM_OVERVIEW.md` §3) without an explicit, human-mediated
Research OS workflow (§15).

The repository currently implements only Slice 1 (Identity) — Location,
Project, Sample, Organization, Research OS, and Environmental Data exist as
design in `DOMAIN_MODEL.md` but have no live tables yet (§2). That materially
narrows what "P0" should mean here: this document recommends a **smaller** P0
set than the catalog's own P0 list (§26), because most of the catalog's P0
candidates have nothing to attach to yet. The recommended P0 is two
providers — Open-Meteo and NASA POWER — plus one narrow, high-leverage
addition (OpenTopography) once Location exists. Everything else, including
GBIF, Panama government sources, and research-literature normalization, is
real and worth building but is sequenced to when there is a canonical entity
for it to enrich.

## 2. Existing Repository State

What actually exists in the database today (`prisma/schema.prisma`): `Person`,
`UserAccount`, `RoleProfile`, `Permission`, `RoleProfilePermission`, `Scope`,
`Assignment`, `AuditEvent` — Slice 1 (Identity) only. No `Location`,
`Project`, `Organization`, `Sample`, `Asset`, or any Research OS / Sensory /
Environmental table exists as a live Prisma model yet. PostGIS is not yet
enabled (nothing spatial exists to index).

What already exists as **design**, not implementation:

- `DOMAIN_MODEL.md` §3 specifies `Location` (hierarchical, lat/lng/altitude,
  timezone) and `Sample` as canonical entities, and §4's Environmental Data
  module specifies `EnvironmentalSource` (typed: weather API / station / IoT
  sensor / logger / manual / imported dataset), `Sensor`,
  `SensorDeployment`, `EnvironmentalObservation`.
- `DATA_ARCHITECTURE.md` §6 already designs `environmental.observation` as a
  monthly-partitioned table with `source_id`, `data_quality`, and the
  provenance columns from §4 of that document — and explicitly names
  "weather API" as one of the source types it must distinguish from a
  station, a sensor, or a manual observation. **This means the transactional
  shape for normalized weather-type external data was already designed** —
  this document's job for that slice of scope is to specify the adapter and
  provenance detail around feeding it, not to invent a new table.
- `INTEGRATIONS.md` already establishes the adapter-per-capability pattern
  this document extends: `WeatherProvider` (§2), `MapsProvider` (§8), and
  `IoTIngestProvider` (§10) are already named interfaces with no concrete
  vendor chosen. This document narrows those choices (Open-Meteo, NASA POWER)
  and adds capability families the catalog surfaces that `INTEGRATIONS.md`
  didn't anticipate: biodiversity, terrain, soil, satellite/remote sensing,
  government open data, and research-literature metadata.
- `AI_GOVERNANCE.md` already establishes the suggestion → human review → audit
  loop and the rule that AI never writes to authoritative tables. §17-18
  below reuse that mechanism rather than inventing a parallel one.
- `docs/architecture/NECTAR_NOMADA_CONTENT_EXPERIENCE_ARCHITECTURE.md` (also
  newly added, exploratory rather than approved) proposes a `MediaAsset` /
  `AISuggestion` model and a "Follow the Place" territory-centered experience
  concept (its §59). Where this document's Location Intelligence section
  (§16) overlaps with that, it's flagged rather than silently duplicated —
  that document has not gone through the same approval step as the
  Section-51 docs.

**Consequence for this document:** every "how does external data attach to
Location/Project/Sample/Research OS" question below is being answered
*ahead of* those entities existing, the same way `DOMAIN_MODEL.md` was
written ahead of any code. That's intentional — it means the Location schema,
when it is built (MVP_ROADMAP.md Slice 2), can carry the geometry and
external-context relationships from day one instead of a retrofit.

## 3. Architectural Principles

Extends `PLATFORM_OVERVIEW.md` §3's provenance model rather than replacing
it. Two axes, not one:

- **`provenance_class`** (already defined, `DATA_ARCHITECTURE.md` §4) —
  Néctar Nómada's own epistemic classification: `measured_fact |
  original_record | direct_observation | scientific_evidence |
  manufacturer_specification | interpretation | hypothesis | conclusion |
  recommendation | ai_suggestion`. This answers "what evidentiary weight does
  this carry in our own hierarchy."
- **`external_source_class`** (new — see §8) — what *kind of external thing*
  produced this value, adapted from the catalog's §19 taxonomy. This answers
  "how far is this from a direct physical measurement of the thing itself."

These are orthogonal on purpose. A GBIF citizen-science occurrence and a
NASA POWER modeled temperature are both, in our own hierarchy, at best
`external observation`/`interpretation`-adjacent — never `measured_fact` for
a Néctar Nómada project — but they differ enormously in `external_source_class`
(`citizen_science_observation` vs `model_reanalysis`), and that distinction
must survive into storage, not just documentation.

Non-negotiables carried directly from the catalog and from CLAUDE.md §3/§32,
restated because they are the ones most likely to erode under implementation
pressure:

- An external value never silently overwrites a primary project measurement.
  A SoilGrids-modeled pH and a lab-measured pH for the same plot are two
  rows, not one row with the newer value winning.
- External identities (a GBIF occurrence, an iNaturalist observation) do not
  become canonical Néctar Nómada records automatically. A human-approved
  relationship connects them explicitly (§15).
- AI may compare, summarize, and suggest against external data; it may not
  convert external correlation into causal conclusion, nor upgrade a
  modeled/forecast/citizen-science value into a measured fact (§17, extending
  `AI_GOVERNANCE.md` §7).

## 4. Source Catalog Assessment

Classification legend: **CORE** (Recommended — Core) · **SEC** (Recommended —
Secondary) · **DEMAND** (Useful on demand) · **EXP** (Experimental) ·
**RED** (Redundant) · **NOT-NOW** (Not currently needed) · **NOT-REC** (Not
recommended).

### Weather & Climate

| Source | Class | Why |
|---|---|---|
| Open-Meteo | **CORE** | Free at project scale, global incl. Panama, forecast+historical+current in one API, no key required for the free tier. Best default. |
| NASA POWER | **CORE** | Purpose-built for agroclimatology (solar radiation, the variables coffee/apiary work actually needs), free, no key, long historical record. |
| Meteostat | DEMAND | Useful if a specific station's long historical record is needed for a research comparison; redundant with Open-Meteo for routine use. |
| Visual Crossing | DEMAND | Commercial fallback only if Open-Meteo's rate limits are actually hit in production — no evidence of that yet. |
| Tomorrow.io | NOT-NOW | Hyperlocal/paid tier aimed at operational-weather use cases (logistics, alerts) Néctar Nómada doesn't have yet. |
| Copernicus CDS/ERA5 | SEC | Valuable for Research OS climate-history questions; heavier integration (CDS API, NetCDF) than routine display needs — sequence after P0. |
| IMHPA (Panama) | SEC, scheduled-import only | Authoritative for Panama but "no stable public REST API confirmed" per the catalog itself — treat as a future scheduled/partner import, never scraped. |

### Satellite & Remote Sensing

| Source | Class | Why |
|---|---|---|
| Copernicus Data Space (Sentinel) | SEC | High value for vegetation/land monitoring once a Location/Project has real georeferenced boundaries — premature before Location exists. |
| Google Earth Engine | DEMAND | Powerful but a second computational platform to operate; use only when a specific derived-index need (NDVI time series) justifies it. |
| NASA Earthdata CMR / OPeNDAP | NOT-NOW | Discovery/access infrastructure for scientific users; no current Néctar Nómada workflow consumes it directly. |
| USGS Landsat M2M | NOT-NOW | Overlaps with Sentinel/Earth Engine for this platform's resolution needs. |
| NASA FIRMS (fire) | DEMAND | Relevant if/when a Project needs fire-risk context; not a current need. |
| Global Forest Watch | SEC | Strong tropical-forest coverage, directly relevant to biodiversity/agroforestry storytelling — sequence after Location/Project exist. |
| NASA GPM IMERG | RED | Overlaps with Open-Meteo's precipitation and NASA POWER; no case for a third precipitation source yet. |
| NASA SMAP (soil moisture) | NOT-NOW | Relevant to future fermentation/drying environmental research, not current scope. |
| ESA WorldCover | DEMAND | One-time/versioned land-cover classification — useful as a static reference layer, not a sync target. |

### Topography, Elevation & Terrain

| Source | Class | Why |
|---|---|---|
| OpenTopography | **CORE** (once Location exists) | Cheap, high-value, one-shot per Location (elevation/slope/aspect), free API-key access, directly serves the Location model's `altitude` field and Map & Territory module. |

### Biodiversity, Species & Pollinators

| Source | Class | Why |
|---|---|---|
| GBIF | **CORE** (once Location exists) | The de facto standard for species occurrence; directly serves CLAUDE.md's biodiversity-observation and apiary/pollinator use cases. |
| iNaturalist | SEC | Strong citizen-science complement to GBIF (GBIF actually aggregates much of iNaturalist already) — sequence just after GBIF, not simultaneously, to avoid duplicate-occurrence handling on day one. |
| Catalogue of Life | SEC | Needed once a canonical internal `Taxon`/`Species` table exists (not yet) to normalize names — sequence with the taxonomy work, not before it. |
| Tropicos | DEMAND | Valuable specifically for Panama/tropical flora once botanical content work is active; narrow use case. |
| eBird | DEMAND, license-gated | Non-commercial API terms (catalog §27) — do not integrate until legal review confirms Néctar Nómada's use qualifies. |
| OBIS, GloBI, IUCN Red List | NOT-NOW | Marine, interaction-network, and conservation-status data with no current Néctar Nómada workflow; revisit if a marine/pollination research project is scoped. |

### Protected Areas & Conservation

| Source | Class | Why |
|---|---|---|
| Protected Planet API v4 | DEMAND, license-gated | Explicitly non-commercial per the catalog — usable for internal research/context only, never for a commercial tourism surface, until MiAmbiente/IPDE layers are evaluated as the licensed alternative. |

### Soil & Agronomic Data

| Source | Class | Why |
|---|---|---|
| ISRIC SoilGrids | SEC | High value for coffee/agroforestry context; catalog flags the REST API is currently paused — build only the WCS/download adapter path, and only once a Location/plot boundary exists to query against. |
| FAO HWSD, FAO GSOC map | NOT-NOW | Coarse global reference rasters; no current use case sharper than SoilGrids covers. |
| FAOSTAT | DEMAND | Country-level production/price statistics — useful for market-context storytelling later, not foundational. |

### Hydrology, Rainfall & Water

| Source | Class | Why |
|---|---|---|
| GEOGLOWS, Copernicus GloFAS, JRC Global Surface Water | NOT-NOW | No current Néctar Nómada hydrology/watershed workflow; revisit if a specific watershed research project is scoped. |
| ACP / SINIA (Panama) | NOT-NOW, scheduled-import only | No confirmed public API; treat as a future scheduled import, never scraped. |

### Marine, Coastal & Ocean

| Source | Class | Why |
|---|---|---|
| Copernicus Marine Service | NOT-NOW | No current coastal/marine project; the catalog itself frames this as relevant only "when coastal projects require it." |

### Air Quality

| Source | Class | Why |
|---|---|---|
| OpenAQ | DEMAND | Free, station-based; relevant if an air-quality-sensitive process (drying, roasting) needs it — not a current requirement. |
| CAMS, Google Air Quality | NOT-NOW | Heavier/commercial for a need not yet demonstrated. |

### Commodity & Agricultural Market Data

| Source | Class | Why |
|---|---|---|
| FAOSTAT, USDA AMS (honey report) | DEMAND | Useful market-context signals for Commerce/storytelling once that module exists (MVP_ROADMAP.md Slice 3) — not before. |
| ICO, ICE futures | NOT-REC (for now) | No stable free public API (ICO) / licensed commercial feeds (ICE) — real cost and licensing commitment with no funded use case yet. |

### Astronomy, Lunar, Solar & Tidal

| Source | Class | Why |
|---|---|---|
| NASA/JPL Horizons, WorldTides | NOT-NOW | No current tourism/experience feature needs tide or precise ephemeris data; sunrise/sunset/moon phase can be computed locally without an API when actually needed. |
| Open-Meteo Marine | DEMAND | Bundled with the Open-Meteo relationship already established for P0 — trivial to add later if a coastal experience is scoped. |

### Tourism & Travel Context

| Source | Class | Why |
|---|---|---|
| INEC Panama, ATP Datos Abiertos | DEMAND, scheduled-import | Useful macro context for tourism storytelling; low urgency, no stable API for INEC specifically. |
| Foursquare, Google Places | NOT-NOW | Commercial POI data with no current Discover/Map feature consuming it; `INTEGRATIONS.md` §8 already scopes Mapbox for geocoding, which covers near-term needs. |

### Panama Government & National Open Data

| Source | Class | Why |
|---|---|---|
| Panama IPDE (WMS/WFS) | SEC | Authoritative for national boundaries/GIS layers — high value once the Map & Territory module (CLAUDE.md §6) is built; not before. |
| Panama Datos Abiertos (CKAN) | SEC | Same reasoning — CKAN adapter is a real, reusable investment, sequence with Map & Territory. |
| MiAmbiente/SINIA, MIDA/OSIGA, ACP, INEC, IMHPA | NOT-NOW, scheduled-import only | All API-light or unconfirmed public APIs per the catalog — the correct posture is "future partner/scheduled import," never scraping, and never before a concrete consuming feature exists. |

### Maps, Geographic Context & POIs

| Source | Class | Why |
|---|---|---|
| OpenStreetMap/Overpass | DEMAND | Useful for trail/route data (Experiences module) later; `INTEGRATIONS.md` §8 already covers base mapping via Mapbox. |
| Google Places, Foursquare | NOT-NOW | See Tourism section above — same reasoning. |

### Certification & Traceability Bodies

| Source | Class | Why |
|---|---|---|
| USDA Organic, Fairtrade, Rainforest Alliance, SCA | NOT-REC for automated ingestion | No supported public APIs per the catalog; certifications belong in Néctar Nómada's own record with evidence and verification status (already the correct pattern per CLAUDE.md §9's "Certifications" field), not an automated feed. |

### Stock Imagery / Footage

| Source | Class | Why |
|---|---|---|
| Unsplash, Pixabay | DEMAND | Fine as a stopgap for placeholder/editorial imagery; original Néctar Nómada photography remains preferred per the catalog's own note. |
| Shutterstock, Getty, Adobe Stock | NOT-NOW | Commercial licensing commitment with no current budget/use case decided. |

### Research Literature & Scientific Metadata

| Source | Class | Why |
|---|---|---|
| Crossref | SEC | Free, no signup, directly useful once Research OS `Publication`/citation records exist (CLAUDE.md §17) — sequence with that slice, not before. |
| ROR | SEC | Normalizes research organizations — same sequencing as Crossref, and useful for `Organization` records of type University/Laboratory. |
| OpenAlex, DataCite | DEMAND | Valuable for deeper literature work; not needed until Research OS has enough content to normalize against. |
| ORCID | DEMAND, license-gated | Non-commercial public-client terms per the catalog — evaluate membership API before any commercial-adjacent use. |

## 5. Capability Map

| Capability | Current need | Future need | No clear need |
|---|---|---|---|
| Weather (current/forecast) | ✅ | | |
| Historical climate | ✅ | | |
| Hyperlocal weather | | | ✅ |
| Terrain/elevation | ✅ (once Location exists) | | |
| Satellite imagery / remote sensing | | ✅ | |
| Vegetation indices | | ✅ | |
| Land cover | | ✅ | |
| Biodiversity / species occurrence | ✅ (once Location exists) | | |
| Pollinators | | ✅ (apiary module) | |
| Soil | | ✅ (agricultural traceability) | |
| Agronomy / commodity markets | | ✅ (commerce module) | |
| Hydrology / water quality | | | ✅ |
| Air quality | | | ✅ |
| Marine / coastal | | | ✅ |
| Astronomical / tidal | | | ✅ |
| Tourism / travel statistics | | ✅ (experiences module) | |
| Panama government/open data (geo, boundaries) | | ✅ (map & territory module) | |
| Certification / reference datasets | | | ✅ (handled as own evidence record, not a feed) |
| Research literature metadata | | ✅ (research OS) | |
| Geographic/contextual POIs | | ✅ (map & territory module) | |
| Stock imagery | ✅ (stopgap only) | | |

## 6. Provider Priority Matrix

Full detail for P0; grouped summary for P1-P3/NO (see catalog for full
per-provider detail already tabulated there — this table adds the
Néctar-Nómada-specific columns the catalog doesn't have: current repo
readiness and recommended priority).

| Provider | Domain | NN use case | Coverage | API type | Cost | Update freq. | Resolution | Licensing | Integration complexity | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Open-Meteo | Weather | Current/forecast/historical weather context for Locations, Field Visits | Global incl. Panama | REST JSON | Free (low volume) | Hourly/daily | Point/grid | Open, attribution-friendly | Low | **P0** |
| NASA POWER | Weather/climate | Agroclimatology (solar radiation, temp) for coffee/apiary context | Global incl. Panama | REST JSON/CSV | Free | Daily/monthly | ~0.5° grid | Open (NASA) | Low | **P0** |
| OpenTopography | Terrain | Elevation/slope/aspect validation for Location records | Global incl. Panama | REST | Free (API key) | Static | Meters-scale DEM | Open, dataset-dependent | Low-Medium (raster handling) | **P0** (gated on Location existing) |
| GBIF | Biodiversity | Species-occurrence context for farms/apiaries | Global | REST JSON | Free | Continuous | Point | Open, source-varies | Low-Medium | P1 |
| Panama IPDE / CKAN | Geo/reference | Authoritative Panama boundaries and open datasets | Panama | WMS/WFS/CKAN | Free | Varies | Vector/varies | Government open | Medium (new adapter families: OGC, CKAN) | P1 |
| Crossref / ROR | Research metadata | Citation/organization normalization for Research OS | Global | REST JSON | Free | Continuous | N/A | Open (CC0/varies) | Low | P1 |
| iNaturalist, Catalogue of Life, Tropicos | Biodiversity/taxonomy | Occurrence + taxonomy normalization | Global/Panama-strong (Tropicos) | REST | Free | Continuous | Point | Open, varies | Medium | P2 |
| Copernicus Sentinel, Global Forest Watch, SoilGrids, ESA WorldCover | Satellite/soil | Vegetation/land/soil context per Project | Global | STAC/OGC/raster | Free (quota) | Varies | 10m-250m | Open, varies | High (raster/STAC pipeline) | P2 |
| FAOSTAT, USDA AMS, OpenAQ | Market/air quality | Commerce/context signals | Global/US-heavy | REST JSON | Free | Periodic | Country/station | Open | Low-Medium | P2 |
| Visual Crossing, Tomorrow.io, Google Places/Air Quality, WorldTides, ICE feeds, stock imagery APIs | Commercial redundancy/context | Fallback or premium features | Global | REST | Paid | Varies | Varies | Commercial | Low-Medium | P3 |
| Protected Planet, ORCID, eBird | Conservation/research identity | Context, citation | Global | REST | Free, license-gated | Varies | Varies | Non-commercial restricted | Low | P3 — legal review required |
| IMHPA, INEC, ACP, MiAmbiente/SINIA, MIDA/OSIGA, ICO, USDA Organic DB, Fairtrade, Rainforest Alliance, SCA | Panama official / certification | Authoritative but API-light | Panama/global | Scheduled download only | Free/varies | Static-ish | Varies | Government/org-specific | Medium (import pipeline, not live API) | NO for now — revisit as partner/scheduled import when a concrete consuming feature exists |

## 7. Proposed External Data Model

New `external` Postgres schema (`DATA_ARCHITECTURE.md` §1's module-schema
convention), separate from `environmental` — with one deliberate exception:

**Decision (flag for §30): weather/climate data that normalizes into a
point-in-time environmental variable (temperature, humidity, rainfall, solar
radiation, wind, soil moisture) is written into the *existing*
`environmental.observation` table** (`DATA_ARCHITECTURE.md` §6), with
`source_id` pointing to an `external.provider`/`external.dataset` pair
instead of a physical `Sensor`/`SensorDeployment`. That table was already
designed to distinguish "weather API" as a `source_type` — reusing it avoids
two parallel provenance systems for the same shape of data (a value, a
variable, a unit, a place, a time). Everything else the catalog covers
(biodiversity occurrences, soil/satellite rasters, static reference layers,
market series, research metadata) does not fit that shape uniformly and gets
its own entities below.

```
external.provider         (id, name, homepage_url, contact, status)
external.dataset          (id, provider_id, name, description, dataset_version,
                            external_source_class, spatial_resolution,
                            temporal_resolution, license_id, terms_url,
                            last_terms_reviewed_at, reviewed_by)
external.identifier        (id, dataset_id, external_id, entity_type, entity_id)
                            -- links a GBIF taxon key / Crossref DOI / etc. to
                            -- a canonical NN entity ONLY via explicit human action
external.observation        (id, dataset_id, variable, raw_value, normalized_value,
                            source_unit, canonical_unit, geometry, observed_at,
                            valid_from, valid_to, retrieved_at, quality_flag,
                            external_source_class, raw_payload_reference,
                            normalization_version)
                            -- for non-timeseries-shaped point/feature data:
                            -- occurrences, single readings, POIs
external.raster_asset       (id, dataset_id, geometry_footprint, acquired_at,
                            resolution, storage_key, checksum, processing_algorithm,
                            processing_version)
                            -- reference to object storage, never the raw scene in Postgres
external.feature            (id, dataset_id, geometry, feature_type, properties jsonb,
                            valid_from, valid_to)
                            -- boundaries, protected areas, land-cover polygons
external.import_job         (id, dataset_id, started_at, finished_at, status,
                            records_ingested, records_rejected, triggered_by,
                            trigger_type)
external.sync_state         (id, dataset_id, last_successful_sync_at,
                            last_attempted_sync_at, last_error, consecutive_failures)
external.license            (id, provider_id, dataset_id, license_name, license_url,
                            commercial_use_allowed, redistribution_allowed,
                            attribution_required, derivative_products_allowed,
                            cache_allowed, max_cache_duration, notes)
external.derived_metric      (id, source_observation_ids[], formula, software_version,
                            computed_at, result_value, unit)
                            -- NDVI-style derived values; always cites its inputs
```

Association to canonical entities (`core.location`, future `Project`,
`Sample`) is **never a required FK at ingestion time** — an
`external.observation`/`feature`/`raster_asset` is geometry-addressable on
its own, and a join to a Location is either computed on read (spatial
proximity/intersection query) or recorded explicitly once a human or an
automated-but-reviewable enrichment job (§13) creates the relationship. This
is what keeps a GBIF occurrence from silently becoming "this farm's
biodiversity record" (§3).

## 8. Provenance Model

Extends `DATA_ARCHITECTURE.md` §4's provenance columns. Every
`external.observation`/`feature`/`raster_asset`/`derived_metric` row carries:

```
provider                  -- FK to external.provider
dataset                   -- FK to external.dataset (carries dataset_version)
external_source_class     -- enum, see below
retrieved_at               -- when NN fetched it
observed_at / valid_from / valid_to   -- when the source says it applies
spatial_resolution          -- e.g. "10km grid", "0.5deg", "point", "10m/pixel"
temporal_resolution         -- see §10
source_unit / canonical_unit
quality_flag                -- provider-specific string, not a universal score (§9)
license_id                  -- FK to external.license
raw_payload_reference        -- object-storage pointer to the raw response, when kept (§13)
normalization_version        -- which version of NN's normalization logic produced this row
```

`external_source_class` enum (from the catalog §19, adopted as-is since it is
already well-designed and directly answers "how far from ground truth"):

```
official_government_observation | external_station_observation |
remote_sensing_observation | model_forecast | model_reanalysis |
modeled_spatial_estimate | citizen_science_observation |
curated_reference_database | market_reference | statistical_series |
scientific_metadata | static_reference_raster | partner_provided_data |
commercial_data_provider | ai_derived_interpretation
```

(`primary_project_measurement` from the catalog's list is deliberately
**not** part of this enum — that case is already `provenance_class =
measured_fact` in Néctar Nómada's own model and does not belong in a
table about *external* data.)

## 9. Spatial Architecture

`core.location` (not yet built) should carry, when it is built: a
`geography(Point, 4326)` PostGIS column for the canonical point, and
optionally a `geography(Polygon, 4326)` for a farm/plot boundary when
surveyed — additive to the lat/lng columns already specified in
`DOMAIN_MODEL.md` §3, not a replacement (lat/lng stay as the simple
human-readable columns; the geography column is what spatial queries index
against). This is the only schema change this document recommends
*eventually*, and it happens as part of the Location table's own creation
(Slice 2), not as a change made for external-data purposes alone.

`external.observation`/`feature`/`raster_asset` each carry their **own**
geometry — a point, footprint, or polygon from the source, in the source's
native precision. They are never forced to pre-resolve to a Location ID at
ingestion. Association is a query: "what external observations/features fall
within N km of Location X" (or intersect its polygon), computed with PostGIS
`ST_DWithin`/`ST_Intersects` at read time or by a background enrichment job
that writes an explicit, reviewable join row (§13) — never a blind FK
assumption. This directly satisfies the catalog's "do not create duplicate
Location concepts" instruction: there is one Location model, and external
geometries relate to it by spatial query, not by re-modeling farms/plots
inside the external schema.

Point vs. polygon vs. line/route vs. raster are handled structurally, not
conflated: `external.observation.geometry` is typically a point;
`external.feature.geometry` can be point/line/polygon (protected areas,
routes, boundaries); `external.raster_asset.geometry_footprint` is always a
polygon (the scene/tile extent), with the actual raster data in object
storage, never in Postgres (`DATA_ARCHITECTURE.md` §5's rule extends
directly here).

## 10. Temporal Architecture

Never reduced to `createdAt`. Explicit fields per §8, with semantics:

- **Instantaneous measurement**: `observed_at` set, `valid_from`/`valid_to`
  null.
- **Period/aggregate** (daily/monthly/seasonal/climatology): `valid_from` +
  `valid_to` set, `observed_at` null or equal to `valid_from` by convention
  (decide at implementation time, document once).
- **Forecast**: additionally carries `forecast_issued_at` and
  `forecast_horizon` (interval) — a forecast for tomorrow issued today is a
  fundamentally different temporal object from an observation, and must
  never be persisted into `environmental.observation` (which represents
  observed/modeled-as-if-observed values) without a `external_source_class =
  model_forecast` tag making that explicit, and ideally a distinct table or
  a `is_forecast` flag if forecast volume ever justifies retention at all
  (§13 recommends forecasts are *not* persisted by default — see below).
- **Historical average/climatology**: `valid_from`/`valid_to` span the
  averaging period; `dataset_version` records which climatology baseline
  (e.g., "1991-2020 normal") produced it.
- **Satellite acquisition**: `observed_at` = acquisition timestamp,
  `retrieved_at` = when NN's ingestion job pulled it — these are commonly
  weeks apart for archival imagery and must not be conflated.
- **Market close**: `observed_at` = the market timestamp the price refers to,
  in the source's timezone, normalized to UTC on storage with the original
  timezone retained in `raw_payload_reference`'s payload if precision matters.

## 11. Data Quality and Confidence

No universal confidence percentage (per the catalog's explicit instruction).
`quality_flag` is a free-text/enum-per-provider field capturing what the
*source* says about itself (e.g., Open-Meteo's model name, a GBIF occurrence's
`basisOfRecord`, a SoilGrids prediction interval where the source provides
one). Néctar Nómada's own internal classification layered on top is
`external_source_class` (§8) plus, where genuinely scientifically
appropriate (a stated prediction interval, a documented model accuracy
metric published by the source), a `provider_confidence_interval` free-form
field — never a fabricated single number implying false precision.

## 12. Resolution Awareness

`spatial_resolution` and `temporal_resolution` (§8, §10) are mandatory,
non-null fields on every `external.observation`/`feature`/`raster_asset` row
— not optional metadata. Any UI or AI surface displaying an external value
next to a Location must show the resolution alongside it (e.g., "NASA POWER,
~50km grid" next to a farm's climate context), so a 10km climate grid is
never presented as if a sensor measured the inside of a coffee fermentation
tank (the catalog's own example, kept verbatim because it's the clearest
statement of the risk). Where a Location's exact coordinates and an external
observation's grid-cell center differ, the enrichment job (§13) should
record `distance_from_location` so research/AI consumers can weigh relevance
accordingly (§17).

## 13. Provider Adapter Architecture

`INTEGRATIONS.md` §1 already establishes the convention: one interface per
*capability*, business logic depends on the interface, one file per concrete
provider implements it. This document adds the layer *underneath* that
convention that the catalog correctly identifies as necessary: capability
interfaces are transport-agnostic, but the catalog's ~70 providers speak at
least six different transport families. Adapters therefore have two layers:

```
/lib/integrations/<capability>/           -- unchanged from INTEGRATIONS.md §1
  types.ts            -- e.g. WeatherProvider, BiodiversityProvider, TerrainProvider
  <provider>.ts        -- e.g. open-meteo.ts, gbif.ts, opentopography.ts
  index.ts

/lib/integrations/_transport/              -- new: shared transport-family helpers
  rest-json.ts          -- fetch + retry/backoff + schema validation helper
  ckan.ts               -- CKAN datastore_search helper (Panama Datos Abiertos, P1)
  ogc.ts                -- WMS/WFS/WCS helper (IPDE, SoilGrids WCS, P1/P2)
  stac.ts                -- STAC catalog/search helper (Sentinel, P2)
  scientific-dataset.ts    -- NetCDF/GRIB/HDF5/Zarr helper (P2/P3, likely a
                           -- server-side Python microservice or a narrow
                           -- Node binding — decide at implementation time,
                           -- not now)
  scheduled-file-import.ts -- checksum + versioned mapping for CSV/XLSX/manual
                           -- downloads (IMHPA, INEC, ACP — NO/scheduled-only, §6)
```

A capability provider file (e.g. `open-meteo.ts`) composes the relevant
transport helper and implements the capability interface — `Location`,
`Project`, and `Sample` code depends only on `WeatherProvider` /
`BiodiversityProvider` / etc., never on `rest-json.ts` or provider-specific
response shapes, exactly as `INTEGRATIONS.md` §1 already requires. This is
where the catalog's `ExternalDataAdapter` interface proposal (its §1) is
useful — as the *shape* each capability interface's methods converge toward
(`fetchPoint`, `fetchArea`, `fetchTimeseries`, `fetchFeatures`, `fetchRaster`,
`discover`) — not as a single mega-interface every provider implements
directly. Forcing NASA POWER and GBIF through one identical interface would
hide real differences business logic needs to know about (a weather fetch
and a biodiversity-occurrence fetch have different natural request/response
shapes); sharing the *transport* plumbing while keeping capability interfaces
distinct is the actual overengineering-avoidance point the catalog's own §4
asks this document to resolve.

## 14. Normalization Strategy

- Canonical variable names and units are defined once per capability (e.g.
  `temperature_c`, `precipitation_mm`, `elevation_m`) in the capability's
  `types.ts`, and every provider adapter maps its native units/names to that
  canonical set before the value is persisted — never stored in the
  provider's native unit with a "figure it out later" comment.
- Validation (Zod, per `SECURITY.md` §3) runs on the provider's raw response
  before normalization, and again on the normalized shape before persistence
  — a malformed or schema-changed provider response is rejected and logged
  (§23), never partially written.
- `normalization_version` increments whenever the mapping logic changes, so
  a later audit can tell which rows were normalized under which rules.

## 15. Storage / Cache / On-Demand Strategy

| Data category | Strategy | Why |
|---|---|---|
| Weather point observations/current conditions (Open-Meteo, NASA POWER) | Normalize + persist into `environmental.observation`, short TTL cache (hours) on repeat requests for the same point/time | Cheap, small, genuinely reused across a Location's pages over time; matches the table already designed for this shape. |
| Weather forecasts | **Do not persist by default** — fetch on demand, cache briefly (matches provider's own update cadence, typically hours) | A forecast is stale the moment a new model run exists; persisting it as history creates exactly the "forecast treated as measured historical observation" error the catalog's AI rules (§24 there) warn against. If a specific research need requires archiving forecasts-as-issued for later verification, that's a deliberate, separately-scoped decision, not a default. |
| Biodiversity occurrences (GBIF, iNaturalist) | Normalize + persist lightweight `external.observation` row (no raw blob) | Small, valuable to reference repeatedly; the source dataset itself is authoritative for re-verification, so no need to hoard raw payloads. |
| Terrain/elevation (OpenTopography) | Fetch once per Location, persist the derived point value (elevation/slope/aspect) as an `external.observation`, not the full DEM raster | Static reference; re-fetching per page view is wasteful, and the platform doesn't need pixel-level terrain data, just the point summary. |
| Satellite scenes, large rasters (Sentinel, SoilGrids WCS output) | **Reference only** — `external.raster_asset` records metadata + object-storage pointer to a derived, small, cropped/summarized product; never store or cache full scenes speculatively | Matches `DATA_ARCHITECTURE.md` §5's "no large media in Postgres" rule and the catalog's explicit "avoid storing massive satellite/weather datasets unnecessarily." |
| Static reference layers (ESA WorldCover, protected areas) | Persist as `external.feature` polygons, versioned, refreshed only when the source publishes a new version | Genuinely static; no benefit to on-demand fetching. |
| Market/statistical series (FAOSTAT, USDA AMS) | Persist normalized series points, scheduled refresh (§16) | Small volume, meaningful history matters for trend display. |
| Research literature metadata (Crossref, ROR) | Fetch on demand when a citation/organization is entered, cache the resolved record | Reference lookups, not something to bulk-sync speculatively. |
| Raw payloads generally | Keep for a bounded retention window (e.g. 30-90 days, tunable per dataset) in object storage when `license.cache_allowed` permits, referenced via `raw_payload_reference` — not kept indefinitely by default | Enables re-normalization if logic bugs are found, without treating every provider response as a permanent archival record by default. |

## 16. Scheduling & Ingestion

| Category | Pattern |
|---|---|
| Weather current/forecast | ON-DEMAND (fetched when a page/job needs it, short cache) — not polled speculatively |
| Weather historical (backfill for a new Location) | EVENT-DRIVEN (on Location creation, §13-style enrichment) |
| Terrain/elevation | EVENT-DRIVEN, once per Location (static) |
| Biodiversity occurrences | EVENT-DRIVEN (on Location creation) + MONTHLY refresh (new occurrences accumulate) |
| Satellite/vegetation indices | ON-DEMAND initially; MONTHLY/SEASONAL if a Project's ongoing monitoring need justifies scheduled sync (P2, not now) |
| Static reference layers (land cover, protected areas) | STATIC REFERENCE — re-synced only on source version bump, checked e.g. quarterly |
| Market/statistical series | WEEKLY or MONTHLY depending on series (daily is unnecessary for the storytelling/context use cases identified in §5) |
| Panama government scheduled imports (IMHPA, INEC, ACP, etc.) | ON-DEMAND / manual import job, run by an operator, never automated polling of an unstable or scrape-risk source |
| Research literature metadata | ON-DEMAND, at citation entry time |

No source is polled "just in case" — every scheduled sync above is tied to a
concrete consuming feature from §5, per the catalog's own "avoid unnecessary
polling" instruction.

## 17. Research OS Integration

Extends `DOMAIN_MODEL.md`'s Research OS module (not yet implemented) with
context relationships, all read-only from the research workflow's
perspective:

```
Project        → ExternalContext (join to relevant external.observation/feature rows)
Experiment     → EnvironmentalContext
Sample         → EnvironmentalContext
FieldVisit     → WeatherContext
ApiaryInspection → EnvironmentalContext
SensorySession  → EnvironmentalContext
Harvest        → ClimateContext
```

Each of these is a join table (`<entity>_id`, `external_observation_id` or
`external_feature_id`, `relationship_type`, `created_by`, `created_at`) — a
record that says "this external observation is contextually relevant to this
research object," created either by a human or by a reviewable enrichment
job (§13/§18). **An external observation becomes part of an `EvidenceClaim`
only through the existing, explicit Research OS evidence workflow**
(`DOMAIN_MODEL.md` "Research OS" module, CLAUDE.md §17) — never automatically
from the mere existence of an `ExternalContext` join row. This is the
concrete mechanism behind the catalog's "AI must not convert contextual
correlation into causal conclusion": the join row says "these were nearby in
space/time," full stop; upgrading that into "this explains the outcome" is a
human research judgment recorded as an `Interpretation`/`Conclusion`, with
the external context cited as one input among others.

## 18. Location Intelligence Integration

A `Location` (once built) can accumulate a cached "intelligence summary" —
elevation, climate baseline, nearby biodiversity occurrence count, land-cover
classification — computed by a background enrichment job and stored as a
small denormalized read-model (e.g. `core.location_intelligence_summary`,
one row per Location, regenerated on schedule or on-demand), **always with a
drill-down to the underlying `external.observation`/`feature` rows and their
provenance** — never presented as if it were the Location's own attribute
without a source trail. This is deliberately the same shape as any other
cached read-model, not a new architectural pattern.

This overlaps with `NECTAR_NOMADA_CONTENT_EXPERIENCE_ARCHITECTURE.md`'s
"Follow the Place" concept (its §59) — that document is exploratory, not
approved, so this section defines only the *data* side (how a Location
accumulates external context) and leaves the experience/composition question
to whatever future review that document goes through.

## 19. Automated Enrichment

Event-driven, cost-aware, and explicitly *not* "call every provider for
every event" (per the catalog's own instruction):

```
New Location created
  → validate coordinates (bounds check, not a provider call)
  → OpenTopography: elevation/slope/aspect             (P0, cheap, one-shot)
  → NASA POWER: climate baseline (e.g. 10-year normals)  (P0, cheap, one-shot)
  → GBIF: nearby species-occurrence count                (P1, cheap, one-shot)
  → [do NOT] auto-fetch satellite imagery, soil rasters, or protected-area
    polygons on every Location creation — these are P1/P2, fetched on-demand
    when a Location/Project page or research workflow actually requests them

New Field Visit
  → Open-Meteo: weather at visit date/location            (P0, cheap, per-visit)

New Experiment / Sample
  → link to existing Location intelligence summary (no new provider call —
    reuse what's already cached for that Location)

New Harvest
  → NASA POWER / Open-Meteo: recent rainfall/climate summary for the harvest
    window                                                (P0, cheap)
```

Each enrichment call is logged as an `external.import_job` row (§7) so cost
and volume are auditable, and every automated call is one of the P0
providers specifically because they are free and low-complexity — this list
is the concrete boundary between "cost-aware" and "call everything," per
§13's instruction.

## 20. AI / Ask Néctar Integration

Extends `AI_GOVERNANCE.md` directly — no new governance mechanism, three
additions specific to external data:

1. AI's RBAC-scoped retrieval (`AI_GOVERNANCE.md` §5) extends to
   `external.*` tables the same way it covers any other schema — a
   permission-filtered query, never a privileged bypass.
2. Any AI-generated text that references an external value must carry an
   explicit, structured citation distinguishing it from Néctar Nómada's own
   data — e.g. internally: `{ source: 'external', provider: 'NASA POWER',
   external_source_class: 'model_reanalysis', resolution: '~50km grid' }`
   attached to that claim — rendered to the user as something like "NASA
   POWER estimated regional temperature: Y" vs. "Temperature recorded by
   Néctar Nómada logger: X" (the catalog's own example, adopted directly).
   This is enforced the same way `AI_GOVERNANCE.md` §7 enforces provenance
   labeling generally: the schema (§8's mandatory fields) makes the source
   type available to the response-composition layer, so omitting it in
   AI-generated text is a prompt/template bug to catch in review, not a
   structural impossibility — worth flagging as a testing requirement,
   not a guarantee the architecture alone provides.
3. AI may never silently accept a fuzzy taxonomic or entity match (a GBIF
   species name resembling a Néctar Nómada product name, e.g.) as a
   confirmed link — any such suggestion is an `ai.recommendation` row
   (`AI_GOVERNANCE.md` §4) awaiting human accept/reject, same as any other
   AI suggestion.

## 21. Operator Intelligence Integration

Reuses the existing suggestion/notification mechanism rather than inventing
a parallel one: an operator-facing signal ("Heavy rainfall occurred before
this field visit," "Satellite vegetation index changed substantially since
the previous observation") is generated as an `ai.recommendation` row
(`suggestion_type = 'operator_signal'`) with its supporting
`external.observation`/`feature` rows cited as evidence, delivered via the
existing `Notification` entity (`DOMAIN_MODEL.md` §5). These are contextual
signals an operator can accept, dismiss, or act on — never autonomous
actions, matching `AI_GOVERNANCE.md` §2's prohibition on AI changing
authoritative data unprompted.

## 22. Content / Experience Integration

`NECTAR_NOMADA_CONTENT_EXPERIENCE_ARCHITECTURE.md`'s `ExperienceComposition`
concept (its §60, exploratory) proposes typed content blocks. If/when that
system is built, external context can populate specific block types (a
"climate context" block on a farm page, a "harvest-season rainfall" block on
a coffee lot page, a "forecast" block on a tourism experience) — but every
such block must degrade gracefully when its external data source is
unavailable or stale (§23), and must carry the same resolution/attribution
disclosure as any other external-data surface (§12). This document does not
adopt the composition-engine concept itself (that's a decision for whoever
reviews that exploratory document) — it only specifies how external data
would feed into it if adopted.

## 23. Creative Intelligence Opportunities

Same `ai.recommendation` mechanism as §21, with a stricter gate: a
creative/editorial suggestion (the catalog's "significant flowering period +
existing farm media + pollinator project → suggest educational story"
example) is only generated when it can cite both an external-data trigger
*and* an existing, concrete Néctar Nómada project/content object — never a
generic suggestion with no NN-specific grounding, per the catalog's own
instruction and consistent with `AI_GOVERNANCE.md`'s "AI drafts, never
publishes" posture (a suggested story is a draft `ai.recommendation`, not a
published Story).

## 24. Licensing & Attribution

`external.license` (§7) implements the catalog's §23 field list directly —
no reinvention needed there. Enforcement point: before any external dataset
backs a **public or commercial** surface (a Discover page, a Commerce
listing, a published Story), the authorization/publish workflow checks
`license.commercial_use_allowed` — this is a hard gate, not a documentation
note, implemented the same way classification gating already works
(`RBAC.md` §6): a boolean condition checked in the same server-side
authorization/publish path everything else goes through. Flagged for
mandatory human legal review before first use, per the catalog's own §27
warnings: Protected Planet, ORCID, eBird, any Google API, stock imagery
providers, and any ICE/commercial market feed.

## 25. Security

- All provider API keys are server-only environment variables
  (`SECURITY.md` §8) — no external provider secret reaches a browser client
  unless a provider explicitly requires and safely supports a public token
  (none of the P0/P1 providers in this document do).
- **SSRF risk**: several capabilities (maps/geocoding, CKAN, OGC, STAC)
  could be abused if a user-supplied coordinate or free-text location string
  is passed too directly into a server-side outbound request. Every adapter
  validates and bounds user-supplied geographic input (coordinate range
  checks, no user-supplied URLs ever passed to `fetch` unvalidated) before
  it reaches a transport helper (§13) — this is a mandatory adapter-level
  control, not just an input-validation nicety.
- Webhook validation (relevant if a future provider like Mux, mentioned in
  the content-architecture doc, is adopted): signature verification before
  processing, per that provider's documented scheme — not yet needed for any
  P0/P1 provider here, none of which push webhooks.
- Provider payload validation (§14) is itself a security control, not just a
  data-quality one: a malformed or unexpectedly-shaped response is rejected
  before it can reach a database write or a template that renders it as
  trusted content.

## 26. Reliability / Failure Handling

- Every outbound provider call has a timeout and a small bounded retry with
  backoff (transport helper responsibility, §13) — no unbounded retry loops.
- A provider outage or rate-limit response degrades the *specific* feature
  that depends on it (e.g., a Location page's "climate context" block shows
  "temporarily unavailable" or falls back to the last cached value with an
  explicit "as of [date]" label) — it never fails the page or blocks
  canonical data operations. External API failure must not corrupt canonical
  project data — enforced structurally by the fact that `external.*` tables
  have no FK the canonical schema depends on for its own integrity (§7).
- A changed/malformed provider schema causes the adapter to reject and log
  the response (§14, §25) rather than write partial or misinterpreted data;
  `external.sync_state.last_error` and `consecutive_failures` make repeated
  failures visible to operators (§27) rather than failing silently forever.
- Missing geographic coverage (a provider with no data for a given
  Panama coordinate) is a normal, expected empty result, not an error — the
  UI/AI layer treats "no external context available" as a valid state.
- Stale data: `retrieved_at` plus the dataset's expected update frequency
  (§16) lets any consumer compute staleness and label it, rather than
  silently presenting month-old cached weather as current.

## 27. Observability

`external.sync_state` (§7) is itself the primary operator-facing
observability surface — queryable, not buried in logs only: last successful
sync, last attempted sync, last error, consecutive failure count, per
dataset. Layered on top of `SECURITY.md` §13's structured logging (each
outbound provider call logged with provider, outcome, latency), and
`external.import_job` (§7) gives per-run records-ingested/records-rejected
counts. An operator dashboard surfacing "which external datasets are stale
or failing" is a natural Slice-later feature built directly on these two
tables — not a new subsystem.

## 28. Cost Considerations

| Provider | Free tier | Likely cost at NN's scale | Notes |
|---|---|---|---|
| Open-Meteo | Generous free tier for non-commercial/low-volume | $0 initially | Revisit if/when request volume is genuinely commercial-scale. |
| NASA POWER | Free, no published limits of concern | $0 | Government-funded, stable. |
| OpenTopography | Free with API key | $0 at Location-creation-triggered volume (one call per Location) | Enterprise keys exist if volume grows dramatically — not a near-term concern. |
| GBIF | Free | $0 | No practical limits for this platform's scale. |
| Panama IPDE / CKAN | Free (government) | $0 | Availability/reliability risk (government infra), not cost risk. |
| Crossref / ROR | Free | $0 | No signup required for Crossref; ROR is fully open. |
| Everything classified P2/P3/NO in §6 | Mixed | Deferred — no cost analysis performed until a funded use case triggers evaluation | Consistent with "don't select providers before a real use case exists." |

## 29. Recommended P0 Integrations

1. **Open-Meteo** — weather current/forecast/historical, normalizes into the
   already-designed `environmental.observation` table.
2. **NASA POWER** — agroclimatology variables, same table, complements
   Open-Meteo's gaps (solar radiation specifically).
3. **OpenTopography** — one-shot elevation/slope/aspect per Location, gated
   on the Location table existing (Slice 2), cheap and high-leverage for the
   Map & Territory module.

Explicitly **not** P0 despite appearing in the catalog's own P0 list: Panama
IPDE, Panama Datos Abiertos CKAN, Copernicus/Sentinel, GBIF, Catalogue of
Life, SoilGrids, Crossref, ROR. Each is a reasonable P1 candidate (§6), but
none has a canonical entity to attach to yet in this repository, and several
(CKAN, OGC, STAC) require building a new transport-adapter family (§13) for
a payoff that doesn't materialize until Map & Territory or Research OS
exist. Building them now would be exactly the "technically impressive API,
no demonstrated current use case" pattern this document was asked to avoid.

## 30. Decisions Requiring Product-Owner Approval

1. **Reuse `environmental.observation` for weather-shaped external data**
   (§7) vs. giving all external data, including weather, its own separate
   `external.observation` table. This document recommends reuse — confirm
   or reject before any Slice-2-adjacent implementation.
2. **`external_source_class` as a new orthogonal axis** alongside the
   existing `provenance_class` (§3, §8) — confirm this doesn't need to be
   folded into a single enum instead (this document argues against folding,
   since the two answer different questions).
3. **P0 scope narrowed to 3 providers** (§29) rather than the catalog's own
   12-provider P0 list — confirm this sequencing is acceptable, or specify
   which additional providers you want pulled forward despite Location not
   yet existing.
4. **Panama-government sources deferred to "scheduled-import, not now"**
   rather than prioritized despite the Panama-first review instruction (§23
   of your prompt) — this document's position is that API-light/unconfirmed
   sources shouldn't be built before there's a consuming feature (Map &
   Territory), regardless of geographic priority. Confirm or push back.
5. **No commercial/paid provider** (Visual Crossing, Tomorrow.io, Google
   Places/Air Quality, ICE feeds, stock-imagery APIs) until a funded,
   specific use case exists — confirm this default.
6. **PostGIS adoption timing** — tied to the Location table's creation
   (Slice 2), not adopted now. Confirm this is acceptable rather than
   enabling the extension preemptively.
7. **Forecast data is not persisted by default** (§15) — confirm, since a
   future research need ("verify forecast accuracy over time") would
   require deliberately reversing this for a specific dataset.
8. **Legal/licensing review required before any use** of Protected Planet,
   ORCID, eBird, and any Google API, stock-imagery provider, or ICE feed
   (§24) — confirm who owns that review (you, or a future legal/ops
   collaborator role per `RBAC.md` §5's Content/Ops Coordinator profile).

---

*This document is architecture only. No provider was implemented, no SDK
installed, no migration created, no credential added, no database modified —
per the constraint given with this task.*
