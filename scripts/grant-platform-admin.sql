-- Grant Platform Admin at platform scope. Run via scripts/grant-platform-admin.sh.
--
-- Why this exists outside the application. Granting Platform Admin requires
-- rbac:manage_permissions, and only Platform Admin holds it — so the first
-- administrator cannot be created from inside the UI. Production reached that
-- state exactly: zero active Platform Admin assignments and zero accounts with
-- a password, leaving a correctly-enforced RBAC model that nobody could act
-- within. Every administrator after the first can be granted through the app.
--
-- Safe to re-run: the insert is guarded by NOT EXISTS, and the audit row is
-- written from the insert's RETURNING, so a second run changes nothing and
-- records nothing.
--
-- Requires -v email=<address>.

\set ON_ERROR_STOP on
BEGIN;

-- La foto de lo que el rol SIGNIFICA, tomada antes de escribir nada. La
-- post-condicion de abajo compara contra esto, no contra un numero escrito aqui:
-- un numero se queda viejo cada vez que el catalogo gana un permiso, y entonces
-- este guion deja de poder conceder nada. Paso el 2026-10-01: decia 89 --la suma
-- de los trece perfiles acotados cuando se escribio-- y la base tenia 144, que es
-- esos 89 mas los 55 que Platform Admin recibe por llevar el catalogo entero
-- (ROLE_PROFILES en lib/rbac/catalog.ts lo define como PERMISSIONS.map(...)).
-- El guardia aborto una concesion legitima, y su mensaje --«permission grants
-- changed»-- se lee como si alguien hubiera tocado los permisos.
--
-- Antes/despues no envejece, y comprueba la propiedad que el comentario de abajo
-- siempre quiso: que conceder un rol a una persona no altere el rol.
CREATE TEMP TABLE permisos_antes ON COMMIT DROP AS
  SELECT count(*) AS n FROM core.role_profile_permission;

CREATE TEMP TABLE target ON COMMIT DROP AS
  SELECT ua.id AS account_id
  FROM core.user_account ua
  JOIN core.person p ON p.id = ua.person_id
  WHERE p.email = :'email' AND ua.auth_provider = 'credentials';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM target;
  IF n <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 credentials account for that email, found %', n;
  END IF;
END $$;

-- Reuse the existing platform scope rather than minting a second one; a
-- duplicate would silently split platform-wide grants across two scope rows.
CREATE TEMP TABLE pscope ON COMMIT DROP AS
  SELECT id FROM core.scope WHERE scope_type = 'platform' ORDER BY created_at LIMIT 1;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pscope;
  IF n <> 1 THEN RAISE EXCEPTION 'no platform scope exists to attach the assignment to'; END IF;
END $$;

-- One statement, so the audit row is written only for an assignment that was
-- actually inserted. Writing the audit separately made a re-run record a
-- creation that never happened — an append-only trail must not carry entries
-- for events that did not occur.
WITH inserted AS (
  INSERT INTO core.assignment (id, user_account_id, role_profile_id, scope_id, granted_at, valid_from, status, created_at, updated_at)
  SELECT gen_random_uuid(), t.account_id, rp.id, s.id, now(), now(), 'active', now(), now()
  FROM target t, pscope s, core.role_profile rp
  WHERE rp.name = 'Platform Admin'
    AND NOT EXISTS (
      SELECT 1 FROM core.assignment a
      WHERE a.user_account_id = t.account_id AND a.role_profile_id = rp.id AND a.scope_id = s.id
    )
  RETURNING id
)
-- RBAC.md: Assignment changes are audited. The actor is null because no
-- administrator existed to do the granting — this came from outside the
-- application, and the record says so rather than naming a proxy.
INSERT INTO core.audit_event (id, actor_user_account_id, operation, entity_type, entity_id, after, reason, source_interface, occurred_at)
SELECT gen_random_uuid(), NULL, 'create', 'assignment', inserted.id,
       jsonb_build_object('role', 'Platform Admin', 'scope', 'platform', 'status', 'active'),
       'bootstrap: no Platform Admin holder existed; granted out-of-band',
       'cli', now()
FROM inserted;

DO $$
DECLARE n int; antes int; otros int;
BEGIN
  -- **En el ÁMBITO DE PLATAFORMA, no en todos.** Esta comprobación contaba las
  -- asignaciones activas de Platform Admin de la cuenta SIN mirar su ámbito, y
  -- exigía exactamente una. Eso codifica una suposición —«ésta es la primera y
  -- única»— en vez de la propiedad que al guion le importa: que haya concedido
  -- una, aquí, en plataforma.
  --
  -- Lo destapó una concesión legítima el 2026-10-02: `INSERT 0 1` —o sea que NO
  -- existía asignación en el ámbito de plataforma, porque el `NOT EXISTS` de
  -- arriba casa justo esas tres columnas— y acto seguido «expected exactly 1
  -- active Platform Admin assignment, found 4». Las otras tres estaban acotadas a
  -- otros ámbitos, que es una situación normal: `scopeContains` resuelve el ámbito
  -- de plataforma por TIPO, y un Platform Admin acotado a una ubicación concede su
  -- juego de permisos sólo ahí. Tener las dos cosas no es un error, y el guion no
  -- tenía por qué negarse.
  --
  -- Es la misma forma que el 89 congelado de más abajo: una post-condición que
  -- mide algo distinto de lo que afirma. Allí abortaba por el crecimiento legítimo
  -- del catálogo; aquí, por el historial legítimo de la persona.
  SELECT count(*) INTO n
  FROM core.assignment a
  JOIN core.role_profile rp ON rp.id = a.role_profile_id
  WHERE a.user_account_id = (SELECT account_id FROM target)
    AND a.scope_id = (SELECT id FROM pscope)
    AND rp.name = 'Platform Admin' AND a.status = 'active';
  IF n <> 1 THEN
    RAISE EXCEPTION 'esperaba exactamente 1 asignación activa de Platform Admin en el ámbito de PLATAFORMA, hay %', n;
  END IF;

  -- Y las de otros ámbitos se DICEN, no bloquean: quien corre esto merece saber
  -- que existen, porque explican de dónde salía el recuento viejo.
  SELECT count(*) INTO otros
  FROM core.assignment a
  JOIN core.role_profile rp ON rp.id = a.role_profile_id
  WHERE a.user_account_id = (SELECT account_id FROM target)
    AND a.scope_id <> (SELECT id FROM pscope)
    AND rp.name = 'Platform Admin' AND a.status = 'active';
  IF otros > 0 THEN
    RAISE NOTICE 'nota: esta cuenta tiene además % asignación(es) activa(s) de Platform Admin en otros ámbitos', otros;
  END IF;

  -- Role definitions are seed-managed (ADR-064). This grants a role to a
  -- person; it must never alter what the role itself means. Se compara contra la
  -- foto del principio de la transaccion, no contra una constante: ver el
  -- comentario de permisos_antes.
  SELECT count(*) INTO n FROM core.role_profile_permission;
  SELECT pa.n INTO antes FROM permisos_antes pa;
  IF n <> antes THEN
    RAISE EXCEPTION 'este guion altero lo que el rol SIGNIFICA: core.role_profile_permission paso de % a %', antes, n;
  END IF;

  RAISE NOTICE 'OK — Platform Admin granted at platform scope; role definitions unchanged';
END $$;

COMMIT;
