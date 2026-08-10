---
name: add-planning-doc
description: Use when the user asks to add, integrate, or process one or more new architecture/planning documents into docs/architecture/. Handles the full check-status → place-file → commit → cross-check → log-in-DECISIONS workflow this project always uses for new planning input, so it doesn't need to be re-explained every time.
---

# Add Planning Doc

This project has a consistent, repeated workflow for bringing in new
architecture/planning documents (from ChatGPT research, from the user
directly, or self-authored). Follow it every time, in this order:

## 1. Check current status first
Before doing anything else, report current build state (which slice,
clean working tree or not, any uncommitted changes). **Do not proceed to
step 2 if there is uncommitted, in-progress work from a different task** —
flag it and stop.

## 2. Verify referenced files actually exist
If the new document references other architecture docs by name, verify
each one exists in `docs/architecture/` exactly as named — do not assume a
static list from the document itself is accurate or complete. Flag any
reference to a file that doesn't exist rather than silently proceeding.

## 3. Place and commit
Place the file(s) in `docs/architecture/`. Commit them on their own,
separate from any other in-progress work, with a clear message naming what
was added.

## 4. Read, cross-check, do NOT implement
Read the new document(s) fully. Cross-check against existing architecture
for conflicts — specifically check anything the new document claims to
"extend" or "reuse" against the actual current state of that system, not
just the existence of a same-named document. Flag conflicts rather than
silently reconciling them.

## 5. Log in DECISIONS.md
Add a new ADR entry recording acceptance of the document(s) — planning
input accepted, implementation deferred, not an immediate build order,
unless explicitly told otherwise.

## 6. Report back, then stop
Summarize what was found — especially any conflicts or broken references —
and stop. Do not begin implementation without explicit approval, even if
the new document seems to invite it.

## Anti-fabrication discipline (always applies)
Never invent file names, quotes, section numbers, or content when
cross-checking. If something can't be verified, say so — "worth
confirming" rather than asserting.
