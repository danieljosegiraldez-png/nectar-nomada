# Equipment and consumables: coffee and cacao research

All quantities/specifications are proposed project requirements. No historical paper is claimed to have used these exact items. `Unspecified` quantities depend on final replication and laboratory SOP; they must not silently become zero in purchasing software. Core means pilot field work, not that every specialist method is required. Borrow or contract laboratory services where practical.

| ID | Item | Category / stage | Pilot quantity | Specification |
|---|---|---|---|---|
| E01 | Documented exclusion sleeves | consumable / core | 6 sleeve | Untreated breathable material; actual aperture, polymer, seams and lot documented; qualify separately for each crop/target |
| E02 | Smooth sleeve support hoops | equipment / core | 3 set | Hold fabric clear of flowers; no girdling or changes to measured load |
| E03 | Soft ties and closure clips | consumable / core | 1 pack | Adjustable; non-scented; replace if closure is compromised |
| E04 | Weatherproof ID labels | consumable / core | 30 label | Unique IDs; visible in photograph; archival-readable marker |
| E05 | Paired microclimate loggers | instrument / core | 2 logger | Matched T/RH probes; target accuracy <=0.5 C, <=3% RH; side-by-side check; 1–5 minute interval |
| E06 | Tape, millimetre ruler and optical scale target | instrument / core | 1 set | Known length reference at flower plane; do not confuse sensor pixels with object scale |
| E07 | Precision fruit/seed balance | instrument / core | 1 balance | >=200 g capacity; 0.01 g readability; verify actual accuracy/repeatability |
| E08 | Pod/batch balance | instrument / cacao_core | 1 balance | Capacity covers heaviest pod/container; candidate >=5 kg and 1 g readability for whole cacao pods |
| E09 | Traceable check masses | reference material / core | 1 set | Span expected loads and instrument requirements; certificate/uncertainty recorded |
| E10 | Harvest containers and trays | consumable / core | 10 container | Unique label, tare, separate treatment/date; no pooling before identity recorded |
| E11 | Field notebook, clipboard and markers | equipment / core | 1 set | Water-resistant; revision/correction history |
| E12 | Offline-capable field phone/tablet | equipment / core | 1 device | Clock, location, photographs; offline UUID records and sync conflict display |
| E13 | Rain gauge and wind meter | instrument / core | 1 set | Calibrated/checked; location, height, units and interval defined |
| E14 | Coffee macro camera and lens | instrument / core | 1 set | HQ C/CS camera with 16 mm candidate; final object-plane resolution acceptance required |
| E15 | Hive entrance camera | instrument / optional | 1 camera | Module 3 Standard candidate; direction/count validation |
| E16 | Recorder, power, media and verified backup | equipment / core | 1 set | Clock, loss logs, independent power, original clips and checksum-verified copy |
| E17 | Cacao macro optics qualification rig | instrument / cacao_core | 1 set | Object-plane scale for smallest visitor; adjustable stable mount and flower-depth test |
| E18 | Magnifier or stereomicroscope access | service / specialist | 1 arrangement | Field magnifier plus lab microscope appropriate to supported taxon/pollen task |
| E19 | Fine forceps and approved pollen-transfer implements | equipment / specialist | 2 set | Dedicated or cleaned/dried between donor changes; recipient-flower manipulation technique validated |
| E20 | Compatible donor flowers/pollen | biological material / specialist | Unspecified donor flower | Known donor ID/genotype, collection time, preparation and compatibility evidence |
| E21 | Labelled specimen vials and storage | consumable / specialist | 20 vial | Match preservation method to morphology, DNA or pollen question |
| E22 | Filtered insect aspirator or collection net | equipment / specialist | 1 set | Appropriate tiny-insect capture method; avoid disturbance in scored cohorts |
| E23 | Preservative and cleaning supplies | consumable / specialist | Unspecified mL | Laboratory-approved material, concentration, storage and instrument compatibility |
| E24 | Slides, coverslips and microscopy consumables | consumable / specialist | Unspecified slide | Approved pollen-count/viability/tube SOP; include blanks and reference pollen |
| E25 | Taxonomist and pollen laboratory | service / specialist | 1 arrangement | Expert review at defensible rank; optional DNA barcoding with chain of custody |
| E26 | Habitat substrate and application containers | biological material / experimental | Unspecified kg | Disease-screened locally appropriate material; mass/moisture/source measured |
| E27 | Soil moisture/nutrient assessment | service / optional | Unspecified sample | Method, depth, units, lab/probe calibration and sampling locations defined |
| E28 | Canopy/shade measurement kit | instrument / optional | 1 set | Repeatable canopy photograph or appropriate calibrated light method; store method/geometry |
| E29 | Caliper | instrument / optional | 1 caliper | Repeatable fruit dimensions; 0.1 mm readability sufficient for pilot |
| E30 | Refractometer and distilled water | instrument / optional | 1 set | Range/accuracy suitable for predeclared juice measurement; zero/reference check |
| E31 | Controlled drying, moisture measurement and seed processing | service / optional | 1 arrangement | Document drying/fermentation/moisture basis; calibrated crop-appropriate moisture method |
| E32 | Blind sensory evaluation | service / optional | 1 arrangement | Adequate sample mass, standardized processing/roasting; random coded batches and qualified panel |
| E33 | Protective housings, rigid posts and mounts | equipment / core | 1 set | No obstruction of visitors; no transfer of camera force to hive load cell |
| E34 | Treatment timing clock and task alerts | equipment / core | 1 system | Synchronized local/UTC times; log actual opening/closing of access |

## Scaling and purchasing

Use the JSON scaling_rule and method_ids to prepare a study-specific bill of materials. Preserve source lot, supplier, quoted price/date, currency, lead time, Florida 33195 delivery eligibility, calibration certificate and asset serial. Consumable reservations and actual use are distinct. Exact supplier SKUs remain unquoted except for the previously researched camera options in the engineering packet. Unknown laboratory needs block that method, not the entire observational pilot.

Do not multiply all pilot quantities by the number of plants: balances, reviewers and recorders are shared assets, while labels, sleeves and sample containers scale with concurrent units or samples. Include cleaning, batteries, replacement media, maintenance time and training in the operational budget.

- **E01 scaling:** ceil(active_exclusion_units*1.2) plus material qualification samples. Six is a coffee fit-test quantity, not six independent replicates. Cacao sleeve size/aperture unresolved.
- **E02 scaling:** one per concurrently supported unit. 
- **E03 scaling:** count closures and spares from final sleeve drawing. 
- **E04 scaling:** plants + branches/cushions + cohorts + sample containers + spares. 
- **E05 scaling:** one per simultaneous treatment environment; third for sham. 
- **E06 scaling:** one per field team. 
- **E07 scaling:** one per weighing station. 
- **E08 scaling:** one per harvest station. 
- **E09 scaling:** one compatible set per balance range. 
- **E10 scaling:** one per treatment/cohort/harvest batch plus spares. 
- **E11 scaling:** one per field team. 
- **E12 scaling:** one per field team. 
- **E13 scaling:** one weather reference per representative site. 
- **E14 scaling:** one per simultaneous flower view. See VIDEO_MICROPARCEL_EXTENSION.md for verified pilot camera SKUs; this generic catalogue does not override them.
- **E15 scaling:** one per monitored entrance. 
- **E16 scaling:** size by measured bitrate*recorded time plus reserve. 
- **E17 scaling:** one pilot before replication. Coffee optics not automatically adequate; no fully qualified cacao lens SKU yet.
- **E18 scaling:** hours by specimens and reviewer availability. 
- **E19 scaling:** operator sets plus clean spare. 
- **E20 scaling:** actual recipient count*validated donor requirement; do not infer grains from anther count. 
- **E21 scaling:** planned specimens + blanks + spares. Pilot stock allowance, not collection target.
- **E22 scaling:** one per authorized collector. 
- **E23 scaling:** approved SOP usage per specimen + blanks. Pollen-on-body examination before ethanol when required; do not invent universal chemical preparation.
- **E24 scaling:** allocated destructive flowers*slides per SOP + QC. 
- **E25 scaling:** quote by specimen/sample and turnaround. 
- **E26 scaling:** prespecified dose*plots*applications; do not infer from published headline. No automatic distribution of cacao pod waste; agronomist reviews pathogen/pest consequences first.
- **E27 scaling:** stratified sites*treatments*dates + QC. 
- **E28 scaling:** one per field team. 
- **E29 scaling:** one per harvest station. 
- **E30 scaling:** one per processing station. 
- **E31 scaling:** separate batches per treatment and independent replicate. 
- **E32 scaling:** replicated processing lots, not one pooled sample per treatment. 
- **E33 scaling:** one per camera position. 
- **E34 scaling:** one shared reference and device sync records. 
