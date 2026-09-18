# Original-source reconciliation

The original files are preserved in `source_original/`; see `evidence/source-hashes.json` for SHA-256 and retrieval provenance. They were recovered as attachments to the referenced ChatGPT conversation; `/mnt/data` is not mounted on this Mac.

| Original source assertion [O] | Disposition and new decision |
|---|---|
| SPEC §1 approximately 20 µA MCU sleep | Reject as board-level budget; see POWER.md and Raspberry Pi source S01 |
| SPEC §1 <2 s sensor capture | Replace with measured capture budget; reference model 8 s is an assumption, not a bound established on hardware |
| SPEC §1/§3 GP15 cuts cellular power | GP15 now enables battery divider; Notecard stays powered |
| SPEC §2 Pico WH / code says Pico or ESP32 | Pico H only. RP2040 PIO implementation is not portable to ESP32 |
| SPEC §2 generic TAL203/GPB144R 100–150 kg | Capacity fixed to 150 kg; exact original vendor variant/drawing absent; do not purchase generic part by name alone |
| SPEC §2 2 × 18650, 6800 mAh + TP4056 | Protected assembled 6600 mAh 1S3P pack candidate for prototype; no loose parallel cells; no field charge circuit in V1 |
| SPEC §2 $90–134 and free cloud | Withdraw as a current quote or total cost; revised BOM includes real development carriers, power support, mechanics and service costs |
| SPEC §3 GP4/5 climate bus | Retain physical pins, use bounded SoftI2C plus mux reset; both probes 0x44 on separate branches |
| SPEC §4 universal 2 mm corner gaps | Replace with individually adjustable stops established by deflection/tolerance testing |
| SPEC §4 fiberglass RF transparency | RF-transparent material is not a guarantee of antenna performance near wet hive, water, metal fasteners or ground |
| SPEC §5 under-screen internal probe | This is underfloor air. True brood-zone sensing requires an explicitly different protected mounting location |
| main.py read_hx711/read_sht31 constants | Replaced with actual drivers; no simulated readings in deployed modules |
| main.py rewrites whole JSON array | Replace with bounded per-record LittleFS journal, checksums, atomic commits and reserved IDs |
| main.py print transmission then empty log | Replace with UART request/response and custody acknowledgement; platform ingestion uses deduplication |
| main.py midnight and no persistent scheduling | Notecard periodic sync persists independently of host boots; no repeated manual midnight sync |
| main.py blind machine.deepsleep | Host power gate or explicitly powered fallback; no unsupported dormant promise |

Original values remain evidence of the earlier proposal, not validated facts. Later conversation estimates are context, not vendor quotes or bench test results. The current user's expanded sensor and platform requirements are incorporated in ENGINEERING_SPECIFICATION.md.
