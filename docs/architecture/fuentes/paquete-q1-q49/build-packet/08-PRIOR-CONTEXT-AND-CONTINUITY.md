# Prior project context and continuity controls

This appendix protects earlier work from being lost in the new Coffee/Bee discovery. It is not a new order to implement every historical idea. **CONFIRMED DECISION** refers to user-requested/accepted direction; **IMPLEMENTATION REQUIREMENT** identifies preservation/reconciliation obligations; **OPEN TECHNICAL DECISION** identifies choices or missing evidence. Current code is not verified here.

## 1. Source coverage

| Source | Coverage | Use |
|---|---|---|
| Create Study Proposal | All 63 available turns, no reported attachments | Q1–Q49, revisions and final handoff direction |
| Compare Farm Management Software | All 19 available turns; three assistant messages truncated at 20,000 characters | Offline Android constraints, field sessions, operator UX, genealogy and repository audit |
| Plataforma digital Nectar Nómada | All 50 available turns; seven assistant messages truncated at 20,000 characters | Broader platform, prior architecture inputs, economics, sovereignty, community commerce and V3 compatibility |
| Set up Claude Code project context | Recent task context sampled | Public-site work is a distinct scope; not evidence of the OS repository's current contents |
| Impacto abejas polinización café | Recent 10 turns sampled | Historical applied beekeeping context; inspection source was missing and no operational counts are imported as current facts |

The first three transcripts are included. Ten truncated historical assistant messages are marked individually; their missing tails were not reviewed. All user messages and the complete Q1–Q49 discovery text were recovered. The sampled task contexts are not included wholesale because they add unrelated/private historical detail without establishing new approved OS requirements. In particular, the earlier apiary report explicitly lacked the inspection it purported to summarize; this packet does not adopt its dates/counts or pollination benefit claims as verified field evidence.

**IMPLEMENTATION REQUIREMENT:** a full conversation retrieval is not equivalent to recovering all files once attached to it. Several canvas/document references are placeholders; exact contents are unavailable here. The platform source exposes some technical PDF attachments, but those PDFs were not extracted/reviewed in preparing this packet. No dosage, equipment specification or migration should be justified by an unread attachment.

## 2. Existing platform architecture, reported rather than inspected

The user previously described a modular monolith using Next.js + PostgreSQL and a shared canonical model including People, Organizations, Locations, Projects, Samples and Assets. Historical prompts reference Prisma, Vercel, Neon and R2. They also mention public/private services, classification, permissions, Research OS, sensory, coffee processing and apiary work.

**IMPLEMENTATION REQUIREMENT:** inspect the actual repository and deployment configuration to establish what is present now. These are discovery leads, not certified stack facts. Search existing equivalents before adding `Farm`, `Site`, `Lot`, `Sample`, `Measurement`, `MediaAsset`, `Offering` or any new wrapper. Preserve in-progress changes and do not run schema generators/migrations simply because a document mentions Prisma.

The discovery's historical assistant reported existing apiary inventory/history, hive origins/movements/inspections, beneficio profitability, three-stage mass balance, detailed drying rules, Brix/pH/honey-type/humidity logic, yeast data, equipment schemas, workday/task visibility and tests. **IMPLEMENTATION REQUIREMENT:** find corresponding code and tests; mark each confirmed, partial, obsolete or unavailable. Do not rebuild those modules based solely on this report.

## 3. Broader platform concepts to preserve

**CONFIRMED DECISION — prior platform direction:** Néctar includes public discovery/storytelling, territory/maps, people/producers/partners, projects, products, services, consulting, tourism/experiences/reservations, commerce, research, sensory, competitions and an evidence-aware AI layer. Visitors can be guests; account users may gain permissioned functionality and personalized guidance. Coffee/cacao research specialization need not be generalized into every beverage process just because the parent platform spans more domains.

**IMPLEMENTATION REQUIREMENT:** preserve boundaries among public presentation, private operational truth and specialized tools. An approved story or product page is a publication projection, not a raw operational table exposed to the internet. Existing public-site and OS repositories/deployments must be identified separately. This handoff does not authorize merging them or redesigning a separate brand site.

Sensory already had a cross-platform purpose: coffee, honey, beer, wine, mead, spirits/liqueurs, guided experiences and competitions, with technical, public and judging use cases. **CONFIRMED DECISION:** Q20 strengthens standalone use; it does not narrow sensory to internal coffee panels. Preserve session, blind sample, individual/cup evaluation and aggregation distinctions wherever already built.

## 4. Content, adaptive experience and AI identity

**CONFIRMED DECISION — prior direction:** original photos, field video/audio, interviews, documents, maps, environmental records and research/sensory data can support multiple approved experiences. Content Intelligence, Creative/Marketing Intelligence, audiovisual production, adaptive user/operator experiences and research support should connect to canonical sources. Do not fabricate documentary facts, quotes, results or missing footage.

**IMPLEMENTATION REQUIREMENT:** maintain original → annotation/transcript/extraction → reviewed derivative → editorial composition → approved channel output lineage. Consent, rights and data classification travel with derivatives. Public storytelling cannot reveal a private client method merely because an AI can retrieve it. Preserve a useful operator focus even if visitors receive rich immersive interfaces; heavy public media must not burden an offline field screen.

**CONFIRMED DECISION — accepted AI design direction:** one coherent Néctar identity with professional modes and scoped tools, rather than unrelated personalities per module. Field/research/fermentation/sensory/gastronomy/storytelling/marketing modes vary depth and tone; they do not change factual or permission boundaries. The earlier “alchemist” metaphor is creative language, not a claim of mystical mechanisms. Humility about uncertain conclusions coexists with precision about observed facts.

**OPEN TECHNICAL DECISION:** actual provider/media stack, rendering, personalized experiences and release phasing. Names such as Cloudinary, Mux, Remotion, Cesium and Mapbox in earlier research are candidates, not approved dependencies.

## 5. Brand, marketing, community and Publer

**CONFIRMED DECISION — prior direction:** Brand/Marketing/Sales Enablement/Community Intelligence stays connected to canonical projects, offerings, campaigns, audiences, rights, approvals and outcomes. Publer was explored as a replaceable publishing/analytics adapter, not the system of record for Néctar's marketing strategy.

**IMPLEMENTATION REQUIREMENT:** preserve draft/review/publication states, attribution and approved data access. No autonomous public posting is authorized by this build packet. **OPEN TECHNICAL DECISION:** verify current Publer API, plan/permissions and specific comments/inbox/DM support; do not infer API coverage from UI features. The earlier architecture document's actual implementation status must be inspected.

## 6. Community marketplace and events

**CONFIRMED DECISION — prior user answers:** curated participation across farmers markets, expos, festivals, pop-ups, tastings, competitions and community events; vendors/exhibitors/contributors; products, services, experiences and projects; physical/digital discovery; and a future path for authorized partner-organized events. Earlier accepted direction includes direct-vendor payment and NN-mediated commerce, temporary event inventory, QR/provenance, approved public profiles, map/routes, agenda/workshops/tastings, shared Sensory OS, Event Passport, interests/favorites/follows, consent-based CRM/leads, collaboration opportunities and post-event analytics.

The exact earlier 20-question choices remain in the full platform source; do not silently reinterpret their letters out of context. **IMPLEMENTATION REQUIREMENT:** preserve current Event, Offering, Vendor and Commerce concepts and avoid duplicating them for Q49. Q49 adds production/buyer fulfillment traceability; it does not cancel the wider event-commerce vision or mandate full marketplace execution now.

**OPEN TECHNICAL DECISION:** current implementation stage, financial responsibilities, payment/refund settlement, subscription/marketplace boundaries and partner release criteria. Reconcile against existing approved plans.

## 7. Operational economics and data sovereignty

**CONFIRMED DECISION — prior user addition:** who worked, for how long, and what production cost matter; full payroll is not the initial goal. Account for ownership and access to resources, not just purchases. Assets/inputs can be bought, owned/pre-existing, borrowed, rented, leased, donated, transferred, partner/client-provided, internally produced or consigned. Cash outlay, economic/reproduction cost and in-kind contribution differ. A zero-cash input is not automatically free to reproduce.

**IMPLEMENTATION REQUIREMENT:** preserve WorkLog, CostEvent, ResourceUsage, supplier provenance, quantities/expiry, actual versus budget/scenario/forecast, original currency/date, shared-allocation basis and cost genealogy. Q23 specifies the first functional subset; it does not erase prior economics. Valuation methods such as FIFO/weighted average/specific identification were subjects to study, not interchangeable approved algorithms.

**CONFIRMED DECISION — user concern:** client export, backups and provider exit are part of being a scientific system of record. **IMPLEMENTATION REQUIREMENT:** portable data/evidence export, read-friendly reports, relationship manifests, restore drills and a provider exit plan. Preserve rights and audit lineage during tenant offboarding. Exact RPO/RTO, retention and contract terms remain open.

## 8. Beverage/process engineering extensions

Prior user direction expanded research into brewing/wine/cider/mead/distillation and technical operations: water/mineral profiles and salts, mash/saccharification/lautering/boil, grape/apple reception/crush/maceration/pressing/racking, cane extraction/bagasse/concentration, cultures/fermentation/MLF, distillation passes/cuts/proofing/alcohol balance, maturation/blending/packaging and equipment readiness.

**IMPLEMENTATION REQUIREMENT:** preserve approved specialized concepts such as Recipe / Formulation / Process Profile / Run and any existing DistillationRun rather than forcing every process into a coffee schema. Shared units, materials, equipment, evidence and inventory services are useful; biological/process semantics can differ. The new honey-to-beverage genealogy requirement is compatible with these modules but does not authorize their entire build during the current coffee/apiary increment.

Support/community knowledge was separately requested, including technical forums and manufacturer information. **IMPLEMENTATION REQUIREMENT:** separate community practice from scientific literature and approved Néctar standards; respect access/reuse rights. This packet does not reverify every historical forum or recipe source.

## 9. V1/V2 versus future V3 technical reference system

**CONFIRMED DECISION — explicit late prior direction:** let Claude finish V1/V2; prepare a forward-compatibility addendum for a later V3 Technical Product & Reference Data System. Do not turn that addendum into an immediate V3 implementation order.

**IMPLEMENTATION REQUIREMENT — preserve these distinctions now where foundational:**

| Distinction | Reason |
|---|---|
| TechnicalProduct vs physical InventoryItem/InventoryLot | Manufacturer identity/formulation differs from a purchased bag, quantity, expiry and supplier lot. |
| EquipmentModel vs EquipmentAsset | Rated specifications differ from a serialled unit, location, maintenance and condition. |
| Configuration/Capability vs asset name | One unit can accept attachments/probes and support different operations over time. |
| Measurement vs method/instrument/calibration references | Historical results require interpretable measurement provenance. |
| ManufacturerClaim vs NN_MEASURED / NN_OBSERVED | Product literature is not field validation. |
| TechnicalDocument vs DocumentVersion | TDS/SDS/manual/certificate versions must be preserved. |
| Product composition vs taxonomic label | Yeast/enzyme or mixed-culture formulations cannot be forced into one strain field. |
| Supplier lot/CoA vs generic product properties | Batch-specific results must not be copied to all instances. |
| Commercial culture vs BiologicalMaterial/Isolate | Future own isolates need origin/provenance without being falsely treated as commercial products. |

Use existing Product, Asset, Inventory, Measurement, Protocol/Run, Resource and Document concepts where semantics already support these distinctions. **OPEN TECHNICAL DECISION:** whether new tables or typed relationships/metadata are justified. A full catalog importer, manufacturer field-coverage matrix, product claims engine and biological registry remain deferred unless separately approved or already present. Avoid destructive future dead ends without expanding the entire current release.

## 10. Required repository documents to locate

Historical names below are search hints, not guaranteed files: `CLAUDE.md`; `AGENTS.md`; `EXTERNAL_DATA_ARCHITECTURE.md`; `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`; `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`; `PLATFORM_ARCHITECTURE_RECONCILIATION.md`; `MASTER_IMPLEMENTATION_ROADMAP.md`; `AI_GOVERNANCE.md`; `SECURITY.md`; AI persona/modes/tools documents; Brand/Marketing/Community/Sales architecture; Phase 1 execution plan; Research OS/CryoBloom definitions; V1/V2/V3 compatibility addendum; current mobile/offline audit; canonical brand/publication rules.

**IMPLEMENTATION REQUIREMENT:** record Found / Renamed equivalent / Superseded / Missing for each. Missing artifacts are context gaps, not invitations to recreate incompatible replacements. Use Claude's existing conversation and repository knowledge to supply the actual approved documents. Ask only for genuinely blocking source material; continue the rest of the audit.
