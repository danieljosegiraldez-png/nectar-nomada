# Data Source Research Prompt — for ChatGPT

Copy everything below the line into ChatGPT. The output is designed to come
back here and drop into `INTEGRATIONS.md` with minimal editing, following the
adapter-interface convention already established in that document.

---

```
I'm building a digital platform for an agricultural/beverage/tourism research
organization based in Panama. It's a modular monolith (Next.js + PostgreSQL)
that connects: coffee farms, apiaries (beekeeping), fermentation research,
craft brewing, sensory evaluation, tourism/experiences, and public storytelling
— all built on a shared canonical data model (People, Organizations, Locations,
Projects, Samples, Assets).

I need an exhaustive, categorized list of EXTERNAL DATA SOURCES AND APIs that
could plausibly feed into this platform. For each one, research and confirm it
is real and currently accessible (not deprecated, not a defunct product) before
including it — I'd rather have a shorter accurate list than a longer one with
dead links or discontinued services.

## Categories to cover (add more categories if you find relevant ones I haven't listed)

1. **Weather & climate** — historical, forecast, and hyperlocal APIs, including
   any specific to Central America / Panama if they exist.
2. **Satellite & remote sensing imagery** — vegetation health (NDVI), land
   cover, cloud/precipitation radar, thermal imaging — anything useful for
   monitoring farm/forest health from above.
3. **Biodiversity & species data** — occurrence records, pollinator/bee health
   databases, citizen-science observation platforms.
4. **Soil & agronomic data** — soil composition, moisture, global soil
   databases.
5. **Hydrology / water quality** — river gauges, water quality monitoring,
   especially anything covering Central America or Panama specifically.
6. **Air quality** — ambient air quality monitoring APIs, global or regional.
7. **Commodity & market data** — coffee market pricing (C-market, ICO
   indicators), honey market data if it exists, any agricultural commodity
   price feeds with a free or low-cost tier.
8. **Astronomical / lunar / tidal** — relevant to any traditional
   agricultural or fermentation timing practices (sunrise/sunset, moon phase,
   tidal data if coastal).
9. **Tourism & travel context** — visitor flow data, regional tourism
   statistics, any open datasets relevant to Panama tourism specifically.
10. **Government / open data — Panama specific** — agricultural ministry
    (MIDA), environmental ministry (MiAmbiente), meteorological/hydrological
    institute (ETESA), national statistics institute (INEC), or any other
    Panamanian government open-data portals with usable APIs.
11. **Certification & traceability standards bodies** — organic, fair trade,
    specialty coffee certification databases with any public API or data
    export capability.
12. **Stock imagery / footage licensing platforms** — only ones with a
    documented API for search/licensing (not just websites), for supplementing
    original photography/video when needed.

## What I need for EACH data source you find

- **Name** and a one-sentence description of what it actually provides.
- **Access model**: free/open, free-tier-with-limits, or paid — and roughly
  what the paid tier costs if you can find that.
- **API availability**: does it have an actual API (REST, GraphQL, etc.), or
  is it web/download-only? Note the API type if known (REST, OGC/WMS, GraphQL,
  bulk download, etc.).
- **Data format**: JSON, GeoTIFF, CSV, NetCDF, etc.
- **Geographic coverage**: global, regional, or does it specifically include
  Panama/Central America?
- **Update frequency**: real-time, daily, monthly, static/historical.
- **A link to the official API documentation** (not a third-party tutorial).

## Important constraints

- Do NOT include anything that requires scraping a site without an API, or
  that violates a platform's terms of service.
- Flag clearly if a source's free tier is very limited (e.g., "100 requests/
  month") vs genuinely production-usable for free.
- If you're not certain a source is still active/maintained, say so explicitly
  rather than presenting it as confirmed — I'd rather know it's uncertain than
  find out later it's defunct.
- Organize the final output as a table or clearly delimited list per category,
  not one long paragraph — I need to hand this to a coding assistant afterward
  to turn into integration adapters.

Please be exhaustive — I'd rather review and discard irrelevant options myself
than have you pre-filter too aggressively. Prioritize breadth within each
category, then depth on the ones that look most promising.
```

---

## After you get the response

Bring it back here (paste it in, or upload it as a file) and I'll:

1. Sanity-check the results against what's actually relevant to your specific
   projects (Kiva Estate, Las Nubes, CryoBloom, Cervecería Tres Gatos) —
   filtering out anything generic that doesn't clearly serve a real use case.
2. Reformat the useful ones into an `INTEGRATIONS.md` addendum, following the
   same adapter-interface convention (`<Capability>Provider.method() →
   type`) already used for Weather, Object Storage, Payments, etc.
3. Hand you the addendum ready to drop into your repo and reference in your
   next Claude Code session — without derailing current Slice 1 (Identity)
   work, since none of this blocks it.
