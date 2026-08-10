-- Correction to the previous migration's grants: Prisma's typed `.create()`
-- (and any plain SQL `INSERT ... RETURNING`) requires SELECT privilege on
-- the target table even for an insert-only caller — Postgres semantics,
-- not a governance exception. Granting SELECT on ai.recommendation itself
-- is harmless and necessary; AI_GOVERNANCE.md §3's actual requirement is
-- "no INSERT/UPDATE/DELETE grant on any research/sensory/competitions/core
-- table," which this does not touch. UPDATE/DELETE on ai.recommendation
-- stay revoked — even the AI role cannot edit or remove its own past
-- suggestions, only append new ones.
GRANT SELECT ON ai.recommendation TO ai_service;
