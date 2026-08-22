-- Remove the DEMO Locations and Organizations that survived ADR-066.
--
-- ADR-066 removed the demo *project subtree*. A Location carries no projectId
-- and an Organization none either, so neither was ever reachable from the
-- projects that were deleted — they were not spared by a judgement call, they
-- were never in scope, and the "production carries only real data" report that
-- followed was wrong about them.
--
-- Six of the eight are `public`, so they are what a visitor currently sees on
-- /discover.
--
-- Nothing real references them: the only inbound references are DEMO to DEMO
-- (four locations belong to demo organizations, two are children of demo
-- parents). Every RESTRICT relation — specimen, hive, harvest_event,
-- storage_assignment, organization_membership — counts zero.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE dloc ON COMMIT DROP AS
  SELECT id, name FROM core.location WHERE name LIKE 'DEMO%';
CREATE TEMP TABLE dorg ON COMMIT DROP AS
  SELECT id, name FROM core.organization WHERE name LIKE 'DEMO%';

-- Refuse if anything real has attached itself since the counts were taken.
-- The check is inbound references from records that are NOT themselves demo —
-- the same guard ADR-066 used, applied to the axis it missed.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM traceability.lot WHERE location_id IN (SELECT id FROM dloc);
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % lot(s) reference a DEMO location', n; END IF;

  SELECT count(*) INTO n FROM core.sample WHERE location_id IN (SELECT id FROM dloc);
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % sample(s) reference a DEMO location', n; END IF;

  SELECT count(*) INTO n FROM core.story WHERE location_id IN (SELECT id FROM dloc);
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % story/stories reference a DEMO location', n; END IF;

  SELECT count(*) INTO n FROM core.location
   WHERE parent_location_id IN (SELECT id FROM dloc) AND name NOT LIKE 'DEMO%';
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % non-demo child location(s) under a DEMO parent', n; END IF;

  SELECT count(*) INTO n FROM core.location
   WHERE organization_id IN (SELECT id FROM dorg) AND name NOT LIKE 'DEMO%';
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % non-demo location(s) belong to a DEMO organization', n; END IF;

  SELECT count(*) INTO n FROM core.project WHERE organization_id IN (SELECT id FROM dorg);
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % project(s) belong to a DEMO organization', n; END IF;
END $$;

DELETE FROM core.location     WHERE id IN (SELECT id FROM dloc);
DELETE FROM core.organization WHERE id IN (SELECT id FROM dorg);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM core.location WHERE name LIKE 'DEMO%';
  IF n <> 0 THEN RAISE EXCEPTION 'DEMO locations remain: %', n; END IF;
  SELECT count(*) INTO n FROM core.organization WHERE name LIKE 'DEMO%';
  IF n <> 0 THEN RAISE EXCEPTION 'DEMO organizations remain: %', n; END IF;

  -- Real data must be exactly as it was.
  SELECT count(*) INTO n FROM traceability.lot;
  IF n <> 43 THEN RAISE EXCEPTION 'expected 43 lots, found %', n; END IF;
  SELECT count(*) INTO n FROM core.person;
  IF n <> 17 THEN RAISE EXCEPTION 'expected 17 people, found %', n; END IF;
  SELECT count(*) INTO n FROM core.project;
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 projects, found %', n; END IF;
  SELECT count(*) INTO n FROM core.story;
  IF n <> 2 THEN RAISE EXCEPTION 'expected 2 stories, found %', n; END IF;
  SELECT count(*) INTO n FROM core.role_profile_permission;
  IF n <> 90 THEN RAISE EXCEPTION 'permission grants changed: %', n; END IF;

  RAISE NOTICE 'post-conditions OK: 0 DEMO places, 43 lots, 17 people, 3 projects, 2 stories, 90 grants';
END $$;

COMMIT;
