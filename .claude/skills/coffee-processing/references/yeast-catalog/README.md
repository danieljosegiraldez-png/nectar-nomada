# Yeast and starter catalog (default reference for Nectar Nomada)

Built 2026-10-06 from public pages and papers read through a fetch tool that returns summaries, so **every figure must be checked against the linked source before it goes into a protocol**. Nothing was filled from memory; "not stated" means the page did not give it. The CSVs in `data/` are the same tables in machine-readable form, a draft for seeding a catalog in the platform, not validated data.

## Files
| File | Content |
|---|---|
| `fermentis-coffee-and-other-beverages.md` | SafCoffee (Green Origins, Deep Amber, Cool Blue, Sunrise Orange), kvass, sorghum, mead, cider |
| `fermentis-beer.md` | SafAle, SafLager, SafBrew, SafSour and aids; beer-style pages |
| `fermentis-wine-and-spirits.md` | SafOeno wine yeasts, SafSpirit, Spring* wine aids; names of products listed on the site but not fetched |
| `commercial-non-fermentis.md` | LalCafe (Lallemand), Novonesis Boost PK-1, wine and brewing strains used by roasters, Kveik, with an evidence code on every row |
| `literature.md` | 27 studies on starters in coffee, with the "Handling and behavior patterns the evidence supports" section |
| `data/*.csv` | every table as CSV |

Not covered: product pages blocked by robots.txt (SafCider AC-4 BIO), Fermentis products not in the fetched lists (the beer category pages load dynamically, so SafAle/SafBrew/SafLager/SafSour completeness is not confirmed), and suppliers with no coffee product found (Angel Yeast, AB Mauri, Laffort, Biotec, Wyeast, White Labs).

## How to use it
Evidence order: manufacturer's page for the exact product (dose, rehydration, temperature) > peer-reviewed study (`literature.md`) > importer or roaster write-up > blog. Always say which level a statement rests on. A supplier's flavor claim is a claim, not a result. Ask which product and lot the user actually holds before writing a dose.

### Which product for which situation (starting points, from the pages)
| Situation | Candidates | Basis |
|---|---|---|
| Cold fermentation, 8-18 C (high altitude, no AC) | SafCoffee Cool Blue (8-18 C ideal, about 7 days below 18 C); Deep Amber (8-30 C, up to 7 days at 8-15 C) | manufacturer page |
| Warm fermentation, 20-30 C | Green Origins (60 h at 18 C or above, 24-48 h above 25 C); Sunrise Orange (fruity profile, same timing); LalCafe products | manufacturer pages; LalCafe doses and effects are supplier plus importer claims |
| Pre-fermentation protection of intact cherries (CryoBloom) | SafOeno Bioprotect MP-72, *Metschnikowia pulcherrima*, label use is oenological (10-20 g/hl, apply below 10 C per its page); the CryoBloom protocol cites a coffee-cherry application limit of 1 g/kg from an FDA GRAS notice | manufacturer page; protocol documents |
| Non-Saccharomyces starters | *Torulaspora delbrueckii*, *Candida parapsilosis*, *Pichia fermentans*, *Pichia kluyveri* | literature only; the best-supported strains are culture-collection strains, not sold products |
| Not coffee yeasts | SafBrew LD-20 (lager yeast with glucoamylase for dry low-carb beer), SafLager and SafAle styles, SafOeno wine strains | their pages; wine and beer strains on coffee have only roaster anecdotes and one independent trial (Oenoferm Freddo, sugarcane juice) |

### Handling and behavior, as far as the evidence goes
Full detail with citations (S-numbers) is in `literature.md`. Summary of what is supported, and what is not:
- **Rehydration (manufacturer):** SafCoffee products: 10 times the yeast's weight in potable water (Cool Blue 10-25 C, the others 15-35 C), stir gently, rest 15-30 min, then mix into the tank. Dose per the pages: 1 g/kg of cherries (Deep Amber 2 g/kg).
- **Dose in studies:** cell densities clustered around 10^7-10^8 per mL or per g; no replicated dose-response study exists.
- **Application:** dunking natural-process cherries in a starter bath beat spraying in two studies; strain-dependent.
- **Temperature:** reported runs were mostly 18-27 C; warm open lots (36-37 C) did worse, but temperature was never varied alone, so a temperature effect is not shown.
- **Time:** the profile moves with time (T. delbrueckii on natural: honey and almond at 0-48 h, fruity and winey at 72-96 h in one study); beyond 96 h is poorly studied; spontaneous lots scored better at shorter times.
- **Acids:** one controlled wet lot went from pH 4.47 to 4.05 and 15.8 to 8.45 Brix in 36 h; no study here supports a target pH. Do not set pH targets from this.
- **Risks:** seed viability can fall in anaerobic lots with yeast (not settled); ochratoxin was measured in one study only; more aromatic complexity scored lower with consumers than a control on green beans.
- **Gaps:** no honey-process study, no Costa Rica or Panama inoculation study, no replicated dose study, small sensory panels, and several high scores without a spontaneous-fermentation control.

### Design a lot from this catalog
1. Settle process, temperature the room can hold, and the time the user wants; 2. pick candidates whose page range covers that temperature; 3. take dose and rehydration from the page; 4. include an uninoculated control lot, because most published gains lack one; 5. record product, lot number, expiry, dose, rehydration, temperature curve, pH and brix curve, time, and the cup result in the lot record; 6. treat the first season as a trial, as the manufacturers advise.
