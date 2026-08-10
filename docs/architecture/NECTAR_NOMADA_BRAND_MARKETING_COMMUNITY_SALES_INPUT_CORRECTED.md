# NÉCTAR NÓMADA — Brand, Marketing, Sales & Community Intelligence Architecture Input
## Claude Code architecture prompt
**Prepared:** 2026-08-10  
**Status:** Architecture input only — do not implement directly.

**Confirmed context, resolved before this reaches Claude Code**: Publer
adoption is confirmed — an earlier operating decision to avoid paid
subscriptions (Meta Business Suite instead of Publer/Buffer) has been
superseded; proceed with Publer as this document describes, no need to
re-litigate that choice. This should also be logged as its own entry in
DECISIONS.md when this document is processed, since it reverses a
previously-recorded decision.

---

# 0. Purpose

Néctar Nómada needs a unified architecture for brand governance, marketing strategy, campaign planning, social publishing, creative production, audiovisual content, community management, sales enablement, product/experience promotion, consulting lead generation, CRM connection, attribution, analytics, audience intelligence, and AI-assisted marketing operations.

This is **not** simply a social-media scheduler integration.

Publer should be evaluated as a replaceable **social publishing, distribution and analytics adapter**. Néctar Nómada should remain authoritative for brand identity, brand voice, canonical facts, approved claims, audience strategy, campaigns, original media, customer identity, sales, bookings, consulting inquiries, CRM, community intelligence, attribution, learning, rights, and AI governance.

---

# 1. First instruction to Claude Code

Before making changes:

1. Read `CLAUDE.md` completely.
2. Read this document completely.
3. Read current relevant architecture documents in `/docs/architecture/` —
   the actual current set is:
   - `PLATFORM_OVERVIEW.md`
   - `DOMAIN_MODEL.md`
   - `DATA_ARCHITECTURE.md`
   - `RBAC.md`
   - `AI_GOVERNANCE.md`
   - `INTEGRATIONS.md`
   - `SECURITY.md`
   - `MVP_ROADMAP.md`
   - `DECISIONS.md`
   - `EXTERNAL_DATA_SOURCES.md`
   - `MEDIA_INTELLIGENCE_PIPELINE.md`
   - `SPECIMEN_AND_MATERIAL_TRACEABILITY.md`
   - `CONSUMER_SENSORY_FEEDBACK.md`
   - `GUIDED_FIELD_STUDY_TOOL.md`
   - `TOURISM_EXPERIENCES.md`
   - `RESEARCH_ACTIVITY_CRITERIA.md`
   - `BEVERAGE_SENSORY_PROTOCOLS.md`
   - `COMPETITIONS.md`
   - `MAP_AND_TERRITORY.md`
   - `OFFLINE_FIELD_CAPABILITY.md`
   - `TOURISM_DESIGN_RESOURCES.md`
   - `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md`
   - (confirm this list against what's actually in the directory — do not
     assume it is exhaustive or that every file above still exists under
     this exact name; verify against the real filesystem first)
4. Inspect the actual repository for existing Brand, Story, MediaAsset, Project, Product, Offering, Experience, Event, Person, Organization, CRM, Customer, Order, Booking, Consulting, AI Suggestion, analytics, approval, publication, social/account, UTM, webhook and scheduled-job infrastructure.
5. Do not assume any proposed capability below is missing.

Do **not** implement production functionality during this phase.

Create:

`/docs/architecture/BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`

After creating it, report:

1. relevant infrastructure already present;
2. recommended canonical entities;
3. what Publer should own vs what Néctar Nómada should own;
4. recommended first vertical slice;
5. what should explicitly not be built yet;
6. major architecture overlaps/conflicts;
7. decisions requiring product-owner approval.

Then stop.

---

# 2. Core architectural principle

Marketing should originate from real platform activity:

```text
REAL NÉCTAR NÓMADA ACTIVITY
Projects / People / Places / Products / Research / Sensory /
Field Visits / Harvests / Experiences / Events / Media
                    ↓
            BRAND INTELLIGENCE
                    ↓
          MARKETING INTELLIGENCE
                    ↓
        OPPORTUNITY DETECTION
                    ↓
           CAMPAIGN STRATEGY
                    ↓
           CREATIVE WORKFLOW
                    ↓
              APPROVAL
                    ↓
         DISTRIBUTION ADAPTER
                    ↓
                 PUBLER
                    ↓
      SOCIAL NETWORKS / CHANNELS
                    ↓
           PERFORMANCE DATA
                    ↓
     NÉCTAR NÓMADA ATTRIBUTION
                    ↓
Sales / Bookings / Leads / Community / Learning
```

Publer distributes. Néctar Nómada understands **what**, **why**, **for whom**, **with which evidence**, and **what happened afterward**.

---

# 3. Brand System

The brand must be represented as structured information, not only static PDFs or logos.

Evaluate a canonical Brand System that can express:

- mission;
- positioning;
- values;
- voice principles;
- tone spectrum;
- preferred terminology;
- prohibited terminology;
- claim rules;
- visual tokens;
- color tokens;
- typography tokens;
- logo usage;
- photography direction;
- illustration direction;
- audiovisual direction;
- motion direction;
- audio direction;
- CTA patterns;
- editorial rules;
- scientific-communication rules;
- prohibited treatments.

Do not create one table per concept unless justified.

---

# 4. Brand hierarchy

Evaluate inheritance and override rules for:

```text
NÉCTAR NÓMADA
    ├── CryoBloom
    ├── Las Nubes
    ├── Origin / product series
    ├── Sensory programs
    ├── Expeditions
    ├── Competitions
    └── Event identities
```

Projects may have their own emphasis without becoming separate companies.

---

# 5. Brand Voice vs AI Persona

Keep separate:

- **AI Persona:** how Ask Néctar communicates as an assistant;
- **Brand Voice:** how Néctar Nómada communicates publicly as an organization;
- **Project Voice:** project/series-specific emphasis;
- **Author Voice:** a named human author's voice.

The brand architecture must integrate with, but not duplicate, the AI persona architecture.

---

# 6. Brand governance

Public content should support risk-based review:

```text
DRAFT
↓
Brand Review
↓
Fact / Evidence Review
↓
Rights / Consent Review
↓
Marketing Approval
↓
Publication
```

Potential risk classes:

```text
LOW_RISK
STANDARD
TECHNICAL
SCIENTIFIC_CLAIM
LEGAL_SENSITIVE
PARTNER_SENSITIVE
```

Low-risk content should not require unnecessary bureaucracy.

---

# 7. Marketing objectives

Campaigns should have explicit goals, for example:

```text
AWARENESS
EDUCATION
COMMUNITY_GROWTH
ENGAGEMENT
PRODUCT_SALE
EXPERIENCE_BOOKING
EVENT_REGISTRATION
CONSULTING_LEAD
RESEARCH_PARTICIPATION
PARTNER_VISIBILITY
CUSTOMER_RETENTION
CROSS_SELL
REACTIVATION
```

A campaign may have one primary and multiple secondary objectives.

---

# 8. Marketing Opportunity Engine

AI should begin from platform reality, not generic posting frequency.

Potential triggers:

- new field visit;
- new harvest;
- new lot;
- processing experiment;
- sensory result;
- approved research milestone;
- new product;
- new experience;
- new event;
- available booking capacity;
- inventory change;
- new interview;
- biodiversity observation;
- new partner;
- award;
- seasonal change;
- community-question trend.

Flow:

```text
Platform Event
↓
Marketing Opportunity
↓
Relevance
↓
Evidence Availability
↓
Media Availability
↓
Audience Match
↓
Timing
↓
Suggested Campaign / Content
```

AI detection is never automatic publication.

---

# 9. Opportunity states

Evaluate:

```text
DETECTED
TRIAGED
PLANNED
IN_PRODUCTION
READY_FOR_REVIEW
APPROVED
SCHEDULED
PUBLISHED
COMPLETED
REJECTED
ARCHIVED
```

---

# 10. Campaign model

Evaluate a canonical `Campaign` connected to existing objects rather than duplicating them.

Potential relationships:

```text
Campaign
├── Objective
├── Project
├── Audience
├── Product / Offering
├── Experience
├── Event
├── Consulting Service
├── Story
├── Creative Brief
├── Content Pieces
├── Publications
├── Budget
├── Landing Destinations
├── Attribution
└── Performance
```

---

# 11. Audience model

Support strategic segmentation without turning behavioral inference into identity claims.

Distinguish:

```text
DECLARED_INTEREST
BEHAVIORAL_INFERENCE
CAMPAIGN_SEGMENT
```

Possible audience contexts include coffee professionals, enthusiasts, brewers/fermenters, beekeepers, gastronomy, travelers, sustainability/nature, researchers, sensory professionals, producers, existing customers, event attendees, consulting prospects, and partners.

---

# 12. Creative Brief

Evaluate a structured Creative Brief containing:

```text
Campaign
Objective
Audience
Core Message
Supporting Evidence
Project
People
Place
Product / Experience / Service
Desired Action
Available Media
Required Media
Brand Voice
Tone
Format
Channel
Length
Language
Deadline
Rights Constraints
Research Constraints
CTA
Approval Requirements
```

AI may draft. Human review remains available/required by policy.

---

# 13. Content Piece vs Content Variant vs Publication

Separate the master content idea from channel execution.

```text
ContentPiece
  ↓
ContentVariant — Instagram Reel
ContentVariant — LinkedIn
ContentVariant — Web Story
ContentVariant — Email
  ↓
Publication — specific account/date/status
```

Channel adaptation must not introduce unsupported facts.

---

# 14. Supported content formats

Plan for:

```text
PHOTO_POST
CAROUSEL
REEL
SHORT_VIDEO
LONG_VIDEO
STORY
LIVE
TEXT_POST
LINK_POST
ARTICLE
NEWSLETTER
EMAIL
EVENT_SCREEN
LANDING_PAGE
BLOG
AUDIO
PODCAST_CLIP
QUOTE_CARD
DATA_VISUALIZATION
INTERACTIVE_STORY
```

Publer only handles the formats/channels it officially supports.

---

# 15. Publer — verified role

Before implementation, re-check current official documentation.

Official Publer API documentation currently describes a RESTful JSON API for scheduling, publishing and analytics.

Relevant official documentation:

- Overview: `https://publer.com/docs`
- Create Posts: `https://publer.com/docs/posting/create-posts`
- Accounts: `https://publer.com/docs/api-reference/accounts`
- Posts: `https://publer.com/docs/api-reference/posts`
- Media: `https://publer.com/docs/api-reference/media`
- Post Insights: `https://publer.com/docs/analytics/post-insights`
- Analytics Charts: `https://publer.com/docs/analytics/charts`
- Competitor Analysis: `https://publer.com/docs/analytics/competitor-analysis`
- Network capabilities: `https://publer.com/docs/posting/create-posts/networks`

Current documented API use includes bearer authentication and workspace context.

---

# 16. Publer adapter

Do not spread Publer-specific fields through the domain.

Evaluate a provider abstraction such as:

```ts
interface SocialPublishingProvider {
  listWorkspaces(): Promise<ExternalWorkspace[]>;
  listAccounts(): Promise<SocialAccount[]>;
  createDraft(input: SocialPublicationInput): Promise<ExternalJob>;
  schedule(input: SocialPublicationInput): Promise<ExternalJob>;
  publish(input: SocialPublicationInput): Promise<ExternalJob>;
  getJobStatus(id: string): Promise<ExternalJobStatus>;
  listPosts(query: PublicationQuery): Promise<ExternalPost[]>;
  getPostInsights(id: string): Promise<SocialPostInsight>;
  getAnalytics(query: AnalyticsQuery): Promise<SocialAnalytics>;
  uploadMedia?(asset: MediaReference): Promise<ExternalMedia>;
}
```

Then `PublerAdapter` can implement that provider.

Reconcile exact interfaces with the repository.

---

# 17. Responsibility boundary

## Publer may own externally

- connected social destinations;
- provider workspace/account mechanics;
- scheduler mechanics;
- platform-specific publishing;
- external post IDs;
- provider job state;
- available provider analytics;
- competitor analytics where used.

## Néctar Nómada should own

- brand rules;
- campaign;
- objective;
- canonical content;
- canonical media;
- facts/evidence;
- approval;
- audience strategy;
- CTA destination;
- customer/lead identity;
- order;
- booking;
- consulting inquiry;
- attribution;
- business analytics;
- community learning.

---

# 18. Publer workspaces

Publer supports Workspaces for organizing brands/businesses/clients.

Map only where useful:

```text
Internal Organization / Brand
→ PublerWorkspaceMapping
```

Do not automatically mirror every internal Organization to Publer.

---

# 19. Social Account model

Evaluate:

```text
SocialAccount
provider
external_account_id
platform
organization
brand
workspace_mapping
status
permissions
last_sync
```

Internal identity remains canonical.

---

# 20. Social Publication model

Potential:

```text
SocialPublication
├── ContentVariant
├── Campaign
├── SocialAccount
├── Channel
├── Provider
├── ExternalPostId
├── Status
├── ScheduledAt
├── PublishedAt
├── URL
├── TrackedLink / UTM
├── CTA
└── Analytics
```

Do not store social publications only in Publer.

---

# 21. Publication states

Potential internal state machine:

```text
DRAFT
READY_FOR_REVIEW
APPROVED
QUEUED
SCHEDULED
PUBLISHING
PUBLISHED
FAILED
CANCELLED
ARCHIVED
```

Provider raw status should also be preserved.

---

# 22. Publer failure handling

Plan for:

- asynchronous creation jobs;
- publish failure;
- disconnected account;
- auth failure;
- channel validation error;
- media error;
- provider outage;
- rate limit;
- invalid schedule.

Canonical campaign/content must survive Publer failure.

---

# 23. Network capability matrix

Do not assume identical behavior across social networks.

Store/evaluate provider capabilities per network for:

- supported media types;
- short-form video;
- stories;
- links;
- titles/descriptions;
- thumbnails;
- mentions;
- hashtags;
- scheduling restrictions;
- API limitations.

---

# 24. Media handoff

Canonical flow:

```text
MediaAsset
↓
Approved Derivative
↓
ContentVariant
↓
Publer Media Upload / Reference
↓
Publication
```

Publer media library is not the authoritative DAM.

---

# 25. Sales attribution

Connect social activity to real business outcomes:

```text
Campaign
↓
Publication
↓
Tracked Link
↓
Landing Page
↓
Session
↓
Product / Experience / Service
↓
Lead / Cart / Booking / Purchase / Consultation
```

Use first-party attribution where privacy/legal requirements permit.

---

# 26. UTM strategy

Centralize UTM generation:

```text
utm_source
utm_medium
utm_campaign
utm_content
utm_term
```

Use stable internal campaign IDs/naming rules.

---

# 27. First-party attribution

Evaluate:

```text
CampaignTouch
AttributionSession
ConversionEvent
```

Potential conversions:

```text
PRODUCT_PURCHASE
EXPERIENCE_BOOKING
EVENT_REGISTRATION
CONSULTING_INQUIRY
NEWSLETTER_SIGNUP
ACCOUNT_CREATION
SENSORY_SESSION_REGISTRATION
LEAD
```

Do not imply exact causality where only correlation/association is known.

---

# 28. Sales Enablement

Marketing should read actual commercial state.

Examples:

```text
Experience Session
capacity = 12
booked = 5
event = 7 days away
approved media available
→ Marketing Opportunity
```

Similarly:

- product inventory;
- launch timing;
- consulting availability;
- event registration;
- customer reactivation;
- cross-sell.

No automatic spend or publication without policy.

---

# 29. Consulting lead integration

Social/community interactions may indicate:

```text
CONSULTING_LEAD
PRODUCT_QUESTION
EXPERIENCE_INTEREST
TECHNICAL_QUESTION
PARTNERSHIP_INQUIRY
MEDIA_REQUEST
SUPPORT
COMPLAINT
UGC
TESTIMONIAL
GENERAL_COMMUNITY
```

High-intent interactions may route into CRM.

---

# 30. Community Management

Community should be represented as conversations/relationships, not only engagement counts.

Evaluate a `CommunityInteraction` or equivalent:

```text
provider
platform
external_interaction_id
social_account
publication
interaction_type
timestamp
text
language
classification
topic
project
product
experience
campaign
lead_state
moderation_state
response_state
```

Store only necessary personal data.

---

# 31. Critical Publer community boundary

Publer currently supports viewing comments in its own interface and AI-assisted comment-response drafting.

Do **not** assume that the public Publer API provides a complete unified inbox, DMs, or all comment-ingestion operations unless current official API docs confirm it at implementation time.

Therefore separate:

```text
SocialPublishingProvider
```

from:

```text
CommunityProvider
```

Possible future community providers may be platform-native APIs or Publer if officially supported.

No scraping.

---

# 32. Community Response AI

Potential flow:

```text
Incoming Interaction
↓
Classification
↓
Context Retrieval
↓
Brand Voice
↓
Canonical Project / Product / FAQ Data
↓
Suggested Response
↓
Human Review / Auto-eligible Policy
↓
Reply
```

Start with human approval for most responses.

---

# 33. Community risk classes

Potential:

```text
ROUTINE
PRODUCT_SUPPORT
TECHNICAL
SCIENTIFIC
COMPLAINT
SAFETY
LEGAL
PR_SENSITIVE
PARTNER_SENSITIVE
PERSONAL_DATA
```

Risk determines review requirements.

---

# 34. Scientific claims in marketing/community

Marketing remains subordinate to Research/AI Governance.

Never turn:

> Treatment B scored higher in this panel.

into:

> This process improves coffee quality.

without approved evidence supporting the stronger claim.

Approved communications may be required for scientific/research-derived claims.

---

# 35. Community Learning

Repeated community interactions can produce intelligence.

Examples:

```text
18 questions about cold fermentation
→ educational content opportunity
```

```text
Repeated booking question
→ experience-page information gap
```

```text
Repeated price confusion
→ commerce UX gap
```

```text
Repeated technical concern
→ research explainer opportunity
```

AI may suggest; humans decide.

---

# 36. Social Listening

Do not promise unrestricted social listening.

Evaluate a provider-neutral `SocialListeningSignal`, implemented only through permitted official APIs or approved datasets.

Potential sources:

- owned account comments;
- owned mentions where API permits;
- approved search APIs;
- Publer competitor analytics;
- manually logged observations.

No scraping.

---

# 37. Publer Analytics

Publer currently documents post insights, analytics charts and competitor-analysis API endpoints.

Store provider metrics as observations, for example:

```text
SocialMetricObservation
provider
publication
metric
value
period
retrieved_at
raw_source
```

Preserve network/provider metric semantics.

---

# 38. Analytics normalization

Do not assume identical definitions for:

- reach;
- impressions;
- views;
- engagement;
- likes;
- comments;
- shares;
- saves;
- follower growth.

Store metric definition/source metadata where needed.

---

# 39. Marketing analytics domains

Separate:

## Social Performance
reach, views, engagement, growth, clicks.

## Content Performance
completion, watch time, saves/shares, interaction depth.

## Business Performance
sales, revenue, bookings, consulting leads.

## Community Performance
questions, response time, repeat engagement, UGC.

## Brand Performance
appropriate awareness proxies, direct traffic, branded search if measurable.

---

# 40. Campaign scorecard

Potential:

```text
Objective
Audience
Spend
Content Published
Reach
Engagement
Traffic
Leads
Bookings
Orders
Revenue
Conversion
Community Questions
Top Content
Learnings
Next Action
```

Do not reduce education/community campaigns to revenue only.

---

# 41. Competitor Analysis

Publer currently documents competitor-analysis endpoints.

Use as contextual benchmarking, not automatic strategy.

Do not let competitor behavior override brand positioning or evidence.

---

# 42. Content Calendar boundary

Potential split:

**Néctar Nómada** owns strategic calendar, campaigns, opportunities, production and approvals.

**Publer** owns social scheduling execution/calendar mechanics.

Synchronize only necessary data.

---

# 43. Evergreen / recycled content

Publer offers scheduling/recycling workflows, but Néctar Nómada should decide whether content is still valid.

Potential metadata:

```text
evergreen
expires_at
revalidation_required_at
seasonal_window
research_reapproval_required
```

Before reuse check:

- product availability;
- event date;
- booking capacity;
- project status;
- scientific status;
- price;
- rights;
- partner approval.

---

# 44. Rights and Consent

Social publication must respect:

```text
MediaAsset rights
ConsentRecord
RightsGrant
Channel permission
Paid advertising permission
Territory
Expiration
Attribution
```

Editorial web approval is not automatically paid-ad approval.

---

# 45. User-generated content

Potential:

```text
CommunityInteraction
↓
UGC Candidate
↓
Rights Request
↓
Consent / License
↓
Approved MediaAsset
↓
Campaign Use
```

Never reuse community content commercially without appropriate permission.

---

# 46. Testimonials

Preserve:

- original source;
- permission;
- exact meaning;
- allowed use;
- edits;
- context.

Do not fabricate composite testimonials.

---

# 47. Creative Intelligence

AI can help answer:

- What is worth communicating?
- Which audience matters?
- Which approved assets already exist?
- What media is missing?
- Which narrative angle fits?
- Which format/channel fits?
- What CTA matches the objective?
- What claim needs specialist approval?
- What similar content has worked before?

---

# 48. Storytelling in marketing

Reuse Storytelling Mode from the AI architecture.

Potential structure:

```text
Place
Person
Material
Transformation
Question
Observation
Result
Invitation
```

Marketing may make the narrative engaging; it may not make it untrue.

---

# 49. Audiovisual campaign production

Connect to Content Intelligence:

```text
Creative Brief
↓
Media Search
↓
Candidate Clips
↓
Storyboard
↓
Edit / Programmatic Video
↓
Subtitles
↓
Brand Check
↓
Rights Check
↓
Approval
↓
Publication Variant
```

Original documentary media remains preferred for real people/places/projects.

---

# 50. Programmatic creative

Reusable templates can create:

- quote cards;
- event reminders;
- product cards;
- sensory visualizations;
- project milestones;
- countdowns;
- educational explainers;
- competition results.

Every generated creative output should reference canonical data and source assets.

---

# 51. Paid media boundary

Do not assume Publer is the paid-ad management layer.

Separate:

```text
OrganicSocialPublication
PaidCampaign
```

If paid ads become important, use official ad-platform APIs or dedicated systems.

---

# 52. Marketing budget

Track only marketing-relevant budget/spend if needed.

Avoid building accounting.

Potential:

```text
CampaignBudget
BudgetAllocation
SpendObservation
```

---

# 53. Marketing + Sales Feedback

Target integrated journey:

```text
Post
↓
Landing Page
↓
Product Purchase
↓
Customer
↓
Sensory Session
↓
Experience Booking
↓
Future Recommendation
```

The same applies to consulting and events.

---

# 54. Customer lifecycle

Potential overlapping states:

```text
VISITOR
FOLLOWER
LEAD
CUSTOMER
REPEAT_CUSTOMER
EXPERIENCE_PARTICIPANT
COMMUNITY_MEMBER
ADVOCATE
CONSULTING_CLIENT
PARTNER
```

Do not force one permanent lifecycle label.

---

# 55. Community identity

Do not automatically merge a social profile with a canonical Person/User.

Potential external identity reference:

```text
ExternalSocialIdentity
```

Only link with appropriate confidence/consent.

---

# 56. Support boundary

Community interactions may become support cases:

```text
CommunityInteraction
→ SupportCase
```

Do not build generic help-desk software unless required.

---

# 57. Owned channels beyond social

Marketing architecture should also permit future:

```text
EmailCampaign
Newsletter
LifecycleMessage
Push / In-app
```

Audience consent/preferences remain canonical in Néctar Nómada.

---

# 58. CRM boundary

Example:

```text
Social Interaction
↓
Lead
↓
Consulting Inquiry
↓
Client Relationship
↓
Project
```

Do not store sales pipeline only in Publer.

---

# 59. Experience / tourism marketing

Campaign intelligence should read real session availability:

```text
ExperienceSession
capacity
booked
availability
date
approved media
↓
Marketing Opportunity
```

---

# 60. Product marketing

Product campaigns should use canonical:

- inventory;
- price;
- availability;
- lot traceability;
- sensory data;
- project story;
- approved media.

Never publish stale/unavailable product information.

---

# 61. Consulting marketing

Support CTA workflows such as:

```text
Request Consultation
Submit Farm / Project Details
Schedule Discovery
```

Do not force project-based consulting into conventional checkout.

---

# 62. Events / Community activation

Connect campaign → registration → attendance for:

- tastings;
- competitions;
- workshops;
- launches;
- brewery/community events;
- farm experiences.

---

# 63. Brand collaborations

Evaluate:

```text
CampaignPartner
approval_status
brand_usage_rights
publishing_rights
required_mentions
```

Partner approval can be a publication gate.

---

# 64. Moderation

Potential classifications:

```text
SPAM
ABUSE
HARASSMENT
MISINFORMATION
TECHNICAL_DISPUTE
CUSTOMER_COMPLAINT
SAFE
```

Do not fully automate sensitive moderation without policy.

---

# 65. Response priority / SLA

Potential:

```text
URGENT
HIGH
STANDARD
LOW
NO_RESPONSE_REQUIRED
```

Technical/scientific questions may need specialist review rather than the fastest reply.

---

# 66. Community knowledge base

Repeated approved answers can feed reusable knowledge:

```text
Repeated Question
↓
Approved Answer
↓
Knowledge Article / FAQ
↓
Future Ask Néctar / Community Response
```

Only approved responses become reusable canonical guidance.

---

# 67. Search across marketing history

Operators should be able to ask:

- show all CryoBloom posts;
- show posts featuring a specific producer;
- show content using a lot or project;
- show campaigns promoting honey;
- show content that generated bookings;
- show every reuse of a given clip or quote.

Use canonical relationships, not only text search.

---

# 68. Content fatigue / duplication

AI may detect repeated use of:

- media;
- quotes;
- claims;
- angles;
- CTA patterns.

Warn, but do not forbid strategic repetition.

---

# 69. Marketing experimentation

Future controlled experiments may include:

- CTA wording;
- landing-page version;
- content format;
- narrative opening.

Do not experiment on:

- scientific conclusions;
- required disclosures;
- legal facts;
- competition rules.

---

# 70. Privacy

Marketing architecture must respect:

- consent;
- communication preferences;
- opt-out;
- data minimization;
- retention;
- applicable law.

Do not infer sensitive personal attributes for segmentation.

---

# 71. AI Marketing Guardrails

AI must not:

- fabricate product benefits;
- invent tasting notes;
- invent testimonials;
- exaggerate research;
- invent producer quotes;
- simulate documentary evidence;
- invent scarcity;
- auto-publish outside policy;
- impersonate community members;
- hide sponsorship/partnership relationships.

---

# 72. Marketing claim types

Evaluate:

```text
FACTUAL
SENSORY
EXPERIENTIAL
SCIENTIFIC
COMPARATIVE
SUSTAINABILITY
HEALTH
ORIGIN
CERTIFICATION
AWARD
```

Different claim types require different evidence/review levels.

---

# 73. Ask Néctar — marketing/community mode

Potential operator requests:

> What should we communicate from this week's project activity?

> Which projects have enough approved material for a story?

> What content drove bookings?

> Which community questions are repeating?

> Draft replies to these routine comments.

> Which upcoming experiences need promotion?

> Create a campaign brief for this product launch.

> What should we capture tomorrow for the campaign?

> Which social posts generated consulting inquiries?

All responses should be grounded in canonical data and permissions.

---

# 74. Operator dashboard

Potential modules:

```text
CAMPAIGNS ACTIVE
CONTENT AWAITING REVIEW
PUBLICATIONS THIS WEEK
UPCOMING EVENTS
EXPERIENCES WITH OPEN CAPACITY
COMMUNITY QUESTIONS
LEADS GENERATED
TOP CONTENT
STALE CONTENT
RIGHTS ISSUES
AI OPPORTUNITIES
```

---

# 75. Brand health

Potential operational checks:

- brand-rule violations;
- unapproved claims;
- expired rights;
- inconsistent terminology;
- outdated project language;
- orphaned campaigns.

Avoid fake aggregate “brand scores” without a defined method.

---

# 76. Marketing calendar

Strategic calendar may combine:

- harvest seasons;
- product launches;
- research milestones;
- tourism sessions;
- events;
- competitions;
- campaign windows;
- seasonal moments.

Publer remains the execution scheduler for social channels.

---

# 77. Content pipeline

Potential state model:

```text
IDEA
OPPORTUNITY
BRIEF
DRAFT
IN_PRODUCTION
EDITORIAL_REVIEW
FACT_CHECK
RIGHTS_CHECK
BRAND_REVIEW
APPROVED
SCHEDULED
PUBLISHED
MEASURED
ARCHIVED
```

Allow simplified flows for low-risk content.

---

# 78. Marketing intelligence loop

```text
Platform Activity
↓
Opportunity Detection
↓
Campaign
↓
Creative Production
↓
Publish
↓
Social Metrics
↓
First-party Traffic
↓
Sale / Booking / Lead
↓
Community Interaction
↓
Learning
↓
Future Recommendation
```

Human judgment remains central.

---

# 79. Publer AI Assist boundary

Publer provides its own AI-assisted content/reply features.

Néctar Nómada should not depend on Publer AI for canonical brand intelligence.

Its own AI persona, governance and canonical data should remain the source for platform-generated suggestions.

Publer AI can remain optional operator convenience.

---

# 80. Source of truth

```text
Canonical strategy/content metadata → Néctar Nómada
Social distribution → Publer
Social network publication → network
Social metrics → Publer/network
Business conversion → Néctar Nómada
```

Do not reconstruct canonical strategy from provider history alone.

---

# 81. Sync strategy

Néctar → Publer:

- approved publication;
- media derivative/reference;
- channel-specific copy;
- schedule;
- target accounts.

Publer → Néctar:

- external post ID;
- job/status;
- publication URL;
- provider error;
- supported analytics.

Sync only what is needed.

---

# 82. Webhook / polling

Before implementation, verify whether current Publer docs provide the required webhook/callback capability.

If not, design rate-conscious background polling.

Do not assume undocumented webhooks.

---

# 83. Credential security

Publer credentials must be:

- server-side only;
- secret-managed;
- minimally scoped;
- workspace-aware;
- rotated when possible.

Never expose bearer credentials to browsers.

---

# 84. Audit

Audit important actions:

- campaign approval;
- scheduling;
- caption changes after approval;
- AI-generated drafts;
- AI community responses;
- publication failures;
- sensitive moderation actions.

---

# 85. Observability

Track:

- publish success/failure;
- provider latency;
- disconnected accounts;
- auth failures;
- analytics sync age;
- queued/failed jobs;
- media failures;
- stale publication status.

---

# 86. Cost control

Track provider usage/costs where relevant.

Do not build architecture around current free-tier assumptions.

Re-check Publer pricing/API access before implementation.

---

# 87. Vendor lock-in

Keep these capability boundaries separable:

```text
SocialPublishingProvider
SocialAnalyticsProvider
CommunityProvider
SocialListeningProvider
```

Publer may implement more than one, but the canonical model should survive provider replacement.

---

# 88. What not to build early

Do not build:

- a social network clone;
- generic agency software;
- generic CRM;
- generic help desk;
- generic DAM;
- ad-buying engine;
- unrestricted social listening;
- autonomous publisher;
- influencer marketplace;
- arbitrary sentiment-scoring engine;
- “virality predictor.”

Build where Néctar Nómada has differentiated knowledge.

---

# 89. Recommended first vertical slice

Evaluate:

## Product / Experience Campaign → Publer → Attribution

```text
Offering / Event
↓
Campaign
↓
Creative Brief
↓
Approved Content Variant
↓
Publer Publication
↓
Post Status
↓
Publer Analytics
↓
Néctar Landing Page
↓
Booking / Purchase / Lead
↓
Campaign Report
```

This validates campaign, brand, content, approval, provider adapter, analytics, attribution, commerce/experience integration.

---

# 90. Secondary vertical slices

## Community Question → AI Draft → Human Reply → Learning

```text
Owned Social Interaction
↓
CommunityInteraction
↓
Classification
↓
Canonical Context
↓
AI Suggested Reply
↓
Human Approval
↓
Reply
↓
FAQ / Content Opportunity
```

Only if official API access supports it.

## Project Activity → Marketing Opportunity

```text
New Field Visit
↓
Approved Media
↓
Project Update
↓
AI Opportunity Detection
↓
Creative Brief
↓
Human Approval
```

This can validate Creative Intelligence without Publer implementation.

---

# 91. Required architecture document structure

`BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md` should contain:

1. Executive Summary
2. Repository Current State
3. Architecture Principles
4. Brand System
5. Brand Voice / AI Persona Relationship
6. Brand Hierarchy
7. Marketing Objectives
8. Marketing Opportunity Engine
9. Campaign Model
10. Audience / Segmentation Model
11. Creative Brief Model
12. Content Piece / Variant / Publication Model
13. Content Approval Workflow
14. Rights / Consent
15. Social Publishing Architecture
16. Publer Adapter
17. Publer Capability Assessment
18. Publer Data Mapping
19. Social Account / Workspace Mapping
20. Publication State Machine
21. Media Handoff
22. Community Management Architecture
23. Community Provider Boundary
24. AI Community Response
25. Moderation / Risk Classes
26. Community Learning
27. CRM / Lead Integration
28. Commerce / Sales Integration
29. Experience / Booking Integration
30. Consulting Lead Integration
31. UTM / Attribution Architecture
32. First-party Analytics
33. Social Analytics
34. Campaign Reporting
35. Competitor Analytics
36. Marketing Intelligence
37. Creative Intelligence
38. Ask Néctar Marketing Mode
39. Privacy
40. Security
41. Audit / Observability
42. Vendor Lock-in Strategy
43. Cost Considerations
44. What Not To Build
45. MVP Recommendation
46. First Vertical Slice
47. Phase Roadmap
48. Risks
49. Open Decisions
50. Product-owner Decisions Required

---

# 92. Required capability matrix

Include:

```text
Capability
Current Repository Status
Néctar Ownership
Publer Ownership
Other Provider
Required for MVP?
Risk
Recommendation
```

---

# 93. Required Publer matrix

Include:

```text
Publer Capability
Official API Confirmed?
API / Interface
Néctar Use Case
Canonical Data Impact
Sync Direction
Fallback
Implementation Priority
```

At minimum evaluate:

- workspaces;
- accounts;
- media;
- create post;
- draft;
- schedule;
- publish;
- posts listing;
- post insights;
- analytics charts;
- competitor analysis;
- comments;
- AI comment replies;
- unified inbox / DMs;
- webhooks/status callbacks;
- channel capability rules.

If an API capability is not confirmed in current official Publer documentation, mark:

`UNCONFIRMED — DO NOT IMPLEMENT`

rather than infer from Publer UI behavior.

---

# 94. Required canonical entity review

Evaluate whether to use/create:

```text
Brand
Campaign
CampaignObjective
AudienceSegment
MarketingOpportunity
CreativeBrief
ContentPiece
ContentVariant
SocialPublication
TrackedLink
CampaignTouch
CommunityInteraction
MarketingInsight
```

Do not blindly create all. Reconcile against existing entities first.

---

# 95. Required AI rules

Marketing AI must be subordinate to:

```text
AI_GOVERNANCE
RESEARCH_GOVERNANCE
BRAND_RULES
RIGHTS / CONSENT
RBAC
```

AI suggestions can never override them.

---

# 96. Recommended phases

## FOUNDATION
Canonical brand, campaign, content/publication and attribution architecture.

## MVP
One real campaign with approved content, Publer publication and first-party conversion attribution.

## NEXT
Marketing Opportunity Detection + social analytics + campaign reporting.

## ADVANCED
Community Intelligence + CRM routing + reusable approved answer knowledge.

## LATER
Cross-channel personalization, richer experimentation, sales/community intelligence loops.

## EXPERIMENTAL
Autonomous campaign optimization, predictive creative scoring, large-scale social listening, autonomous replies/publication.

---

# 97. Important constraints

During this architecture phase DO NOT:

- modify production code;
- create migrations;
- install Publer SDKs;
- add Publer credentials;
- create Publer accounts;
- publish content;
- connect live social accounts;
- implement AI replies;
- ingest comments;
- modify CRM;
- alter checkout;
- implement paid ads;
- create autonomous marketing agents.

Architecture only.

---

# 98. Final response format

After creating:

`/docs/architecture/BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`

report only:

1. Current relevant infrastructure found.
2. Recommended canonical brand/marketing entities.
3. What Publer should own.
4. What Néctar Nómada should own.
5. Recommended first vertical slice.
6. Publer capabilities confirmed vs unconfirmed.
7. What should explicitly be deferred.
8. Main risks.
9. Product-owner decisions required.
10. Specific conflict check: does this document's Content Piece/Variant/
    Publication model (§13) and Creative Intelligence pipeline (§47-49)
    duplicate or conflict with MEDIA_INTELLIGENCE_PIPELINE.md's existing
    AI-assisted content generation lifecycle (Phase B) and Story &
    Knowledge Engine (DOMAIN_MODEL.md §4)? Reconcile explicitly rather
    than building a parallel content system.
11. Specific conflict check: does the AI Marketing Guardrails section
    (§71) and the Ask Néctar marketing mode (§73) correctly defer to
    AI_GOVERNANCE.md's existing suggestion lifecycle and
    AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md's Commerce/Tourism
    mode definitions, rather than defining a separate, parallel AI
    behavior model for marketing specifically?

Then stop.

Do not implement until approved.
