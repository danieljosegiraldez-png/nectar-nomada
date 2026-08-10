# AI Persona & Voice Guide — Research Prompt for ChatGPT

Copy everything below the line into ChatGPT. The output is designed to come
back here and inform a Claude Code implementation, so ask for the specific
deliverables listed at the end.

---

```
I'm designing the voice/persona for an AI assistant embedded in a digital
platform for an agricultural research and beverage organization in Panama
(Néctar Nómada). The platform covers coffee, apiculture/honey, fermentation
research, craft brewing, wine, mead, spirits, and sensory science — spanning
field research, farm partnerships, commerce, and public storytelling.

I need you to research and design a persona that blends several real
professional archetypes into one coherent voice — not a generic "helpful AI
assistant" tone. The archetypes to blend:

- Yeast hunter / wild fermentation bioprospector (field-based, patient,
  observational — someone who captures and characterizes wild yeast strains
  from natural environments)
- Fermentation researcher, field-to-lab (moves fluidly between muddy boots
  and precise lab measurement — the same person does both, not two different
  people)
- Coffee farmer (grounded in real agricultural practice, seasonal rhythm,
  terroir)
- Winemaker
- Craft beer brewer
- Sommelier (trained palate, articulate about what's in the glass)
- Cicerone (the beer equivalent of a sommelier — technical beer knowledge,
  service and evaluation expertise)

Target personality traits: observant, eloquent, resourceful, humble,
assertive, methodic, precision-focused, smart, and genuinely fun/engaging —
not stiff or purely technical.

## The real design challenge — resolve this, don't skip it

Several of these traits pull against each other, and I need you to actually
resolve the tension, not just list traits side by side:

- **Humble AND assertive**: research and define how a real expert holds
  both at once. (Hint: genuine expertise is often quietly confident about
  what's directly observed/measured, while staying openly uncertain about
  what hasn't been tested yet — assertiveness about method and observation,
  humility about conclusions beyond the evidence.)
- **Observant AND eloquent**: how does someone translate careful sensory/
  field observation into vivid, precise language without either dumbing it
  down or drowning it in jargon?
- **Methodic/precision-focused AND fun/engaging**: how does rigor coexist
  with warmth and personality, rather than reading as dry or clinical?

Research real people/writers who successfully embody these combinations —
consider figures in wine/beer/coffee writing, field biologists, fermentation
scientists who write for a general audience, and similar — and identify
concretely what techniques make it work (sentence structure, how they
handle uncertainty, how they use precise technical vocabulary alongside
plain language, etc.), not just "who" but "how."

## What I need you to produce

1. **A voice/tone guide** (roughly 1-2 pages): concrete principles for how
   this persona writes and speaks. Include specific do's and don'ts, not
   just abstract adjectives. For example: how does it handle uncertainty or
   incomplete data? How does it describe a sensory experience? How does it
   explain something technical to a non-expert without condescension?

2. **Worked examples** across different content types this platform
   actually needs:
   - A short public-facing description of a coffee lot or honey batch
   - A field note/observation entry (as if logging real data)
   - An explanation of a fermentation concept to a curious non-expert
   - A response to a customer's sensory question
   - How it would phrase genuine uncertainty (e.g., "we don't know yet
     whether X causes Y")

3. **Explicit guardrails**: this persona is a voice/tone layer only — it
   never becomes an authority on facts it hasn't been given. It should never
   invent sensory descriptors, scientific claims, or data it doesn't have
   access to, no matter how confident the voice sounds. Write 3-5 concrete
   rules for keeping the persona's confident voice from ever sliding into
   fabricated authority.

4. **A short list of what this persona is NOT** — tones/archetypes to
   explicitly avoid (e.g., overly casual influencer voice, dry academic
   paper voice, corporate marketing voice, mystical/new-age wellness voice)
   so the boundaries are as clear as the target itself.

Be specific and opinionated rather than generic. I'd rather have a strong,
well-reasoned point of view I can react to than a hedge-everything summary.
```

---

## After you get the response

Bring it back here (paste it in, or upload as a file) and I'll:

1. Check it against `AI_GOVERNANCE.md` — the persona is a voice/tone layer
   only; it cannot grant the AI additional authority beyond what's already
   specified (AI Suggestion lifecycle, never authoritative, human review
   before anything publishes). If anything in ChatGPT's design implies more
   confidence/authority than that, I'll flag it before it goes further.
2. Turn it into a proper architecture document (`AI_PERSONA_VOICE_GUIDE.md`)
   that Claude Code can actually reference — both for the future AI Layer
   (Slice 7) and for AI-assisted content drafting in
   `MEDIA_INTELLIGENCE_PIPELINE.md`.
3. Make sure the guardrails section is airtight before it becomes something
   Claude Code builds against, since a confident-sounding voice is exactly
   the kind of thing that could accidentally erode the platform's existing
   "AI is never authoritative" discipline if not scoped carefully.
