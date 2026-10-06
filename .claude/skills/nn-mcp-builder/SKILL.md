---
name: nn-mcp-builder
description: Design and build MCP servers for the Nectar Nomada platform so Claude and other agents can read room, lot and drying data and request approved actions safely - tool design around real workflows, TypeScript with zod schemas, read-only by default, auth and role checks that reuse the platform's own, evaluation questions. Use this skill whenever the user wants an MCP server, a tool Claude can call for the platform, an agent-facing API for the beneficio module or the room controller, or asks how Claude Code should read lot or environment data, even if they do not say "MCP".
---

# MCP server builder (Nectar Nomada)

## Before designing
- Read how the platform already authenticates and authorizes (`auth.ts`, the RBAC scripts, `docs/arquitectura/inventario-de-acceso.md`) and the public contract (`docs/beneficio/03_public_api.md`). A tool must not open a path the app itself does not allow; it calls the same service layer under the caller's role.
- The repository does not currently depend on an MCP SDK. Adding a dependency or a new deployable is a design decision: record it (ADR) and run it past Daniel.

## Tool design
- Design around tasks a person or agent actually does, not one tool per table. Candidates grounded in this project: read the room status and recent samples; read a lot's drying curve with its meter readings; list lots in a risk zone with the reason; create an approval request for a drastic room action; read the state of an approval.
- **Read-only first.** Reads need no confirmation. Anything that changes a room, a lot or a setting is a request that a person approves in the beneficio module; the tool never performs the drastic action itself.
- Names are verbs with a domain prefix (`room_get_status`, `lot_get_drying_curve`). Inputs validated with zod, outputs structured with units and the data's age (a stale reading is labeled stale). Return actionable errors, never stack traces.
- Pagination and size limits on every list. Never return secrets, `.env` values or personal data beyond what the caller's role sees.
- Reads of environment data state their source and sampling interval; derived values (AH, dew point, VPD) say they are derived.

## Process
1. Write the tool list and each tool's one-sentence purpose; get it agreed.
2. Implement in TypeScript; keep business rules in the existing service layer, not in the MCP layer.
3. Hermetic tests for each tool (`scripts/ci.sh` runs every `tests/**/*.test.ts` EXCEPT those named in `scripts/pruebas-por-compuerta.txt`, so a new hermetic test needs NO entry there — adding one would remove it from the lane. [Corregido al instalar, 2026-10-06: la skill decía «runs tests from a hand-written list, so add new test files there or they will not run», que es lo contrario y causa el defecto de `PENDING_IMPLEMENTATIONS/008`.]).
4. Write ten realistic questions an agent would ask and check each can be answered with the tools, read-only, with correct values.
5. Run the repo's verify gate before proposing a merge.
