---
name: project-status
description: Use when the user asks for a status check, wants to know what's currently built/working, or asks "what's next." Runs the standard diagnostic set this project always checks, pulled from the actual repository state — not from memory of past sessions.
---

# Project Status Check

Run and report, in this order, pulling from the real repository state, not
from memory or from what architecture docs claim:

## 1. Git and build state
```
git status
git log --oneline -10
npx tsc --noEmit
npm run lint
npm test
npm run build
```

## 2. Database state
```
npx prisma migrate status
```
Confirm this against Neon (production), not just local dev, if a
production database is configured.

## 3. Deployment state
```
npx vercel ls
```
Confirm latest deployment status, not just that a deployment exists.

## 4. Credentials
Check presence/absence only (never print values) of expected environment
variables in both local `.env`/`.env.local` and, if accessible, Vercel's
configured production environment variables. Flag any mismatch between
local and production credential presence.

## 5. Open items
Check `DECISIONS.md`'s most recent entries and any `SETUP.md` notes for
explicitly-flagged open items (missing credentials, unconfigured
integrations, pending product-owner decisions). Report these, don't
re-solve them.

## Report format

State plainly: current slice/phase, what's actually verified working
(not just "should work"), and a short list of open items in priority
order. Do not present architecture-document claims as build status without
verifying against the actual repository first.
