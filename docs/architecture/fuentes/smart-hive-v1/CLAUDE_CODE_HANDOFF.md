# Claude Code handoff — Smart Hive Node V1 RC1

Start here. Implemented firmware and host tests are provided; no hardware qualification or manufacturing release is claimed. Preserve original source files and distinguish facts, decisions and unresolved gates. Read README, docs/ENGINEERING_SPECIFICATION, WIRING, POWER, MECHANICAL, FIRMWARE, TEST_PLAN and OPEN_ITEMS before changes.

## User requirements

Three prototypes: 150 kg single-point cell/HX711; brood and ambient T/RH; pressure; microphone; sampled acceleration/tilt; ambient light; switched battery sensing; latched reed inspection; Blues Notecard; independent local operation plus optional Nectar Nomada OS; future camera/CO2/entrance sensing. Source from reputable US sellers delivering cheaply to Florida 33195; Amazon acceptable only for verified exact parts. No purchases authorized by this handoff.

Additional pilot: one coffee plant with Roubik-inspired bagged/open branch treatments, both close flower and hive entrance views. Prefer shared recorder/power/storage to reduce incremental cost. HQ camera +16 mm flower lens and Camera Module 3 Standard entrance candidate, one optical pilot before replication. Read VIDEO_MICROPARCEL_EXTENSION; do not promise species classification or identify hive origin from timestamps.

## What exists and what remains

firmware contains real sensor protocols, bounded errors, durable CRC journal, sequence state, UART request correlation, configuration validation and main orchestration. No simulated measurements in deployed source. Host tests use fakes intentionally. GPIO contract is fixed in WIRING; changes require coordinated source/schema/BOM/docs updates.

Current deliberate limits: local USB configuration/updates, no firmware OTA; audio RMS/peak features only; sampled vibration rather than always-on detection; no camera capture service; no platform server; no PCB CAD/fabrication files; no qualified fiberglass tooling drawing. These are explicit boundaries rather than hidden stub implementations. Do not label RC1 production-ready until gates close.

## Exact execution sequence

1. Run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v` from packet root. Run `python3 tools/verify_packet.py`. Retain output and versions. Use JSON Schema 2020-12 to validate examples and API contracts. Inspect actual MicroPython compatibility on the pinned release; host tests cannot establish it.
2. Electronics: convert WIRING into reviewable KiCad schematic and harness drawing; verify every exact suffix/datasheet and supplied carrier revision; select fuses/protection/charging controls and connector/keying. Run ERC. Build P1 with current-limited supply, execute G1/G4/G6 before attaching battery. Record actual rail waveforms, PIO/I2S timing and firmware UF2 SHA-256. Correct software only against evidence.
3. Mechanics: obtain supplier signed cell installation/excitation answers, define gross load envelope and tray geometry; produce dimensioned CAD, laminate/insert/fastener drawings and tolerances, calculate stresses/deflections, review stop inequality and wind/foundation loads. Build unloaded P2 fixture; execute mechanical tests before hive installation. Do not invent laminate allowables or treat 150% cell overload as a complete assembly rating.
4. Run real power-cut/storage, UART/Notecard queue and low-battery tests. Measure whole-battery energy over realistic weak signal and temperature conditions, then choose service interval. The original 20 µA and 12–18 month battery claims are not accepted requirements without evidence.
5. Platform: inspect the actual Nectar Nomada repository when supplied; implement migration, device registry/tenant authorization, idempotent ingestion, raw/derived/event separation, cursor reads, alerts, service/calibration history, permission-controlled document releases and export using schemas/openapi.json and docs/PLATFORM_API. Add integration tests for every rejection/custody case. Do not invent existing routes or deployment URLs. Keep cloud disabled in default device config.
6. Imaging: run the single-plant optical pilot; retain original clips and expert annotation results. Only after passing, implement separate Linux capture/manifest/upload service with power and disk-failure tests. Preserve bag exclusion treatment. Expand trial replication with research lead; a single plant is a method pilot.
7. Integrate P3; seven-day bench then 30-day field acceptance. Publish an immutable release bundle, checksums, build/calibration/service guides and actual results. Update costs with seller carts for ZIP33195. Owner approval to publish externally or buy equipment must be obtained in the actual working session, not inferred from this handoff.

## Definition of done

All requirements trace to executable code, contract, drawing or explicit deferred extension. Every applicable TEST_PLAN row has evidence and reviewer, no unresolved blocking gate, reproducible firmware/build manifest, backed-up raw data, documented rollback/recovery, approved mechanical/power BOM and calibration records for each serial. Platform optionality is demonstrated with cellular disconnected. Multi-tenant isolation and end-to-end duplicate handling pass. Video capability claims match independently reviewed footage. Until then, report release-candidate status and exact remaining gates.

## Non-negotiable data behavior

No constants posing as sensors; null/fault on failure. Do not clear logs after print or a timed-out UART request. Do not overwrite unacknowledged records when full. Preserve device epoch/sequence on routine updates. Authenticate using registry and route identity, not payload labels. Preserve originals when changing algorithms/calibration. Do not add arbitrary remotely executed Python for OTA.

## Experimental protocol addition

Read [COFFEE_EXPERIMENT_REQUIREMENTS_AND_METHOD.md](docs/COFFEE_EXPERIMENT_REQUIREMENTS_AND_METHOD.md) for non-hive equipment, qualified netting, cohort tracking and field/harvest records. Implement its identifiers, treatment breaches, observation effort and missing-data distinctions in research forms; do not infer a powered replicated study from the one-plant pilot.

## Research library and experiment implementation

Use the [complete coffee/cacao manual](research/COFFEE_CACAO_RESEARCH_MANUAL.md) and [research software contract](research/RESEARCH_SOFTWARE_REQUIREMENTS.md). Import `research/research_reference_bundle.json` using its adjacent schema; run `python3 tools/verify_research.py`. Preserve source-derived evidence separately from proposed local procedures. Implement the contract’s field entities, provenance, inventory scaling, offline reconciliation and permission rules, then execute its 12 acceptance cases. The reference bundle is implemented; a deployed experiment-management application is not. Do not treat early cacao set as harvested yield, camera detections as confirmed pollination, unknown quantities as zero, or multiple branches as independent hive-treatment replicates.
