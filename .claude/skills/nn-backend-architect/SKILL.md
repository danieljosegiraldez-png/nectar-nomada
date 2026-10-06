---
name: nn-backend-architect
description: Backend architecture and data-model guidance for the Nectar Nomada platform OS (Next.js, Prisma and Postgres, zod, next-intl) - adding models and routes without breaking the normative beneficio contract, ingestion from the dark-room controller, the approval and escalation state machine, audit trails, idempotency, offline buffering, and the repository's verification gates. Use this skill whenever the user designs or changes a model, migration, API route, background job or integration, wants to bring room-controller data into the platform, or asks how to structure approvals, alerts or timers, even if they do not say "architecture".
---

# Backend architect (Nectar Nomada)

## Orient first
Read `CLAUDE.md`, `SESSION_STATE.md`, `docs/beneficio/README.md` and `docs/beneficio/03_public_api.md`. The contract is authoritative: every enum, model, signature and state chain comes from it. If a needed name is not declared, stop and ask rather than invent it. Record design decisions as ADRs in `docs/architecture/DECISIONS.md`.

## Rules of the repository to respect
- Prisma 7 with Postgres; migrations through the repo's scripts; follow the `prisma-*` skills in `.claude/skills` for CLI and client questions.
- The compuerta is `bash scripts/ci.sh` (typecheck, state budget, route inventory, lint, hermetic tests). Read its exit code, never pipe it. Its test list is an EXCLUSION list, not an inclusion list: `scripts/ci.sh` runs every `tests/**/*.test.ts` EXCEPT the ones named in `scripts/pruebas-por-compuerta.txt` (see its lines 48-49, `grep -vxF "$EXCLUIDAS"`). So a NEW HERMETIC test needs no entry at all, and adding one there would REMOVE it from this lane. Only a test that needs the database goes in that file, under the `base-sembrada` group, which `scripts/ci-con-base.sh` reads. [Corregido al instalar, 2026-10-06: la skill decía lo contrario —«its test list is hand-written, so a new test file must be added there»— y seguir eso saca una prueba hermética del carril, que es el defecto de `PENDING_IMPLEMENTATIONS/008`.] Check whether a new route must also be added to the route and access inventories (`npm run check:rutas`, `docs/arquitectura/inventario-de-acceso.md`).
- Several sessions work in parallel and merges go through the session that holds the turn; do not edit `SESSION_STATE.md` unless you hold it.
- Texts for people are in Spanish via `messages/` (next-intl); domain rules are normative in `docs/beneficio/` and `docs/dominio/`.

## Environment layer (room controller to platform)
Open design questions to settle with Daniel before modeling (each blocks differently):
1. **Ingestion:** the room controller keeps working with no network and posts batches later, so ingestion must be idempotent on (room, timestamp) and accept late and out-of-order samples. Device authentication is separate from user login.
2. **Storage:** high-rate samples differ from lot records; decide retention and rollups. Do not store raw samples in the lot tables.
3. **Linking to lots:** a room reading belongs to a room; a lot's exposure is derived through a time-bounded lot-in-room record. Meter readings are entered by a person.
4. **Approvals:** a state machine (requested, approved, rejected, escalated, expired-to-protective-action, taken-over) with timers of 12 h and 12 h as agreed, every transition audited with who and when, and takeover possible at any time. Timers must survive restarts: persist deadlines, do not hold them in memory.
5. **Protective actions after 24 h:** the list is an open decision; the room executes only actions pre-approved in its configuration.
6. **Per-process limits:** target RH and temperature per process are configuration with history, versioned, so a past decision can be explained.

## How to work
Design the smallest model that satisfies the contract and the cases above, show the migration and a rollback path, write hermetic tests, run the gate, and list the decisions made and the ones left for Daniel.
