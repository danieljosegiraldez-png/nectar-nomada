# Smart Hive Node V1 — engineering handoff, 2026-09-16

**Ready for Claude Code engineering continuation; not released for manufacturing or unattended deployment.** This packet contains implemented MicroPython firmware, host tests, a three-prototype procurement specification, wiring, analytical mechanical/power review, schemas and operating guides. No physical hardware, cellular coverage, laminate, or assembled power path was available to test. “Finalized packet” does not mean those unperformed validations passed.

Start with [CLAUDE_CODE_HANDOFF.md](CLAUDE_CODE_HANDOFF.md). Then read [engineering specification](docs/ENGINEERING_SPECIFICATION.md), [purchase plan for Florida 33195](docs/FLORIDA_PURCHASE_PLAN.md), [prototype BOM](docs/BOM.md), and [release gates](docs/OPEN_ITEMS.md).

The original attachments are preserved byte-for-byte in `source_original/`. Firmware replaces their simulated measurements and unsafe log deletion. All new numerical limits not expressly sourced are **engineering targets/decisions**, not manufacturer guarantees.

## Packet map

| Folder/file | Purpose |
|---|---|
| firmware/ | Complete source implementation, RC1; local commissioning required |
| tests/ | Executable host tests, hardware fakes and fault injection |
| tools/ | Commissioning, calibration, export, calculations and package verification |
| schemas/ | JSON Schema, OpenAPI and synthetic examples |
| docs/ | Engineering, wiring, power, mechanics, assembly, calibration, service, security, platform and test procedures |
| evidence/ | Actual test outputs and source hashes; no fabricated bench reports |
| MANIFEST.sha256 | Integrity hashes for delivered files |

## Principal corrections

- Keep both Notecard supply domains continuously powered. Host power gating is separate; `machine.deepsleep()` is not assumed to deliver a 20 µA Pico board.
- Non-wireless Pico H; Notecard-controlled host power-off after durable commits. Powered watchdog fallback is functional but uses substantially more energy.
- TCA9548A branches contain I2C faults and let both SHT31s use address 0x44. Microphone is ICS-43434 prototype stock, explicitly not the production lifecycle choice.
- A 150 kg load-cell rating is not the normal gross operating limit: use 120 kg provisional gross limit, including the moving tray. The reference 108MA-150kg is larger and more expensive than the original generic estimate.
- Local log → acknowledged Notecard custody → Notehub → idempotent optional platform ingestion. These are separate delivery states.
- Offline logging, physical USB export and local configuration work without Nectar Nomada OS. Cellular mode necessarily uses Blues Notehub; platform independence does not mean carrier independence.
- Brood-zone placement is beside brood frames. Under-bottom-board air is a different measurement and must not be relabeled as brood temperature.

## Honest release status

Host tests exercise algorithms, framing and filesystem failure behavior. They cannot verify RP2040 PIO/I2S allocation, analog accuracy, LittleFS under actual power cuts, a GPIO pinout on a delivered board, or RF performance. All physical acceptance rows start **NOT RUN**. PCB fabrication files and validated fiberglass tooling drawings are not included because the geometry, laminate and supplier tolerances remain unresolved. The exact work to close these gaps is in the handoff.

## Coffee video pilot

The [camera recommendation and experiment protocol](docs/VIDEO_MICROPARCEL_EXTENSION.md) specify both flower and entrance views, an HQ camera with 16 mm lens for a small flower cluster, optical acceptance tests, and intact bagged/open treatments. Camera/lens pilot subtotal is $161.75, excluding shared recorder, power and weatherproofing. Species identification remains a validation gate.

The [coffee experimental requirements and method](docs/COFFEE_EXPERIMENT_REQUIREMENTS_AND_METHOD.md) cover non-hive tools, netting qualification, treatments, field work through harvest, records and analysis.

## Coffee and cacao research extension

The [complete research packet](research/README.md) adds 40 evidence records, crop-specific methods, 34 equipment/consumable requirements, eight workflows, field forms and a software import contract. Read its evidence-access limits before replicating published experiments.
