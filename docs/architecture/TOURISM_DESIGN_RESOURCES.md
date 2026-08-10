# Tourism Design Resources — Néctar Nómada Digital Platform

Extends `TOURISM_EXPERIENCES.md` §10 (episode-based experience design) and
`RBAC.md` (Partner Workspace access). Specifies a real, partner-facing
resource library teaching experience design methodology — not just internal
guidance, an actual feature partners can use to design their own tourism
offerings.

**Source grounding**: primarily Chile's national tourism authority
(SERNATUR)'s *Manual de Diseño de Experiencias Turísticas*, which explicitly
authorizes citation-based reuse for educational purposes. Complemented by
two applied works from the same credentialed practitioner — Victor Jiménez
Ayres (Certified Cicerone, Biersommelier Doemens, BJCP Judge certified in
both beer and mead, Diplomado en Turismo, founding member of Chile's Ruta
Cervecera Lafken): a beer-tourism experience design deck for Chile's Lakes
region, and a workshop delivered at Rana Dorada (a Panama craft brewery) in
October 2023 — genuinely relevant given it's Panama-market-specific, not a
foreign case study. Supplementary brand-identity framework from Cristóbal
Saldaño's *Hackéate*. All referenced and cited by name, not reproduced
wholesale, consistent with standard copyright practice for third-party
published work.

---

## 1. What this actually is

A structured library of design guidance, accessible through Partner
Workspace (`MVP_ROADMAP.md` Slice 5), teaching the same methodology the
platform's own Experiences use (per `TOURISM_EXPERIENCES.md` §10) — so a
partner like Luis at Kiva Estate or Katrin at Los Destiladeros can design
their own tourism offering using a real, tested framework, not guesswork.

## 2. Core content modules

```
resources.tourism_design_module(id, title, sequence_order, summary,
  content_body, source_attribution, category
  [economy_of_experience|defining_an_experience|design_process|
  episode_and_narrative|identity_and_positioning|case_examples])
```

- **La economía de la experiencia** — Pine & Gilmore's framework: why a
  well-designed experience commands more value than a raw product or
  service, illustrated with the coffee-industry value-ladder example already
  used in the source manual (commodity beans → packaged product → prepared
  service → full café experience).
- **¿Qué es una experiencia turística?** — the real definition, and why
  subjectivity (the visitor's own lived interpretation) is a core, not
  incidental, part of the product.
- **El proceso de diseño paso a paso** — the 9-step process: know your
  publics, know your environment, know your competition, define the bases,
  define actions/roles per episode, design places/narratives/elements,
  implement, implement your promotion plan, evaluate and correct.
- **Episodios y curva dramática** — the structural model now built into
  `TOURISM_EXPERIENCES.md` §10: script → episodes → dramatic arc, the five
  structuring elements (protagonist, actions, place, narrative, mediators),
  nuclear vs. auxiliary actions.
- **Identidad y posicionamiento** — lighter-weight framework for a partner
  figuring out their own experience's identity/purpose, informed by
  `Hackéate`'s propósito/vínculo approach (what pain point does this serve,
  what bond do you want to create) — offered as one useful lens, not
  prescribed as the only way to think about it.
- **Casos reales** — the Wandersleben case (a Chilean brewer who built
  cross-brewery regional collaboration around a shared identity) as a
  genuinely relevant example for anyone thinking about collaborative,
  multi-producer tourism experiences — directly relevant given your own
  cross-brewery Panama lager cultural-identity work. Complemented by five
  international beer-tourism benchmarks (New York's craft beer scene: 3.66M
  visits, $450M impact; Belgium's Toer de Gueuze, a multi-brewery cycling
  route culminating in a collaborative "megablend"; Oktoberfest's scale
  data; Argentina's Festival del Lúpulo in El Bolsón) — useful reference
  points for scale and format, not templates to copy.

## 2a. Workshop modules — a real, tested 4-exercise format

The fourth source document (a workshop delivered at Rana Dorada, a Panama
craft brewery, by the same credentialed practitioner — Victor Jiménez
Ayres: Certified Cicerone, BJCP Judge certified in both beer *and* mead,
founding member of Chile's Ruta Cervecera Lafken) provides a complete,
already-tested workshop structure, not just theory. Worth including as its
own guided module sequence, mirroring the same exercise flow:

```
resources.tourism_design_exercise(id, module_id, sequence_order,
  exercise_name, instructions, deliverable_template)
```

1. **Exploración del entorno — análisis PESTEL**: identify one real example
   each of Political, Economic, Social, Technological, Environmental, and
   Legal factors affecting the proposed experience's context. Grounds
   design in real local conditions before anything else gets designed.
2. **Segmentación de clientes**: define target visitor segments using a
   structured table — the same spirit as the three named personas (an
   international homebrewer tourist, a local nature-focused trekker, a
   local foodie) used in the practitioner's own applied beer-tourism work.
3. **Mapa de empatía**: build an empathy map for each defined segment —
   standard business-design tool, applied here specifically to a tourism
   visitor.
4. **Guion de experiencia turística**: using everything from exercises 1-3,
   build the actual experience script — directly exercises the Episode/
   Dramatic-Curve structure already built into `TOURISM_EXPERIENCES.md`
   §10, closing the loop between the methodology taught here and the real
   data model a partner would then use to actually create the Experience
   on the platform.

Followed by an evaluation phase (`Evaluación de la Experiencia Turística`)
— consistent with SERNATUR's own step 9 ("evalúa y corrige").

## 2b. Beer tourism classification — useful positioning framework

From the same source, a real two-type classification worth including as
its own short reference module, since it's directly useful for how you (or
a partner) position an experience:

- **Type 1**: beer/beverage *is* the primary travel motivation (a route, a
  tasting series, a themed weekend).
- **Type 2**: the destination is the primary motivation, and the
  beverage/craft element is secondary (a festival encountered while
  visiting somewhere, a gastropub as one stop among many).

Neither is better — but being explicit about which type an experience is
designed as changes what actually matters in its design (Type 1 experiences
can ask more of the visitor's time/planning; Type 2 experiences need to
work as a compelling *addition* to a trip already happening for other
reasons).

**One honest caveat worth including in the module itself**: the source
material's own beer-tourist demographic profile (skewing male, 30-40,
professional/higher socioeconomic) is explicitly described in its source as
based on limited existing research ("pocos estudios") — worth presenting as
a starting reference point, not a settled fact, consistent with this
platform's general epistemic discipline about evidence strength.

## 2c. A flagged opportunity, not built here: Beer/Craft Routes on the map

The source material describes **rutas cerveceras** (beer routes) as a
formal tourism concept — a suggested path connecting multiple breweries/
producers, sometimes deliberately excluding non-independent operators to
preserve authenticity (Denver's route excludes corporate breweries for
exactly this reason). This maps naturally onto `MAP_AND_TERRITORY.md`'s
existing route-rendering capability (§5, currently scoped to Experience
itineraries) — a genuinely available extension (a cross-producer "Panama
craft trail" connecting Tres Gatos, Casa Bruja, Clandestina, and others,
rendered as a route on the map) but **not built here** — flagged as a real
future opportunity worth a dedicated conversation if you want to pursue it,
not assumed into scope now.

## 3. Access — Partner Workspace, not public

```
Role Profile access: Partner Field Collector, Research Contributor, and
above (RBAC.md §5) — this is operational/business guidance for people
actively building something on the platform, not public Discover content.
```

Reasonable default: available to any authenticated partner with an active
Assignment, regardless of which specific project — this is general
methodology, not project-scoped confidential information.

## 4. Format

Structured content pages (reusing the Story & Knowledge Engine's content
rendering, `DOMAIN_MODEL.md` §4), not a downloadable PDF library — keeps
it inside the platform's own reading experience, versioned, and linkable
directly from the Experience-creation flow (a partner designing a new
Experience sees a contextual link: "New to experience design? See the
methodology guide").

## 5. Attribution requirement

Every module sourced from SERNATUR's manual carries explicit citation
(`source_attribution` field, populated, not optional) — consistent with the
manual's own terms (citation-based reproduction, always citing source,
title, and author) and with this platform's general copyright discipline.
Content adapted from Victor Jiménez's applied example or Hackéate's
framework is described in the platform's own words, citing the real
practitioner/author by name rather than reproducing their material
directly.

## 6. Sequencing

Fits with Slice 5 (Partner Workspace) — needs partner Assignment/access to
exist first, and pairs naturally with the episode-design fields added to
`TOURISM_EXPERIENCES.md` §10, since the resource library teaches exactly
that structure. Log acceptance in `DECISIONS.md`.
