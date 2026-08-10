# Map & Territory — Néctar Nómada Digital Platform

Extends `PLATFORM_OVERVIEW.md` §6 (location pages dynamically expose
connected information) and brings together several already-specified
geospatial pieces into one coherent map experience: `Location`
(`DOMAIN_MODEL.md` §3), `Specimen` (`SPECIMEN_AND_MATERIAL_TRACEABILITY.md`),
Environmental sensors (`DOMAIN_MODEL.md` §4), Field Study areas
(`GUIDED_FIELD_STUDY_TOOL.md`), and Experience routes/itineraries
(`TOURISM_EXPERIENCES.md`). Stack: PostGIS + Mapbox, both already decided
(`DECISIONS.md` ADR-001, ADR-009).

Offline map support is specified in the companion document
`OFFLINE_FIELD_CAPABILITY.md`, not duplicated here.

---

## 1. Layering model — default per role, refinable by toggle

The map shows a **sensible default layer set per role**, with toggles
available to refine:

- **Public visitor**: Locations, Stories, Products, Experience venues/
  routes — classification-filtered to `public` only (§3).
- **Partner**: their own assigned Project's Specimens, Field Study areas,
  plus everything public.
- **Researcher**: adds biodiversity/Specimen layers across projects they
  have Assignment access to, plus environmental sensor layers.
- **Admin**: everything, all layers available.

Toggle-able layers (available to any role, filtered to what they're
permitted to see): Specimens, Environmental Sensors, Field Study Areas,
Organizations, Experience Routes, Satellite/NDVI Imagery (§6).

## 2. Zoom and density — clustering

```
map.cluster_config(layer_type, cluster_zoom_threshold, cluster_radius_px)
```

Below a per-layer zoom threshold, individual points (specimens especially,
given potentially hundreds per site) cluster into a single farm/site-level
pin showing a count. Zooming in past the threshold reveals individual
points. This is standard Mapbox clustering behavior, configured per layer
rather than uniformly — a site with 5 Locations doesn't need the same
clustering aggressiveness as one with 300 Specimens.

## 3. Classification-based visibility — same rules as everywhere else

Map data visibility uses the exact same classification enforcement already
specified in `SECURITY.md` §4 — no separate, simpler map-specific access
system. A point that wouldn't render for a given user in a list view
doesn't render for them on the map either; the same authorization service
(`SECURITY.md` §2) gates map data queries as gates every other read.

## 4. Environmental data — real-time where it exists, static for biodiversity

- **Environmental sensor layer**: shows latest/recent readings when
  enabled (once the Environmental Data module is built — this layer is
  specified now, populated later).
- **Specimen/biodiversity layer**: shows current known state (species,
  last observation, notable flag) — not a live feed, since bloom/health
  observations are opportunistic field entries, not continuous sensor
  streams.

## 5. Experience routes

For multi-day expeditions and tour itineraries (`TOURISM_EXPERIENCES.md`
§4), the map renders a connecting route/path between stops, not just
disconnected point markers — using Mapbox's routing/path rendering over
the Experience's stop sequence.

## 6. Satellite/NDVI imagery layer

Optional toggle-able layer sourcing from Sentinel Hub/Copernicus, per the
adapter already scoped in `EXTERNAL_DATA_SOURCES.md`. Off by default
(bandwidth/performance cost), available where farm-health visualization is
useful — connects the earlier data-source research to something actually
renderable rather than an abstract future integration.

## 7. Click behavior — role-dependent depth

Clicking a Location pin shows a connected-content summary before drilling
in further, per `PLATFORM_OVERVIEW.md` §6's dynamic-connection principle —
but the summary's depth varies by role:

- **Public**: simple popup — name, short description, link to the full
  public page.
- **Staff/Partner**: fuller summary — connected Specimens, active Field
  Studies, related Projects, recent Assets — everything their permissions
  already grant them elsewhere, surfaced at the map level too.

## 8. Default view by embed context

The map has no single fixed default — it adapts to where it's embedded:

- **Discover page**: full Panama-wide view, everything the viewer's role
  permits.
- **Project page**: scoped to that Project's Locations/area.
- **Location page**: centered on that specific site.

This is a rendering-context parameter, not a separate map implementation —
one map component, configured differently per embed point.

## 9. Search

Search by name (Specimen, Project, Location, Organization) jumps directly
to the matching point/area on the map — reuses the same full-text search
infrastructure already specified (`DATA_ARCHITECTURE.md` §8), scoped to
geospatial entities.

## 10. Static export for reports

The map can render a static image snapshot — **required**, not optional,
since `GUIDED_FIELD_STUDY_TOOL.md` §11 already specifies a map visualization
as part of every study's generated PDF report. This is the same rendering
engine as the interactive map, captured as a static image at generation
time, not a separate map-drawing implementation.

**Attribution requirement, non-negotiable**: every static export
automatically includes required attribution for whichever data sources are
active in that view — Mapbox attribution always, Sentinel/Copernicus
attribution when the NDVI layer (§6) is included. This is a licensing
compliance requirement, not a design choice, consistent with the licensing
discipline already established in `EXTERNAL_DATA_SOURCES.md`. Attribution
text is generated automatically based on which layers are actually in the
exported view — never omitted because someone forgot, never manually
re-typed per export.

## 11. Custom branded styling

The map uses a **custom Mapbox Studio style** matching Néctar Nómada's
visual identity (warm coffee-brown accent, per the existing brand identity)
rather than Mapbox's default appearance — this is a design/frontend task
against the already-chosen Mapbox stack, not a new architectural decision.

## 12. Sequencing

Map & Territory isn't a single vertical slice on its own — it's
infrastructure that multiple slices render into (Discovery for public
Locations, Partner Workspace for Specimens/Field Studies, Sensory for
environmental layers). Build the base map component early (fits naturally
with Slice 2's Location pages), then layer in each data type as its owning
slice gets built — Specimens with Slice 5, environmental sensors with
Slice 6-adjacent Environmental Data work, NDVI/satellite as a standalone
addition whenever prioritized. Log acceptance in `DECISIONS.md`.
