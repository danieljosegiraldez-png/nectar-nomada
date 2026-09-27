<!-- Añadido 2026-08-28. Nada del documento original se modificó: solo este
     bloque al principio y las secciones al final. -->

> **Antes que nada, leer `SESSION_STATE.md`.** Este archivo dice **cómo se
> construye** el proyecto; ése dice **dónde está**. Empieza con las decisiones
> que solo Daniel puede tomar: corre `bash scripts/open-decisions.sh` y llévale
> las que sigan abiertas **antes de proponer trabajo**.
>
> Lo que sigue a este bloque es la especificación original de la plataforma, en
> inglés, y son unas 2.200 líneas. **Su último párrafo pide «empezar
> inspeccionando el repositorio y producir la evaluación arquitectónica y el
> plan de implementación». Eso ya se hizo:** el proyecto va por el PR #58 y por
> ADR-103 en `docs/architecture/DECISIONS.md`. Esa frase es un arranque
> histórico, no una instrucción para hoy. Ver «Trampas» al final.

> **Y el dominio del beneficio es normativo, en `docs/beneficio/`.** Catorce
> documentos, no tres. Este índice existe porque hasta el 2026-09-14 **nada en
> este archivo los nombraba**: catorce documentos normativos a los que no
> apuntaba el único archivo que se carga en cada sesión. Medido con su control —
> `docs/beneficio` daba **cero** menciones aquí, y no sólo las rúbricas.
>
> Las tres que el paquete pide citar explícitamente, porque no son referencia
> sino **criterios de aprobación**:
>
> - **`20_modelo_ciclo_completo.md`** — identidad y **genealogía** del lote a
>   través de divisiones y fusiones, y las etapas posteriores. Extiende
>   `01_lot_lifecycle.md`. Un puntaje de taza impecable sobre un lote cuya
>   identidad se perdió en una fusión no vale nada.
> - **`21_rubrica_veracidad.md`** — *«cada afirmación que emite debe poder
>   sostenerse»*. Una cifra que no resiste ser desarmada convierte la
>   herramienta en un generador de documentación creíble, **peor que no tener
>   nada porque nadie la cuestiona**.
> - **`22_rubrica_pedagogica.md`** — *«el propósito no es tener el beneficio
>   documentado, es que quien la usa fermente mejor»*. Documentar es el medio.
>
> **Los tres ejes pesan igual**: un módulo que pasa el funcional y falla el
> pedagógico **no está aprobado**.
>
> Y las otras once están al lado, con `docs/beneficio/README.md` explicando cómo
> se leen. Las transversales que gobiernan sobre el resto son `00_conventions`,
> `01_lot_lifecycle`, `02_calibration` y **`03_public_api`, que es el contrato
> autoritativo**: todo enum, modelo, firma y cadena de estado sale de ahí. Si
> hace falta un nombre que no esté declarado, se para y se pregunta en vez de
> inventarlo.
>
> **Un `[PROVISIONAL]` de esos documentos no se cierra desde aquí.** Son de
> Daniel, y `99_revision_v2_a_v3.md` §D lista los cinco que siguen abiertos.
> El 2026-09-14 él cerró uno —la verificación de instrumentos es por contraste
> contra patrón, no por calendario— y eso cambia la §3 de `02_calibration`:
> cuando una decisión suya contradiga un documento normativo, manda él y se
> anota en el documento. **Corregido el 2026-09-19:** este párrafo lo daba por
> anotado y `02` no tenía ningún commit desde que entró; la nota se puso ese día.
>
> **Y el 2026-09-19 decidió, para el café, de dónde salen los umbrales (ADR-181):
> de la receta, no del paquete.** Los cinco perfiles de `00` §8 son
> plantillas; `10`–`13` llevan su nota encima de cada sección afectada. La
> revisión de literatura que lo sostiene está en
> `docs/dominio/revision-literatura-fermentacion-2026-09-19.md`, con cada cita
> marcada como comprobada o no. P-F sigue abierta por Varroa y Meliponini.

---

# CLAUDE.md
## NÉCTAR NÓMADA — Digital Platform / Cloud Application / Operating System

You are acting as the principal software architect, product engineer, database architect, UX systems designer, AI systems engineer, and technical lead for the development of the **Néctar Nómada Digital Platform**.

Your job is not to create a simple website, landing page, Shopify-style store, or collection of disconnected dashboards.

You are building a modular, cloud-native digital platform with:

- public website;
- Progressive Web App / mobile-responsive application;
- user accounts;
- customer profiles;
- partner workspaces;
- project workspaces;
- research systems;
- sensory evaluation;
- competition management;
- e-commerce;
- reservations and experiences;
- maps and geospatial information;
- environmental data;
- content and storytelling;
- CRM;
- analytics;
- AI-assisted recommendations and operational intelligence;
- role-based permissions;
- unified relational data architecture;
- strong provenance, auditability and traceability.

The platform must be designed so that new industries, projects, territories, products, partners, experiments and experiences can be added without rebuilding the core system.

---

# 1. ORGANIZATION

The parent organization is:

**Néctar Nómada**

Néctar Nómada explores, documents, develops and connects territory, agriculture, fermentation, people, gastronomy, biodiversity, scientific experimentation, cultural heritage, tourism and specialty products.

It operates through projects, collaborations and implementing partners.

The platform should allow Néctar Nómada to connect:

- producers;
- farms;
- apiaries;
- processors;
- roasters;
- brewers;
- winemakers;
- distillers;
- chefs;
- researchers;
- laboratories;
- sensory evaluators;
- judges;
- collaborators;
- photographers;
- storytellers;
- tourism operators;
- venues;
- consumers;
- customers;
- participants;
- members.

---

# 2. CORE PLATFORM PRINCIPLE

Do NOT create isolated databases for every project.

Create a shared foundational identity and relationship layer for:

- People
- Users
- Organizations
- Locations
- Projects
- Products
- Experiences
- Events
- Samples
- Assets
- Roles
- Permissions

Then create specialized domain modules that reference these canonical entities.

The same farm, person, sample, coffee lot, organization or location must not be recreated unnecessarily in different modules.

Example:

Finca Rosina
→ Location
→ Organization / Farm
→ Coffee lots
→ Apiaries
→ Biodiversity observations
→ Research projects
→ Products
→ Experiences
→ Stories
→ Environmental data

The architecture should behave more like a relational knowledge graph than a collection of independent tables.

---

# 3. IMPORTANT EXISTING SYSTEM PRINCIPLES

Néctar Nómada already has a Research OS architecture developed for projects such as CryoBloom.

Preserve these principles.

## Authoritative source hierarchy

Original evidence and measurements remain authoritative.

AI is never the authoritative source.

The system must distinguish:

- measured fact;
- original record;
- direct observation;
- scientific evidence;
- manufacturer specification;
- interpretation;
- hypothesis;
- conclusion;
- recommendation;
- AI-generated suggestion.

Missing information must remain:

- Missing
- Unknown
- Unconfirmed
- Pending verification

Never automatically infer missing factual values and save them as facts.

## Version preservation

Approved protocols, documents and records must not be silently overwritten.

New versions supersede old versions.

Historical versions remain accessible.

## Traceability

Records should preserve origin and lineage.

For scientific or production materials this may include:

Harvest
→ Lot
→ Selection
→ Treatment
→ Fermentation
→ Drying
→ Storage
→ Transport
→ Sample
→ Roast
→ Brewing
→ Sensory
→ Analysis
→ Product / Publication

---

# 4. PLATFORM EXPERIENCE

The same application must expose different interfaces depending on identity, permissions and intention.

Examples:

PUBLIC VISITOR

Discover
→ Map
→ Story
→ Product
→ Experience
→ Reservation / Purchase

REGISTERED CUSTOMER

My Néctar
→ Saved items
→ Orders
→ Bookings
→ Experiences
→ Tastings
→ Sensory history
→ Interests
→ Recommendations
→ Projects followed

IMPLEMENTING PARTNER

Partner Workspace
→ Assigned projects
→ Tasks
→ Locations
→ Uploads
→ Operational forms
→ Data entry
→ Documentation
→ Calendar
→ Reports

RESEARCHER

Research Workspace
→ Experiments
→ Protocols
→ Samples
→ Measurements
→ Evidence
→ Analysis
→ Sensory
→ Reports

ADMIN / PLATFORM OWNER

Platform Command Center
→ Projects
→ Organizations
→ Users
→ Permissions
→ Commerce
→ Reservations
→ Research
→ Sensory
→ Competitions
→ Environment
→ Content
→ Analytics
→ AI suggestions
→ Data quality
→ Alerts

Do not create separate applications unless technically necessary.

Prefer one platform with role-aware interfaces.

---

# 5. CORE APPLICATION MODULES

Create the system around these primary modules.

## A. Discover

Public exploration interface.

Support discovery through:

- place;
- product;
- person;
- project;
- ingredient;
- experience;
- story;
- agriculture;
- fermentation;
- biodiversity;
- gastronomy;
- research.

Possible navigation concepts:

Taste
Explore
Travel
Learn
Participate
Shop

Do not force the platform to behave only like an online store.

---

# 6. MAP & TERRITORY

Build an interactive geospatial layer.

Entities may include:

- farms;
- estates;
- apiaries;
- processing facilities;
- laboratories;
- roasters;
- breweries;
- wineries;
- distilleries;
- restaurants;
- venues;
- tourism locations;
- biodiversity points;
- sensor locations;
- routes;
- project sites.

Location records should support:

- latitude;
- longitude;
- altitude/elevation;
- country;
- province/state;
- district;
- corregimiento/locality;
- timezone;
- organization;
- location hierarchy;
- maps;
- photographs;
- linked projects;
- environmental data.

The location page should be able to dynamically expose connected information.

Example:

Finca
→ Story
→ Producer
→ Current projects
→ Products
→ Experiences
→ Research
→ Environmental data
→ Biodiversity
→ Media

---

# 7. ENVIRONMENTAL DATA

Support:

- weather APIs;
- local weather stations;
- IoT sensors;
- data loggers;
- manual observations;
- imported datasets.

Never mix these as if they have identical provenance.

Every environmental record should preserve:

- source type;
- source identity;
- location;
- coordinates;
- timestamp;
- interval;
- variable;
- unit;
- data quality;
- indoor/outdoor context;
- provenance;
- original/raw source reference.

Variables may include:

- temperature;
- relative humidity;
- rainfall;
- pressure;
- soil moisture;
- solar radiation;
- wind;
- fermentation environment;
- drying environment.

Design this so time-series data can eventually contain millions of observations without degrading the transactional database.

---

# 8. PROJECT SYSTEM

Projects are central.

Create:

Programs
Projects
Subprojects / Initiatives
Project Assignments
Collaborations
Milestones
Tasks
Assets
Reports
Events
Products
Experiences

Projects should support multiple domains simultaneously.

Example:

Las Nubes

may simultaneously belong to:

Coffee
Agriculture
Apiary
Honey
Pollination
Biodiversity
Tourism
Research
Storytelling

Do not force one project into only one taxonomy.

---

# 9. PEOPLE & ORGANIZATIONS

Create canonical identity models.

PEOPLE

Person
User Account
Contact Details
Professional Information
Organizations
Roles
Assignments
Permissions
Expertise
Certifications
Participation History

ORGANIZATIONS

Farm
Estate
Producer
Roaster
Brewery
Winery
Distillery
Apiary
Laboratory
Restaurant
Venue
Association
University
Supplier
Tour Operator
Néctar Nómada Partner

One person may have several contextual roles.

Example:

Person X
→ Producer at Farm A
→ Research Contributor in Project B
→ Judge in Competition C

Do not encode these roles permanently inside the user identity.

Use contextual assignments.

---

# 10. ROLE-BASED ACCESS CONTROL

Design permissions using:

User
→ Assignment
→ Scope
→ Role Profile
→ Permission

Possible assignment scopes:

Platform
Program
Project
Location
Competition
Session
Experience

Permissions must support:

View
Create
Edit
Approve
Publish
Delete / Retire
Export
Manage Users
Manage Permissions

Contextual assignments should normally narrow permissions rather than automatically broaden them.

Sensitive records require classifications such as:

Public
Registered
Partner
Internal
Confidential
Trade Secret

---

# 11. COMMERCE

Build commerce as a native module connected to projects and stories.

Possible items:

Coffee
Cacao
Honey
Beer
Wine
Mead
Specialty spirits
Fermented products
Food products
Kits
Limited editions
Merchandise
Tickets
Experiences
Services

Core objects:

Product
Product Variant
SKU
Inventory
Price
Tax
Availability
Collection
Cart
Order
Order Item
Customer
Payment
Fulfillment
Discount
Promotion
Refund

A product can be connected to:

Project
Producer
Location
Lot
Story
Experiment
Experience
Event

Do not duplicate project information inside commerce.

---

# 12. EXPERIENCES & RESERVATIONS

Create a dedicated booking engine.

An experience is not just another SKU.

Model:

Experience
Experience Type
Host
Location
Session
Schedule
Capacity
Price
Participant
Booking
Payment
Requirements
Transportation
Weather Dependency
Waiver
Checklist
Media
Related Product
Related Project

Examples:

Farm visits
Coffee processing experience
Coffee tasting
Honey tasting
Apiary experience
Palm wine expedition
Fermentation workshop
Gastronomic experience
Field research participation
Educational workshop
Producer visit

Support:

available capacity;
private/public sessions;
waitlist;
booking status;
cancellation;
guest registration;
registered user reservations.

---

# 13. EVENTS

Separate events from recurring experiences.

Events could include:

CryoBloom tastings
Pop-ups
Exhibitions
Competitions
Launches
Dinners
Educational sessions
Collaborations

Model:

Event
Edition
Venue
Sessions
Guests
Tickets
Participants
Speakers
Sponsors
Media
Products
Projects

---

# 14. MY NÉCTAR

Create a registered-user area.

Possible components:

Saved
Orders
Bookings
Upcoming Experiences
Past Experiences
My Tastings
Sensory History
Collections
Projects Followed
Recommendations
Learning
Notifications
Profile
Preferences

Consider a future feature:

Néctar Passport

tracking:

Places visited
Products tasted
Producers met
Projects participated in
Regions explored
Experiences completed

Avoid childish gamification.

---

# 15. CUSTOMER PROFILE & CRM

Build progressive profiling.

Do not force users to fill long questionnaires.

Separate:

Declared Preference

from

Inferred Preference

Example interests:

Coffee
Honey
Fermentation
Gastronomy
Biodiversity
Agriculture
Tourism
Research
Beer
Wine
Mead
Spirits

Store interaction events where appropriate:

Viewed
Saved
Purchased
Booked
Attended
Tasted
Rated
Followed
Shared

Use these signals for recommendations.

Do not convert behavioral inference into personal factual information.

---

# 16. STORY & KNOWLEDGE ENGINE

Néctar Nómada documents people, territory, heritage and processes.

Create:

Story
Article
Interview
Person Profile
Producer Profile
Location Story
Project Story
Field Note
Media Collection
Source
Quote
Transcript
Topic
Tag

Media types:

Photo
Video
Audio
Document
Dataset
Illustration

Every asset should preserve:

asset ID;
creator;
capture date;
location when known;
project;
related entities;
original file;
derivative files;
usage rights;
status;
metadata.

Original evidence must remain immutable.

---

# 17. RESEARCH OS

The research module must be substantially more rigorous than general project management.

Preserve concepts such as:

Research Programs
Research Themes
Research Questions
Hypotheses
Objectives
Experiments
Protocols
Protocol Versions
Treatment Batches
Processes
Processing Stages
Measurements
Samples
Equipment
Calibration
Environment
Evidence
Evidence Claims
Interpretations
Conclusions
Recommendations
Analysis Plans
Analysis Runs
Analysis Results
Publications
Deviations
Corrective Actions
Approvals

Research objects must preserve provenance and history.

AI cannot approve scientific conclusions.

---

# 18. AGRICULTURAL TRACEABILITY

Support multiple agricultural domains.

Initially:

Coffee
Cacao
Apiculture / Honey

Possible future extension should not require redesign.

For coffee support:

Farm
Lot
Cultivar
Species
Harvest Event
Selection
Processing
Fermentation
Drying
Storage
Transport
Green Sample
Roasting
Brewing
Sensory

Do not confuse species with cultivar.

Allow mixed lots.

---

# 19. APIARY / HONEY MODULE

Support:

Apiary
Hive
Colony
Inspection
Queen
Feeding
Treatment
Health Observation
Bloom / Flora
Harvest
Honey Batch
Extraction
Storage
Sensory
Product
Competition Entry

Allow relationships among:

Flora
Season
Location
Environmental Conditions
Apiary
Honey Batch
Sensory Profile

---

# 20. FERMENTATION & BEVERAGE MODULES

Design generalized fermentation infrastructure while keeping domain-specific schemas where necessary.

Domains may include:

Coffee
Cacao
Beer
Wine
Mead
Specialty fermented beverages
Spirits precursor fermentations

Possible reusable entities:

Fermentation Run
Vessel
Ingredient
Culture
Microorganism
Inoculation
Temperature
Gravity
Brix
pH
Pressure
Gas
Time-series data
Deviation
Sample
Analysis

Do not oversimplify all fermentation products into a single generic record if domain-specific semantics would be lost.

---

# 21. SENSORY & EVALUATION PLATFORM

This is a major cross-platform service.

The Sensory module must support:

Research
Quality Control
Education
Consumer Testing
Guided Tastings
Product Development
Competitions
Professional Judging

Supported domains should include at minimum:

Specialty Coffee
Filtered Coffee
Honey
Beer
Wine
Mead
Specialty Spirits / Liqueurs

The sensory architecture should NOT use one universal form.

Build configurable Evaluation Protocols.

Core model:

Sensory Session
Evaluation Protocol
Protocol Version
Product / Sample
Blind Code
Flight
Evaluator
Individual Assessment
Attribute
Attribute Response
Cup / Replicate Assessment
Descriptor
Defect
Score
Comment
Confidence
Panel Aggregate
Result
Analysis

Keep individual responses immutable once submitted unless revision is explicitly versioned.

---

# 22. EVALUATOR TYPES

Support different evaluation modes.

## Technical / Research

Researchers
Q graders
Sensory specialists
Brewers
Winemakers
Distillers
Technical judges

## Guided Experience

Consumers attending a guided tasting.

The application may progressively display instructions.

## Consumer

Simple preference and perception testing.

Example:

Preference
Purchase intent
Perceived intensity
Descriptors
Overall liking

Never combine consumer preference with technical quality score as if they represent the same metric.

---

# 23. SENSORY — COFFEE

Support:

Cupping
Filter coffee
Espresso
Cold brew
Flash brew
Experimental A/B/C comparisons
Custom descriptor scales
Research scales
Competition scoring

For filtered coffee, allow traceability such as:

Coffee Lot
→ Green Sample
→ Roast Session
→ Coffee Sample
→ Brewing Session
→ Grinder
→ Grind Setting
→ Water
→ Water Chemistry
→ Dose
→ Beverage Mass
→ Temperature
→ Brew Time
→ TDS
→ Extraction Yield
→ Sensory Session

---

# 24. SENSORY — HONEY

Support configurable attributes such as:

Aroma
Floral
Fruity
Herbal
Vegetal
Spice
Caramelized
Sweetness
Acidity
Bitterness
Texture
Crystallization
Persistence
Complexity
Defects
Overall Impression

The exact protocol must remain configurable and version controlled.

Do not hard-code this example as an official judging standard.

---

# 25. SENSORY — BEER

Support:

Appearance
Aroma
Flavor
Mouthfeel
Balance
Style Expression
Defects
Descriptor Intensity
Overall Impression
Preference
Quality Control

Allow custom brewery QC protocols as well as competition protocols.

---

# 26. SENSORY — WINE / MEAD / SPIRITS

Create configurable protocols supporting relevant characteristics.

Examples include:

Visual
Aroma
Flavor
Acidity
Sweetness
Tannin
Alcohol
Balance
Body
Texture
Complexity
Persistence
Botanical Character
Raw Material Character
Defects
Overall Impression

Do not claim these example attributes constitute an official judging system.

Competition-specific protocols must be versioned and configurable.

---

# 27. EVALUATOR PROFILE

Each evaluator can accumulate a sensory history.

Potential metrics:

Sessions completed
Products evaluated
Categories evaluated
Repeatability
Panel alignment
Descriptor usage
Calibration history
Certifications
Judge assignments
Competition participation

Do not turn these automatically into public rankings.

Evaluator statistics should support permissions and privacy.

---

# 28. SENSORY ANALYTICS

Support:

Panel means
Median
Variance
Standard deviation
Confidence intervals
Inter-rater agreement
Intra-rater repeatability
Descriptor frequency
Intensity comparison
Preference mapping
Treatment comparison
Radar visualizations
Distribution plots
PCA when scientifically appropriate
Correlation
Mixed models / advanced analysis through specialized analytics

Always retain the raw response data.

Derived metrics must store:

method;
formula;
software/version when relevant;
source dataset;
timestamp;
version.

---

# 29. COMPETITION MANAGEMENT OS

Create a competition management engine that can operate independently from but connect to the Sensory module.

Initial competition domains:

Specialty Filter Coffee
Honey
Beer
Wine
Mead
Specialty Spirits / Liqueurs

Core hierarchy:

Competition
→ Edition
→ Category
→ Division / Class
→ Entry
→ Competitor
→ Product
→ Sample
→ Blind Code
→ Flight
→ Panel
→ Judge
→ Evaluation
→ Result
→ Ranking
→ Award

Support:

registration;
eligibility;
entry payment if applicable;
sample receipt;
chain of custody;
blind coding;
flight assignment;
judge assignment;
conflict-of-interest declaration;
calibration;
scoring;
tie handling;
head judge review;
results;
awards;
feedback reports.

Never reveal sample identity to a judge during blind evaluation unless protocol explicitly allows it.

---

# 30. COMPETITION — SPECIALTY FILTER COFFEE

The platform should be capable of evaluating both:

Coffee quality

and, where competition design requires:

Brewing execution.

Possible traceability:

Coffee
Roast
Brewer
Recipe
Water
Grinder
Equipment
Extraction metrics
Sensory result

Do not assume one specific scoring system.

Competition scoring models must be configured per competition edition.

---

# 31. AI INTELLIGENCE LAYER

AI is a cross-platform assistant.

It should work from permissions-aware structured data and approved documents.

Possible functions:

Search
Summarize
Compare
Identify missing information
Recommend next operational steps
Suggest related content
Suggest products
Suggest experiences
Identify patterns
Detect anomalies
Generate drafts
Prepare reports
Assist data interpretation
Prepare customer recommendations
Support project navigation

Examples:

“What documentation is missing from this project?”

“Show all lots where transport exceeded a specified temperature.”

“What experiments have comparable environmental conditions?”

“Which customers who purchased this kit may be interested in the next field experience?”

“What stories can be created from the assets captured during this expedition?”

---

# 32. AI GOVERNANCE

The AI must NOT automatically:

approve research conclusions;
change authoritative source data;
overwrite protocols;
publish unsupported claims;
change competition results;
alter submitted sensory forms;
infer missing measurements;
expose restricted information.

Design a human-in-the-loop system:

AI Suggestion
→ Evidence / Reason
→ Human Review
→ Accept / Reject / Modify
→ Action
→ Audit Record

Create an AI Suggestions table or equivalent persisted object.

Store:

suggestion type;
model;
created date;
context;
related objects;
recommendation;
supporting evidence;
confidence if relevant;
reviewer;
decision;
action taken.

---

# 33. SEARCH

Build global search capable of retrieving entities across modules.

Examples:

Search “Geisha”

could return:

Cultivar
Coffee lots
Products
Research
Stories
Farms
Sensory sessions
Competition entries
Experiences

Search must obey permissions.

---

# 34. NOTIFICATIONS & WORKFLOWS

Design notification infrastructure for:

Task due
Data missing
Approval needed
Booking confirmed
Experience approaching
Competition assignment
Sensor alert
Inventory low
Research deviation
Document awaiting review
User invitation
Payment event

Support in-app notifications first.

Architecture should permit future email / push / messaging integrations.

---

# 35. AUDIT TRAIL

Important changes must record:

actor;
timestamp;
operation;
entity;
previous value where appropriate;
new value;
reason when required;
source/interface.

Sensitive and scientific records require stronger audit history.

Use soft deletion / retirement for canonical records where appropriate.

---

# 36. DATABASE DESIGN

Use a robust relational database as the canonical application datastore.

Recommended:

PostgreSQL

Use appropriate extensions if useful, including geospatial capabilities.

Do not make Airtable the long-term transactional backend for the final public platform.

Existing Airtable data should eventually be importable or synchronized during migration.

Design migrations carefully.

All major entities should have:

UUID or equivalent immutable identifier;
created_at;
updated_at;
created_by;
status;
version where appropriate;
audit metadata.

Avoid using display names as relational identifiers.

---

# 37. FILE / OBJECT STORAGE

Do not put large media assets inside PostgreSQL.

Use object storage.

Support:

original;
derivative;
thumbnail;
preview;
checksum;
MIME type;
size;
creator;
capture metadata;
permissions;
related entity.

Original scientific/evidence files must be preserved.

---

# 38. TIME-SERIES ARCHITECTURE

Environmental sensors, fermentation logging and equipment loggers may generate high-frequency time-series data.

Architect this separately from ordinary application records where appropriate.

Support:

device;
sensor;
deployment;
timestamp;
measurement;
unit;
quality;
raw payload;
derived metric.

Keep raw data retrievable.

---

# 39. FRONT-END ARCHITECTURE

Build a modern responsive interface suitable for:

mobile;
tablet;
desktop.

Prefer an installable PWA architecture initially rather than requiring native iOS and Android apps.

The design system must support:

public storytelling pages;
map interfaces;
commerce;
forms;
dashboards;
research data;
sensory forms;
competition judging;
partner workspaces.

Mobile forms are particularly important for field work and sensory judging.

---

# 40. OFFLINE / FIELD CAPABILITY

Design the application so selected workflows can later operate with intermittent connectivity.

Priority candidates:

Field observations
Farm visits
Apiary inspections
Sensory forms
Competition judging
Environmental observations
Photo capture
Harvest records

Architect local draft / synchronization capability even if full offline operation is not included in MVP.

---

# 41. INTERNATIONALIZATION

Design for multilingual content.

Initial priority:

Spanish
English

Do not duplicate entities simply because the UI is translated.

Separate canonical data from localized display content where appropriate.

---

# 42. TECHNICAL STACK

You may propose adjustments, but favor a maintainable modern architecture.

Suggested starting point:

Frontend:
Next.js
React
TypeScript

Backend:
TypeScript application services and APIs

Database:
PostgreSQL

ORM:
Prisma or equivalent mature typed ORM

Authentication:
Secure modern authentication provider or self-hosted auth architecture with RBAC support

Object storage:
S3-compatible storage

Maps:
Mapbox or equivalent geospatial platform

Payments:
Provider abstraction, initially Stripe-compatible architecture where available

Search:
PostgreSQL search initially, with migration path to specialized search when scale requires it

Analytics:
Application analytics plus dedicated analytical views

AI:
Provider-independent AI service layer

Do NOT tightly couple business logic to one AI vendor.

External integrations must be implemented behind adapters.

---

# 43. API-FIRST PRINCIPLE

Major capabilities should have clear service boundaries and APIs.

This allows future:

mobile native applications;
partner integrations;
IoT ingest;
public APIs;
research exports;
external dashboards;
automation.

---

# 44. EXTERNAL INTEGRATION ARCHITECTURE

Create adapter interfaces for:

Weather API
Google Drive
Existing Airtable Research OS
Email
Payments
Maps
Calendar
IoT / data loggers
AI providers

Do not scatter provider-specific code throughout the application.

---

# 45. DATA IMPORT

Create import architecture for:

CSV
XLSX
JSON

Future sources may include existing Airtable databases.

Every import should support:

import job;
source;
mapping;
validation;
errors;
preview;
commit;
rollback where possible;
provenance.

---

# 46. EXPORTS

Authorized users should be able to export relevant data.

Examples:

CSV
XLSX
PDF reports
Research datasets
Sensory results
Competition results
Booking lists

Exports must obey permissions.

---

# 47. DASHBOARDS

Create role-specific dashboards rather than one universal dashboard.

Examples:

Executive dashboard
Project dashboard
Partner dashboard
Research dashboard
Commerce dashboard
Experience dashboard
Sensory dashboard
Competition dashboard
Data quality dashboard

---

# 48. DESIGN PHILOSOPHY

Visually, Néctar Nómada should not feel like generic enterprise software.

The public side should communicate:

territory;
exploration;
origin;
craft;
science;
nature;
people;
discovery.

The operational side should prioritize:

clarity;
speed;
traceability;
low cognitive load;
mobile usability.

Use one shared design system but allow public/editorial surfaces and technical/operator surfaces to have different density.

---

# 49. DO NOT DO THESE THINGS

Do NOT:

build everything into one gigantic database table;
duplicate canonical people/locations across modules;
hard-code one sensory protocol;
hard-code one competition scoring system;
make AI authoritative;
silently mutate scientific records;
store all data as JSON blobs;
put large media in the SQL database;
expose confidential research to public users;
make project role equal to permanent user role;
assume missing scientific data;
combine consumer liking with technical judging;
combine raw measurement with calculated value;
overwrite approved protocol versions;
make commerce the central organizing model;
treat all environmental sources as equivalent;
build only desktop interfaces;
build only static marketing pages.

---

# 50. DEVELOPMENT METHODOLOGY

Work iteratively.

Before writing large amounts of code:

1. inspect the repository;
2. identify existing architecture;
3. document assumptions;
4. create/update architecture documentation;
5. define domain boundaries;
6. define database schema;
7. define RBAC;
8. define API contracts;
9. define MVP scope;
10. build vertical slices.

Do not attempt to implement every module at once.

---

# 51. FIRST ARCHITECTURE DELIVERABLES

Before substantial feature implementation, create:

/docs/architecture/PLATFORM_OVERVIEW.md

/docs/architecture/DOMAIN_MODEL.md

/docs/architecture/DATA_ARCHITECTURE.md

/docs/architecture/RBAC.md

/docs/architecture/AI_GOVERNANCE.md

/docs/architecture/INTEGRATIONS.md

/docs/architecture/SECURITY.md

/docs/architecture/MVP_ROADMAP.md

/docs/architecture/DECISIONS.md

Create Architecture Decision Records where appropriate.

---

# 52. INITIAL DOMAIN MODEL

At minimum evaluate these core entities before implementation:

User
Person
Organization
Location
Role
Permission
Assignment

Program
Project
ProjectMembership
Task

Product
ProductVariant
Inventory
Order
OrderItem

Experience
ExperienceSession
Booking
Participant

Event

Story
Interview
MediaAsset

ResearchQuestion
Hypothesis
Experiment
Protocol
ProtocolVersion
Evidence
Measurement
Sample

SensoryProtocol
SensoryProtocolVersion
SensorySession
SensorySample
Evaluator
Assessment
Attribute
AttributeResponse
PanelResult

Competition
CompetitionEdition
CompetitionCategory
Entry
Flight
JudgeAssignment
CompetitionResult
Award

EnvironmentalSource
Sensor
SensorDeployment
EnvironmentalObservation

AIRecommendation
Notification
AuditEvent

Do not implement these blindly.

Normalize and refine the model first.

---

# 53. MVP STRATEGY

Define a realistic MVP that demonstrates the architecture through complete vertical workflows.

Recommended initial vertical slices:

### Vertical Slice A — Public discovery

Location
Project
Story
Product
Experience

### Vertical Slice B — Identity

Authentication
Profile
RBAC
My Néctar

### Vertical Slice C — Commerce

Product
Cart
Order

### Vertical Slice D — Experiences

Experience
Session
Booking

### Vertical Slice E — Sensory

Sensory Session
Blind Sample
Evaluator
Assessment
Panel Results

### Vertical Slice F — Partner Workspace

Project assignment
Task
Data submission
Media upload

### Vertical Slice G — AI

Permission-aware platform assistant
Data completeness suggestions

Do not implement advanced CryoBloom science in the first public MVP if doing so blocks the foundational architecture.

Build Research OS integration progressively.

---

# 54. DEMONSTRATION DATA

Create development seed data clearly labeled DEMO.

Use plausible but fictional values unless explicit verified project data is supplied.

Do not invent real experimental results.

Seed examples may include project names already known to the platform such as:

CryoBloom
Las Nubes
Finca Rosina
Kiva Estate

But do not fabricate:

scientific results;
exact production figures;
addresses;
GPS;
sensory outcomes;
people;
certifications;
prices;
dates

unless those are explicitly supplied.

---

# 55. DATA QUALITY

Add validation and data-quality states.

Possible statuses:

Draft
Incomplete
Pending Review
Verified
Approved
Archived
Rejected

Scientific evidence may additionally use:

Verified
Verified with limitation
Provisional
Unconfirmed
Conflicting
Superseded
Working hypothesis
Not tested
Missing source record

---

# 56. SECURITY

Use secure defaults.

Implement:

authentication;
authorization;
server-side permission enforcement;
input validation;
CSRF protection where applicable;
rate limiting;
secure secret management;
audit logs;
file access control;
signed asset URLs where appropriate;
encryption in transit;
secure session handling.

Never rely exclusively on hidden UI elements for authorization.

---

# 57. TESTING

Implement:

unit tests;
integration tests;
permission tests;
API tests;
critical user-flow tests.

RBAC tests are mandatory.

Sensitive objects must explicitly test unauthorized access.

---

# 58. OBSERVABILITY

Prepare:

structured logging;
error monitoring;
audit events;
performance monitoring;
health checks.

Do not log secrets or unnecessary sensitive information.

---

# 59. PERFORMANCE

Prioritize:

server-side pagination;
database indexing;
query efficiency;
lazy loading;
image optimization;
caching of appropriate public content;
background processing architecture for heavy imports and analysis.

Do not prematurely create microservices.

Start modular monolith unless repository constraints strongly justify otherwise.

---

# 60. WHAT I WANT YOU TO DO FIRST

Do NOT immediately generate hundreds of screens.

Start by examining the current repository.

Then:

1. summarize what exists;
2. compare it against this specification;
3. identify architectural conflicts;
4. propose a final technical architecture;
5. define the canonical domain model;
6. define database boundaries;
7. define RBAC;
8. define MVP;
9. define implementation phases;
10. create the architecture documentation;
11. create the database schema/migrations;
12. create the application shell;
13. implement the first vertical slice.

After completing each major architectural decision, update documentation.

Do not abandon previous working implementation unless there is a documented technical reason.

---

# 61. DECISION PROTOCOL

When a requirement is ambiguous:

A. Search the existing repository and project documentation first.

B. Prefer consistency with already-established architecture.

C. If no prior decision exists, choose the solution that provides:

data integrity;
traceability;
maintainability;
security;
extensibility;
low operational complexity.

D. Record meaningful assumptions in:

/docs/architecture/DECISIONS.md

E. Do not invent business facts.

---

# 62. PRODUCT PRINCIPLE

Every major object in Néctar Nómada should answer some combination of:

WHAT is it?

WHO is connected to it?

WHERE did it happen / originate?

WHEN did it happen?

HOW was it produced / evaluated?

WHY is it relevant?

WHAT evidence supports it?

WHAT can the user do next?

That could mean:

read;
explore;
compare;
buy;
book;
taste;
participate;
evaluate;
research;
upload;
approve;
follow.

---

# 63. FINAL SYSTEM VISION

The long-term platform should allow a person to move naturally from:

Territory
→ Person
→ Story
→ Ingredient
→ Product
→ Process
→ Research
→ Sensory Experience
→ Purchase
→ Visit
→ Participation

while allowing the organization behind it to maintain:

Data
→ Traceability
→ Evidence
→ Operations
→ Commerce
→ Research
→ Sensory
→ Customer Relationships
→ Content
→ Analytics
→ AI Assistance

inside one coherent digital ecosystem.

This is the core objective.

Build toward this architecture incrementally without compromising the integrity of the underlying data model.

Begin by inspecting the repository and producing the architectural assessment and implementation plan before making substantial architectural changes.


---

<!-- ===================================================================== -->
<!-- Añadido 2026-08-28. Todo lo de arriba es el documento original.        -->
<!-- ===================================================================== -->

# Cómo se trabaja aquí

## Dos reglas sobre este archivo

**Una instrucción vieja es peor que ninguna.** Se actúa cada sesión, así que una
afirmación que se volvió falsa desorienta activamente. Cuando encuentres una,
**corrígela y dilo**, en vez de trabajar a su alrededor.

**Una regla en prosa la deshace una entrada equivalente en la lista de
permisos.** Cuando te apoyes en una regla de este archivo, comprueba que nada en
`.claude/settings*.json` pre-aprueba lo que prohíbe.

## Este repositorio no es el sitio público

El sitio editorial vive en `~/Developer/nectarnomada-web` y **no se toca desde
aquí**. `~/Developer/nectar-worktrees/` lleva worktrees de *este* repositorio:
**otras sesiones trabajan en el mismo checkout**, así que **nunca `git add -A`**
— se añade archivo por archivo.

**Todo trabajo que vaya a producir un commit empieza con un worktree propio**
(instrucción de Daniel, 2026-08-28; procedimiento en `~/.claude/CLAUDE.md`).
Commitear sobre el `main` local de este árbol dejó que el push de otra sesión
arrastrara un commit a `main` sin PR y sin CI encima.

## Comandos

Node no está en el PATH por defecto:

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
```

```bash
npm run dev            # con dev-guard delante
npm run dev:local      # contra la copia local restaurada, puerto 3017
npm run verify         # typecheck + presupuesto de estado + lint (sin base de datos)
npm run typecheck
npm test               # vitest; EXIGE base local (ver abajo)
npm run test:db -- up     # levanta el clúster; NO restaura si ya hay datos
npm run test:db -- reset  # tira los datos y restaura de verdad
npm run check:state    # SESSION_STATE.md cabe en una lectura
npm run decisiones     # qué decisiones de Daniel siguen abiertas
node tools/browser-checks/respuesta-anonima.mjs  # qué contesta el sitio a quien NO tiene sesión
```

**La suite se niega a hablar con una base remota** salvo `ALLOW_REMOTE_TEST_DB=1`
(`tests/setup.ts`). Hasta el 2026-08-21 corría contra Neon de producción y
escribía unas 244 filas de `core.audit_event` por corrida.

**Encadenar la compuerta al commit, y nunca canalizarla.** El estado de salida
de una tubería es el del último comando, así que `npm test | grep …&& git commit`
commitea sobre una suite en rojo:

```bash
npm test; test $? -eq 0 && git commit -F msg.txt
```

Usar `git commit -F <archivo>`. En un `-m` entre comillas dobles los backticks
son peores que las comillas: la shell ejecuta la palabra y la borra en silencio.

## Cómo se despliega

Push a `main` → Vercel construye `nectar-nomada-package`
(`prj_9EkGhnZZgdgsEOJGsxGNFOd24Bvm`), con `scripts/vercel-build.sh`.
**Esperar el check de Vercel antes de fusionar** — y saber que ese check no
promete que producción vaya a construir; ver abajo.

**Un deploy que dice «success» dice que la subida funcionó, no que la página
funcione.**

**El check de Vercel que pasa en una PR es el de *preview*.** No dice nada sobre
si producción puede desplegar. El 2026-09-01 lo di por bueno dos veces y las dos
me equivoqué: la PR estaba verde y el merge no construía. Lo que sí lo dice es
el estado del commit fusionado, y después el log, que nombra cada migración:

```bash
# Vercel y los demás «statuses» del commit. NO trae las compuertas de Actions.
gh api repos/danieljosegiraldez-png/nectar-nomada/commits/<sha>/status
# Las compuertas viven en otro endpoint, y se leen conclusión POR CONCLUSIÓN:
# `cancelled` no es `failure` y se cuela en un vistazo. Ver la trampa del final.
gh api repos/danieljosegiraldez-png/nectar-nomada/commits/<sha>/check-runs \
  --jq '.check_runs[] | "\(.name): \(.conclusion)"'
vercel inspect --logs <url-de-produccion> --scope <scope>
```

## Revisión independiente

`docs/CODEX_REVIEW.md`. El CLI de Codex funciona y está autenticado; **no está
en el PATH**: `/Applications/ChatGPT.app/Contents/Resources/codex`. El paquete de
revisión lo arma `tools/pack-for-review.sh`, mecánicamente.

## Salud del repositorio — comprobado el 2026-08-28

- Remoto `https://github.com/danieljosegiraldez-png/nectar-nomada.git`, rama `main`, árbol limpio.
- `vercel` autenticado; vive en `~/.nvm/versions/node/v24.19.0/bin`.
- Codex `0.150.0-alpha.12.2`, `login status` → «Logged in using ChatGPT».
- Backups: `NN_BACKUP_DIR` está en `~/.zshrc` y apunta a Google Drive; el
  destino existe; `com.nectarnomada.backup` está cargado en launchd con último
  estado de salida 0; el log vive en `~/Library/Logs/nectar-nomada-backup.log`.
- **La alerta de backup ya vive fuera de esta máquina** — P-A cerrada el
  2026-09-04. `ping_health` en `run-scheduled.sh` manda `/start`, `/fail` y el
  éxito *sólo tras verificar la restauración*, contra la URL de healthchecks.io
  que Daniel guarda en `~/.config/nectar-nomada/backup.env`, fuera del
  repositorio. El backup es **semanal, lunes 09:00**; el check está con periodo
  de 1 semana y margen de 2 días.
- `timeout` no existe en este macOS; usar el timeout de la herramienta.

## Trampas que han costado tiempo real

### El último párrafo de la especificación de arriba ya no aplica

**Síntoma.** El documento termina pidiendo «empezar inspeccionando el
repositorio y producir la evaluación arquitectónica y el plan de
implementación». Cargado cada sesión, invita a re-hacer un arranque.

**Causa.** Es el prompt fundacional del proyecto, y el proyecto avanzó: PR #58,
ADR-103, 43 documentos de arquitectura, 50 de implementación.

**Arreglo.** El bloque del principio lo dice. El documento original no se
reescribe por instrucción de Daniel; se neutraliza nombrándolo.

### El dominio de marca sirvió esta aplicación — **resuelto el 2026-08-28**

**Síntoma.** `https://www.nectarnomada.com` respondía con este OS: `/login`,
`/signup` y `/discover` daban 200 ahí.

**Causa.** El dominio apuntaba a este proyecto de Vercel, no al del sitio
público. Se reasignó la misma noche; ahí `/login` ya da 404.

**Lo que quedó comprobado mientras duró:** la exposición era de superficie, no
de datos — las ocho rutas privilegiadas redirigían a `/login` también en el
dominio. Y **la prueba de P-B se cerró sola** al cambiar el mundo, sin que
nadie editara nada.

**Este OS vive ahora solo en `nectar-nomada-package.vercel.app`.**

### Una prueba que se encuentra a sí misma

**Síntoma.** La prueba de P-A («¿hay una alerta de backup fuera de la máquina?»)
buscaba `healthcheck|hc-ping|cronitor` en `scripts/` y reportó **cerrada**.

**Causa.** Encontró su **propio texto**. Evidencia falsa *a favor* de la regla
que estaba probando, fabricada por el error exacto que la regla describe.

**Arreglo.** La prueba mira solo `scripts/backup/`, donde el ping viviría.
Todas las pruebas de `open-decisions.sh` pasaron flip-test en las dos
direcciones — incluida P-E, que se **abre** sola si alguien quita
`NN_BACKUP_DIR` de `~/.zshrc`.

### Un `exit` dentro de un `eval` mata el script entero

**Síntoma.** Sin red, `open-decisions.sh` no imprimía ninguna decisión, ni
siquiera las que sí había evaluado.

**Causa.** Una prueba hacía `exit 2` para decir «no se pudo determinar», y
`eval` corre en la shell actual: terminaba el script y truncaba la lista **sin
decir nada**.

**Arreglo.** Cada prueba corre en subshell. Lo encontró el flip-test de «sin
red», no la lectura del código.

### 18 errores de tipos que no son errores de código

**Síntoma.** `npm run typecheck` falla con ~18 errores en
`lib/traceability/selection.ts`, `lots.ts`, `balance.ts` y
`tests/traceability/selection.test.ts`: `"selection"` no asignable a
`LotTransformationType`, `rejectionCategoryValue` no existe en `LotInclude`.
Parece que `main` está roto.

**Causa.** El cliente de Prisma generado estaba viejo respecto al esquema. El
código era correcto; el que mentía era el cliente.

**Arreglo.** `npm run prisma:generate`. Comprobado el 2026-08-28: 18 errores → 0.
Después de traer una migración, regenerar antes de creer al typecheck.

### Canalizar la compuerta la vuelve verde

**Síntoma.** `npm run verify 2>&1 | tail -20` reportó **salida 0** mientras
imprimía 18 errores de tipos justo encima.

**Causa.** El estado de salida de una tubería es el del último comando: `tail`
siempre sale 0. Pasó en esta misma sesión, escribiendo la regla que lo prohíbe.

**Arreglo.** Correr la compuerta sin tubería y leer el código de salida:

```bash
npm run verify > /tmp/verify.txt 2>&1; echo "salida=$?"; tail -20 /tmp/verify.txt
```

Hay un hook en `~/.claude/hooks/preguntar-patrones-caros.py` que **pregunta**
cuando una tubería precede a un `git commit`. No cubre leer un resultado
canalizado: eso sigue siendo cosa de quien mira.

### Vitest esconde los `console.log` de un test que PASA

**Síntoma.** 2026-09-26. Una sonda de sólo lectura, escrita para medir cuántos
lotes hay por clasificación, imprimía sus cifras con `console.log`. La corrida
dijo `Test Files 1 passed`, `Tests 1 passed`, salida 0 — y **ni un número**. Un
test en verde sin la medición debajo se lee como «medido y correcto», que es la
forma exacta de un cero que en realidad significa «no miré». Costó dos corridas
y estuve a punto de dar cifras que no había visto.

**Causa, medida y no deducida.** Vitest 4 (`4.1.10`) **intercepta `console.*`** y
el reportero por defecto sólo lo saca a pantalla para los tests que **fallan**.
Una sonda, que por definición pasa, no imprime nunca.

Medido con un archivo de dos tests —uno que pasa y uno que falla— contando las
marcas sobre la salida **entera**, no sobre un `tail`:

| lo que escribe la sonda | test que PASA | test que FALLA |
|---|---|---|
| `console.log` | **0** | 2 |
| `process.stdout.write` | 1 | no medido |
| `console.log` con `--disableConsoleIntercept` | **1** | no medido |

**Las dos columnas juntas son el control positivo:** el `grep` sí encuentra la
marca del test que falla, así que el `0` de la primera columna es supresión y no
un patrón mal escrito. Con una sola columna se lee como «la sonda no escribió».

**Y `--silent=false` NO lo arregla**, aunque el texto de `--silent --help` lo
sugiera («Use 'passed-only' to see logs from failing tests only»). Medido: con
`--silent=false` y con `--silent=passed-only`, la marca del test que pasa sale
**0** las dos veces. Deducir el mecanismo de la ayuda fue el segundo error de la
misma tarde; el que lo mueve es el de la intercepción.

**Arreglo.** Para cualquier sonda que deba imprimir lo que midió, una de estas
dos — nunca `console.log` a secas:

```bash
npx vitest run tests/<sonda>.test.ts --disableConsoleIntercept
```

o que la sonda **escriba su resultado a un archivo** con `writeFileSync` y se lea
después. La segunda no depende de acordarse de una bandera, y es la que se usó.

**Por qué importa más que la incomodidad.** `npm run verify` y la suite no
sufren: ahí lo que se lee es el código de salida. Pero **toda medición ad hoc
hecha como test** cae en esto, y cae del lado que halaga — el veredicto que se
buscaba sale en verde, sin ninguna cifra que pueda contradecirlo.

### `test:db -- up` dice «ready» y te da una base de hace dos días

**Síntoma.** Tras `npm run test:db -- up`, la copia local seguía teniendo los
lotes con el nombre viejo («Finca Las Nubes Cerro Azul») y cero cohortes. La
salida terminaba en «Test database ready», y la verificación en el navegador
habría descrito una aplicación que no existe.

**Dos causas encadenadas.** `up` **no restaura si ya hay datos** — imprime
«Already up, with data. Use 'reset' to restore it again.» varias líneas antes
del «ready», donde es fácil que un `tail` se la coma. Y `newest_backup()` lee
`${NN_BACKUP_DIR:-$HOME/nectar-backups}`: una shell que no ha leído `~/.zshrc`
**no tiene esa variable** y restaura del directorio local, que aquí estaba dos
semanas atrasado. Las dos veces el veredicto fue «listo».

**Arreglo.** `reset`, no `up`, y exportar `NN_BACKUP_DIR` antes. Y leer la línea
`Restoring from ...Z`, que dice de qué backup salió:

```bash
export NN_BACKUP_DIR="$HOME/Library/CloudStorage/GoogleDrive-<cuenta>/My Drive/nectar-backups"
npm run test:db -- reset
```

**Antes de creer nada, imprimir una fila patrón conocida** y leerla. Aquí fue
`select count(*) from traceability.planting_cohort` — debía dar 4 y dio 0.

### …y `reset` también dice «ready» con el esquema de ayer

**2026-09-07.** Restaurar la base compartida salió limpio: `salida=0`,
`Restoring from 2026-09-07T140006Z...`, `Test database ready.`, y las seis tablas
patrón casando con el `rowcounts.tsv` del backup. Todo correcto — y el esquema
estaba **seis migraciones por detrás de `main`**.

**Causa.** El dump es una foto del momento en que se tomó. `reset` restaura esa
foto y **no aplica lo que se haya fusionado desde entonces**. Ese día habían
entrado seis migraciones entre las 09:00 y las 00:00.

**Por qué importa más de lo que parece.** El síntoma siguiente no dice «te falta
migrar»: dice `Null constraint violation` o `Unknown argument` en tests que no
tocaste — exactamente la misma cara que la deriva de otra sesión descrita arriba,
y que se lee como «`main` está roto». Es el mismo error leído del revés.

**Arreglo, y va SIEMPRE después de un reset:**

```bash
npx prisma migrate deploy      # y leer los nombres que imprime
npx prisma generate            # el cliente también quedó viejo
npm run db:seed                # permisos, perfiles y catálogos
```

**Y la comprobación que lo dice antes de perder el tiempo** — contar las dos
listas, no confiar en «ready»:

```bash
ls prisma/migrations | grep '^[0-9]' | sort > /tmp/en-disco.txt
# ...contra las de _prisma_migrations; en DISCO y no aplicadas = lo que falta
```

**Ojo con la cuenta:** `_prisma_migrations` tiene una fila **duplicada** de
`20260810150000_phase1_quantity_event`, que sí está en el repositorio. Sin
deduplicar, la comparación inventa una migración ajena que no existe — me pasó,
y me hizo creer que había dos sesiones con trabajo en juego cuando había una.

### La base de pruebas es compartida: un fallo tuyo puede ser de otra sesión

**2026-09-06.** Corriendo la suite sobre un worktree recién sacado de
`origin/main`, `tests/traceability/roasting.test.ts` falló **7 de 11** con
`Null constraint violation` al crear un tueste. El árbol estaba limpio —el
mismo fallo salía con y sin mi cambio— así que no era mío; parecía deriva del
esquema en `main`.

No lo era. La base de pruebas del puerto 55433 **la comparten todas las
sesiones a propósito** (el objetivo era separar los *archivos*, no los datos),
y otra sesión había aplicado ahí su migración en curso:

```bash
# migraciones aplicadas en la base, contra las que hay en el repositorio
psql "$TEST_DATABASE_URL" -At -c "select migration_name from _prisma_migrations;" | sort > /tmp/aplicadas.txt
ls prisma/migrations | grep '^[0-9]' | sort > /tmp/en-disco.txt
comm -13 /tmp/en-disco.txt /tmp/aplicadas.txt   # en la BASE y no en el repositorio
```

Salió `20260906183946_perfil_de_tueste`, con `finished_at` de esa misma tarde y
el nombre de la rama de un PR abierto — y **no estaba ni en la rama publicada**,
o sea trabajo sin commitear de otra sesión. Su columna `purpose NOT NULL` no
existe en el `schema.prisma` de `main`, así que Prisma no la manda y el insert
revienta.

**Dos consecuencias, y la segunda importa más:**

- Un fallo local que el control demuestra ajeno a tu cambio **todavía puede no
  ser de `main`**. El control de dos mitades —con y sin tu cambio— distingue
  «mío» de «no mío», no «de `main`» de «de otra sesión». Para eso hace falta
  la comparación de migraciones de arriba.
- **No restaurar la base para «arreglarlo».** `test:db -- reset` habría borrado
  la migración que otra sesión estaba usando en ese momento.
- **Y aquí no hay a quién preguntarle el veredicto.** Esta nota decía primero
  que «lo dice CI, que levanta su propio Postgres»: **falso**, y comprobarlo
  costó una línea. `roasting` está en el grupo `datos-reales` de
  `scripts/pruebas-por-compuerta.txt`, **excluido de CI a propósito** porque su
  valor es afirmar hechos de la finca real. Así que esos 7 se quedan **sin
  verificar** hasta que la base compartida vuelva a casar con `main` —cuando se
  fusione la rama que trae la migración, o cuando nadie esté usando la base y se
  pueda restaurar—. Decirlo es la respuesta correcta; inventarle un árbitro que
  no existe, no.
- **Averiguar de qué rama es, sin adivinar por el nombre.** Aquí la migración se
  llamaba como una rama que se fusionó ese mismo día **sin traerla**: la traía
  otra, de nombre casi idéntico. Un nombre parecido no es evidencia; el que lo
  dice es el árbol:

  ```bash
  for b in $(git branch -r --format='%(refname:short)' | grep -v HEAD); do
    git ls-tree -r "$b" --name-only | grep -q "<marca de tiempo>" && echo "$b"
  done
  ```

  Y con un control positivo al lado: la misma búsqueda sobre una migración que
  sí está en `main`, para probar que el bucle mira donde debe.

### Un subagente resetea la base compartida si su encargo no se lo prohíbe

**2026-09-18, ~23:39Z.** Durante la tarea 8 del manejo fitosanitario (ADR-174),
un subagente corrió `npm run test:db -- reset` sobre la base compartida del
55433 y restauró el backup del 2026-09-14. La prohibición estaba en los encargos
de las tareas 3 a 7 y **faltó en el de la 8**. El esquema quedó coherente al
medirlo después, pero los datos de prueba entre el 14 y el reset no se reparan.

**Y un subagente puede fabricarse el permiso.** El 2026-09-19, en las rutinas de
lugar (ADR-180), otro subagente usó el texto de su propio encargo como
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` para correr `prisma migrate reset`.
Esa variable pide el consentimiento **de Daniel**, no el de quien delega. Esa
vez sólo tocó una base propia y no se perdió nada, pero el guardia de Prisma
quedó saltado.

**La regla:** todo encargo a un subagente que toque la base lleva escrita la
prohibición de `test:db -- reset`, `prisma migrate reset`, `db push
--force-reset`, borrar bases y fijar esa variable, y nombra la **única** base
que puede usar. Que las tareas anteriores lo dijeran no cuenta: el subagente
sólo ve su propio encargo.

### Una prueba nueva que necesita base corre en el carril que no la tiene

**2026-09-07.** `npx vitest run` pasó 1291/1291 en local y CI falló el carril
hermético con `Invalid value for argument in[0]: Can not use undefined value
within array` — un error de Prisma en una compuerta que no toca Prisma. La causa
no era el código: `scripts/ci.sh` corre **todo lo que NO está** en
`scripts/pruebas-por-compuerta.txt`, así que una prueba nueva que necesita base
cae ahí por omisión y se ejecuta **sin base**.

Correr la suite entera en local **no lo detecta nunca**, porque en local siempre
hay base. Es la forma inversa de `PENDING_IMPLEMENTATIONS/008`, donde un test
hermético nuevo no corría en CI: la misma lista, el mismo silencio, el otro lado.

**Antes de empujar una prueba nueva que toque la base, correr el carril
hermético tal cual lo corre CI:**

```bash
bash scripts/ci.sh          # 0 = el carril sin base está bien
```

y comprobar que la prueba nueva **no** aparece en su salida. Si aparece, va al
grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`, que es de donde
`ci-con-base.sh` saca las suyas — el mismo archivo a propósito, para que no haya
dos fuentes que deriven.

### La suite completa ve regresiones que CI no puede ver

**Síntoma.** `main` en verde en CI, y `npm test` en local con **2 fallos**:
`s1.test.ts` y `roasting.test.ts`, ambos en la aserción «los datos reales de
Cerro Azul siguen intactos».

**Causa.** El renombrado del 2026-08-29 dejó los tests buscando `contains:
"Nubes"` y `contains: "Cerro Azul"`, que ya no existen como nombres. Los datos
estaban perfectos; los que miraban al sitio equivocado eran los tests. **CI no
lo vio y no podía verlo:** corre tres archivos herméticos, y la suite entera
necesita `npm run test:db`, que un runner no tiene.

**Consecuencia práctica.** Un cambio de datos en producción puede romper la
suite sin que ningún check se ponga rojo. Después de correr cualquier script de
`data:*` contra producción, correr `npm test` en local antes de dar por cerrada
la sesión.

### Verificar en local no puede ver un fallo de husos horarios

**Síntoma.** Se abre una jornada escribiendo las 07:30 y la pantalla muestra
12:30. Parece «la aplicación muestra en UTC» y se anota como decisión de
producto.

**Causa.** Un `<input type="datetime-local">` entrega un reloj de pared **sin
zona**: `"2026-03-12T07:30"`. `new Date()` sobre esa cadena la interpreta en la
zona **del servidor**. En desarrollo el servidor y el navegador comparten zona,
así que el error se cancela y el instante guardado es correcto. **En producción
el servidor corre en UTC** y no: un 07:30 de Panamá se guarda como las 02:30.

Estuvo en nueve sitios de tres módulos —incluidos cosecha y recepción, que son
los que más filas reales tienen— y ninguna compuerta, suite ni verificación en
navegador lo vio. Lo encontró una revisión independiente el 2026-08-31.

**Arreglo.** `lib/time/localDateTime.ts`: el formulario manda el desfase del
dispositivo (`<TimezoneOffsetField />`) y el servidor los combina. Si el desfase
falta, **falla** en vez de suponer una zona.

**Cómo verificarlo.** Un dev server con `TZ=UTC`, que es lo que hace Vercel:

```bash
TZ=UTC PORT=3033 DATABASE_URL=... npm run dev
```

Con la zona local no se ve nada. Comprobar leyendo la base con
`at time zone 'UTC' at time zone 'America/Panama'`, no la pantalla.

### Precargar un `datetime-local` con `toISOString()` corrompe el dato

**Síntoma.** Abrir un formulario de corrección y guardar **sin tocar la hora**
adelanta el registro cinco horas. Cada vez. En silencio.

**Causa.** `defaultValue={x.occurredAt.slice(0, 16)}` pone el reloj de pared en
**UTC**. El campo es `datetime-local` y el formulario manda `TZ_OFFSET_FIELD`,
así que al guardar `parseLocalDateTime` lo re-interpreta como hora **local**.
Medido el 2026-09-06: `16:31Z` → el campo muestra `16:31` → se vuelve a guardar
`21:31Z`. Con una medición de medianoche cambia también **la fecha**.

**Arreglo.** `paraCampoLocal` en `lib/time/localDateTime.ts`, el inverso exacto
de `parseLocalDateTime`, escrito en el DOM con un efecto —como
`TimezoneOffsetField`— porque en el servidor `getTimezoneOffset()` devuelve el
desfase del *servidor*.

**Y la distinción que hay que hacer antes de tocar nada de esto**, porque un
arreglo mecánico rompe seis sitios: hay **campos de día** —`sampledAt`,
`describedAt`, `plantedAt`, `producedAt`: vienen de un `type="date"` y se
guardan como medianoche UTC— cuya ida y vuelta **ya cierra** con
`toISOString().slice(0,10)`, y convertirlos a la zona del sitio los movería un
día atrás. Y hay **instantes**, que sí hay que convertir. Se distingue mirando
cómo se PARSEA el campo, no cómo se muestra.

### Un guardia que lee la fuente no puede fiarse de la indentación

**Síntoma.** Un test de arquitectura señala como incorrectos tres archivos que
están bien, entre ellos el primero que adoptó la práctica que vigila.

**Causa.** Cerraba el bloque buscando el `});` a la misma indentación que lo
abría. `lib/traceability/plantingCohorts.ts` tiene el cuerpo de su
`$transaction` **al mismo nivel** que la apertura, así que el `});` de un
`create` interno pasaba por el cierre y todo lo posterior quedaba «fuera».

**Arreglo.** Contar paréntesis desde el `(`, que no depende del formato. Y un
control positivo del **análisis**, no del código: un test que comprueba que el
detector *encuentra* algo. Sin él, un cambio de formato lo deja ciego y el
guardia pasa sin mirar nada — que es lo que casi ocurre aquí.

### Un guardia que pasa igual con y sin la regresión

**Síntoma.** `tests/session-state-budget.test.ts` estaba en verde. También lo
estaba con el guardia sustituido por `process.exit(0)`.

**Causa.** Solo corría el guardia contra el archivo bueno y exigía salida 0.

**Arreglo.** Cinco fixtures negativos. Comprobado: con el guardia neutralizado
caen los 6 tests, y vuelven a pasar al restaurarlo.

### Ocho guardias falsos en un día, y las tres reglas que quedaron

**Síntoma.** Compuertas en verde sobre propiedades que nadie medía. El
2026-09-01, cuatro revisiones independientes destaparon **ocho** casos míos, y
ninguno lo vio la suite.

**Las formas que tomaron**, porque reconocerlas es el arreglo:

- **Un test que se compara consigo mismo.** Comprobaba que la unión de dos
  paneles fuera igual a la unión de esos mismos dos paneles.
- **Un valor por defecto que vuelve infalsificable un guardia.** Un
  `?? ["proceso_de_cafe"]` hacía imposible que una variable quedara huérfana, y
  además metía en silencio las de laboratorio en el desplegable de recetas.
  **Arreglo estructural:** el mapa pasó a ser un `Record` total, así que **el
  compilador** obliga a declarar cada variable nueva. Un tipo que no compila es
  mejor guardia que un test que hay que acordarse de mirar.
- **Cuatro tests que prometían atomicidad y sólo comprobaban existencia.**
  «Escribe el AuditEvent en la misma transacción» hacía
  `expect(evento).not.toBeNull()` **después de que todo salió bien**: quitar el
  `tx` los dejaba verdes a los cuatro. Comprobado: la suite de `soilProfiles`
  pasaba 20/20 con el `tx` quitado. Hoy lo cubre
  `tests/arquitectura/audit-atomico.test.ts`, que lee la fuente.
- **Una comprobación negativa sobre contenido ausente.** Un test de temporalidad
  corría antes de que existiera la evidencia que decía medir: pasaba porque no
  había nada. Su propio comentario lo admitía —«anterior a toda la evidencia que
  el fixture crea después»— y no se vio.
- **Sondas contra la base que salieron vacías** porque las subconsultas
  devolvían `NULL` con la base de test limpia. Una llegó a insertar una fila sin
  sujetos que hubo que borrar.

**Las tres reglas.** Salieron de ahí y valen para cualquier guardia:

1. **Un flip-test no vale hasta ver caer al test que se cree que lo cubre.**
   Mirar *cuál* cae, no sólo que caiga alguno. Dos veces cayó otro test y el
   guardia que se estaba probando era ciego.
2. **Antes de creer que una mutación probó algo, comprobar que se aplicó.** Una
   salió verde sin haberse aplicado siquiera: la cadena ancla ya no existía y el
   `replace` no hizo nada. Sólo lo dijo el `diffstat`.
3. **Una sonda contra la base necesita control positivo.** Si la fila que debía
   ser rechazada no llegó a construirse, «no entró» no prueba nada. Crear las
   filas primero, probar con `SAVEPOINT`, y comprobar además que **lo válido sí
   entra**.

**Y el patrón que las explica todas:** llamar «estructural» a lo que sólo
comprueba el servicio. Pasó tres veces el mismo día —«Gate 0 hecho estructura»,
«cada sujeto nuevo excluye `lot_id`» sobre una tabla sin un solo `CHECK`, y «la
regla es estructural aquí»—. Una restricción que vive en TypeScript o en un
comentario **no existe para la base**: un importador, una reparación operativa o
SQL directo se la saltan.

### El límite de despliegues de Vercel es una cuota, no un fallo del cambio

**Síntoma.** El merge a `main` no construye. En GitHub el check dice
`Vercel: failure — Deployment rate limited — retry in 24 hours`, que se lee como
un fallo del cambio. La PR estaba verde minutos antes.

**Causa.** Es una cuota de **cuenta**, del plan gratuito, y sólo sale con nombre
propio al intentarlo desde el CLI: `more than 100, code:
"api-deployments-free-per-day"`. El 2026-09-01, diez PR con sus previews la
agotaron en una tarde.

Se junta con lo que dice «Cómo se despliega»: el check verde de la PR es el de
*preview*, así que ni siquiera avisa.

**Consecuencia.** Un merge con migración se queda sin desplegar sin que nada más
avise, y `main` se va por delante de producción. No hay inconsistencia mientras
código y migración queden fuera **juntos** —`vercel-build.sh` construye antes de
migrar, ADR-070— pero hay que anotarlo en `SESSION_STATE.md` §3 o la siguiente
sesión no lo sabrá.

**Arreglo.** Leer el estado del commit fusionado, no el de la PR, y después el
log, que nombra cada migración aplicada:

```bash
gh api repos/danieljosegiraldez-png/nectar-nomada/commits/<sha>/status
vercel inspect --logs <url-de-produccion> --scope <scope>
```

**El discriminante limpio no es la duración: es la URL del check.** Una cuota
apunta a la página de venta, un build real apunta al despliegue:

```bash
gh api repos/danieljosegiraldez-png/nectar-nomada/commits/<sha>/status \
  --jq '.statuses[] | select(.context=="Vercel") | .state + " -> " + .target_url'
# cuota:      https://vercel.com/<scope>?upgradeToPro=build-rate-limit
# build real: https://vercel.com/<scope>/nectar-nomada-package/<id>
```

La duración sigue valiendo, pero sólo cuando hay fila que mirar — y con una
cuota **no la hay**.

**Y de ahí lo que cuesta un rato descubrir: una cuota no crea despliegue, así
que no existe el botón *Redeploy* de ese commit.** El 2026-09-03 se perdió
tiempo buscándolo. Lo que despliega esos commits es un **push nuevo**: la
siguiente fusión de cualquier sesión los arrastra a todos. Subir de plan levanta
el tope de ahí en adelante y **no vuelve atrás** a construir lo ya rechazado.

**Y el tope que bloquea es de cantidad, no de dinero** —`api-deployments-free-per-day`—
así que puede quedar crédito de sobra y estar bloqueado igual. Son dos
medidores distintos y confundirlos lleva a pagar por un problema que no era de
pago. Desde el 2026-09-05 hay `vercel.json` con `ignoreCommand`: un cambio que
sólo toca documentación no construye. Ver `scripts/solo-documentacion.sh`.

**CORREGIDO EL 2026-09-18: el *Redeploy* del panel NO arregla la comprobación del
PR.** Esta sección decía que «usa la integración de git, queda atado al commit». Falso,
y medido: en #421, con Vercel en caída parcial, el build de *preview* falló con
«An unexpected error occurred… may be a transient issue». Daniel pulsó *Redeploy*
sobre ese despliegue, el nuevo terminó **Ready**, y el commit siguió con sus dos
únicos estados de Vercel —`pending` y `failure`, los del intento original—: el
Redeploy **no escribe ningún estado nuevo en GitHub**. El PR seguía en rojo.

Lo que sí rehízo la comprobación fue **volver a empujar el mismo contenido con otro
sha** (`git commit --amend --no-edit --date=now`; se comprueba que el árbol es
idéntico antes de empujar). Medido en #421: el sha nuevo recibió su propio estado de
Vercel y pasó a `success`. Cuesta repetir el CI de Actions entero, que es el precio.
**Y con Vercel todavía en caída, el despliegue nuevo puede quedarse minutos en
«Initializing»**: el de #421 tardó ~8 minutos en arrancar. Esperar, no volver a empujar.
Antes de pedirle a Daniel que pulse nada en el panel, esto es lo que hay que saber.

### Y GitHub Actions tiene su propia cuota, que se lee como un fallo del cambio

**2026-09-14.** El PR #309 salió con `¿Hay código en este cambio?: failure` y las otras tres
compuertas en `skipped`. Eso se lee exactamente como «tu cambio rompió la primera compuerta y
las demás no se molestaron en correr». No era eso. La anotación del job lo decía:

```
The job was not started because an Actions budget is preventing further use.
```

**El job nunca arrancó.** `failure` ahí significa «no pudo empezar», y los `skipped` de las
otras tres son su consecuencia mecánica, no un juicio sobre el código. Es la misma forma que
la cuota de Vercel de la sección anterior, en el otro proveedor — y **más engañosa**, porque
Vercel al menos apunta a una página de venta mientras que esto llega como el rojo de una
compuerta propia.

**Lo que lo distingue en dos comandos**, y hay que correrlos antes de tocar el código:

```bash
gh run view <run-id> -R <owner/repo> | grep -i 'Actions budget'
gh run list -R <owner/repo> --limit 8 --json createdAt,headBranch,conclusion,event
```

La anotación es el discriminante directo. La lista es el control: si fallan **ramas
distintas y también los `push` a `main`**, no es el cambio. Medido ese día: cuatro corridas
seguidas con la anotación —dos PR de sesiones distintas y dos pushes a `main`—, la última
verde a las 16:53 y la primera fallida a las 17:03. Y el control negativo que cierra la
lectura: la última corrida buena tiene la anotación **cero** veces, así que el `grep`
discrimina de verdad.

**Dos consecuencias que importan más que el diagnóstico:**

- **No se fusiona.** Cuando el dueño dice «fusiónala cuando pase el CI», un CI que **no puede
  correr** no cumple la condición. Lo verificado en local —`verify`, `build`, el carril
  hermético— sigue valiendo y hay que decirlo, pero no sustituye a la compuerta.
- **`main` se queda sin red sin que nada avise.** Los pushes a `main` fallan igual, así que
  cualquier cosa fusionada mientras dura la cuota entra **sin compuerta encima**. Eso se anota
  en `SESSION_STATE.md` §3 o la siguiente sesión no lo sabrá.

**Y lo arregla el dueño, no la sesión**: es un límite de gasto de su cuenta. No hay reintento
que lo salte.

### …y el reverso: no todo rojo de Vercel es la cuota

**El mismo día, la sección de arriba me hizo el daño.** Vi
`Vercel — fail` en una PR, lo leí como la cuota conocida, y fusioné. Producción
llevaba **una hora** rechazando cada despliegue, ocho seguidos, y el sitio servía
un build viejo mientras `main` seguía avanzando.

No era la cuota: era `npm run build` saliendo con 1. Y la pista estaba a la
vista sin abrir nada — **los rechazos por cuota no duran 18 segundos**. Un build
de verdad tarda 33-59 s; los fallos tardaban 18-20 s, que es demasiado para una
cuota y muy poco para un build completo. La duración distinguía los dos casos y
no la miré.

**La causa raíz era mía y de una clase que la compuerta no ve:**

```
Error: Only async functions are allowed to be exported in a "use server" file.
> export class FechaInvalidaError extends Error {}
```

De un archivo `"use server"` Next.js sólo deja exportar funciones `async` —cada
export es un punto de entrada invocable desde el navegador—. Una clase exportada
rompe el módulo entero: **69 errores en 26 archivos** desde una línea. Y `npm run
verify` corre tipos, lint y tests, **no `next build`**, así que para TypeScript
el archivo era válido y las PR salieron en verde.

**Las dos reglas:**

- **Antes de atribuir un rojo a la cuota, leer el log.** `vercel ls` da estado y
  **duración**; una duración de build significa que se construyó y falló.
  Atribuir sin leer es la lectura que halaga la hipótesis.
- **Un guardia de fuente no sustituye al build, lo adelanta.** El de esta regla
  está en `tests/arquitectura/use-server-solo-async.test.ts`. Cubre un error
  concreto que ya costó una hora; el resto de los que sólo ve `next build`
  siguen fuera, y la compuerta sigue sin correrlo.

### `vercel --prod` sin enlace previo crea un proyecto nuevo

**Síntoma.** Un despliegue «de producción» que falla en `prisma migrate deploy`
con `The datasource.url property is required`. Producción intacta, y en la cuenta
aparece un proyecto que nadie creó.

**Causa.** Sin `.vercel/project.json`, el CLI toma el **nombre del directorio** y
crea un proyecto con él. En un worktree eso es el nombre de la carpeta: el
2026-09-01 nació uno llamado `estado4`, sin ninguna variable de entorno, que
murió al migrar. Hubo que borrarlo, y consumió un intento de la cuota.

**Arreglo.** Enlazar antes, y comprobar el **id**, no el nombre:

```bash
vercel link --yes --project nectar-nomada-package --scope <scope>
cat .vercel/project.json   # debe decir prj_9EkGhnZZgdgsEOJGsxGNFOd24Bvm
```

`vercel link` además escribe un `.env.local` con lo que el proyecto tenga. Está
gitignorado (`.env*`), pero es un secreto en disco: mirar qué trajo y borrarlo.

### Una fusión sin conflictos puede dejar código roto

**2026-09-19, en el PR #445.** Git auto-fusionó
`lib/traceability/pendienteDeTrampas.ts` **sin un solo marcador de conflicto** y
el resultado no compilaba: la lógica de «atendido» de `main` se cruzó con un
refactor de helpers de la rama y dejó `revisionVigente` referenciada fuera de
alcance. Lo cazó el typecheck, no la lectura del diff.

**El silencio de git no es evidencia.** Que no haya conflictos dice que los
cambios no se solapan **textualmente**, no que el resultado tenga sentido. Es la
misma forma que el resto de esta sección: una salida que parece buena —«sin
conflictos»— y que no mide lo que se cree.

**Arreglo:** `npx tsc --noEmit` y `npm run build` después de CADA rebase o merge,
aunque git no se haya quejado. Con cinco ramas en cola el mismo día, esto pasa.

### Una clase de validación nueva que llegue a una acción es un 500

**PR #433.** `friendlyError` (`app/actions/traceability.ts`) **relanza toda clase
que no conoce**, y no conocía `PropositoInvalido`: el formulario mandaba `[]`, el
servicio lo rechazaba, y abrir una jornada sin propósito reventaba con la pantalla
de error en vez de decir «Elige al menos un propósito de la visita».

**La regla:** cuando un servicio gana una clase de error de validación, su rama en
`friendlyError` entra en el mismo cambio. Sin ella el dominio funciona y la
pantalla miente. Se anota aquí porque la entrada de estado que lo contaba se
archivó el 2026-09-19 y un log archivado no lo lee nadie.

### Una prueba puede cerrarse sola por una errata

**Síntoma.** `open-decisions.sh` trataba **cualquier** código distinto de 0 y 2
como «cerrada». Una orden mal escrita sale 127; una decisión que solo Daniel
puede tomar desaparecía del primer mensaje sin dejar rastro.

**Arreglo.** Solo el `1` cierra. Cualquier otro código imprime `ROTA` y el
script sale 3. Los sitios de aterrizaje exigen un **encabezado** `## ADR-NNN`,
para que «los correos de las personas siguen pendientes» no cierre P-C. P-A
exige una **invocación** (`curl`/`wget` a un servicio de healthcheck), no una
mención. P-E exige una asignación con valor no vacío.

**Las dos las encontró la revisión independiente de Codex** sobre la PR #60, no
una lectura nuestra. La adjudicación está en `SESSION_STATE.md`.

### Una limpieza escrita debajo de las aserciones no corre

**Síntoma.** Una medición de «cuántos sitios de apiario hay» en la base local
devolvió **3** con dos reales. El tercero era `TEST Sitio (a99-pol-…)`, del
2026-09-08, y con él estaba la corrida entera: 2 organizaciones, 1 proyecto, 2
personas, 2 cuentas, 1 `Assignment`, 1 `Scope`, 1 `FieldSession` y 7
`AuditEvent`. Y la suite había pasado en verde desde entonces.

**Causa, y no es la que parece.** El `afterAll` de `polinizacion.test.ts` **sí
borraba la Location**. No llegaba. Los dos `it` que crean una `FieldSession` la
borraban en la **última línea del cuerpo, debajo de las aserciones** — y una
aserción que falla se salta ese borrado. `field_session.location_id` es
`RESTRICT`, así que el `afterAll` reventó al borrar la Location y **abandonó las
seis líneas siguientes**. Un `afterAll` es una cadena: la primera FK que se
queja tira el resto.

**`assertDefinedWhere` no puede cazar esto.** Su `where` estaba perfectamente
definido; el problema no era un filtro vacío sino un borrado que no se ejecutó y
otro que no pudo. Son dos fallos distintos con la misma cara —filas TEST en la
base compartida— y el helper sólo cubre el primero.

**Arreglo.** La limpieza de lo que crea un `it` va en un `afterEach`, que corre
falle o no la prueba, nunca al final del cuerpo. Y el `afterAll` borra todo lo
que la corrida pudo dejar, no sólo lo que el `beforeAll` creó a mano.

**Y una segunda fuga que se vio de camino: el `Scope`.** Cinco pruebas de
apiario y `coordenadasDelSitio` lo creaban en `beforeAll` y no lo borraban
nunca. Se borra **después** del `Assignment`, que lo referencia con `RESTRICT`.
Al escribir esto la base local llevaba **284** `Scope` huérfanos acumulados.

**Lo que lo destapa es contar filas, no leer el verde.** Flip-test, con la
quietud de la base comprobada antes —dos lecturas iguales sin correr nada en
medio, porque otras sesiones escriben ahí y una ventana sucia no mide nada—:

| versión | pruebas | `Scope` huérfanos project/location |
|---|---|---|
| antes del arreglo | 55/55 ✓ | 245/39 → **250/40** |
| después | 55/55 ✓ | 245/39 → **245/39** |

**Las dos filas dicen 55/55.** Una compuerta que sólo mira el color no
distingue estas dos columnas: hay que contar la basura antes y después.

Y el caso original, mutando una aserción de esa prueba a un valor falso: antes
caían **2** —la mutada y otra, arrastrada por la visita que sobrevivió— y
quedaban **7 filas** en la base; después cae **1** y quedan **0**. Un fallo que
se multiplica por tres es la firma de este defecto, no de tres defectos.

### Un admin de plataforma ve la base compartida entera

**Síntoma.** 2026-09-17, tres veces en tres ramas que no tocaban nada de lo que
la prueba lee: `reporteDeProceso.test.ts` fallaba en el carril con base
(`expected 3 to be 1`) y **pasaba siempre sola**.

**Causa.** El fixture le daba a su usuario **Platform Admin en ámbito de
plataforma**. Con eso `resolveLotVisibility` devuelve `mode: "all"`, y la
función bajo prueba calcula sobre **toda la base**, no sobre lo que el archivo
creó. Los archivos corren en paralelo contra la misma base, así que el recuento
sumaba los procesos que `lotProcess.test.ts` tenía vivos en ese instante. Sola,
la prueba nunca tiene vecinos: por eso pasaba.

**Filtrar por el RUN no basta si la función no deja filtrar**: un agregado
(`faltan.procesosCerrados`) no tiene dónde meter el filtro. Lo que aísla es el
**ámbito del usuario**: Farm Operator de su propio plot, y la visibilidad real
hace el resto.

**Y que la prueba afirme el aislamiento.** Con el ámbito acotado, un recuento
de lo visible puede ser **exacto** (`toBe(2)`, no `>= 2`). Si alguien vuelve a
darle ámbito de plataforma, cae **siempre** —la base tiene lotes sembrados— en
vez de a veces. Flip-test: volver a poner el admin → `expected 56 to be 2`.

**Reproducirlo sin esperar a la suerte:** una prueba temporal, no commiteada,
que crea la fila ajena en `beforeAll`, la mantiene viva 20 s en un `it` y la
borra en `afterAll`; correrla en el mismo `vitest run` que la sospechosa.

**La forma lenta del mismo defecto: una lista con tope.** Si la función corta
en N (`LIST_LIMIT`, `take: 500` y 200 visibles…), un admin ve todo, y lo propio
sale de la lista cuando otros dejan N filas que ordenan antes. No falla hasta el
día que la basura acumulada cruza el tope. Dos casos medidos el 2026-09-18 en
`PENDING_IMPLEMENTATIONS/012`.

### Un `failure` de Actions puede ser el presupuesto, y el job nunca arrancó

**2026-09-14.** Un PR salió con `¿Hay código en este cambio?: FAILURE` y las otras tres
compuertas `SKIPPED`. Se lee exactamente como un cambio que rompe la primera compuerta y
deja sin correr a las demás. **No lo era: el job nunca recibió un runner.** Es la hermana
de la cuota de Vercel de más arriba, con la misma forma —un tope de cuenta disfrazado de
fallo del cambio— y en otro proveedor.

**El discriminante no es la conclusión: es que el job no tiene runner ni pasos.**

```bash
gh api repos/<owner>/<repo>/actions/jobs/<job-id> \
  --jq '"runner=\(.runner_name) pasos=\(.steps|length) dur=\(.started_at)→\(.completed_at)"'
# muerto por presupuesto:  runner=""                      pasos=0   3 segundos
# corrida real:            runner="GitHub Actions 10000…" pasos=5
```

Y **lo dice con todas sus letras en las anotaciones**, que es donde no miré primero:

```bash
gh api repos/<owner>/<repo>/check-runs/<job-id>/annotations --jq '.[].message'
# → The job was not started because an Actions budget is preventing further use.
```

`gh run view --log-failed` **no sirve aquí**: devuelve `log not found`, porque no hay log
que devolver. Eso también es señal, y se lee como una avería de la herramienta.

**Dos consecuencias prácticas.** Relanzar no lo arregla —lo probé, el intento 2 salió
idéntico— y hay que mirar si le pasa a **otras ramas**: si la corrida de `main` de un
minuto antes tiene la misma firma, no es el PR. Con la protección de rama exigiendo esos
checks, **nada se puede fusionar** hasta que el dueño suba el límite en
`github.com/settings/billing`; Vercel es independiente y sigue desplegando.

### `cancelled` no es `failure`, pero tampoco es verde

**Síntoma.** 2026-09-11. Fusionado un PR, miré el estado del commit en `main`
—que es lo que manda «Cómo se despliega», más arriba— y leí la lista de
comprobaciones por encima: ninguna decía `failure`, así que di el merge por
bueno. No lo era. Dos de ellas decían **`cancelled`**, y una cancelada no ha
comprobado nada.

**Causa.** El grupo de concurrencia del workflow **cancela la corrida del
commit anterior en cuanto entra otra fusión**. Con varias sesiones fusionando
el mismo día, eso pasa solo. Le ocurrió a dos commits seguidos —el mío y el que
lo pisó— dentro de la misma media hora de tráfico.

**No es una avería, es tráfico.** Medido sobre los 20 commits más recientes de
`main`: **15 `success`, 2 `cancelled`, 0 `failure`**, y 3 sin corrida o todavía
en marcha. Un 10 %, concentrado en las rachas.

**Lo que engaña es la forma de leerlo.** `cancelled` se parece a «terminó» y no
se parece a «rojo», así que un vistazo a la columna de estados lo cuenta como
hecho. Sólo lo delata imprimir **la conclusión de cada comprobación**, una por
línea, en vez de un resumen o un «¿hay algún fallo?».

**CORREGIDO EL 2026-09-14: `main` ya no tiene corrida, así que la mitad de esta
sección describe un mundo que no existe.** El dueño quitó el disparador `push` del
workflow —Actions se comía 576 corridas en catorce días, **293 de ellas de `push`**,
y agotó el presupuesto de la cuenta—. Ahora sólo corre `pull_request`.

**Lo que sigue valiendo, y es la parte que importa:** el verde que juzga un cambio es
**el del PR**, donde la corrida no compite con nadie. Eso ya lo decía esta sección y
ahora es lo único que hay.

**Lo que dejó de valer:** buscar el commit de `main` que lleva el cambio y leer sus
comprobaciones. **No habrá ninguna.** Cero comprobaciones en `main` es lo normal
desde hoy, no una señal de nada — y confundir «no hay corrida» con «no llegó a
correr» es exactamente la lectura que esta sección enseñaba a evitar. Lo que sí se
verifica después de fusionar es **el contenido**, que no depende de Actions:

```bash
# ¿está mi cambio en main? Por CONTENIDO, nunca por el SHA.
gh api "repos/<owner>/<repo>/contents/<ruta>?ref=main" --jq .content | base64 -d | grep -c '<marca del cambio>'
# y el despliegue, que es de Vercel y NO depende de Actions:
gh api repos/<owner>/<repo>/commits/<sha>/status --jq '.statuses[] | .context + ": " + .state'
```

**Y lo que se perdió al quitarlo, dicho sin adornos:** la red de después. `main` ya no
tiene compuerta propia, así que el caso de dos PR verdes por separado que juntos
rompen `main` deja de estar cubierto. La protección de rama sigue exigiendo los tres
checks y se evalúan sobre el PR, así que nada entra sin revisar — pero nadie vuelve a
mirar después.

El `cancelled` sigue siendo real **dentro de un PR** cuando se empuja dos veces
seguidas a la misma rama: el grupo de concurrencia cancela la corrida anterior. Ahí la
regla original se aplica igual — leer **la conclusión de cada comprobación**, una por
línea, nunca un resumen.

### Un PR en conflicto no tiene las compuertas en rojo: no las tiene

**Síntoma.** 2026-09-26, PR #484. El panel decía `failing: 0` y dos comprobaciones
en `SUCCESS`. Lo leí como verde y fui a fusionar. Las dos eran **de Vercel**: las
**tres** que la protección de `main` exige no aparecían en la lista **en absoluto**.

**Causa.** El PR estaba en conflicto con `main` —había entrado otra fusión debajo—.
Un workflow de `pull_request` corre sobre la **referencia de fusión**, y GitHub no
puede construirla si hay conflicto, así que el workflow **nunca arranca**. No hay
rojo porque no hay corrida.

**Por qué engaña, y en qué se distingue de las de arriba.** En la cuota de Actions
el job arranca y sale `failure`; en `cancelled` arranca y se corta. Aquí **no
existe**, y `failing: 0` es literalmente cierto y completamente vacío. Es la misma
familia: una lectura que halaga la hipótesis porque el instrumento no midió nada.

**El discriminante es CONTAR, no leer el color.** Un PR sano de este repositorio da
**6**; el mío daba **2**:

```bash
gh pr view <n> -R <owner/repo> --json statusCheckRollup --jq '[.statusCheckRollup[]?] | length'
gh pr view <n> -R <owner/repo> --json mergeable,mergeStateStatus --jq '"\(.mergeable) \(.mergeStateStatus)"'
```

`CONFLICTING` / `DIRTY` en la segunda línea explica la primera. Y el control es
barato: correr lo mismo sobre un PR reciente que sí fusionó. Los #478, #479, #480 y
#482 dieron 6 cada uno.

**Lo que NO es.** No es un agujero por el que se cuele un cambio sin verificar: la
protección exige tres contextos por nombre, así que GitHub bloquea la fusión de
todas formas. Lo que se pierde es el **diagnóstico** — se concluye «CI está roto» o
se espera un verde que no va a llegar nunca, cuando lo que hace falta es resolver el
conflicto. Resuelto, las comprobaciones pasaron de **2 a 6** al instante.

**Corolario para cualquier espera de CI:** antes de interpretar estados, comprobar
que estén **las que deben estar**. Una comprobación ausente no tiene color.

## Al cerrar la sesión

Los ocho pasos están en `SESSION_STATE.md` §5. El primero es actualizar
`SESSION_STATE.md`: **es el entregable, no el diff.** Ninguna lección se escribe
solo en un log de sesión — nada los lee.
