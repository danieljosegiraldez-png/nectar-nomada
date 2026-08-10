# NÉCTAR NÓMADA — Web Experience Reference Research & UX Direction Prompt for Claude Code

**Prepared:** 2026-08-10  
**Purpose:** Design-reference research and architecture direction only.  
**Status:** Do not redesign or implement production UI during this pass.

**Sequencing dependency, added before this reaches Claude Code — hard
blocker, not optional**: §47 explicitly requires alignment with
`PHASE_1_TECHNICAL_EXECUTION_PLAN.md`. Do not run this prompt until that
document exists AND has been reviewed/approved. If it doesn't exist yet
when this is read, stop immediately and report that back rather than
proceeding with the Phase 1 alignment step skipped or guessed at.

**Reference verification caveat, added before this reaches Claude Code**:
§39 asks for 5-10 additional current references, each verified active via
official URL. Before attempting this, confirm whether real web search/
fetch capability is actually available in this session. If it is not,
do NOT guess at "current" state of any reference (named in this document
or newly found) from training data alone — explicitly flag any reference
whose active status/current interface could not be actually verified,
rather than presenting an assumption as a confirmed fact. This applies to
the 12 named references in §38 too, not just the additional ones — if
verification isn't possible, say so plainly rather than silently treating
prior knowledge as current.

---

# 0. WHY THIS DOCUMENT EXISTS

Néctar Nómada is not only a website and not only an operations application.

It needs a coherent digital experience spanning:

1. a public-facing brand/homepage;
2. discovery and storytelling;
3. products and commerce;
4. tourism, events and bookable experiences;
5. project/farm/place profiles;
6. traceability;
7. sensory evaluation;
8. coffee processing and fermentation tools;
9. field/operator workflows;
10. research and analytics;
11. maps/environmental context;
12. media/content intelligence;
13. consulting;
14. marketing/community management;
15. Ask Néctar / AI-assisted interfaces.

No single reference website should be copied.

The objective is to study several excellent products and extract interaction patterns, information architecture, visual hierarchy, progressive disclosure, data visualization, storytelling techniques and mobile behavior appropriate to each Néctar Nómada interface.

The final product should remain recognizably Néctar Nómada.

---

# 1. INSTRUCTION TO CLAUDE CODE

Before proposing UI changes:

1. Read `CLAUDE.md`.
2. Read all relevant architecture and implementation documents.
3. Inspect the current application and component system.
4. Inspect:
   - routes;
   - public pages;
   - authenticated app shell;
   - design tokens;
   - typography;
   - navigation;
   - components;
   - maps;
   - charts;
   - forms;
   - tables;
   - media components;
   - commerce pages;
   - operator interfaces;
   - sensory interfaces;
   - current responsive behavior.
5. Do not assume the references below should become the visual style.
6. Treat references as pattern libraries, not templates.
7. Preserve the existing Néctar Nómada identity unless a later approved design phase explicitly changes it.

Create:

`/docs/design/WEB_EXPERIENCE_REFERENCE_ARCHITECTURE.md`

Do not implement production UI yet.

---

# 2. DESIGN PRINCIPLE

Néctar Nómada should intentionally have more than one interface density while maintaining one design system.

Think in EXPERIENCE MODES rather than unrelated websites:

```text
PUBLIC / DISCOVERY
immersive + visual + narrative

COMMERCE
clear + desirable + conversion-oriented

EXPERIENCE / TOURISM
place + people + itinerary + booking

TRACEABILITY
exploratory + visual + evidence-rich

FIELD / OPERATOR
fast + dense + actionable

SENSORY
focused + low-distraction + protocol-driven

RESEARCH / ANALYTICS
dense + analytical + provenance-aware

CONTENT / MARKETING
workflow + media + calendar + performance

AI / ASK NÉCTAR
contextual + conversational + evidence-aware
```

The mistake to avoid is forcing the same page density and interaction language onto every task.

---

# 3. REFERENCE SET — PUBLIC BRAND / SPECIALTY COFFEE

## A. ONYX COFFEE LAB

Official:
https://onyxcoffeelab.com/

Study for:

- premium specialty-coffee presentation;
- strong visual identity;
- commerce + education;
- product discovery;
- storytelling integrated into selling;
- transparency;
- navigation between coffee, classes, guides and brand story.

Especially important:
Onyx states that coffee pages include trade/pricing data, scores and sourcing details.

Néctar Nómada lesson:

A product should not have to choose between being beautiful and being technically transparent.

Potential NN adaptation:

```text
PRODUCT / LOT PAGE

Hero
↓
Buy / Book / Participate
↓
Sensory profile
↓
Producer / Place
↓
Process
↓
Traceability
↓
Research / evidence
↓
Media story
↓
Related experience
```

Do NOT copy Onyx aesthetics.

Study the integration of commerce, transparency and education.

---

## B. COFFEE COLLECTIVE — TRANSPARENCY

Official:
https://coffeecollective.dk/pages/transparency-report

Study for:

- institutional transparency;
- producer-centered communication;
- annual reporting;
- economic/supply-chain context;
- communicating values through data rather than vague claims.

Néctar Nómada lesson:

Transparency can itself become an experience and a trust mechanism.

Potential use:

- project transparency;
- origin reports;
- farm collaboration reports;
- research summaries;
- sustainability evidence;
- producer attribution.

---

# 4. REFERENCE SET — OPERATIONAL COFFEE PLATFORM

## C. CROPSTER

Official:
https://www.cropster.com/

Cupping documentation:
https://help.cropster.com/en_US/cupping

Study carefully.

Cropster is one of the closest functional references for parts of Néctar Nómada, but Néctar Nómada has a broader scope.

Study:

- coffee workflow organization;
- lot traceability;
- operational hierarchy;
- production monitoring;
- inventory;
- quality workflows;
- sensory session creation;
- comparison of sensory results;
- mobile cupping;
- separation of operational modules;
- information density.

Important current behavior:

Cropster supports structured cupping sessions, custom cupping sheets, guest evaluators, double-blind sessions, comparison of results, and integration of sensory feedback with other quality information.

Néctar Nómada lesson:

Study Cropster for workflow discipline.

Do NOT make Néctar Nómada look like conventional enterprise software.

NN should potentially combine Cropster-like operational rigor with a much stronger place/story/research/public experience.

---

# 5. REFERENCE SET — PLACE-BASED STORYTELLING

## D. ARCGIS STORYMAPS

Official:
https://storymaps.arcgis.com/

Reference explainer:
https://storymaps.arcgis.com/stories/01201cafc1914661a7e5d93a1c3aeb5e

Study:

- maps embedded in narrative;
- scroll-driven storytelling;
- immersive blocks;
- sidecar interactions;
- guided map tours;
- multimedia;
- text + map + photography;
- progressive geographic exploration;
- responsive storytelling.

Néctar Nómada applications:

```text
Expedition
Farm Story
Project Story
Watershed
Coffee Journey
Apiary Journey
Biodiversity Story
Ingredient Origin
Field Research
```

Potential NN pattern:

```text
STORY SCROLL
       │
       ├── narrative
       ├── media
       ├── map state changes
       ├── data observations
       ├── people
       └── process milestones
```

Do not reproduce ArcGIS branding or builder UI.

Extract storytelling interaction patterns.

---

# 6. REFERENCE SET — DATA STORYTELLING

## E. OUR WORLD IN DATA

Official:
https://ourworldindata.org/

Study:

- chart + explanatory text;
- progressive disclosure;
- source visibility;
- interactive filters;
- data download;
- clear distinction between narrative and evidence;
- embedding charts inside stories;
- accessible visualization.

Néctar Nómada applications:

- fermentation curves;
- sensory comparisons;
- environmental context;
- harvest history;
- biodiversity;
- campaign/business analytics;
- longitudinal farm data.

Important principle:

A chart should answer a question.

Avoid dashboards composed of charts simply because data exists.

Potential pattern:

```text
QUESTION
↓
KEY RESULT
↓
INTERACTIVE CHART
↓
EXPLANATION
↓
METHOD / SOURCE
↓
EXPLORE DATA
```

---

# 7. REFERENCE SET — ENVIRONMENTAL MAP / MONITORING

## F. GLOBAL FOREST WATCH

Official:
https://www.globalforestwatch.org/

Study:

- map-first environmental exploration;
- layer selection;
- place-based dashboards;
- alerts;
- global → local transition;
- combining many datasets without exposing all complexity at once;
- contextual statistics.

Néctar Nómada applications:

- farm environmental context;
- forest cover;
- watershed;
- biodiversity;
- external-data overlays;
- landscape monitoring.

Key lesson:

Map layers should be task/context aware.

Do not show every available external-data layer simultaneously.

---

## G. NASA WORLDVIEW

Official:
https://worldview.earthdata.nasa.gov/

Study:

- temporal exploration;
- layer switching;
- map timeline;
- satellite imagery;
- compare observations through time;
- scientific interface density.

Néctar Nómada applications:

- environmental timeline;
- rainfall/weather context;
- remote sensing;
- farm event contextualization.

Do not reproduce NASA's complexity for casual users.

Use its temporal-map interaction ideas for expert modes.

---

## H. iNATURALIST

Official:
https://www.inaturalist.org/observations

Study:

- map/list/grid switching;
- observation cards;
- filtering;
- geographic exploration;
- community-contributed observations;
- species identity;
- evidence/photo-first records;
- research-grade status;
- density → individual observation behavior while zooming.

Néctar Nómada applications:

- biodiversity observations;
- pollinators;
- plants;
- fungi;
- field observations;
- wild yeast source context;
- farm ecology.

Potential NN pattern:

```text
MAP
↔
OBSERVATION LIST
↔
MEDIA GRID
↔
OBSERVATION DETAIL
```

---

# 8. REFERENCE SET — EXPERIENCE / TOURISM COMMERCE

## I. AIRBNB EXPERIENCES

Official:
https://www.airbnb.com/experiences

Panama:
https://www.airbnb.com/panama/things-to-do

Study:

- experience discovery;
- visual cards;
- location/date/guest search;
- experience detail;
- host identity;
- social proof;
- booking;
- availability;
- itinerary expectations;
- mobile behavior;
- conversion with minimal friction.

Néctar Nómada applications:

- farm visits;
- coffee experiences;
- cuppings;
- fermentation workshops;
- apiary visits;
- gastronomic experiences;
- expeditions;
- events.

Néctar Nómada should go deeper than Airbnb in technical/story context.

Potential NN experience page:

```text
IMMERSIVE HERO
↓
What you will experience
↓
Host / Producer
↓
Place
↓
Journey / Itinerary
↓
What you will taste / do
↓
Technical depth selector
↓
Availability
↓
Book
↓
Related project/story
```

---

# 9. REFERENCE SET — MODERN OPERATOR UX

## J. LINEAR

Official:
https://linear.app/features

Study for:

- speed;
- keyboard-friendly interaction;
- restrained UI;
- contextual commands;
- clear state;
- compact operational workflows;
- project/activity navigation;
- action hierarchy;
- minimal friction.

Do NOT copy Linear's monochrome visual language blindly.

Néctar Nómada field/operator interfaces need more semantic distinction because biological, operational and research states can be confused if visual grouping is too subtle.

Use Linear primarily as a reference for interaction efficiency.

---

# 10. REFERENCE SET — FINANCIAL / ANALYTICAL DASHBOARD DISCIPLINE

## K. STRIPE DASHBOARD / REPORTING

Official documentation:
https://docs.stripe.com/payments/analytics
https://docs.stripe.com/stripe-reports

Study:

- metric hierarchy;
- filtering;
- date ranges;
- drill-down;
- transaction/detail relationships;
- reporting;
- dense information without losing clarity;
- actionable error/failure states.

Néctar Nómada applications:

- commerce;
- campaign conversion;
- bookings;
- consulting;
- operational analytics;
- report filters.

Key lesson:

Summary → filter → drill-down → underlying record.

---

# 11. REFERENCE SET — MARKETING / SOCIAL OPERATIONS

## L. PUBLER

Official:
https://publer.com/

Analytics:
https://publer.com/features/analytics

API:
https://publer.com/docs/

Study:

- content calendar;
- account switching;
- publishing workflow;
- workspace/team concepts;
- analytics overview;
- post insights;
- channel-specific performance;
- competitor analysis;
- content planning.

Néctar Nómada should NOT duplicate Publer unnecessarily.

Study Publer to determine:

1. what NN should delegate;
2. what NN should surface contextually;
3. what NN should own canonically.

Potential NN marketing interface should emphasize:

```text
REAL PROJECT ACTIVITY
→ MARKETING OPPORTUNITY
→ CREATIVE BRIEF
→ APPROVED CONTENT
→ PUBLER
→ SOCIAL PERFORMANCE
→ FIRST-PARTY CONVERSION
```

not simply recreate a scheduler.

---

# 12. REFERENCE SYNTHESIS — WHAT TO BORROW

Create a matrix like:

| NN Surface | Primary Reference | Secondary Reference | Pattern to Learn |
|---|---|---|---|
| Homepage | Onyx | StoryMaps | immersive entry + clear pathways |
| Product/Lot | Onyx | Coffee Collective | commerce + transparency |
| Project Story | StoryMaps | Patagonia-style field storytelling | scroll narrative + place |
| Traceability | Cropster | StoryMaps | rigorous lineage + understandable journey |
| Sensory | Cropster | OWID | focused capture + analytical results |
| Research | OWID | Stripe | evidence + filters + drilldown |
| Environmental Map | GFW | NASA Worldview | layers + time |
| Biodiversity | iNaturalist | GFW | map/list observations |
| Experience Booking | Airbnb Experiences | StoryMaps | conversion + narrative |
| Operator | Linear | Cropster | speed + domain rigor |
| Analytics | Stripe | OWID | hierarchy + explanation |
| Marketing | Publer | Linear | workflow + performance |
| Ask Néctar | NN-specific | Linear interaction principles | contextual command layer |

Do not assume this exact mapping is final. Review it against the repository.

---

# 13. HOMEPAGE — RECOMMENDED CONCEPT TO EVALUATE

The homepage should not attempt to explain every module.

It should establish:

```text
WHAT IS NÉCTAR NÓMADA?
↓
WHAT CAN I DISCOVER / DO?
↓
WHY SHOULD I CARE?
↓
WHERE CAN I ENTER?
```

Potential opening experience:

```text
FULL-BLEED REAL FIELD MEDIA
NÉCTAR NÓMADA

Explore the living systems behind
coffee, fermentation, honey, place and flavor.

[Explore Projects] [Shop] [Experiences]
```

This is illustrative copy only, not approved brand copy.

Then potentially:

```text
CURRENTLY IN THE FIELD
```

with live/recent project cards.

Then:

```text
EXPLORE BY JOURNEY

Coffee
Honey / Apiaries
Fermentation
Beverages
Gastronomy
Places
People
Research
```

Then:

```text
FROM FIELD TO EXPERIENCE
```

showing the system graphically.

Then selected:

- projects;
- products;
- experiences;
- stories;
- research observations.

The homepage should feel alive rather than like a static corporate brochure.

---

# 14. MULTIPLE ENTRY PATHS

A visitor may arrive wanting very different things.

Design clear paths for:

```text
I WANT TO EXPLORE
I WANT TO BUY
I WANT TO VISIT / EXPERIENCE
I WANT TO LEARN
I WANT TO WORK WITH NÉCTAR NÓMADA
I AM A PARTNER / OPERATOR
```

Do not expose internal module names such as "Research OS" to casual public users unless context requires it.

---

# 15. PUBLIC PROJECT PAGE

Potential architecture:

```text
Project Hero
↓
Place
↓
People
↓
Question / Objective
↓
Timeline
↓
Process
↓
Media
↓
Measurements / observations
↓
Results
↓
What remains unknown
↓
Products / Experiences / Related stories
```

Adapt density to audience.

---

# 16. PLACE / FARM PAGE

Potential:

```text
Map + Hero
↓
Place identity
↓
People
↓
Environment
↓
Current projects
↓
Lots / harvests
↓
Biodiversity
↓
Weather/environment context
↓
Stories
↓
Products / experiences
```

A farm should feel like a living place, not a database record.

---

# 17. LOT / TRACEABILITY PUBLIC EXPERIENCE

Study the tension between Cropster rigor and StoryMaps readability.

Potential:

```text
LOT IDENTITY
↓
ORIGIN MAP
↓
PRODUCER
↓
HARVEST
↓
PROCESS JOURNEY
↓
FERMENTATION
↓
DRYING
↓
STORAGE
↓
ROAST
↓
SENSORY
↓
DATA / EVIDENCE
```

Provide progressive disclosure:

```text
STORY VIEW
TECHNICAL VIEW
DATA VIEW
```

These can share the same canonical data.

---

# 18. SENSORY INTERFACE

Separate:

## SESSION SETUP

technical/operator interface.

## ACTIVE EVALUATION

minimal distraction.

## RESULTS

analytical/exploratory.

## PUBLIC RESULT

simplified communication.

Do not force one screen to do all four jobs.

Blind evaluation should suppress contextual identity.

---

# 19. FERMENTATION INTERFACE

Potential active-run screen:

```text
Run status
Elapsed time
Current measurements
Trend chart
Vessel
Input lot
Protocol
Interventions
Observations
Alerts
Samples
Timeline
```

Mobile quick action:

```text
+ Measurement
+ Observation
+ Intervention
+ Sample
```

Prioritize logging speed.

---

# 20. DRYING / STORAGE

Use visual status where helpful.

Potential:

```text
ACTIVE DRYING LOTS
bed/location
days drying
latest moisture
latest aw
ambient context
last turn
next action
```

Do not imitate kanban if timeline/location representation is more useful.

---

# 21. RESEARCH INTERFACE

Use evidence-first patterns.

Potential:

```text
Research question
Status
Treatments
Samples
Protocol
Measurements
Sensory
Analysis
Evidence
Claims
Limitations
Media
Timeline
```

Allow deep drill-down without making the first screen unreadable.

---

# 22. DATA VISUALIZATION PRINCIPLES

Borrow from OWID and analytical interfaces.

Every visualization should identify:

1. question;
2. metric;
3. unit;
4. time/context;
5. source;
6. uncertainty where relevant.

Support:

- hover;
- zoom where useful;
- compare;
- filter;
- download/export where authorized;
- inspect underlying observations.

Do not use decorative charts.

---

# 23. MAP DESIGN PRINCIPLES

Borrow selectively from StoryMaps, GFW, NASA Worldview and iNaturalist.

Potential modes:

```text
STORY MAP
FIELD MAP
ANALYTICAL MAP
OBSERVATION MAP
EXPEDITION MAP
```

Do not create one giant universal map interface.

---

# 24. CONTENT / MEDIA INTERFACE

Potential views:

```text
Media Library
Project Coverage
Story Coverage
Missing Assets
Rights
People
Places
Timeline
Content Opportunities
```

Media search should connect assets to canonical entities.

---

# 25. MARKETING INTERFACE

Néctar Nómada marketing should not merely replicate Publer.

Potential:

```text
Campaign
Objective
Project Activity
Audience
Creative Brief
Assets
Content Variants
Approval
Publication Status
Social Performance
Traffic
Sales / Bookings / Leads
Community Questions
Learning
```

Publer handles social execution.

NN handles meaning and business context.

---

# 26. CONSULTING INTERFACE

Potential:

```text
Client
Objective
Project
Field Visits
Data
Findings
Recommendations
Deliverables
Open Actions
Reports
```

This should reuse canonical project/research/measurement/reporting infrastructure.

---

# 27. ASK NÉCTAR

Ask Néctar should not be a floating chatbot disconnected from context.

Possible contextual surfaces:

```text
Lot page:
"Ask about this lot"

Research:
"Analyze this experiment"

Media:
"Find footage for this story"

Operator:
"What needs attention?"

Marketing:
"What is worth communicating?"

Sensory:
"Compare these results"
```

The current object/page should become part of AI context subject to permissions.

---

# 28. RESPONSIVE STRATEGY

Do not treat mobile as desktop squeezed smaller.

Mobile priorities:

FIELD:
capture

SENSORY:
evaluate

EXPERIENCE:
discover/book

COMMERCE:
browse/buy

PUBLIC STORY:
consume

Desktop priorities:

RESEARCH:
analyze

OPERATOR:
coordinate

MARKETING:
manage

REPORTING:
compare

---

# 29. VISUAL LANGUAGE DIRECTION

Do not infer the final visual identity solely from SaaS references.

Néctar Nómada should combine:

```text
NATURAL / FIELD
+
EDITORIAL
+
SCIENTIFIC
+
PREMIUM CRAFT
+
DIGITAL PRECISION
```

Avoid:

- generic green sustainability SaaS;
- generic beige coffee shop;
- black luxury template;
- generic purple AI startup;
- enterprise-blue dashboard;
- excessive glassmorphism;
- every section in cards;
- gratuitous gradients;
- dashboard aesthetics on public storytelling pages.

---

# 30. ORIGINAL MEDIA

Real Néctar Nómada photography/video should dominate public storytelling.

Design should create space for:

- landscape;
- macro details;
- people;
- process;
- tools;
- fermentation;
- coffee;
- bees;
- ingredients;
- maps;
- scientific observations.

Do not bury strong original media inside small cards.

---

# 31. MOTION

Motion should communicate:

- journey;
- transformation;
- geography;
- time;
- data change;
- lineage.

Examples:

- map transition;
- lot journey progression;
- fermentation timeline;
- image reveal;
- scroll-triggered process stages.

Avoid motion purely as decoration.

Respect reduced-motion accessibility.

---

# 32. DESIGN SYSTEM

Claude should evaluate whether current design tokens can support multiple density modes.

Potential tokens:

```text
public spacious
editorial medium
operator compact
sensory focused
analytics dense
```

One component system can have density variants without becoming different brands.

---

# 33. COMPONENT FAMILIES TO EVALUATE

```text
HeroMedia
StorySection
EntityCard
ProjectCard
ProductCard
ExperienceCard
PersonCard
PlaceCard
MapPanel
Timeline
LineageGraph
MeasurementChart
MetricCard
ObservationCard
MediaGallery
EvidencePanel
SourceBadge
SensoryRadar/appropriate sensory visualization
DataTable
FilterBar
CommandBar
QuickCapture
StatusChip
ApprovalState
AskNectarContext
```

Do not create components until architecture is approved.

---

# 34. NAVIGATION

Evaluate two related navigation systems:

## PUBLIC

```text
Explore
Projects
Experiences
Shop
Stories
About
```

Illustrative only.

## AUTHENTICATED WORKSPACE

```text
Home / Operations
Projects
Lots
Sensory
Research
Media
Experiences
Commerce
Marketing
Reports
```

Actual labels must be derived from implemented modules.

Avoid exposing everything to every role.

---

# 35. ROLE-ADAPTIVE INTERFACE

Navigation should adapt to authorization.

Example:

Farm operator:
- assigned projects;
- lots;
- measurements;
- tasks.

Researcher:
- research;
- experiments;
- samples;
- sensory;
- analysis.

Marketing:
- campaigns;
- media;
- content;
- performance.

Customer:
- purchases;
- bookings;
- saved interests.

Do not merely hide links client-side; RBAC remains server-side.

---

# 36. DESIGN REFERENCE SCORECARD

For each reference, score 1–5 on:

```text
Public storytelling
Commerce
Traceability
Operational UX
Research/data
Maps
Sensory
Tourism
Mobile
Information hierarchy
Visual distinctiveness
Accessibility
Applicability to NN
```

Explain the scores.

---

# 37. PATTERN EXTRACTION

For every reference, document:

```text
Reference
Specific page/interface
What works
Why it works
NN use case
What NOT to copy
Technical implication
Mobile implication
Accessibility implication
Priority
```

---

# 38. REQUIRED REFERENCE MATRIX

Include at minimum:

1. Onyx Coffee Lab
2. Coffee Collective
3. Cropster
4. ArcGIS StoryMaps
5. Our World in Data
6. Global Forest Watch
7. NASA Worldview
8. iNaturalist
9. Airbnb Experiences
10. Linear
11. Stripe Dashboard/reporting
12. Publer

Claude may add other references only if they solve a clear NN interface problem.

Do not add sites merely because they are visually fashionable.

---

# 39. ADDITIONAL REFERENCES CLAUDE SHOULD RESEARCH

Claude should search for 5–10 additional CURRENT references specifically for gaps in this list.

Look for:

- world-class field science interfaces;
- agricultural traceability;
- biodiversity visualization;
- sensory science;
- premium food/beverage commerce;
- museum/editorial interactive storytelling;
- scientific multimedia narratives;
- booking/experience interfaces;
- data-heavy mobile field tools.

For each additional reference:

- verify it is active;
- use official URL;
- state exact interface being referenced;
- explain why it adds something not already covered.

---

# 40. COPYRIGHT / DESIGN ETHICS

References are inspiration, not assets.

Do not:

- copy layouts pixel-for-pixel;
- copy proprietary illustrations;
- copy photography;
- copy brand colors;
- copy text;
- copy icons;
- reproduce proprietary interaction sequences without adaptation.

Extract design principles and interaction patterns.

---

# 41. REQUIRED PAGE-BY-PAGE DIRECTION

Create recommendations for:

1. Public Homepage
2. Explore / Discovery
3. Project Detail
4. Place / Farm Detail
5. Person / Producer Detail
6. Product Detail
7. Experience Detail
8. Booking Flow
9. Lot / Traceability Detail
10. Operator Home
11. Active Operations
12. Fermentation Run
13. Drying / Storage
14. Sensory Session Setup
15. Active Sensory Evaluation
16. Sensory Results
17. Research Project
18. Data / Analytics
19. Environmental Map
20. Biodiversity Observations
21. Media Library
22. Story Builder / Story View
23. Marketing Campaign
24. Community / Social Intelligence
25. Consulting Workspace
26. Reports
27. Ask Néctar contextual interface

For each specify:

```text
Primary user
Primary job
Information hierarchy
Primary CTA/action
Secondary actions
Reference patterns
Density
Mobile behavior
Data dependencies
AI opportunity
Risks
```

---

# 42. HOMEPAGE WIREFRAME

Produce a conceptual homepage wireframe in Markdown/ASCII.

Do NOT write final marketing copy.

Show:

- navigation;
- hero;
- current activity;
- discovery paths;
- featured project;
- featured product/experience;
- map/place component;
- story/research component;
- community/CTA;
- footer.

Explain why each block exists.

---

# 43. AUTHENTICATED APP SHELL WIREFRAME

Produce conceptual desktop + mobile app shell.

Desktop should consider:

```text
sidebar / contextual navigation
top context
main workspace
optional inspector / Ask Néctar
```

Mobile should consider:

```text
bottom/high-priority navigation
quick capture
contextual actions
```

Do not assume a permanent right AI panel is correct; evaluate it.

---

# 44. TRACEABILITY WIREFRAME

Produce a conceptual traceability experience showing:

```text
Origin
↓
Lot genealogy
↓
Processing
↓
Measurements
↓
Samples
↓
Sensory
```

Show both:

PUBLIC STORY MODE

and:

TECHNICAL MODE.

---

# 45. SENSORY WIREFRAME

Produce:

1. setup;
2. blind evaluation;
3. results.

Blind mode must not leak sample identity/context.

---

# 46. MAP WIREFRAME

Produce:

1. public story map;
2. expert environmental map;
3. mobile field map.

They should not be the same UI.

---

# 47. DESIGN PRIORITY

Classify surfaces:

```text
PHASE 1
PHASE 2
PHASE 3
LATER
EXPERIMENTAL
```

Align with `PHASE_1_TECHNICAL_EXECUTION_PLAN.md`.

Do not let visual exploration expand Phase 1 scope.

---

# 48. PROTOTYPE RECOMMENDATION

Recommend which 3–5 screens should be prototyped first to establish the design language.

Strong candidates:

- Homepage;
- Lot Detail / Traceability;
- Active Fermentation / Operator;
- Sensory Evaluation;
- Project Story or Experience Detail.

Choose based on current repository state.

---

# 49. DESIGN TOKENS / THEMING

Audit existing tokens before proposing new ones.

Recommend semantic tokens, not one-off values.

Consider:

- surface;
- text;
- border;
- accent;
- data visualization;
- status;
- evidence;
- warning;
- measurement quality;
- research status.

Do not overload brand colors with operational semantics.

---

# 50. ACCESSIBILITY

Include:

- WCAG-oriented contrast;
- keyboard operation;
- focus states;
- reduced motion;
- chart alternatives;
- captions/subtitles;
- map alternatives;
- touch targets;
- non-color status cues;
- screen-reader labels.

Sensory and field workflows require especially clear interaction.

---

# 51. PERFORMANCE

Public immersive experiences must remain fast.

Plan:

- responsive media;
- lazy loading;
- image/video derivatives;
- map lazy initialization;
- chart code splitting;
- reduced-motion fallback;
- progressive enhancement.

Do not make the homepage dependent on loading every interactive system.

---

# 52. FINAL DELIVERABLE

Create:

`/docs/design/WEB_EXPERIENCE_REFERENCE_ARCHITECTURE.md`

with:

1. Executive Summary
2. Current UI Audit
3. Néctar Nómada Experience Modes
4. Design Principles
5. Reference Research
6. Reference Scorecard
7. Pattern Extraction Matrix
8. Public Experience Direction
9. Homepage Direction
10. Discovery
11. Projects
12. Places/Farms
13. People
14. Products
15. Experiences/Booking
16. Traceability
17. Operator UX
18. Fermentation
19. Drying/Storage
20. Sensory
21. Research
22. Analytics
23. Maps
24. Biodiversity
25. Media/Storytelling
26. Marketing/Community
27. Consulting
28. Ask Néctar
29. Navigation
30. Responsive Strategy
31. Design System Implications
32. Accessibility
33. Performance
34. Wireframes
35. Prototype Recommendation
36. Phase Priorities
37. Risks
38. Decisions Requiring Product-Owner Approval

---

# 53. IMPORTANT CONSTRAINTS

During this phase:

DO NOT:

- redesign production pages;
- change production CSS;
- install UI libraries;
- replace the design system;
- create migrations;
- alter navigation;
- implement maps;
- implement charts;
- implement animation;
- integrate third-party services;
- copy reference-site code/assets;
- modify production components.

Research, audit and design direction only.

---

# 54. FINAL RESPONSE TO PRODUCT OWNER

After creating the document, report:

1. the 5 most useful reference sites overall;
2. the best reference for the public homepage;
3. the best reference for traceability;
4. the best reference for operator tools;
5. the best reference for sensory;
6. the best reference for maps/data;
7. the best reference for experiences/booking;
8. the 3–5 screens you recommend prototyping first;
9. any conflicts with the current UI;
10. decisions requiring approval.
11. Confirm whether real web verification was actually available and used
    for the reference research, or whether findings rely on prior
    knowledge without live verification — name which references (if any)
    couldn't be actively confirmed.

Then stop.

Do not implement the redesign until approved.
