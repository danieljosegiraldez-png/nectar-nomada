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
npm run test:db -- up  # restaura el backup verificado más nuevo en :55433/nectar_test
npm run check:state    # SESSION_STATE.md cabe en una lectura
npm run decisiones     # qué decisiones de Daniel siguen abiertas
node tools/browser-checks/rutas-protegidas.mjs   # autorización en el artefacto vivo
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
**Esperar el check de Vercel antes de fusionar.**

**Un deploy que dice «success» dice que la subida funcionó, no que la página
funcione.**

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
- **La alerta de backup es local a esta máquina** (P-A sigue abierta).
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

### Un guardia que pasa igual con y sin la regresión

**Síntoma.** `tests/session-state-budget.test.ts` estaba en verde. También lo
estaba con el guardia sustituido por `process.exit(0)`.

**Causa.** Solo corría el guardia contra el archivo bueno y exigía salida 0.

**Arreglo.** Cinco fixtures negativos. Comprobado: con el guardia neutralizado
caen los 6 tests, y vuelven a pasar al restaurarlo.

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

## Al cerrar la sesión

Los ocho pasos están en `SESSION_STATE.md` §5. El primero es actualizar
`SESSION_STATE.md`: **es el entregable, no el diff.** Ninguna lección se escribe
solo en un log de sesión — nada los lee.
