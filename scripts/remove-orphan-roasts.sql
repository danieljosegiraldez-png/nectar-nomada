-- Remove the orphaned RoastSessions the test suite left in production.
--
-- These are residue from the era `tests/setup.ts` was written to end, when the
-- suite ran against production and wrote into the live research record. The
-- roasting fixture's cleanup deletes sessions `WHERE roaster_person_id IN
-- (...)`, but §4.1 creates three sessions naming no roaster, so those were
-- never removed. Their output lots and transformations were.
--
-- The survey (ADR-085) found all 79 rows in traceability.roast_session match
-- every residue criterion at once: dated 2027, no transformation, no
-- measurement, no roaster, no creator. There are no real roast sessions in
-- production — this table is entirely leakage.
--
-- Safe to re-run: afterwards the set is empty, the delete is a no-op, and the
-- post-conditions still hold.

\set ON_ERROR_STOP on
BEGIN;

-- The residue predicate, evaluated once so the guard, the delete and the
-- post-condition cannot disagree about which rows they mean.
CREATE TEMP TABLE orphan_roast ON COMMIT DROP AS
  SELECT rs.id
    FROM traceability.roast_session rs
   WHERE rs.started_at > now()
     AND rs.roaster_person_id IS NULL
     AND rs.created_by IS NULL
     AND NOT EXISTS (SELECT 1 FROM traceability.lot_transformation t WHERE t.roast_session_id = rs.id)
     AND NOT EXISTS (SELECT 1 FROM traceability.measurement m WHERE m.roast_session_id = rs.id);

-- Totals captured inside the transaction, so "real data is exactly as it was"
-- is proved by comparison rather than by a number hardcoded when the script
-- was written. ADR-066's script hardcoded its post-conditions and they went
-- stale the moment a legitimate change landed — role_profile_permission has
-- moved from 90 to 91 since, for a reason that was correct.
CREATE TEMP TABLE totals_before ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM traceability.lot)               AS lots,
         (SELECT count(*) FROM core.person)                    AS people,
         (SELECT count(*) FROM core.project)                   AS projects,
         (SELECT count(*) FROM core.story)                     AS stories,
         (SELECT count(*) FROM core.location)                  AS locations,
         (SELECT count(*) FROM core.organization)              AS orgs,
         (SELECT count(*) FROM core.role_profile_permission)   AS grants,
         (SELECT count(*) FROM traceability.lot_transformation) AS transformations,
         (SELECT count(*) FROM traceability.measurement)       AS measurements;

DO $$
DECLARE n int; keep int;
BEGIN
  -- The guard that matters, and the one that makes this safe to run later:
  -- refuse if ANY roast session does not match the residue predicate. A real
  -- roast recorded between the survey and this run would land here, and the
  -- whole transaction must roll back rather than take it with the rest.
  SELECT count(*) INTO keep
    FROM traceability.roast_session rs
   WHERE rs.id NOT IN (SELECT id FROM orphan_roast);
  IF keep > 0 THEN
    RAISE EXCEPTION 'ABORT: % roast session(s) are not residue — survey them before deleting anything', keep;
  END IF;

  -- Belt and braces. The predicate already excludes referenced rows, so a
  -- non-zero count here would mean the two disagree, which is worth stopping
  -- for on its own.
  SELECT count(*) INTO n FROM traceability.lot_transformation
   WHERE roast_session_id IN (SELECT id FROM orphan_roast);
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % transformation(s) reference a session marked as residue', n; END IF;

  SELECT count(*) INTO n FROM traceability.measurement
   WHERE roast_session_id IN (SELECT id FROM orphan_roast);
  IF n > 0 THEN RAISE EXCEPTION 'ABORT: % measurement(s) reference a session marked as residue', n; END IF;

  -- Nothing to do is a valid outcome, not a failure — this script is meant to
  -- be re-runnable.
  SELECT count(*) INTO n FROM orphan_roast;
  RAISE NOTICE 'residue roast sessions to remove: %', n;
END $$;

DELETE FROM traceability.roast_session WHERE id IN (SELECT id FROM orphan_roast);

DO $$
DECLARE n int; b totals_before%ROWTYPE;
BEGIN
  SELECT count(*) INTO n FROM traceability.roast_session
   WHERE started_at > now() AND roaster_person_id IS NULL AND created_by IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'residue roast sessions remain: %', n; END IF;

  SELECT * INTO b FROM totals_before;

  -- Every real total, unchanged. A delete that touched anything else shows up
  -- here and rolls the transaction back.
  IF (SELECT count(*) FROM traceability.lot) <> b.lots
     THEN RAISE EXCEPTION 'lots changed: % -> %', b.lots, (SELECT count(*) FROM traceability.lot); END IF;
  IF (SELECT count(*) FROM core.person) <> b.people
     THEN RAISE EXCEPTION 'people changed: % -> %', b.people, (SELECT count(*) FROM core.person); END IF;
  IF (SELECT count(*) FROM core.project) <> b.projects
     THEN RAISE EXCEPTION 'projects changed: % -> %', b.projects, (SELECT count(*) FROM core.project); END IF;
  IF (SELECT count(*) FROM core.story) <> b.stories
     THEN RAISE EXCEPTION 'stories changed: % -> %', b.stories, (SELECT count(*) FROM core.story); END IF;
  IF (SELECT count(*) FROM core.location) <> b.locations
     THEN RAISE EXCEPTION 'locations changed: % -> %', b.locations, (SELECT count(*) FROM core.location); END IF;
  IF (SELECT count(*) FROM core.organization) <> b.orgs
     THEN RAISE EXCEPTION 'organizations changed: % -> %', b.orgs, (SELECT count(*) FROM core.organization); END IF;
  IF (SELECT count(*) FROM core.role_profile_permission) <> b.grants
     THEN RAISE EXCEPTION 'permission grants changed: % -> %', b.grants, (SELECT count(*) FROM core.role_profile_permission); END IF;
  IF (SELECT count(*) FROM traceability.lot_transformation) <> b.transformations
     THEN RAISE EXCEPTION 'transformations changed: % -> %', b.transformations, (SELECT count(*) FROM traceability.lot_transformation); END IF;
  IF (SELECT count(*) FROM traceability.measurement) <> b.measurements
     THEN RAISE EXCEPTION 'measurements changed: % -> %', b.measurements, (SELECT count(*) FROM traceability.measurement); END IF;

  RAISE NOTICE 'post-conditions OK: 0 residue roast sessions; % lots, % people, % projects, % transformations, % measurements untouched',
    b.lots, b.people, b.projects, b.transformations, b.measurements;
END $$;

COMMIT;
