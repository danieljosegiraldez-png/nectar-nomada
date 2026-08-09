# NÉCTAR NÓMADA — External Data Sources & API Integration Inventory
## Prepared for Claude Code
**Verification date:** 2026-08-09
**Platform context:** Next.js + PostgreSQL modular monolith for agriculture, coffee, apiaries, fermentation, beverages, sensory evaluation, tourism, research, environmental monitoring, public storytelling and AI-assisted operations.

---

# 0. Purpose

This document is the authoritative planning inventory for external data integrations that may feed the Néctar Nómada Digital Platform.

It is NOT an instruction to implement every provider.

Claude Code should use this document to:

1. define external-data domain boundaries;
2. create adapter interfaces;
3. prioritize integrations;
4. preserve provenance, licensing and source identity;
5. distinguish live APIs from scheduled imports and static reference datasets;
6. avoid scraping;
7. avoid undocumented browser endpoints;
8. avoid turning modeled/contextual values into measured project facts.

Every external observation must retain its source/provenance.

Recommended conceptual provenance fields:

- provider
- provider_dataset_id
- provider_record_id
- dataset_version
- retrieved_at
- observed_at / valid_from / valid_to
- geometry / coordinates
- source_resolution
- variable
- raw_value
- normalized_value
- source_unit
- canonical_unit
- quality_flag
- license
- source_url
- raw_payload_reference
- ingestion_job_id
- adapter_version

An external value must never silently overwrite primary project measurements.

Example:

- SoilGrids modeled pH
- laboratory soil pH
- NASA POWER modeled temperature
- IMHPA observation
- local farm logger temperature

are distinct evidence/data classes even when they use the same unit.

---

# 1. Recommended integration architecture

Prefer provider-specific adapters behind shared capabilities.

```ts
interface ExternalDataAdapter {
  provider: string;

  capabilities(): DataCapability[];

  discover?(query: DiscoveryQuery): Promise<ExternalDataset[]>;
  fetchPoint?(request: PointQuery): Promise<ExternalObservation[]>;
  fetchArea?(request: AreaQuery): Promise<ExternalObservation[]>;
  fetchTimeseries?(request: TimeseriesQuery): Promise<ExternalTimeseries>;
  fetchFeatures?(request: FeatureQuery): Promise<GeoFeatureCollection>;
  fetchRaster?(request: RasterQuery): Promise<ExternalRaster>;
  fetchMetadata?(request: MetadataQuery): Promise<ExternalMetadata[]>;

  provenance(): ProviderMetadata;
}
```

Do not force all providers through JSON REST.

Néctar Nómada must support at least:

- REST / JSON
- GraphQL
- OGC WMS
- OGC WFS
- OGC WCS
- STAC
- CKAN DataStore API
- Python/CLI scientific-data adapters
- NetCDF / GRIB
- GeoTIFF / COG
- CSV/XLSX scheduled imports
- bulk data snapshots

---

# 2. Weather & Climate

| Source | Provides | Access model | API / format | Coverage | Update | Official documentation |
|---|---|---|---|---|---|---|
| Open-Meteo | Forecast, current weather, historical/reanalysis, climate, marine, air-quality and flood endpoints. | Free for low-volume/non-commercial use; paid commercial/high-volume plans. | REST; JSON, CSV, XLSX. | Global including Panama. | Model dependent; operational updates throughout day. | https://open-meteo.com/en/docs |
| NASA POWER | Solar radiation and meteorological variables optimized for agroclimatology and applied research. | Free/open NASA. | REST; JSON, CSV, ASCII, NetCDF. | Global including Panama. | Hourly/daily/monthly products. | https://power.larc.nasa.gov/docs/services/api/ |
| Meteostat | Historical station weather and climate observations. | Open data/library; hosted API via RapidAPI with plan-specific limits. | REST JSON; bulk CSV; Python library. | Global. | As source observations update. | https://dev.meteostat.net/ |
| Visual Crossing Weather | Current, forecast, alerts and long historical weather archive. | Free tier ~1,000 records/day; paid pay-as-you-go and plans. | REST; JSON/CSV. | Global. | Operational. | https://www.visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/ |
| Tomorrow.io | Hyperlocal weather, forecast, history, alerts and map layers. | Free developer/testing tier; production plans paid. | REST JSON; map tiles; webhooks. | Global. | Real-time/forecast. | https://docs.tomorrow.io/reference/welcome |
| Copernicus Climate Data Store / ERA5 | Reanalysis, historical climate and climate indicators. | Free/open with account. | CDS API; NetCDF/GRIB. | Global. | Dataset dependent. | https://cds.climate.copernicus.eu/how-to-api |
| IMHPA — Instituto de Meteorología e Hidrología de Panamá | Official Panama weather, hydrology, forecasts, stations and national observations. | Public government data. | Current web/download interfaces; no stable public REST API confirmed. | Panama-specific. | Operational + historical products. | https://www.imhpa.gob.pa/ |

## Recommended priority

**P0:** Open-Meteo, NASA POWER
**P1:** IMHPA import/reference adapter, Copernicus ERA5
**Optional commercial redundancy:** Visual Crossing / Tomorrow.io

Do not treat modeled weather and station observations as equivalent.

---

# 3. Satellite & Remote Sensing

| Source | Provides | Access | API / format | Coverage | Update | Docs |
|---|---|---|---|---|---|---|
| Copernicus Data Space Ecosystem | Sentinel-1 SAR, Sentinel-2 multispectral, Sentinel-3 land/ocean/thermal and other EO data. | Free/open account + quotas. | STAC, OData REST, S3, Sentinel Hub; JP2/SAFE/raster products. | Global. | Acquisition dependent; often hours/day. | https://documentation.dataspace.copernicus.eu/APIs.html |
| Google Earth Engine | Hosted geospatial catalog and server-side computation across Sentinel, Landsat, MODIS, climate, elevation and derived datasets. | Free eligible research/noncommercial; paid commercial. | JavaScript, Python, REST; GeoTIFF/CSV/etc exports. | Global. | Dataset dependent. | https://developers.google.com/earth-engine |
| NASA Earthdata CMR | Search/discovery for NASA Earth science collections/granules. | Free; Earthdata login for many downloads. | REST + GraphQL metadata APIs. | Global. | Continuously indexed. | https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/cmr-api |
| NASA OPeNDAP | Remote subset access to multidimensional scientific data. | Free; auth dataset dependent. | OPeNDAP/DAP; NetCDF/HDF. | Global. | Dataset dependent. | https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/opendap/servers |
| USGS Landsat M2M API | Search/order/download Landsat and USGS/EROS inventory. | Free account. | REST JSON; GeoTIFF/TAR product bundles. | Global. | New acquisitions + archive. | https://m2m.cr.usgs.gov/api/docs/json/ |
| NASA FIRMS | MODIS/VIIRS active fire and thermal anomaly detections. | Free MAP_KEY. | API; CSV, KML/KMZ. | Global. | Near-real-time. | https://firms.modaps.eosdis.nasa.gov/api/ |
| Global Forest Watch Data API | Forest loss, disturbance alerts, fires, carbon and land-use layers. | Free with API key where required. | REST Data API, raster/tile APIs, downloads. | Global/tropical strength. | Daily/weekly depending product. | https://data-api.globalforestwatch.org/ |
| NASA GPM IMERG | Satellite precipitation. | Free/open. | Earthdata/OPeNDAP; HDF5/NetCDF. | Global. | Half-hourly products. | https://gpm.nasa.gov/data/imerg |
| NASA SMAP | Surface/root-zone soil moisture. | Free/open. | Earthdata; HDF5; selected products via Earth Engine. | Global. | Hours/daily depending product. | https://smap.jpl.nasa.gov/data/ |
| ESA WorldCover | Global land-cover classification at 10 m for 2020/2021 based on Sentinel-1/2. | Free/open CC BY 4.0. | Downloadable COG/GeoTIFF; also available through Earth Engine and geospatial catalogs. | Global including Panama. | Static/versioned. | https://esa-worldcover.org/en/data-access |

## Useful farm-derived products

Potential derived features include:

- NDVI
- EVI
- NDMI
- NDWI
- canopy/vegetation change
- land-cover class
- forest disturbance
- fire proximity
- precipitation anomalies
- soil-moisture context
- surface thermal context
- SAR backscatter change

Derived imagery metrics must store:

- source satellite/product
- acquisition date
- cloud percentage / quality mask
- processing algorithm/version
- spatial resolution
- geometry
- calculation formula
- derived raster reference

---

# 4. Topography, Elevation & Terrain

## OpenTopography

**Description:** Active geospatial platform providing programmatic access to global DEMs including SRTM, NASADEM, Copernicus DEM, ALOS World 3D, GEBCO and other terrain datasets.

- Access: free/research-friendly API access with API keys; enterprise keys available for heavier/commercial use.
- Interface: REST Global Datasets API.
- Formats: raster elevation products, commonly GeoTIFF.
- Coverage: global, including Panama.
- Update: dataset/version dependent; topographic reference rather than real-time.
- Docs: https://opentopography.org/developers
- API docs: https://portal.opentopography.org/apidocs/

Recommended uses:

- farm elevation validation;
- slope;
- aspect;
- watershed/catchment context;
- route difficulty;
- terrain visualization;
- tourism/hiking context;
- solar exposure modeling;
- drainage modeling.

Do not automatically replace surveyed/GPS elevation with DEM-derived elevation. Store both with provenance.

---

# 5. Biodiversity, Species & Pollinators

| Source | Provides | Access | API / format | Coverage/update | Docs |
|---|---|---|---|---|---|
| GBIF | Species occurrences, datasets, taxonomy, institutions and biodiversity metadata. | Free/open; source dataset licenses vary. | REST/OpenAPI JSON; Darwin Core/bulk downloads. | Global; continuously updated. | https://techdocs.gbif.org/en/openapi/ |
| iNaturalist | Citizen-science observations, taxa, projects, places and photo-linked records. | Free with usage limits/guidelines. | REST JSON. | Global; near-real-time submissions. | https://api.inaturalist.org/v1/docs/ |
| eBird API 2.0 | Bird observations, hotspots and regional species data. | Free key, generally non-commercial absent permission. | REST JSON. | Global; near-real-time. | https://www.birds.cornell.edu/home/ebird-api-terms-of-use/ |
| OBIS | Marine biodiversity occurrence data. | Free/open; source licenses vary. | REST JSON/GeoJSON; GeoParquet/TSV; map services. | Global marine waters. | https://api.obis.org/ |
| GloBI | Biotic interaction records such as pollination, flower visits, predation and parasitism. | Free/open. | Web API + bulk datasets. | Global; versioned snapshots. | https://www.globalbioticinteractions.org/data |
| Catalogue of Life / ChecklistBank | Canonical taxonomy, accepted names, synonyms and hierarchy. | Free/open. | REST API + bulk datasets. | Global taxonomy. | https://www.catalogueoflife.org/tools/api |
| IUCN Red List API | Conservation status, threats, habitat/ecology and distribution for assessed species. | Authenticated; terms apply. | REST API. | Global; periodic releases. | https://api.iucnredlist.org/api-docs/index.html |
| Tropicos Web Services | Botanical names, accepted names, synonyms, distributions, references, specimens, images and higher taxa from Missouri Botanical Garden. | API key required; official preferred interface. | Web API; XML/JSON options depending method. | Global botanical coverage, especially useful for tropical flora/Americas. | https://services.tropicos.org/ |

## Suggested taxonomy strategy

Use one internal canonical `Taxon` / `Species` record.

External identifiers may include:

- Catalogue of Life ID
- GBIF taxon key
- iNaturalist taxon ID
- Tropicos name ID
- IUCN taxon/assessment reference
- GloBI interaction references

Never automatically merge taxa solely by common name.

For Panama tropical plants, Tropicos is a particularly useful complement to Catalogue of Life and GBIF.

---

# 6. Protected Areas & Conservation Context

## Protected Planet API v4

**Description:** Official UNEP-WCMC/IUCN database of protected and conserved areas, including protected areas and OECMs.

- Status: ACTIVE.
- Important: API v3 is deprecated.
- Use **API v4 only**.
- API: REST.
- Coverage: global, including Panama.
- Update: monthly government/partner submissions.
- Docs: https://api.protectedplanet.net/documentation
- API home: https://api.protectedplanet.net/

### Licensing warning

The public Protected Planet API is explicitly not available for commercial use.

Therefore:

- suitable for research/non-commercial components subject to terms;
- do NOT assume it may feed a revenue-generating tourism or commercial product;
- for production commercial Panama mapping, prioritize official MiAmbiente/IPDE protected-area layers where licensing allows.

Potential uses:

- protected-area intersection;
- buffer/proximity analysis;
- conservation storytelling;
- ecological context;
- project-site risk/context.

---

# 7. Soil & Agronomic Data

| Source | Provides | Access | API / format | Coverage | Update | Docs |
|---|---|---|---|---|---|---|
| ISRIC SoilGrids | Modeled ~250 m soil properties: pH, organic carbon, texture, CEC, bulk density, nitrogen, etc. | Free/open. | WCS/download; GeoTIFF. | Global. | Versioned models. | https://docs.isric.org/globaldata/soilgrids/wcs.html |
| FAO Harmonized World Soil Database v2 | Soil-unit composition and physical/chemical properties. | Free download. | Download rather than API; raster/database. | Global. | Static/versioned. | https://www.fao.org/soils-portal/data-hub/soil-maps-and-databases/harmonized-world-soil-database-v20/en/ |
| FAO Global Soil Organic Carbon Map | Harmonized soil organic carbon map. | Free/open download. | Geospatial datasets. | Global. | Versioned/static. | https://www.fao.org/soils-portal/data-hub/soil-maps-and-databases/global-soil-organic-carbon-map-gsocmap/en/ |
| NASA SMAP | Surface/root-zone moisture. | Free/open. | HDF5/Earthdata/OPeNDAP. | Global. | Hours/daily. | https://smap.jpl.nasa.gov/data/ |
| NASA POWER | Agroclimate context. | Free/open. | REST JSON/CSV/NetCDF. | Global. | Hourly/daily/monthly. | https://power.larc.nasa.gov/docs/services/api/ |
| FAOSTAT | Production, yields, trade, inputs, emissions, prices, land use. | Free/open. | Official API; JSON/CSV. | Global country-level. | Dataset dependent. | https://www.fao.org/faostat/en/ |

### Critical SoilGrids warning

Do not design around the SoilGrids REST API at present.

ISRIC currently states that its REST API is temporarily paused.

Build an adapter around:

- WCS
- raster download
- cached derived farm polygons/point summaries

so a future REST implementation can be swapped in without changing the domain layer.

---

# 8. Hydrology, Rainfall & Water

| Source | Provides | Access | API / format | Coverage/update | Docs |
|---|---|---|---|---|---|
| GEOGLOWS ECMWF Streamflow | Global modeled streamflow forecasts, retrospective simulation and return periods. | Free/open. | REST data services. | Global; operational forecast + long retrospective. | https://geoglows.ecmwf.int/documentation |
| Copernicus GloFAS | Global flood forecasts, discharge and hydrological reanalysis. | Free with Copernicus account. | EWDS/CDS APIs; scientific files. | Global; daily forecast + historical/reanalysis. | https://global-flood.emergency.copernicus.eu/ |
| NASA GPM IMERG | Satellite precipitation. | Free/open. | HDF5/NetCDF/OPeNDAP. | Global; half-hourly. | https://gpm.nasa.gov/data/imerg |
| JRC Global Surface Water | Historical water occurrence, change and seasonality. | Free/open. | Raster; Earth Engine. | Global; historical/versioned. | https://global-surface-water.appspot.com/ |
| Open-Meteo Flood API | Global modeled discharge forecast. | Free/paid under Open-Meteo plan. | REST JSON. | Global; forecast. | https://open-meteo.com/en/docs/flood-api |
| ACP Panama Canal Authority hydrology | Official Canal watershed hydrologic and reservoir/rainfall records and reports. | Public. | Official publications/downloads; no general public API confirmed. | Panama Canal watershed. | https://pancanal.com/agua/ |
| SINIA / MiAmbiente water datasets | Panama environmental and water-related open geodata. | Public/open depending dataset. | Download/geoservices; some WMS/WFS. | Panama. | https://sinia.gob.pa/datos-abiertos-y-geoservicios/ |

No global station-based water-quality API with reliably strong Panama coverage was confirmed during this review.

For research projects, local sampling/laboratory measurements remain primary.

---

# 9. Marine, Coastal & Ocean Data

## Copernicus Marine Service

**Description:** Satellite, model and in-situ ocean products including sea-surface temperature, currents, waves, salinity, biogeochemistry and related marine variables.

- Access: free.
- Official programmatic access: Copernicus Marine Toolbox.
- Interface: Python API + CLI.
- Formats: Analysis-Ready Cloud-Optimized Zarr, NetCDF and product-dependent native formats.
- Coverage: global + regional products.
- Update: near-real-time, forecast and historical depending dataset.
- Docs: https://toolbox-docs.marine.copernicus.eu/

Potential uses for Panama:

- coastal tourism/expeditions;
- sea surface temperature;
- currents;
- wave conditions;
- coastal environmental context;
- marine biodiversity projects;
- coastal honey/flora/mangrove narratives.

---

# 10. Air Quality

| Source | Provides | Access | API / format | Coverage/update | Docs |
|---|---|---|---|---|---|
| OpenAQ v3 | Aggregated station-based ambient air-quality measurements. | Free; source licenses vary. | REST/OpenAPI JSON. | Global, station-dependent; near-real-time where available. | https://docs.openaq.org/api |
| CAMS / Copernicus Atmosphere | Modeled atmospheric composition: PM, ozone, NO2, aerosol and related products. | Free/open with account. | Atmosphere Data Store; NetCDF/GRIB/STAC where supported. | Global; operational forecast + analyses. | https://ads.atmosphere.copernicus.eu/ |
| Google Maps Air Quality API | Fine-scale air-quality indices, pollutants, current/historical/forecast. | Paid Google Maps Platform. | REST JSON + tiles. | 100+ countries. | https://developers.google.com/maps/documentation/air-quality/overview |

---

# 11. Commodity & Agricultural Market Data

| Source | Provides | Access | API / format | Coverage/update | Docs |
|---|---|---|---|---|---|
| FAOSTAT | Agricultural prices, production, trade and related indicators. | Free/open. | API JSON/CSV. | Global; dataset-specific. | https://www.fao.org/faostat/en/ |
| International Coffee Organization (ICO) | ICO Composite Indicator Price and coffee statistics. | Headline/public data plus paid detailed historical packages. | No stable public developer API confirmed; Excel/data packages/publications. | Global coffee market; daily/monthly/annual. | https://ico.org/resources/public-market-information/ |
| ICE Coffee C Futures | Arabica Coffee C futures benchmark. | Public delayed display; programmatic/live licensed feeds commercial. | Enterprise feeds/APIs/report products. | Global benchmark; intraday/daily. | https://www.ice.com/products/15/Coffee-C-Futures |
| ICE Cocoa / soft commodities | Cocoa and related futures benchmarks. | Licensed commercial feeds. | Enterprise APIs/feeds/reports. | International markets. | https://www.ice.com/products |
| USDA AMS MyMarketNews API | US agricultural market reports, including National Honey Report. | Free registration/API key. | REST JSON. | Primarily U.S.; report-specific. | https://mymarketnews.ams.usda.gov/mymarketnews-api |
| World Bank Indicators API | Macro, agriculture and tourism indicators. | Free/open. | REST JSON/XML. | Global; periodic/annual. | https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation |

---

# 12. Astronomy, Lunar, Solar & Tidal

| Source | Provides | Access | API / format | Coverage/update | Docs |
|---|---|---|---|---|---|
| NASA/JPL Horizons API | Precise ephemerides for Sun, Moon, planets and other solar-system bodies. | Free. | HTTP API. | Calculated for requested location/time. | https://ssd-api.jpl.nasa.gov/doc/horizons.html |
| Open-Meteo Marine API | Waves, sea surface temperature/current and modeled sea-level/tide context. | Open-Meteo free/paid model. | REST JSON. | Global coastal/marine forecast. | https://open-meteo.com/en/docs/marine-weather-api |
| WorldTides | Tide predictions and high/low events. | Commercial credit model with trial/test credits. | REST JSON. | Global coastal. | https://www.worldtides.info/apidocs |

For routine sunrise/sunset/moon phase, calculate locally from coordinates/time where practical.

---

# 13. Tourism & Travel Context

| Source | Provides | Access | API / format | Coverage/update | Docs/data |
|---|---|---|---|---|---|
| INEC Panama tourism statistics | Official visitor arrivals, purpose, nationality, port-of-entry and related statistics. | Free government data. | Downloadable CSV/XLSX/PDF; no stable public statistical REST API confirmed. | Panama; monthly/annual. | https://www.inec.gob.pa/ |
| Panama Datos Abiertos — ATP | Tourism Authority datasets. | Free/open. | CKAN API where DataStore-enabled; otherwise CSV/XLSX/download. | Panama; dataset-specific. | https://www.datosabiertos.gob.pa/organization/autoridad-de-turismo-de-paanama |
| World Bank Indicators | Tourism arrivals, receipts and macro context. | Free/open. | REST JSON/XML. | Global country-level; annual. | https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation |
| Foursquare Places API | POIs, tourism venues, categories and nearby contextual places. | Commercial with limited free allowance. | REST JSON. | Global; maintained continuously. | https://docs.foursquare.com/data-products/docs/places-api |
| Google Places API (New) | POIs, attractions, businesses, place details/photos/autocomplete. | Paid by SKU. | REST JSON. | Global; continuously updated. | https://developers.google.com/maps/documentation/places/web-service |

---

# 14. Panama Government & National Open Data

## 14.1 Panama Datos Abiertos — CKAN

Base:
https://www.datosabiertos.gob.pa/

Typical action endpoint:

```text
https://www.datosabiertos.gob.pa/api/action/datastore_search
```

Recommended generic adapter:
`CKANAdapter`

---

## 14.2 IPDE — Infraestructura Panameña de Datos Espaciales

Official Panama spatial-data infrastructure.

https://www.ipde.gob.pa/geoservicios/

Interfaces include:

- WMS
- WFS

Prefer official IPDE geometry when an authoritative Panama layer exists.

---

## 14.3 MiAmbiente / SINIA

https://sinia.gob.pa/datos-abiertos-y-geoservicios/

Potential domains:

- water
- biodiversity
- forest
- environmental indicators
- climate
- soils
- protected areas

Integration style varies between geoservices and official downloads.

---

## 14.4 MIDA / OSIGA

Agricultural geospatial monitoring and information system.

Current service exists, but no documented stable public developer API was confirmed.

Policy:
Do not scrape.
Treat as `PotentialPartnerIntegration`.

---

## 14.5 IMHPA

https://www.imhpa.gob.pa/

Use as authoritative national meteorological/hydrological reference and future documented partner/API integration.

---

## 14.6 INEC Panama

Official national statistical source.

Implement as versioned scheduled import where structured downloads are available.

---

## 14.7 Panama Canal Authority — ACP

Especially relevant to Canal watershed, Cerro Azul and Chagres-region context.

No general public developer API confirmed.

Use official published/downloaded datasets only.

---

# 15. Maps, Geographic Context & POIs

| Source | Use | Access | Interface | Notes |
|---|---|---|---|---|
| Panama IPDE | Official boundaries and Panama government GIS layers. | Free government services. | WMS/WFS. | Preferred authoritative national layer source. |
| OpenStreetMap / Overpass | Roads, trails, waterways, POIs, settlements, infrastructure. | ODbL open data; public Overpass fair-use limits. | Overpass API JSON/XML; bulk extracts. | Heavy production should use hosted extracts/provider rather than hammer public endpoints. |
| Google Places API | Commercial place/POI information. | Paid. | REST JSON. | Do not use Google place IDs as canonical Néctar Nómada Location IDs. |
| Foursquare Places | Commercial POI/context taxonomy. | Limited free allowance then paid. | REST JSON. | Useful tourism/context alternative. |

---

# 16. Certification & Traceability Bodies

## USDA Organic Integrity Database

https://organic.ams.usda.gov/

- Public searchable database.
- Export/report capability exists.
- No supported generic public REST API confirmed.

Do not scrape.

---

## Fairtrade Finder

https://www.fairtrade.net/en/fairtrade-finder.html

No documented public third-party API confirmed.

Do not scrape.

---

## Rainforest Alliance

RACP / MultiTrace / MyRA remain active partner traceability/certification platforms.

No general public API suitable for arbitrary ingestion was confirmed.

Treat as formal partner integration only.

---

## Specialty Coffee Association

No general public API was confirmed for certification/person/coffee verification suitable for automated platform ingestion.

Store certification records internally with evidence and verification status.

---

# 17. Stock Imagery / Footage APIs

| Provider | Capability | Access | API | Docs |
|---|---|---|---|---|
| Shutterstock API | Search metadata/previews; license and download images/video/audio. | Commercial licensing. | REST JSON. | https://api-reference.shutterstock.com/ |
| Getty Images API | Search Getty/iStock imagery/video/illustrations and licensing workflows. | Commercial/contract. | REST v3 / JSON. | https://developers.gettyimages.com/ |
| Adobe Stock API | Search metadata and programmatic licensing. | Partner/enterprise oriented; paid assets. | REST JSON. | https://developer.adobe.com/stock/docs/api/ |
| Unsplash API | Search/retrieve free licensed photography/illustrations with attribution rules. | Free API subject to terms/rate/review. | REST JSON. | https://unsplash.com/documentation |
| Pixabay API | Search free images/videos under Pixabay license. | Free subject to terms. | REST JSON. | https://pixabay.com/api/docs/ |

Original Néctar Nómada photography/video should remain preferred.

---

# 18. Research Literature & Scientific Metadata

## 18.1 Crossref REST API

Provides scholarly DOI metadata including works, journals, publishers, funders, licenses and identifiers.

- Public API.
- No signup required for ordinary retrieval.
- REST JSON.
- Docs: https://www.crossref.org/documentation/retrieve-metadata/rest-api/

Recommended for citation normalization and DOI metadata.

---

## 18.2 OpenAlex

Open catalog of scholarly works, authors, institutions, sources, topics, funders and citation relationships.

- REST API.
- API key currently required.
- Free daily allowance + usage-based billing.
- Full snapshots also available.
- Docs: https://developers.openalex.org/

Recommended for literature discovery and citation/topic graphs.

---

## 18.3 DataCite REST API

DOI metadata for datasets, software, publications and other research outputs.

- REST JSON:API.
- Public retrieval/search available.
- Creating/updating DOIs requires repository credentials.
- Docs: https://support.datacite.org/reference/introduction

Use current endpoints only; legacy REST endpoints were deprecated in July 2026.

---

## 18.4 ROR — Research Organization Registry

Open persistent identifiers for research organizations.

- REST JSON.
- Open/free.
- Metadata CC0.
- Bulk JSON/CSV snapshots updated regularly.
- Docs: https://ror.readme.io/docs/rest-api

Recommended for normalizing universities, laboratories and research organizations.

---

## 18.5 ORCID

Researcher identifier/profile infrastructure.

- REST JSON/XML.
- Public API available with credentials.
- Docs: https://info.orcid.org/what-is-orcid/services/public-api/

Important:
Current public-client terms restrict public API use to non-commercial use as defined by ORCID.

For a commercial/revenue-linked platform, evaluate ORCID membership/member API or use only a permitted consent-based workflow.

---

# 19. Data Source Classification

Suggested source classes:

```text
PRIMARY_PROJECT_MEASUREMENT
OFFICIAL_GOVERNMENT_OBSERVATION
EXTERNAL_STATION_OBSERVATION
REMOTE_SENSING_OBSERVATION
MODEL_FORECAST
MODEL_REANALYSIS
MODELED_SPATIAL_ESTIMATE
CITIZEN_SCIENCE_OBSERVATION
CURATED_REFERENCE_DATABASE
MARKET_REFERENCE
STATISTICAL_SERIES
SCIENTIFIC_METADATA
STATIC_REFERENCE_RASTER
PARTNER_PROVIDED_DATA
COMMERCIAL_DATA_PROVIDER
AI_DERIVED_INTERPRETATION
```

AI output is never an upstream external source of truth.

---

# 20. Priority Integration Roadmap

## P0 — Foundation / highest value

1. Panama IPDE
2. Panama Datos Abiertos CKAN
3. Open-Meteo
4. NASA POWER
5. Copernicus Data Space / Sentinel
6. GBIF
7. iNaturalist
8. Catalogue of Life
9. SoilGrids WCS
10. OpenTopography
11. Crossref
12. ROR

---

## P1 — Research and environmental enrichment

13. Tropicos
14. GEOGLOWS
15. NASA FIRMS
16. Global Forest Watch
17. OpenAQ
18. CAMS
19. FAOSTAT
20. ESA WorldCover
21. DataCite
22. OpenAlex
23. MiAmbiente / SINIA
24. Copernicus Marine when coastal projects require it

---

## P1 Conditional / license review

25. Protected Planet v4
26. ORCID
27. eBird

Do not implement before legal/use-case review.

---

## P2 — Commercial/context integrations

28. Visual Crossing or Tomorrow.io
29. Google Places or Foursquare
30. Google Air Quality
31. WorldTides
32. Shutterstock/Getty/Adobe Stock
33. ICE licensed market feeds

---

## Scheduled imports / non-API sources

34. IMHPA
35. INEC Panama
36. ACP hydrology
37. ICO market datasets
38. certification-body exports supplied under permitted terms
39. tourism datasets not exposed through CKAN DataStore

---

# 21. Recommended Adapter Families

## RestJsonAdapter

Examples:

- Open-Meteo
- NASA POWER
- GBIF
- iNaturalist
- OpenAQ
- Crossref
- OpenAlex
- DataCite
- ROR

## CKANAdapter

For:

- datosabiertos.gob.pa
- other CKAN portals

## OGCAdapter

Support:

- WMS
- WFS
- WCS

For:

- IPDE
- SINIA/MiAmbiente
- SoilGrids

## StacAdapter

For satellite/catalog providers.

## ScientificDatasetAdapter

For:

- NetCDF
- GRIB
- HDF5
- Zarr
- OPeNDAP

## ScheduledFileImportAdapter

For official structured downloads lacking a supported API.

Must preserve checksum, retrieval timestamp, schema mapping, import version and provenance.

---

# 22. External Data Storage Policy

## Metadata/reference
PostgreSQL.

## Structured observations needed by application
PostgreSQL or dedicated time-series architecture.

## Large raster/scientific/raw assets
Object storage.

Examples:

- GeoTIFF
- COG
- NetCDF
- GRIB
- HDF5
- Zarr
- bulk snapshots

---

# 23. Licensing Registry

Every integration should record:

```text
provider
dataset
license_name
license_url
commercial_use_allowed
redistribution_allowed
attribution_required
derivative_products_allowed
cache_allowed
max_cache_duration
api_terms_url
last_terms_reviewed_at
reviewed_by
notes
```

Important review cases:

- Protected Planet
- ORCID
- eBird
- Google APIs
- stock media
- commercial market feeds

---

# 24. AI Rules for External Data

AI may:

- find relevant external records;
- suggest links;
- compare sources;
- identify anomalies;
- summarize;
- propose interpretation;
- suggest data gaps.

AI may NOT:

- silently accept fuzzy taxonomic matches;
- convert citizen-science observations into verified farm records;
- convert modeled soil into laboratory measurement;
- change project coordinates based on external mapping;
- treat outdated land-cover maps as current facts;
- claim an external correlation proves causation;
- turn forecast values into measured historical observations.

---

# 25. Core External-Data Entities to Design

Before implementing adapters, Claude Code should propose:

- ExternalProvider
- ExternalDataset
- ExternalIdentifier
- ExternalObservation
- ExternalRasterAsset
- ExternalFeature
- ExternalImportJob
- ExternalSyncState
- ExternalLicense
- DerivedExternalMetric

External identities must not become canonical internal records automatically.

Example:

GBIF occurrence
≠
Néctar Nómada field observation

until a human-approved relationship explicitly connects them.

---

# 26. Recommended First Implementation Task

Do not implement every provider.

First:

1. inspect the repository;
2. design external-data entities;
3. create adapter contracts;
4. create license/provenance handling;
5. create test fixtures;
6. implement one REST vertical slice;
7. implement one Panama CKAN/OGC vertical slice;
8. implement one scientific/raster vertical slice.

Suggested proof-of-architecture providers:

- REST: Open-Meteo
- Panama government: Panama CKAN or IPDE
- Raster/geospatial: OpenTopography or SoilGrids WCS
- Biodiversity: GBIF

---

# 27. Current Known Warnings

## SoilGrids
REST access is currently paused by ISRIC. Use WCS/download.

## Protected Planet
Use API v4 only. Public API is not for commercial use.

## ORCID
Public API has non-commercial-use restrictions under current public client terms.

## eBird
Review non-commercial/API terms before production use.

## Panama government systems
Many authoritative sources are API-light. Support CKAN, OGC and official scheduled imports rather than scraping.

## ICO
No stable public production developer API confirmed. Treat detailed data as licensed/imported series.

## ICE
Official programmatic market feeds are commercial/licensed.

## IMHPA
Important authoritative source, but no stable public REST contract confirmed.

## ESA WorldCover
Useful historical baseline; not a substitute for current Sentinel monitoring.

---

# 28. Instruction to Claude Code

Treat this file as an integration inventory and architecture input, not as an implementation checklist.

Do not implement a provider until:

- official documentation is reviewed;
- current terms/license are reviewed;
- rate limits are recorded;
- commercial-use implications are understood;
- data provenance mapping is defined;
- caching/redistribution rules are understood;
- the integration has a concrete product/research use case.

When uncertain, record the provider as:

`RESEARCHED_NOT_APPROVED`

rather than making assumptions.
