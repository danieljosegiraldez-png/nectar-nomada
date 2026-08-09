# NÉCTAR NÓMADA — Content Intelligence, Interactive Media & Experience Architecture
## Architecture exploration for Claude Code
**Prepared:** 2026-08-09  
**Purpose:** Extend the Néctar Nómada platform beyond data management into a high-quality, interactive, audiovisual and AI-assisted publishing/experience system built primarily around original Néctar Nómada content and verified project data.

---

# 0. Core idea

Néctar Nómada should not treat content as a folder of photos plus blog posts.

It should treat content as a **traceable multimodal knowledge layer**.

A field visit may generate:

- photographs;
- video clips;
- drone footage;
- 360 imagery;
- audio interviews;
- voice notes;
- transcripts;
- quotes;
- maps;
- GPS tracks;
- weather/environmental observations;
- research observations;
- species observations;
- samples;
- sensory evaluations;
- products;
- people;
- places;
- events;
- experiences.

Those should become structured, related objects that can be reused to create many experiences without duplicating facts.

Example:

```text
Field Visit
 ├─ Location: Finca Rosina
 ├─ People: Sherry, Bob, collaborators
 ├─ Projects: Las Nubes
 ├─ Media
 │   ├─ Photos
 │   ├─ Video clips
 │   ├─ Interview audio
 │   └─ Drone/360
 ├─ Observations
 ├─ Environmental data
 ├─ Coffee lots
 ├─ Apiary observations
 ├─ Biodiversity observations
 └─ Stories / derived content
```

From the same source material the platform might later create:

- interactive farm profile;
- two-minute documentary;
- 30-second social reel;
- producer biography;
- map story;
- research timeline;
- audio walk;
- tasting introduction;
- event screen;
- tourism itinerary;
- educational module;
- personalized customer recommendation.

The platform must preserve one source-of-truth relationship graph underneath all of those presentations.

---

# 1. Content architecture principle

Separate:

```text
SOURCE ASSET
      ↓
MEDIA DERIVATIVES
      ↓
CONTENT INTELLIGENCE
      ↓
EDITORIAL OBJECTS
      ↓
EXPERIENCE COMPOSITIONS
      ↓
CHANNEL OUTPUTS
```

Do not store each final post/video/page as an isolated copy of the information.

---

# 2. Source Asset Layer

Create a canonical `MediaAsset` / `SourceAsset` model capable of representing:

- photo;
- video;
- audio;
- 360 panorama;
- drone footage;
- document;
- scanned record;
- illustration;
- diagram;
- map;
- dataset;
- sensor/log file;
- transcript;
- subtitle file;
- generated derivative.

Recommended metadata:

```text
asset_id
original_filename
asset_type
mime_type
checksum
file_size
width
height
duration
frame_rate
orientation
capture_timestamp
capture_timezone
camera/device
creator
rights_owner
license
consent_status
location
coordinates
project
event
field_visit
related_people
related_organizations
related_samples
related_lots
related_species
original_or_derivative
parent_asset
derivative_type
processing_history
visibility
confidentiality
approval_status
storage_uri
delivery_uri
```

Originals must remain immutable.

AI-created or AI-altered media must always be explicitly identifiable as derived/generated content.

---

# 3. Media Derivative Pipeline

The platform should create device-appropriate derivatives rather than serving originals directly.

Potential derivative types:

## Images

- responsive resolutions;
- thumbnails;
- WebP/AVIF;
- social crops;
- portrait crops;
- square crops;
- hero crop;
- low-quality preview;
- map thumbnail;
- print derivative.

## Video

- streaming rendition ladder;
- poster frames;
- animated preview;
- vertical 9:16;
- horizontal 16:9;
- square;
- short excerpts;
- captions;
- transcript;
- chapters;
- contact sheet;
- audio-only derivative.

## Audio

- compressed web copy;
- waveform;
- transcript;
- chapters;
- quote clips;
- translated transcript;
- subtitle/synchronized transcript objects.

Every derivative should point back to the original asset.

---

# 4. Recommended Media Infrastructure

## 4.1 Cloudinary

Current official documentation:
https://cloudinary.com/documentation

Useful capabilities:

- image/video upload;
- media asset management;
- metadata;
- transformations;
- responsive delivery;
- derived assets;
- delivery optimization;
- REST Upload API;
- REST Admin API.

Official APIs:
https://cloudinary.com/documentation/image_upload_api_reference
https://cloudinary.com/documentation/admin_api

Potential role:

**media transformation + delivery layer**

Do not allow Cloudinary to become the canonical business-data database.

Store canonical `MediaAsset` metadata in PostgreSQL and the provider asset ID as an external reference.

---

## 4.2 Mux

Current official docs:
https://www.mux.com/docs

Mux provides developer-focused:

- video ingest;
- adaptive streaming;
- live streams;
- playback;
- video processing;
- video analytics;
- API/webhook workflows.

Potential role:

**video streaming infrastructure**

Especially useful for:

- documentary clips;
- live competition feeds;
- live sensory events;
- event broadcasts;
- long-form field footage.

Do not necessarily use both Cloudinary video and Mux video. Evaluate responsibilities and cost.

Possible split:

```text
Cloudinary → image asset pipeline
Mux        → video streaming pipeline
```

---

## 4.3 Vimeo API — optional alternative

Official:
https://developer.vimeo.com/

Player SDK:
https://developer.vimeo.com/player/sdk/reference

Useful if Néctar Nómada already develops a Vimeo-hosted video library or wants editorial/private-video workflows.

Do not add Vimeo merely because it exists if Mux/object-storage delivery already covers the requirement.

---

# 5. Content Intelligence Layer

The platform should understand source content before attempting to generate new content.

Create asynchronous enrichment jobs.

Potential enrichment outputs:

```text
Asset
 ├─ transcript
 ├─ language
 ├─ detected scene changes
 ├─ suggested subjects
 ├─ suggested project links
 ├─ suggested location links
 ├─ suggested taxonomy tags
 ├─ visual quality indicators
 ├─ audio quality indicators
 ├─ quote candidates
 ├─ chapters
 ├─ semantic embedding
 └─ editorial suggestions
```

AI suggestions must never silently become approved metadata.

Model:

```text
AISuggestion
  type
  source_asset
  suggested_value
  confidence
  supporting_context
  model/provider
  created_at
  status
  reviewed_by
  accepted_value
```

Status:

```text
PROPOSED
ACCEPTED
MODIFIED
REJECTED
SUPERSEDED
```

---

# 6. Speech, Interviews & Oral History

Original interviews are one of Néctar Nómada's most valuable content sources.

The system should treat interviews as structured research/content objects.

Suggested model:

```text
Interview
 ├─ Participants
 ├─ interviewer
 ├─ location
 ├─ project
 ├─ date
 ├─ original audio/video
 ├─ transcript
 ├─ transcript segments
 ├─ speaker turns
 ├─ topics
 ├─ quotes
 ├─ consent / release
 └─ derived stories
```

---

# 7. Speech-to-Text Providers

## Deepgram

Official docs:
https://developers.deepgram.com/

Current platform includes:

- prerecorded speech-to-text;
- streaming speech-to-text;
- text-to-speech;
- voice-agent infrastructure.

Potential use:

- interviews;
- field voice notes;
- live event captions;
- competition transcription;
- search across recorded conversations.

---

## AssemblyAI

Official docs:
https://www.assemblyai.com/docs

Current platform includes:

- prerecorded transcription;
- real-time transcription;
- speech-understanding features.

Potential use:

alternative transcription adapter.

---

## ElevenLabs

Official docs:
https://elevenlabs.io/docs/overview/intro

Current platform includes:

- text-to-speech;
- speech-to-text;
- dubbing/voice infrastructure;
- generative audio capabilities.

Potential uses:

- multilingual narration;
- accessibility narration;
- optional dubbed documentary content;
- guided audio experiences.

### Critical voice rule

Do not clone or synthesize the voice of a producer, collaborator or participant without explicit consent and documented usage rights.

Human testimony should default to the original human recording whenever practical.

---

# 8. Transcript as Navigable Media

A transcript should not be plain text attached to a video.

Represent timed segments:

```text
TranscriptSegment
  start_time
  end_time
  speaker
  text
  language
  translated_text
  topics
  linked_entities
  quote_candidate
```

This enables:

- click transcript → seek video;
- search phrase → open exact video timestamp;
- generate quote cards;
- create chapter navigation;
- compare producer interviews;
- retrieve all statements about a project topic;
- produce subtitled multilingual experiences.

---

# 9. Multimodal Semantic Search

Eventually the platform should let users search meaning rather than filenames.

Example queries:

> "Show me footage of coffee drying on African beds in Toabré."

> "Find Sherry talking about why Rosina started the farm."

> "Show all images with flowering coffee from Cerro Azul."

> "Find audiovisual material connected with pollination."

> "What footage do we have that can explain CryoBloom transport?"

Create a provider-independent embedding/search architecture.

Possible embedding units:

- story paragraph;
- interview segment;
- image;
- video chapter;
- audio segment;
- document chunk;
- species observation;
- research claim.

Keep semantic vector IDs separate from canonical content identity.

Current multimodal model APIs evolve quickly; do not hardcode the system around one model.

Potential current providers to evaluate include:

- Claude vision for image reasoning:
  https://docs.anthropic.com/en/docs/build-with-claude/vision
- Gemini multimodal APIs/embeddings:
  https://ai.google.dev/gemini-api/docs

The model used for enrichment must be recorded with each result.

---

# 10. Content Graph

Create relationships between content and actual platform objects.

Examples:

```text
MediaAsset
→ depicts Person
→ depicts Location
→ documents Project
→ documents Process
→ documents Species
→ documents Sample
→ supports EvidenceClaim
→ used in Story
→ used in Experience
→ used in Product
→ used in SocialOutput
```

This is more valuable than generic tags alone.

Tags can still exist, but first-class entity relations should drive context.

---

# 11. Editorial Content Blocks

Do not restrict stories to rich-text HTML.

Build a structured `StoryBlock` system.

Possible block types:

```text
TEXT
HEADING
QUOTE
IMAGE
IMAGE_GALLERY
VIDEO
AUDIO
MAP
MAP_ROUTE
PANORAMA_360
TIMELINE
BEFORE_AFTER
DATA_CHART
SENSORY_PROFILE
WEATHER_SNAPSHOT
SPECIES_CARD
PERSON_CARD
PRODUCT_CARD
EXPERIENCE_CARD
RESEARCH_FINDING
PROCESS_TRACE
COMPARISON
CALL_TO_ACTION
QUIZ
POLL
LIVE_DATA
ARTEFACT_VIEWER
```

A Story becomes a composition of blocks rather than one WYSIWYG blob.

This makes the same content reusable in web, mobile, installations, event screens and future channels.

---

# 12. Scrollytelling

One of the strongest formats for Néctar Nómada is **scroll-driven documentary storytelling**.

Example:

```text
INTRO
full-screen cloud forest video

↓ scroll

MAP
Panama → Cerro Azul → farm boundary

↓ scroll

TERRAIN
elevation appears

↓ scroll

PERSON
producer audio begins

↓ scroll

AGRICULTURE
coffee plants / harvest

↓ scroll

PROCESS
animated processing trace

↓ scroll

DATA
temperature / humidity timeline

↓ scroll

SENSORY
coffee profile appears

↓ scroll

ACTION
book visit / taste coffee / explore project
```

The editorial system should let content managers configure this without writing custom JavaScript for each story.

---

# 13. Map-Based Storytelling

Mapbox GL JS remains a current actively documented option for interactive maps:

https://docs.mapbox.com/mapbox-gl-js/guides/

Potential experience:

### Living Territory Map

A user moves through Panama and toggles:

- coffee;
- apiaries;
- honey;
- biodiversity;
- projects;
- people;
- research;
- experiences;
- events;
- protected/environmental context.

Clicking a point should not just open a popup.

It can transition into a location story.

Potential route story:

```text
Panama City
   ↓
Cerro Azul
   ↓
farm
   ↓
specific lot
   ↓
coffee journey
```

---

# 14. 3D Geospatial Experiences

CesiumJS is currently active and supports 3D geospatial experiences and 3D Tiles:

https://cesium.com/learn/cesiumjs-learn/
https://cesium.com/why-cesium/3d-tiles/

Possible applications:

- fly from Panama → mountain → farm;
- visualize elevation;
- show watershed;
- show cloud/terrain relationships;
- overlay farm polygons;
- add image/video hotspots;
- show experiment locations;
- visualize journey/transport route.

Do not use 3D simply for spectacle.

Use it when terrain, distance, elevation or geography actually explains the story.

---

# 15. 360° Farm / Apiary / Facility Experiences

Marzipano remains an active lightweight WebGL panorama viewer with a JavaScript API:

https://www.marzipano.net/

Possible experience:

### Explore the Farm

360 scene with hotspots:

```text
Coffee tree
→ cultivar information

Flower
→ pollination/biodiversity

Beehive
→ apiary story

Drying bed
→ process explanation

Producer
→ play interview

Mountain
→ elevation/weather

Coffee
→ taste/book/buy
```

A panorama should be represented as another experience composition linked to canonical platform entities.

---

# 16. Digital Twin Lite

Do NOT begin with a full "metaverse."

A useful lightweight digital twin can be:

```text
Terrain
+ farm polygon
+ key buildings
+ trails
+ equipment locations
+ sensors
+ apiaries
+ media hotspots
+ project layers
```

Use 2.5D/3D only where it improves comprehension.

Potential technologies:

- CesiumJS for geospatial 3D;
- Three.js for custom 3D interactive scenes:
  https://threejs.org/docs/

Keep the canonical geometry/data independent of rendering library.

---

# 17. Interactive Process Trace

The same traceability data used internally should produce public storytelling when fields are approved for release.

Example:

```text
Harvest
  06:40

Cold Hold
  10–12°C

Transport
  Boquete → Toabré

Processing
  fermentation stage

Drying
  greenhouse / African beds

Rest
  storage

Roast
  profile

Brew
  recipe

Sensory
  panel result
```

Users should be able to tap stages and reveal:

- photo;
- video;
- timestamp;
- environmental context;
- person;
- equipment;
- approved explanation.

This can become a core Néctar Nómada visual language.

---

# 18. "Time Machine" Experiences

For recurring projects, allow users to compare time.

Examples:

### Farm through the year

slider:

```text
JAN ─ FEB ─ MAR ─ APR ... DEC
```

Changing month updates:

- imagery;
- flowering;
- rainfall;
- temperature;
- harvest status;
- apiary activity;
- stories.

### Experiment timeline

Compare:

```text
T0
T+12h
T+24h
Drying
Storage
Roast
Sensory
```

### Satellite before/after

Use Sentinel imagery for visual comparison with explicit dates and cloud/quality information.

---

# 19. Sensory Experience Interface

Sensory should be an audiovisual interaction system, not only a form.

Possible session flow:

```text
1. Welcome
2. Calibration/instructions
3. Blind code revealed
4. Timer
5. Aroma evaluation
6. Flavor evaluation
7. Descriptor selection
8. Intensity controls
9. Optional voice note
10. Submit
11. Lock assessment
12. Reveal results when protocol allows
13. Compare with panel
14. Explore origin/story
```

For public guided experiences:

visuals should be intentionally restricted before evaluation if they could bias perception.

After submission, the experience can open:

- origin;
- producer;
- process;
- sensory comparison;
- product;
- booking;
- related stories.

---

# 20. Live Sensory & Competition Mode

Potential real-time experience:

```text
Head Judge Dashboard
      ↓
Flight starts
      ↓
Judge devices synchronize
      ↓
Timer / blind samples
      ↓
Assessments lock
      ↓
Aggregation
      ↓
Head Judge review
      ↓
Results
```

Audience mode may show:

- category;
- anonymized progress;
- educational content;
- live stream;
- map/origin information only after allowed by competition rules.

Never leak blind identities through public realtime channels.

---

# 21. Real-Time Collaboration

Liveblocks currently provides real-time collaboration infrastructure for people and AI agents:

https://liveblocks.io/

Potential uses:

- collaborative story editing;
- annotations;
- editorial review;
- research comments;
- producer approval;
- live event operations.

Do not introduce it into the MVP unless realtime collaboration is actually needed.

A simpler database + optimistic concurrency model may be sufficient initially.

---

# 22. Dynamic Video Generation

## Remotion

Current official platform:
https://www.remotion.dev/
Docs:
https://www.remotion.dev/docs/

Remotion generates video and motion graphics programmatically using React.

Potential Néctar Nómada uses:

### Automatic but human-reviewed outputs

- event recap;
- experiment summary;
- coffee traceability reel;
- producer introduction;
- tasting-result animation;
- competition award card/video;
- seasonal farm update;
- project timeline;
- bilingual social video.

Example:

```text
Project data
+ approved photos
+ approved clips
+ map animation
+ approved text
+ subtitles
+ branding
      ↓
Remotion composition
      ↓
draft MP4
      ↓
human approval
      ↓
publish
```

This is significantly safer than asking an AI video model to invent documentary footage.

---

# 23. Generated Content Policy

Distinguish at least:

```text
ORIGINAL_CAPTURE
DOCUMENTARY_EDIT
NON_DESTRUCTIVE_DERIVATIVE
DATA_VISUALIZATION
AI_ASSISTED_EDIT
AI_GENERATED_ILLUSTRATION
AI_GENERATED_AUDIO
AI_GENERATED_VIDEO
```

For research/documentary storytelling:

Original captured media should dominate.

AI should primarily help:

- organize;
- find;
- summarize;
- translate;
- subtitle;
- crop;
- format;
- draft;
- storyboard;
- suggest;
- create explanatory graphics.

Do not let generative visuals masquerade as documentation of a real farm, person, experiment or historical event.

---

# 24. Interactive Data Visualization

Use actual project data to create experiences.

Potential views:

- temperature timeline;
- pH / Brix progression;
- drying curve;
- fermentation timeline;
- rainfall comparison;
- sensory radar;
- panel distribution;
- harvest volume;
- honey yield;
- pollinator observations;
- satellite vegetation trend;
- elevation profile;
- route travel profile.

Charts should support:

- hover/tap;
- annotations;
- provenance;
- source;
- units;
- sample identity;
- export where permitted.

A public visualization must only expose approved fields.

---

# 25. Content-Provenance UI

Make provenance visible without making pages feel academic.

Possible UI:

```text
SOURCE

Captured at Finca Rosina
July 2026

Weather:
NASA POWER contextual data

Observation:
Néctar Nómada field record

Photography:
Daniel Giraldez

Research status:
Preliminary
```

Users can optionally expand "How we know this."

This supports the Néctar Nómada science/storytelling identity.

---

# 26. AI Story Assistant

AI should work inside the editorial system.

Example commands:

> "What content do we already have for Las Nubes?"

> "Find footage that supports the producer story without reusing the CryoBloom launch footage."

> "Build a 90-second storyboard using only approved original assets."

> "Which claims in this draft are not linked to approved evidence?"

> "Find three strong quotes about soil."

> "Create an English subtitle draft."

> "Create Instagram, website and event-screen variants of this approved story."

The assistant should return references to real assets and records rather than hallucinating content.

---

# 27. Story Coverage Matrix

Create automated coverage analysis.

Example:

| Project | People | Place | Process | Data | Sensory | Biodiversity | Video | Audio | Product | Experience |
|---|---|---|---|---|---|---|---|---|---|---|
| Las Nubes | ✓ | ✓ | ✓ | partial | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Project X | ✓ | ✓ | missing | ✓ | missing | partial | missing | ✓ | — | — |

AI can then suggest:

> "The project has strong process and environmental documentation but no recorded producer interview."

This is a much better content-generation trigger than generic "generate a post."

---

# 28. Editorial Opportunity Detection

Potential AI rules:

```text
IF project has:
  new field visit
  + 10 approved photos
  + interview
  + environmental data
THEN suggest:
  Field Story
```

```text
IF experiment becomes approved for public communication
  + sensory results
  + media
THEN suggest:
  Research Story
  Animated Process Trace
  Short Video
```

```text
IF experience date approaches
  + available capacity > 0
THEN suggest:
  Experience promotion package
```

Suggestions require human approval.

---

# 29. Personalized Storytelling

Registered users can see different ordering of approved content based on declared/interpreted interests.

Example visitor A:

```text
Coffee → Processing → Sensory → Buy
```

Visitor B:

```text
Biodiversity → Bees → Forest → Visit
```

Visitor C:

```text
People → Heritage → Gastronomy → Expedition
```

Do not generate different underlying facts.

Personalization should change:

- ordering;
- recommended next objects;
- depth;
- format.

Not factual truth.

---

# 30. Progressive Disclosure

Different audiences should not receive the same density.

## Public

simple story + optional depth.

## Enthusiast

process + sensory + maps.

## Technical

methods + data + sources + uncertainty.

## Research collaborator

full authorized project records.

One canonical object can therefore support multiple presentations.

---

# 31. "Choose Your Lens"

Potential signature UX element.

At a farm/project:

```text
EXPLORE AS:

[ Traveler ]
[ Coffee Lover ]
[ Brewer / Fermenter ]
[ Researcher ]
[ Beekeeper ]
[ Judge / Sensory Professional ]
```

The page reorganizes existing approved content around that lens.

This is more meaningful than merely changing the dashboard by user role.

---

# 32. Audio-First Field Experience

At a farm, visitor scans QR or opens location.

Headphones mode:

```text
"You're standing beside..."
```

The guide can combine:

- original producer voice;
- narration;
- location triggers;
- images;
- maps;
- species cards;
- tasting notes.

Potential modes:

- 10-minute highlights;
- deep technical;
- children/family;
- Spanish;
- English.

Do not require continuous connectivity; cache selected experience content in PWA where practical.

---

# 33. QR / NFC Physical-Digital Bridge

Physical products and locations should link into the graph.

Examples:

Coffee bag QR:

```text
Product
→ lot
→ farm
→ producer
→ process
→ roast
→ sensory
→ story
→ related experience
```

Honey jar:

```text
Honey batch
→ apiary
→ location
→ flora
→ harvest
→ sensory
→ beekeeper
```

Event card:

```text
Competition
→ category
→ anonymized session
→ post-event results
```

NFC can be added later but QR should work universally.

---

# 34. Digital Passport

A registered user's `Néctar Passport` can collect genuine interactions:

- places visited;
- experiences attended;
- coffees tasted;
- honey tasted;
- producers encountered;
- competitions judged;
- workshops completed;
- projects followed.

Avoid arbitrary points.

Use it as a personal archive of exploration.

---

# 35. Interactive Collections

Allow users to create collections:

```text
"Coffee processes I want to compare"
"My Cerro Azul trip"
"Favorite honey"
"Fermentation references"
"Plants I saw"
```

Collections become another personalization signal.

---

# 36. Accessibility as Experience Quality

Every media workflow should plan for:

- captions;
- transcripts;
- keyboard controls;
- reduced-motion mode;
- readable contrast;
- alternative text;
- audio descriptions where valuable;
- no information conveyed only by color;
- mobile touch targets;
- fallback for WebGL/3D.

Immersive does not mean inaccessible.

---

# 37. Low-Bandwidth / Field Mode

Panama field connectivity will not always support rich media.

Every immersive component needs graceful fallback.

Example:

```text
3D terrain
→ fallback interactive 2D map
→ fallback static map image

4K documentary
→ adaptive stream
→ low-bandwidth audio + transcript

360 tour
→ image gallery
```

PWA caching priorities:

- itinerary;
- map region;
- essential farm/location information;
- field forms;
- selected media;
- QR-linked product story.

---

# 38. Content CMS Decision

Néctar Nómada already requires a canonical relational database.

Do not automatically introduce a second authoritative content database.

A strong default is:

```text
PostgreSQL
  canonical entities
  stories
  story blocks
  approvals
  relations

Object storage/media provider
  media binaries

Search/vector store
  derived indexes
```

## Optional Sanity evaluation

Sanity remains an active structured-content platform with Content Lake and HTTP APIs:

https://www.sanity.io/docs/content-lake
https://www.sanity.io/docs/http-reference

Use only if the editorial experience justifies operating a second content platform.

If introduced:

Sanity should not become authoritative for scientific/project facts.

Prefer references back to canonical Néctar Nómada IDs.

---

# 39. Product Analytics & Experience Experimentation

## PostHog

Feature flags:
https://posthog.com/docs/feature-flags

Potential uses:

- feature flags;
- gradual rollout;
- UX experiments;
- product analytics;
- session replay where privacy policy permits.

Potential experiments:

- map-first vs story-first landing;
- sensory result visualization;
- experience-booking flow;
- story length;
- call-to-action placement.

Do not experiment on scientific scoring rules or competition outcomes without explicit protocol design.

---

# 40. Interactive Museum / Event Mode

The same platform can drive installations.

Example event screen:

```text
LIVE MAP
   |
origin points appear

NOW TASTING
Sample B

ENVIRONMENT
farm weather

STORY
producer video

AUDIENCE
anonymous sensory aggregate

RESULT
revealed at end
```

Build output surfaces as clients of the same APIs.

Avoid making event presentations separate one-off databases.

---

# 41. Public Research Explorer

Potential interface:

```text
QUESTION
Does cold handling change...?

↓
PROJECTS

↓
EXPERIMENTS

↓
EVIDENCE

↓
SENSORY

↓
CURRENT CONCLUSION

↓
LIMITATIONS

↓
WHAT WE ARE TESTING NEXT
```

This gives research a narrative interface without oversimplifying the evidence.

---

# 42. Interactive Evidence Layer

A public claim can expose:

```text
Claim:
"X"

Evidence:
3 project observations

Status:
Preliminary

Limitations:
...

Last reviewed:
...
```

For internal users:

click through to source records.

This directly operationalizes the existing Evidence Claim architecture.

---

# 43. Dynamic Project Homepage

Project pages should be generated from connected objects.

Example:

```text
HERO
latest approved media

CURRENT STATUS
active / harvest / sensory / etc.

STORY
why project exists

MAP
where

PEOPLE
who

TIMELINE
what happened

DATA
key approved metrics

MEDIA
field documentation

RESEARCH
questions/findings

PRODUCTS
available

EXPERIENCES
bookable

NEXT
follow / visit / taste / buy
```

No project page should require copying all this information manually.

---

# 44. Content Reuse Rules

One approved quote can be used in:

- article;
- video;
- Instagram card;
- event screen;
- product page.

But each use should reference:

```text
source_quote_id
source_interview_id
usage_context
editorial_version
```

Do not copy/paste text until provenance is lost.

---

# 45. Programmatic Visual Production

Use templates, not generic AI art, for recurring branded information.

Examples:

- lot card;
- location card;
- sensory radar animation;
- event countdown;
- producer quote;
- weather update;
- project milestone;
- competition result;
- tasting comparison.

Potential rendering:

- server-side HTML/image rendering;
- SVG;
- canvas;
- Remotion for video.

Templates should use approved brand tokens.

---

# 46. Content Versioning

Represent:

```text
Story
StoryVersion
StoryBlock
StoryPublication
```

Publication surfaces:

```text
WEB
APP
SOCIAL_DRAFT
EVENT_SCREEN
EMAIL
QR_EXPERIENCE
PRINT_EXPORT
```

Do not overwrite published editorial history.

---

# 47. Content Approval Workflow

Suggested:

```text
DRAFT
↓
AI_ASSISTED_DRAFT
↓
EDITORIAL_REVIEW
↓
FACT_CHECK
↓
RIGHTS_CHECK
↓
APPROVED
↓
PUBLISHED
↓
SUPERSEDED
```

Sensitive research-derived stories may also require:

```text
RESEARCH_APPROVAL
```

before publication.

---

# 48. Rights & Consent

Create first-class rights records.

```text
ConsentRecord
RightsGrant
UsageRestriction
ReleaseDocument
License
Expiration
Territory
AllowedChannels
```

Examples:

- producer can appear on website but not paid advertising;
- photographer grants web/social rights;
- interview is research-only;
- stock image requires attribution;
- music is licensed only for event use.

AI should check rights before suggesting publication.

---

# 49. Music & Ambient Sound

Original soundscapes can become part of the experience.

Capture:

- forest;
- rain;
- coffee processing;
- fermentation;
- brewery;
- bees;
- market;
- producer environment.

Store as `AudioAsset`.

Potential use:

- documentary bed;
- immersive map;
- audio walk;
- event installation.

Avoid autoplay audio on ordinary web pages.

---

# 50. Field Capture Companion

Partner/mobile interface can help capture content correctly.

Before field visit:

```text
SHOT LIST
INTERVIEW QUESTIONS
MISSING COVERAGE
PROJECT TASKS
```

During visit:

```text
capture photo
capture video
record audio
scan QR
attach to project
attach location
attach person
add note
mark consent
```

After visit:

```text
upload
checksum
transcode
transcribe
AI suggestions
human review
story opportunities
```

This closes the gap between operations and content creation.

---

# 51. AI-Generated Shot List

Before a visit:

> "What are we missing for the Las Nubes story?"

AI considers current coverage and proposes:

```text
- wide establishing shot at sunrise
- drying-bed close-up
- 60-second producer explanation
- apiary ambient audio
- flowering coffee macro
- route footage
```

This is a useful form of AI content generation because it creates better **original documentation**, rather than replacing it.

---

# 52. Live Camera / Streaming

Mux supports live streams through its current API.

Potential use:

- competition finals;
- live cupping;
- field event;
- educational workshop;
- brewery release;
- farm harvest window.

Live content should automatically create:

```text
LiveEvent
→ recording
→ transcript
→ chapters
→ highlights
→ archive story
```

subject to rights and consent.

---

# 53. AI Highlight Detection

For long recordings, AI can suggest candidate ranges:

```text
00:04:13–00:05:02
Producer origin story

00:17:20–00:18:01
Explanation of process

00:28:40–00:29:11
Strong quote
```

Human editor chooses final clips.

Store accepted segments as `MediaSegment`, not duplicated source files until rendering requires it.

---

# 54. Multilingual Experience

Canonical content may have:

```text
source_language
canonical_transcript
human_translation
AI_translation
translation_status
reviewer
```

Spanish/English should be first class.

Do not use AI translation as approved public copy for critical technical/scientific material until reviewed.

---

# 55. Interactive Comparison Engine

Many Néctar Nómada stories are fundamentally comparisons.

Examples:

- washed vs honey vs experimental;
- Boquete vs Toabré;
- before vs after CryoBloom;
- apiary A vs apiary B;
- beer batch month 1 vs month 2;
- consumer vs trained panel.

Build reusable compare components:

```text
side-by-side
slider
timeline
radar
distribution
map
photo comparison
video synchronized comparison
```

---

# 56. "Follow the Sample"

Potential signature research experience:

```text
CHERRY
  ↓
BATCH
  ↓
PROCESS
  ↓
DRYING
  ↓
GREEN SAMPLE
  ↓
ROAST
  ↓
BREW
  ↓
CUP
  ↓
SENSORY RESULT
```

Each node can expose real source data/media.

This can work internally for traceability and externally for storytelling.

---

# 57. "Follow the Ingredient"

For beverage/gastronomy:

```text
Plant / Honey / Coffee / Cacao
  ↓
Producer
  ↓
Harvest
  ↓
Transformation
  ↓
Fermentation
  ↓
Product
  ↓
Sensory
  ↓
Serving
```

This makes very different Néctar Nómada domains feel like one platform.

---

# 58. "Follow the Person"

Person-centered experience:

```text
Producer
→ place
→ projects
→ interviews
→ products
→ knowledge
→ experiences
```

A person should not be reduced to a marketing biography.

Allow their actual recorded voice, work and project relationships to shape the page.

---

# 59. "Follow the Place"

Place-centered experience:

```text
Place
→ terrain
→ climate
→ flora/fauna
→ people
→ agriculture
→ projects
→ products
→ experiences
```

This should be a core Néctar Nómada interface because territory connects almost every domain.

---

# 60. Experience Composition Engine

Create an `ExperienceComposition` concept that can be rendered differently.

Possible composition:

```text
Composition
  title
  audience
  mode
  blocks[]
  required_assets[]
  fallback_blocks[]
  personalization_rules
  publication_status
```

Modes:

```text
ARTICLE
SCROLLYTELLING
MAP_STORY
GUIDED_TASTING
FIELD_GUIDE
AUDIO_WALK
EVENT_SCREEN
PROJECT_EXPLORER
PRODUCT_TRACE
RESEARCH_EXPLORER
360_TOUR
```

This avoids creating a bespoke page architecture for every immersive idea.

---

# 61. Performance Budgets

Immersive interfaces can easily become unusable.

Set budgets.

Examples to define during implementation:

- initial JS budget;
- hero media budget;
- lazy-load 3D;
- lazy-load maps;
- adaptive video;
- responsive images;
- reduced-motion alternatives;
- low-bandwidth media profiles.

Measure Core Web Vitals.

Do not load Cesium/Three.js on pages that do not need them.

---

# 62. Progressive Enhancement

Every experience should have hierarchy:

```text
BASE
semantic text + images

ENHANCED
interactive map/chart/video

IMMERSIVE
3D / 360 / live layers
```

The content must remain understandable when advanced rendering is unavailable.

---

# 63. Eventual AR / WebXR

Treat augmented/virtual reality as experimental, not MVP.

Possible future:

- point phone at coffee plant → cultivar/story;
- point at cooler → CryoBloom process overlay;
- point at product → traceability;
- AR farm trail markers.

Keep underlying annotations generic:

```text
SpatialAnnotation
  entity
  geometry
  orientation
  content
```

so they can later feed AR/WebXR without redesigning canonical data.

---

# 64. Recommended Technical Stack Extensions

Evaluate, do not blindly install all:

## Media
- Cloudinary — image/media pipeline
- Mux — streaming/video
- Vimeo — optional existing editorial video ecosystem

## Speech
- Deepgram OR AssemblyAI — transcription
- ElevenLabs — optional narration/dubbing with explicit consent

## Maps
- Mapbox GL JS OR MapLibre depending licensing/product strategy
- CesiumJS — selected 3D geospatial experiences

## 360
- Marzipano

## Custom 3D
- Three.js, only where needed

## Programmatic video
- Remotion

## Structured editorial
- Native PostgreSQL Story/StoryBlock system
- Sanity only if editorial tooling justifies secondary system

## Product analytics
- PostHog or equivalent

## Realtime collaboration
- Liveblocks only when actual collaborative editing/live-state need exists

## Multimodal AI
Provider-independent adapter:
- Claude vision
- Gemini multimodal
- future providers

Do not couple the core content model to any of these vendors.

---

# 65. New Domain Entities Recommended

Claude Code should evaluate:

```text
MediaAsset
MediaDerivative
MediaSegment
MediaCollection

Interview
Transcript
TranscriptSegment
Quote

Story
StoryVersion
StoryBlock
StoryPublication

ExperienceComposition
ExperienceBlock

ContentTopic
ContentEntityLink

AISuggestion
AIEnrichmentJob
AIEnrichmentResult

RightsGrant
ConsentRecord
UsageRestriction

SpatialAnnotation
PanoramaScene
PanoramaHotspot

MediaProcessingJob
MediaDeliveryProvider

ContentCoverageMetric
EditorialOpportunity

Translation
SubtitleTrack

LiveMediaSession
LiveMediaRecording
```

Avoid duplicating existing canonical:

```text
Person
Organization
Location
Project
Sample
Product
Experience
Event
Taxon
EvidenceClaim
```

Use relationships.

---

# 66. Content Intelligence Pipeline

Recommended workflow:

```text
1. INGEST
   Original media uploaded

2. VERIFY
   Checksum + metadata + rights + project links

3. PROCESS
   Derivatives/transcode

4. TRANSCRIBE
   Audio/video where appropriate

5. ENRICH
   AI suggestions + embeddings

6. REVIEW
   Human approves entity links/tags/quotes

7. COMPOSE
   Story/experience builder

8. FACT CHECK
   Claims checked against canonical records/evidence

9. RIGHTS CHECK
   Validate allowed channels

10. PUBLISH
   Web/app/social/event/etc.

11. ANALYZE
   Engagement/behavior

12. LEARN
   Suggest improved content coverage
```

---

# 67. Recommended First Content Vertical Slice

Do not begin with 3D or generative video.

Build one high-value complete workflow.

Suggested pilot:

## Finca Rosina / Las Nubes interactive place story

Use verified existing content only.

Components:

```text
Location
People
Project
Media gallery
Interview segment
Map
Environment snapshot
Coffee/project relationships
Story blocks
Experience CTA
```

Pipeline demonstration:

```text
Upload original
→ metadata
→ transcript
→ AI suggested entity links
→ human review
→ Story composition
→ public interactive page
```

Then add one advanced component:

**scroll-driven map/process story**

This validates the architecture before adding 360/3D/live video.

---

# 68. Second Vertical Slice

## CryoBloom — Follow the Sample

Use:

- process trace;
- location transitions;
- approved experiment data;
- media;
- temperature timeline;
- sensory comparison;
- product/event links.

This validates:

- Research OS linkage;
- data visualization;
- evidence/publication boundary;
- storytelling.

---

# 69. Third Vertical Slice

## Guided Sensory Session

Validate:

- real-time form UX;
- blind sample control;
- participant experience;
- post-submission story reveal;
- sensory analytics;
- personalized recommendations.

---

# 70. Fourth Vertical Slice

## Field Capture Companion

Validate:

- PWA;
- media upload;
- offline draft;
- project/entity linking;
- consent;
- AI coverage suggestions.

This turns content creation into an operational system rather than an afterthought.

---

# 71. Instruction to Claude Code

Before implementing these ideas:

1. inspect existing content/media architecture;
2. identify overlap with current `MediaAsset`, `Story`, `EvidenceAsset`, `Project`, `Experience` and Research OS entities;
3. do not create duplicate canonical concepts;
4. write:
   `/docs/architecture/CONTENT_EXPERIENCE_ARCHITECTURE.md`
5. define content provenance and rights models;
6. propose StoryBlock / ExperienceComposition schemas;
7. define media processing boundaries;
8. define AI enrichment governance;
9. define search/indexing architecture;
10. define the first vertical slice;
11. estimate which services require paid providers;
12. keep vendor adapters replaceable.

Do not begin by adding Cesium, Mux, Cloudinary, Sanity, Liveblocks and AI providers simultaneously.

Architecture first.

---

# 72. Design Objective

The end state should make the platform capable of turning a real project into a rich experience without fabricating the project.

A visitor should be able to move naturally through:

```text
PLACE
→ PEOPLE
→ ENVIRONMENT
→ PROCESS
→ DATA
→ STORY
→ SENSORY
→ PRODUCT
→ EXPERIENCE
→ PARTICIPATION
```

while a technical user can move through the same underlying objects as:

```text
PROJECT
→ SOURCE
→ OBSERVATION
→ SAMPLE
→ PROCESS
→ MEASUREMENT
→ EVIDENCE
→ ANALYSIS
→ CONCLUSION
```

The interface changes.

The underlying truth does not.
