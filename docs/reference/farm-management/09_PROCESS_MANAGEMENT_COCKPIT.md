# 09 — Beneficio Process-Management Cockpit (Home Page) — Spec

**Prepared:** 4 Oct 2026 from a structured interview with the beneficio manager (D. Giráldez). Builds on `03` (capabilities), `04` (parameters), `06` (protocol model), `07` (assets, variables, allocation), `08` (Panama). This is the **master page** of the app for anyone processing coffee: a glimpse of the whole world, and the place where decisions are made.

**One-line purpose:** show what is **in process now** and what is **coming in**, so that no selected cherry is lost, every batch hits its next action on time, capacity never surprises the team, and the season lands on its process-mix target.

---

## 0. Decisions from the interview

| Topic | Decision |
|---|---|
| Primary user | **Beneficio manager** (dense, operator-grade). Owner/crew views come later as role defaults. |
| Device | **Phone first.** Desktop is a wider layout of the same modules. |
| Scale | **Configurable micro → medium** (< 2 t to 50 t cherry/day). No layout assumes a size; lists collapse/aggregate as volume grows. |
| Data input | Manual phone entry **+** sensors/loggers **+** integrated scales **+** weather station/forecast API. Every value records its source. |
| Drying setups | All: raised/African beds (open & covered), solar/parabolic, patios, dark/controlled rooms, mechanical (guardiola/silo). |
| Mix target basis | **Green-equivalent kg** (what is sold). Cherry kg shown alongside for daily routing. |
| Routing | **Tool suggests, manager approves.** Overrides require a one-line reason (learning signal). |
| Cherry sources | Own blocks · bought from neighbours · multiple farms of one owner · **toll/contract processing** for third parties. |
| Selection before eligibility | Flotation · hand/optical sorting · Brix & ripeness sampling · a **separate second-quality stream** (floaters, strip-pick, rejects as their own lots). |
| Washed clocks | Reception→pulping wait · fermentation to endpoint · washing + soak/grading · drying + reposo. |
| Honey | Measured **mucilage %** + house **colour label** · **sticky-phase risk** tracking · drying speed by **shade regime**. |
| Natural | **Bed-days blocked** · **early critical phase** · **moisture & aw curve** · optional **pre-ferment phase** · optional **fermentation phase** (aerobic/anaerobic before drying). |
| Special treatments | **Both:** on the main clocks board with a "special" badge + tighter alerts, **and** an Experiments panel with curve vs reference band and trial arms. |
| Alerts | **WhatsApp + app push + email digest + escalation chain.** (Also logged to the central Néctar Nómada WhatsApp record per platform rule.) |
| Lot logic | Blend same-day pickings · split after reception · split by density/grade · re-merge after drying. Full genealogy. |
| Scope beyond wet mill | **Harvest forecast & picking** and **dry mill & warehouse** summarized on home. (Quality feedback and water/energy live on their own pages for v1.) |
| v1 intelligence | **Allocation engine · 14-day capacity forecast · endpoint & drying-finish predictions.** (What-if scenarios = v2.) |
| Connectivity | **Mostly online**; offline only as fallback capture queue. |
| Language | **Spanish first, English toggle**; field terms in Spanish (tolva, sifón, baba, cps, correteo, pasera, reposo…). |

---

## 1. The mental model: two enemies, three speeds

**Enemies:** *time* (cherry, baba, wet parchment degrade on clocks) and *capacity* (vessel slots, m² of bed/patio, dryer hours, cold-room volume, labour). Finished inventory is history; the cockpit is about **work in progress (WIP) and the incoming pipeline**.

**Speeds:**
1. **Interrupt** — red alerts pushed to the phone (minutes).
2. **Glance** — the home page, read in 5 seconds (hours).
3. **Decide** — routing and planning with the engine's suggestions (day / 14 days / season).

---

## 2. Home page layout (phone-first, top to bottom)

Order follows urgency. Each module is a card; tap opens its detail page. Desktop places cards in a 3-column grid with the same order.

| # | Module | What it shows | Primary question |
|---|---|---|---|
| H1 | **Status strip** | One sentence + colour (Verde/Ámbar/Rojo) summarizing the worst open issue and the nearest crunch. Counters: rojo · ámbar · lots in process · kg at risk (US$). | "Do I need to act?" |
| H2 | **Ahora — Clocks board** | Every active batch as *time left until its next required action*, sorted by urgency. Badge for process (L/M/N/E), special flag, owner (own/bought/toll). Swipe to acknowledge/assign. | "What's next and when?" |
| H3 | **Por decidir — Routing inbox** | Received lots awaiting allocation with the engine's proposal + reasons; approve / change / split. Shows cherry waiting time. | "Where does this lot go?" |
| H4 | **Pipeline** | Kg (green-equiv. and cherry) at each stage: forecast in field → received/selection → pulping/holding → fermentation → washing → drying → reposo → dry mill → bagged. WIP age per stage. Second-quality stream as a thin parallel lane. | "Where is my coffee and is it flowing?" |
| H5 | **Capacidad 14 días** | Heat-grid: resources × days (tanks, sealed vessels, cold room, beds m², patios m², solar dryers m², mechanical dryer hours, dark room, crew). Colour = forecast load / capacity. First crunch day highlighted. | "When do I run out of space?" |
| H6 | **Mezcla vs meta** | Honey/Natural/Washed/Special: **actual · committed · projected end of season** vs target, in green-equiv. kg. Warning when the target could only be met with ineligible cherry. | "Am I on plan for the season?" |
| H7 | **Cosecha próxima** | Expected cherry kg next 7–14 days by block/farm/supplier (from flowering + GDD + pass history + picker crews), against absorbable capacity. | "What's coming?" |
| H8 | **Clima** | Next 48 h rain/sun/RH with impact on coffee *currently exposed* ("lluvia 15:00 — 6 lotes en camas > 20 % humedad"). | "Does weather threaten what's drying?" |
| H9 | **Seco & bodega** | Reposo stock ready for hulling, hulling schedule, bagged inventory by lot, samples pending. | "What's leaving the beneficio?" |
| H10 | **Experimentos** | Special lots: curve vs protocol band, arm comparison, next sampling time. | "Are my trials on track?" |

**Glance rule:** H1–H3 must fit the first phone screen. Nothing on home requires scrolling to discover a red issue.

---

## 3. Process stage models (per-lot state machines)

Stages are templates; each farm/protocol calibrates durations. Defaults below come from `04`/`07`; **unsourced durations are farm-calibrated and learned from the farm's own history** (the prediction engine updates them).

### 3.1 Washed (lavado)
| Stage | Clock / exit condition | Default reference | Key measurements |
|---|---|---|---|
| Recepción & selección | flotation, sorting, sampling done | — | kg, ripeness mix, °Brix, floaters % |
| Espera a despulpado | warn 8 h, red 10 h (Anacafé profile); Cenicafé profile 48 h with mass core °C logging | 10 h / 24 h outer | core °C if > 10 h |
| Despulpado | pulper quality checks | damage < 1 %, unpulped < 1 %, pulp-in-coffee < 2 % | gap, damage %, L/kg cps |
| Fermentación | **predicted endpoint** (pH/°Brix/TA/Fermaestro/time per protocol); red 60 min before, red if > 2 h past | protocol | mass °C, pH, °Brix, TA, volume |
| Lavado + remojo/clasificación | rinses done, soak hours, correteo grades → sub-lots | 4 rinses; soak per protocol | L, grades kg |
| Secado | moisture curve → 10–12 %; **predicted finish date** | solar 10.6–15.5 d; mechanical ~29.5 h from 53 % | moisture (method), aw+°C, bean °C, turns, layer |
| Reposo | ≥ 21 d, stable moisture/aw | 21 d | monthly moisture & aw |

### 3.2 Honey (miel)
| Stage | Clock / exit condition | Notes |
|---|---|---|
| Recepción & selección | as washed | eligibility by ripeness/Brix |
| Espera a despulpado | as washed | — |
| Despulpado + control de mucílago | **measured mucilage retained %** (gravimetric/estimate) + house colour label | label never replaces the % |
| **Fase pegajosa** (first 48–72 h on bed, farm-calibrated) | turning compliance, layer depth, clump/mould observations; red on rain exposure or missed turns | highest-risk window |
| Secado | regime: sun / shaded / covered / solar / mechanical finish; predicted finish | drying days farm-calibrated by colour × regime |
| Reposo | ≥ 21 d | — |

### 3.3 Natural
| Stage | Clock / exit condition | Notes |
|---|---|---|
| Recepción & selección | stricter eligibility (naturals magnify defects) | ≥ 80 % ripe, < 2.5 % unripe for modified routes |
| **Pre-fermentación (opcional)** | aerobic heap/container or sealed (anaerobic) cherry phase; time/°C | as protocol |
| **Fermentación (opcional)** | aerobic or anaerobic, with endpoint prediction | as protocol |
| **Fase crítica temprana** | first days at high moisture/aw > 0.90: turning, layer ≤ protocol, rain exposure, night cover | red on rain/no-turn |
| Secado | moisture & aw curve; days between aw 0.95 → 0.80 (≤ 4 d reference, low confidence); **bed-days blocked** | solar 11–27 d; mechanical 8–12 d; ≈ 2.3× solar area per unit green vs washed |
| Reposo | ≥ 21 d | — |

### 3.4 Special treatments
Built from the protocol step model (`06`): cold hold (CryoBloom 9–12 °C + bioprotection), anaerobic/sealed (pressure, headspace CO₂/O₂), carbonic, inoculated (product, dose, rehydration), river-fermented bags (water °C), thermal shock, co-ferment. Each step defines its own clock and endpoint. Alerts are tighter (e.g. pressure ≥ 80 % of rating = ámbar, ≥ 95 % = rojo). Disclosure block and competition eligibility are computed live.

---

## 4. Alerts

### 4.1 Tiers
| Tier | Meaning | Channels | Ack |
|---|---|---|---|
| **Rojo** | product/safety at risk within hours | push + WhatsApp, escalation | required |
| **Ámbar** | decision needed before end of shift | push; WhatsApp optional | recommended |
| **Digest** | yesterday/tomorrow summary | email 06:00 + 18:00 (configurable) | — |

### 4.2 Escalation
If a rojo is not acknowledged in **X min** (default 15), notify the next person in the chain (e.g. jefe de beneficio → gerente → dueño). Each alert carries: **what**, **lot/asset**, **deadline**, **suggested action**, **who is assigned**. Acknowledge ≠ resolve; both are logged.

### 4.3 Catalogue (v1)
**Rojo:** cherry wait ≥ limit · holding mass core °C rising · fermentation endpoint ≤ 60 min with no one assigned / > 2 h past · mass °C above protocol · cold room/chiller failure · sealed vessel pressure ≥ 95 % rating · rain ≤ 60 min with coffee > 20 % moisture exposed · mechanical dryer bean > 40 °C or stopped/furnace out · drying interrupted while moisture > 30–40 % · sensor offline on active batch · honey sticky phase missed turn + rain · CO₂ high in fermentation room/cold room.
**Ámbar:** tomorrow's forecast intake > absorbable capacity · capacity crunch ≤ 3 days · lot reaching target moisture (move to reposo — over-drying) · curve outside protocol band · cherry:parchment ratio off block history · calibration expired on instrument in use · inoculum/bioprotectant stock < planned runs · routing inbox item waiting > 2 h · mix projection off target by > X pts.
**Digest:** intake, yields, deviations, mix progress, tomorrow's plan, crews, weather.

Thresholds come from the parameter registry/protocols (never hard-coded). Alert fatigue control: dedupe, snooze with reason, per-user quiet hours (rojo bypasses).

---

## 5. Intelligence (v1)

### 5.1 Allocation engine (suggest → approve)
**Inputs:** lot (source/owner, block/supplier, variety, altitude, pass, ripeness mix, °Brix, floaters %, kg, time since picking) · protocol eligibility rules · capacity over the **protocol's full duration** (not just today) · crew on shift · 5-day weather · mix gap (green-equiv.) · commitments (buyer microlots, competition, trials, **toll-client instructions** which are fixed) · second-quality rules.
**Output:** ranked options, each with protocol, assets to allocate, expected finish date, green-equiv. kg, and **reasons** ("Especial va 6 % vs 10 % meta; SM-1 #2 libre 120 h; lote califica"). Can propose **splits** (e.g. 60 % honey / 40 % natural).
**Hard constraints:** eligibility, toll-client protocol, capacity, legal/safety. **Soft:** mix, preferences, cost.
**Learning:** overrides + reasons, and end-of-season cup results per decision, reweight soft preferences.

### 5.2 Capacity forecast (14 days)
Per resource and day: occupied (current lots × predicted finish) + planned (approved allocations) + forecast intake × likely routing. Shows first crunch day and the lots causing it. Resource units: tank/vessel slots (L), cold room (kg), bed/patio/solar m² at protocol layer depth, mechanical dryer batch-hours, dark room m², crew hours.

### 5.3 Endpoint & drying predictions
- **Fermentation endpoint:** per-protocol model from readings (pH, °Brix, TA, Fermaestro, °C) + farm history; displays ETA with uncertainty band; tightens as readings arrive.
- **Drying finish:** moisture curve fit (per regime/process/weather) → date at 10–12 %; also predicted aw window; updates with each reading and the forecast.
- Predictions feed H2 (clocks), H5 (capacity) and H6 (projected mix).

### 5.4 Harvest forecast (H7)
Flowering events + GDD (`04`) + pass history + picker crew size × productivity → expected cherry kg/day by block/farm; bought-cherry and toll intake from supplier commitments.

---

## 6. Lot logic & ownership

- **Genealogy graph:** deliveries → batches (blend) → sub-lots (split by process, vessel, grade) → dried lots → commercial lots (re-merge). Every node keeps kg, moisture, protocol, assets, owner.
- **Ownership:** own / bought (supplier, price, quality at reception) / multi-farm (site) / **toll** (client owns the coffee; client's protocol; separate custody; service billing). Toll lots never count toward the farm's mix target and can't be blended with others.
- **Second-quality stream:** floaters, strip-pick, rejects become their own lots with simplified routing; merging into specialty requires override + reason (rule in `03 §D`).
- Mass balance per node, moisture-normalised.

---

## 7. Mix target (green-equivalent)

`green_equiv_kg = cherry_kg × yield_factor(process, variety, farm history)` — default factors from `04` (washed cherry→green ≈ 6.25), natural/honey factors **learned from the farm's own weighings** (no authoritative values).
Three bars per category: **actual** (bagged/reposo) · **committed** (in process + approved) · **projected** (committed + forecast harvest × engine routing). Targets editable mid-season with history. Warning: "meta de natural requiere 1.2 t de cereza < 80 % madura".

---

## 8. Detail pages reachable from home

Lot page (timeline, curves, genealogy, disclosure) · Batch/asset page (vessel/bed/dryer with live sensors) · Routing inbox · Capacity planner · Pipeline · Mix planner · Harvest & crews · Dry mill & warehouse · Experiments · Alerts log · Weather. Field capture forms follow the checklist pattern (`03` principle 7).

---

## 9. Data needed (beyond 03/07)

`StageTemplate(process, stage, clock_rule, exit_condition, default_duration, source)` · `LotStageState(lot, stage, started_at, due_at, predicted_at, status)` · `Alert(tier, rule, lot/asset, deadline, assigned_to, ack_at, resolved_at, escalation_level)` · `EscalationChain` · `NotificationPreference(user, channels, quiet_hours)` · `AllocationProposal(lot, options[], reasons[], chosen, override_reason)` · `CapacityResource(type, unit, capacity_by_day)` · `CapacityForecast(resource, day, occupied, planned, forecast)` · `Prediction(lot, kind: endpoint|dry_finish, eta, band, model_version)` · `MixTarget(season, category, pct)` · `YieldFactor(process, variety, farm, value, n_obs)` · `HarvestForecast(block|supplier, day, kg, method)` · `Ownership(lot, type, client/supplier, contract)` · `LotEdge(parent, child, kg)`.

---

## 10. Acceptance criteria (v1)

1. With 30 active lots across the four process families, H1–H3 render on a 390 px-wide phone above the fold; a new rojo appears on home ≤ 60 s after its trigger and on WhatsApp/push ≤ 2 min.
2. Each lot shows its current stage, due time and predicted time; overdue lots sort to the top.
3. A new reception produces an allocation proposal with ≥ 1 reason within 10 s; approving it updates capacity and mix projections immediately.
4. Capacity grid correctly flags a crunch caused by routing a lot to natural (bed-days over the protocol's full duration).
5. Mix bars reconcile: Σ categories = 100 % of farm-owned green-equiv.; toll lots excluded.
6. Rojo unacknowledged for the configured minutes escalates to the next person; all events logged.
7. Spanish default; every screen toggles to English; Spanish field vocabulary preserved.
8. Offline fallback: entries queue and sync; queued entries are visibly marked until synced.

---

## 12. UX quality bar (acceptance gate for every beneficio screen)

**Read & glance**
- **5-second rule:** from the home page the manager can say whether to act and what comes next. Red issues are always above the fold on a 390 px phone.
- **One meaning per colour:** rojo / ámbar / verde for urgency only; process colours (miel, natural, lavado, especial, 2ª calidad) for process only. Never colour alone — pair with a label or icon; colours also differ in lightness.
- **Numbers that matter are big and monospaced** (time left, kg, %); labels small. Units always shown. Spanish number format (1.240 kg; 4,9).
- **Sunlight legibility:** body text ≥ 4.5:1 contrast, critical values ≥ 7:1; no light-grey text on white for anything actionable.
- **Every alert/clock says three things:** what to do, by when, who owns it. "pH 4,9" alone is not acceptable; "Lavar antes de 14:30 · asignado a X" is.

**Capture**
- **One-hand, gloved, wet:** targets ≥ 44 px (≥ 56 px for primary field actions), steppers and big numeric keypads instead of free text, defaults pre-filled from the protocol and the last reading.
- **Tap budget:** a fermentation reading (pH + °Brix + °C) ≤ 6 taps from the lot; a reception ≤ 90 s including photo; routing a lot ≤ 2 taps when accepting the engine's proposal.
- **Instrument-aware:** capture shows the instrument used and whether its calibration is valid *before* saving; aw always asks for sample °C.
- **Undo for 10 s** on every save; edits after that are versioned, never silent.

**States**
- Every module designs **empty** (start of season), **loading**, **stale data** (sensor offline → value greyed with age), **offline** (queued entries marked until synced) and **error** states.
- Predictions always show their **uncertainty band** and the time of the last reading they are based on.

**Navigation**
- Bottom bar (Inicio · Lotes · Ruteo · Capacidad · Más); any lot reachable in ≤ 2 taps from home; deep links from WhatsApp/push open the exact lot and action.
- Desktop = same modules in a multi-column grid; no feature exists only on desktop.

**Language & tone**
- Spanish first with English toggle; field vocabulary kept (tolva, sifón, baba, cps, correteo, pasera, reposo, broca, roya). Imperative, short, specific copy. No jargon the crew wouldn't use.

**Trust**
- Reference values display "referencia · fuente · confianza"; NN/low-confidence values are visibly marked. The engine always explains its suggestion; overrides are respected and recorded, never second-guessed in the UI.

## 13. Screens still to design (not in the mockup)

1. **Field capture flows:** reception (weight, ripeness mix, °Brix, floaters, photo), fermentation reading, drying moisture/aw reading, turning/cover log, cold-hold check.
2. **Alert detail & escalation** (ack, assign, snooze with reason, history).
3. **Capacity planner** full screen (drag a lot to a different resource/day; see consequences).
4. **Mix planner** (targets per season, actual/committed/projected, yield factors learned).
5. **Harvest & crews** (forecast by block/supplier, picker crews, intake plan).
6. **Experiments panel** detail (arms side by side, curve vs band).
7. **Dry mill & warehouse** (reposo stock, hulling queue, bags, samples).
8. **Asset page** (tank/bed/dryer with live sensors, maintenance, calibration).
9. **Toll-client view** (their lots, protocol, custody, service billing).
10. **Empty-season / onboarding** (register facilities, assets, instruments, protocols, targets).

## 14. v2 backlog
What-if scenarios (rain week, mix change, add beds) · quality feedback panel (CVA back to decisions) · water/wastewater/energy card · crew-level task assignment from clocks · wall-screen mode · owner view · supplier portal for bought cherry and toll clients.
