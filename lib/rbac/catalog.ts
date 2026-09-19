/**
 * Seed-managed Permission and Role Profile catalog — RBAC.md §5.
 * Single source of truth shared by prisma/seed.ts (writes these to the
 * database) and the RBAC unit tests (build fixtures from the same data so
 * tests can't silently drift from what's actually seeded).
 */

export interface PermissionDef {
  resourceType: string;
  action: string;
  description: string;
}

export const PERMISSIONS: readonly PermissionDef[] = [
  { resourceType: "platform", action: "manage_users", description: "Invite, suspend, and deactivate user accounts." },
  { resourceType: "platform", action: "manage_permissions", description: "Create Assignments and manage Role Profiles." },

  { resourceType: "content", action: "view", description: "View non-public story/content drafts." },
  { resourceType: "content", action: "create", description: "Create story/content drafts." },
  { resourceType: "content", action: "edit", description: "Edit story/content drafts." },
  { resourceType: "content", action: "publish", description: "Publish story/content to the public site." },

  { resourceType: "project", action: "view", description: "View non-public project details." },
  { resourceType: "project", action: "manage_operations", description: "Manage project tasks, assignments, and operational data." },

  { resourceType: "research", action: "view", description: "View research protocols, evidence, and measurements." },
  { resourceType: "research", action: "create_measurement", description: "Record a new measurement or observation." },
  { resourceType: "research", action: "create_evidence", description: "Attach evidence to a research record." },
  { resourceType: "research", action: "approve_protocol", description: "Approve a protocol version." },
  // RO1 (docs/implementation/34_RO1_RESEARCH_OS.md §5) — running a protocol
  // against real material (creating a TreatmentBatch and its
  // ProcessingStages) is distinct from authoring/approving the protocol
  // version itself: the product owner designs and approves PE protocols,
  // Eliecer/Roberto execute them (§1) — approve_protocol and
  // execute_protocol are deliberately two permissions, not one.
  { resourceType: "research", action: "execute_protocol", description: "Execute a protocol version against a lot: create a TreatmentBatch and its ProcessingStages." },

  { resourceType: "partner", action: "submit_task", description: "Submit or update an assigned task." },
  { resourceType: "partner", action: "submit_data", description: "Submit field data for a project." },
  { resourceType: "partner", action: "upload_media", description: "Upload media assets for a project." },

  { resourceType: "sensory", action: "submit_assessment", description: "Submit a sensory assessment within a judging session." },
  { resourceType: "sensory", action: "manage_session", description: "Create/manage sessions, flights, and blind samples; compute panel results." },

  { resourceType: "blind_mapping", action: "view", description: "View the real identity behind a blind-coded sample (RBAC.md §7)." },

  { resourceType: "ai", action: "review_suggestion", description: "Review AI-generated suggestions (accept/reject/modify) — AI_GOVERNANCE.md §4." },

  { resourceType: "competition", action: "manage", description: "Create editions/categories/entries, assign judges, finalize results, and declare awards." },

  // Phase 1 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md §26) —
  // deliberately not reusing research:create_measurement: an operational
  // fermentation/drying reading is not research evidence until Research OS
  // explicitly adopts it, and overloading that permission would blur the
  // boundary COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md §J insists on
  // keeping sharp (Operational Measurement != Approved Research Evidence).
  { resourceType: "lot", action: "manage", description: "Create/transform lots, record measurements, fermentation/drying/storage runs." },
  { resourceType: "lot", action: "view", description: "View lot detail, lineage, and measurements." },
  // CLAUDE.md §10 lists Export as its own verb, and §46 requires exports to
  // obey permissions. Kept separate from `view` deliberately: reading one
  // record in the UI and extracting every record you can see as a file are
  // different acts, and only the second is worth being able to withhold.
  { resourceType: "lot", action: "export", description: "Export lots and their linked records as a downloadable dataset." },
  // P0 (docs/implementation/41_P0_MASS_BALANCE.md §6) — accept a
  // transformation whose input and output masses do not reconcile within the
  // organization's tolerance. Deliberately NOT granted to Farm Operator: the
  // operator records what the scale says, and accepting a discrepancy is a
  // different act by someone else. Same separation A7 applied when it withheld
  // `apiary:manage` from the Apiary Colony Event Recorder — a competence and
  // authority boundary, not a tier of the same permission.
  { resourceType: "commerce", action: "manage_store", description: "ADR-163. Llevar la tienda: crear variantes de un producto y confirmar la recepción de envases asignados desde un lote envasado — lo único que sube el inventario. Separado de lot:manage a propósito: envasar y asignar es trabajo de campo; recibir en la tienda, no." },
  { resourceType: "hive_node", action: "manage", description: "Register a sensor node and install, move or remove it on a hive. Deliberately separate from apiary:manage, which every Farm Operator holds: moving a node REASSIGNS its data — May's observations start belonging to another hive (artefactos de colmena spec, §7.1)." },
  { resourceType: "lot", action: "release", description: "Authorize a rested lot for sale. Deliberately separate from lot:manage, which every Farm Operator holds: releasing is a commercial decision, not field work. Does not check the resting age — that is a judgement about the buyer, not the calendar." },
  { resourceType: "lot", action: "override_balance", description: "Accept a lot transformation whose mass balance is outside the organization's tolerance." },
  // §9 de `docs/architecture/EQUIPMENT_AND_READINESS.md`: «No new *machinery*,
  // only new verbs». Comprobado, no supuesto: el aislamiento entre clientes ya
  // lo dan los ámbitos hoja de `resolve.ts` —una asignación de `project` nunca
  // cubre un proyecto hermano— más la clasificación como AND aparte.
  { resourceType: "equipment", action: "view", description: "Ver equipos, su condición y sus verificaciones." },
  { resourceType: "equipment", action: "manage", description: "Registrar equipos, moverlos, retirarlos, y declarar contra qué patrones se verifica un instrumento." },
  // **Deliberadamente separado de `manage`**, y es la parte que importa: quien
  // trabaja con una máquina tiene que poder decir que está rota sin poder
  // retirarla del inventario. Misma frontera de competencia y autoridad que
  // `lot:override_balance` y que `apiary:manage`: no es un escalón del mismo
  // permiso, es otro acto. Si informar de una avería exigiera `manage`, el
  // operario que ve el sello partido no informa — y entonces el sistema no se
  // entera, que es el mismo argumento que la §7.1 usa contra bloquear.
  { resourceType: "equipment", action: "report_condition", description: "Informar de la condición de un equipo y verificar un instrumento contra sus patrones." },
  { resourceType: "sample", action: "manage", description: "Create samples, including from a traceable lot." },
  // 2026-09-06. `requireSampleAccess` aceptaba `"view"` desde su primera versión
  // y el permiso no existía: nadie podía MIRAR una muestra sin poder cambiarla.
  // Lo pidió el anfitrión de cata, que elige qué se cata y no debe poder editar
  // lo que eligió. `manage` NO implica `view` — `can()` exige la clave exacta—,
  // así que quien lea muestras acepta cualquiera de las dos.
  { resourceType: "sample", action: "view", description: "See samples without being able to change them — choosing what to cup." },

  // A1 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §3) — a new
  // subject, not folded into `lot`: Hive/Colony are not Lots (§2), and the
  // apiary vertical has its own dependency chain, separate from coffee's
  // traceability schema.
  { resourceType: "apiary", action: "manage", description: "Create/manage hives and colonies, and record apiary field data." },
  { resourceType: "apiary", action: "view", description: "View hive/colony detail." },

  // A7 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md) — a narrower
  // permission than apiary:manage, specifically so a trainee (competence-
  // gated, not permission-gated by design intent) can log ColonyEvent
  // entries without also being able to create a formal Inspection.
  // recordColonyEvent accepts apiary:manage OR colony_event:manage;
  // recordInspection accepts apiary:manage only.
  { resourceType: "colony_event", action: "manage", description: "Record ColonyEvent entries (feeding/treatment/passing observation) without full apiary:manage." },
  { resourceType: "colony_event", action: "view", description: "View ColonyEvent entries." },

  // F1 (docs/implementation/30_F1_OPERACION_FINCA_ESQUEMA.md) — editing a
  // Location's own stable terroir attributes (§1) and subdividing it into
  // a microlot (§2) is a different authority than recording a fact under
  // an existing Location: it edits the parent record itself, not a child
  // row, so it gets its own permission rather than folding into lot:manage.
  { resourceType: "location", action: "manage_attributes", description: "Edit a Location's terroir attributes (sun, shade, altitude range, slope, soil, plant spacing, description) and create microlots beneath it." },

  // Decisión de Daniel, 2026-09-17: crear un beneficio es de Farm Manager y
  // dueño, «no de un capataz». Va aparte de `manage_attributes` porque crear
  // un lugar nuevo no es editar los atributos de uno existente, y se comprueba
  // SOBRE EL SITIO PADRE: así una asignación estrecha no ensancha el acceso
  // (RBAC.md §3), y un Farm Manager de una finca no puede crear un beneficio
  // en otra. El precedente contrario es `crearSitioDeAbejas`, que exige alcance
  // de plataforma porque parte de ninguna ubicación.
  // Decisión de Daniel, 2026-09-18 (spec fincas y parcelas): una finca nueva la da de alta sólo
  // el administrador de plataforma. Crear una organización no es trabajo de una finca, así que
  // ningún perfil acotado lo lista; Platform Admin lo recibe por tener el catálogo entero.
  // Spec 2026-09-18 jornada y entrega de cosecha §3.4–3.5. El recolector con cuenta anota SU
  // entrega y reporta lo que ve en lo que tiene asignado; el servicio exige además que la
  // Person de la cuenta sea el recolector asignado en esa jornada. Ver situaciones de campo es
  // aparte: de serie para Farm Manager y capataz, concedible a quien trabaje esa parcela o lote.
  { resourceType: "harvest_delivery", action: "create_own", description: "Anotar la entrega propia de cosecha en una jornada donde se está asignado." },
  { resourceType: "field_report", action: "create_own", description: "Reportar situaciones de campo y condiciones del día sobre lo asignado en la jornada propia." },
  { resourceType: "field_report", action: "view", description: "Ver las situaciones de campo que reportan los recolectores en las jornadas de una finca." },

  { resourceType: "organization", action: "create_farm", description: "Dar de alta una finca: la organización y su terreno. Sólo en ámbito de plataforma." },

  { resourceType: "location", action: "create_site", description: "Crear una ubicación nueva bajo un sitio que ya se gestiona: un beneficio, una instalación o una parcela." },

  // Decisión de Daniel, 2026-09-18 (spec #370 §4.3): el capataz edita un
  // beneficio SÓLO si se le concede; por defecto no. Va aparte de
  // `create_site` porque son dos autoridades: conceder a un capataz que edite
  // no le da crear beneficios nuevos. Y aparte de `manage_attributes`, que el
  // operario sí tiene y que es justo lo que hasta hoy le dejaba editar el
  // beneficio por la acción de atributos y la de coordenadas.
  { resourceType: "location", action: "edit_beneficio", description: "Editar un beneficio: su ficha, atributos y coordenadas. De serie para Farm Manager; a un Farm Operator sólo por concesión." },

  // F1 §3/§5 — a Specimen is a standing land asset (a tracked tree, or a
  // broca trap modeled as a Specimen per direct product-owner decision),
  // not a Lot in the processing-chain sense — same reasoning A1 used to
  // give Apiary its own permission instead of reusing lot:manage.
  { resourceType: "specimen", action: "manage", description: "Create/manage Specimens and record SpecimenObservations." },
  { resourceType: "specimen", action: "view", description: "View Specimen detail and observation history." },

  // RO1 §6 — RESEARCH_ACTIVITY_CRITERIA.md's substance-test gate. A single
  // "review" action (approve or reject is the decision *content*, decided
  // via ResearchActivity.complianceStatus, not two separate permissions) —
  // matches competition:manage's own single-permission-many-decisions
  // shape rather than splitting review into approve_activity/
  // reject_activity.
  { resourceType: "research_activity", action: "review", description: "Approve or reject a ResearchActivity's compliance status against RESEARCH_ACTIVITY_CRITERIA.md's substance test." },

  { resourceType: "classification", action: "clear_registered", description: "Access records classified Registered." },
  { resourceType: "classification", action: "clear_partner", description: "Access records classified Partner." },
  { resourceType: "classification", action: "clear_internal", description: "Access records classified Internal." },
  { resourceType: "classification", action: "clear_confidential", description: "Access records classified Confidential." },
  { resourceType: "classification", action: "clear_trade_secret", description: "Access records classified Trade Secret." },
] as const;

export interface RoleProfileDef {
  name: string;
  description: string;
  permissions: ReadonlyArray<readonly [resourceType: string, action: string]>;
}

export const ROLE_PROFILES: readonly RoleProfileDef[] = [
  {
    name: "Platform Admin",
    description: "Full platform access. Intended scope: platform.",
    permissions: PERMISSIONS.map((p) => [p.resourceType, p.action] as const),
  },
  {
    name: "Content/Ops Coordinator",
    description:
      "Story/content and project-operations permissions, explicitly excluding research-approval and " +
      "competition-result permissions. Satisfies the non-developer collaborator requirement from day one.",
    permissions: [
      ["content", "view"],
      ["content", "create"],
      ["content", "edit"],
      ["content", "publish"],
      ["project", "view"],
      ["project", "manage_operations"],
      // Slice 7 (AI) — reviewing a data-completeness suggestion and
      // deciding whether to act on it is exactly the kind of non-developer
      // collaborator task this profile exists for (RBAC.md §5).
      ["ai", "review_suggestion"],
      // ADR-092, and the fourth time this exact shape has appeared: ADR-063
      // for Farm Operator and Project Viewer, ADR-069 for the colony event
      // recorder, ADR-081 for Sensory Judge. A profile holding actions and no
      // clearance is not restricted by an enforced gate, it is disabled by it.
      //
      // Story defaults to `internal`, so without these the coordinator could
      // not open, edit or publish a single story — including the two already
      // live on the public site, which are `public` but were drafted from
      // somewhere. Granting clearance and enforcing is a NARROWING against the
      // previous state, where content:* was checked nowhere and the
      // classification of a story restricted nobody.
      //
      // Stops at `partner`/`internal`, matching Farm Operator. Confidential
      // and trade-secret stories stay out of reach of a content role.
      ["classification", "clear_partner"],
      ["classification", "clear_internal"],
    ],
  },
  {
    name: "Research Lead",
    description: "Full research module permissions within an assigned project, including protocol approval and execution.",
    permissions: [
      ["research", "view"],
      ["research", "create_measurement"],
      ["research", "create_evidence"],
      ["research", "approve_protocol"],
      // RO1 — the product owner both designs/approves PE protocols and
      // runs them personally at times; Research Lead gets both permissions.
      ["research", "execute_protocol"],
      ["classification", "clear_internal"],
      ["classification", "clear_confidential"],
    ],
  },
  {
    name: "Research Contributor",
    description: "Create/edit measurements and evidence within an assigned project, and execute approved protocol versions. No approve/publish.",
    permissions: [
      ["research", "view"],
      ["research", "create_measurement"],
      ["research", "create_evidence"],
      // RO1 §1 — Eliecer/Roberto run PE protocols the product owner
      // designs; they need execute_protocol without approve_protocol.
      ["research", "execute_protocol"],
      ["classification", "clear_internal"],
    ],
  },
  {
    name: "Research Compliance Reviewer",
    description:
      "RESEARCH_ACTIVITY_CRITERIA.md §4's independent reviewer — approves or rejects a ResearchActivity's " +
      "compliance status against the five-part substance test. Deliberately excludes research:approve_protocol " +
      "and research:execute_protocol: this role reviews whether an activity qualifies as real research, it does " +
      "not run research itself. The no-self-review rule (a reviewer cannot decide their own proposal) is " +
      "enforced in code (canReviewResearchActivity, lib/research/researchActivity.ts), not by this permission " +
      "grant alone — same structural-not-just-permission pattern RBAC.md §7 uses for blind-judge restrictions.",
    permissions: [
      ["research_activity", "review"],
      ["research", "view"],
      ["classification", "clear_internal"],
      ["classification", "clear_confidential"],
    ],
  },
  {
    name: "Partner Field Collector",
    description: "Task/data submission and media upload within an assigned project or location. No approval permissions.",
    permissions: [
      ["partner", "submit_task"],
      ["partner", "submit_data"],
      ["partner", "upload_media"],
      // Slice 5 (DECISIONS.md ADR-029) — the classification level literally
      // named "partner" exists for exactly this profile to clear. Without
      // it, a Partner Field Collector could see nothing above `public` on
      // their own assigned project, which defeats the purpose of a
      // project-scoped Assignment. They still cannot clear
      // internal/confidential/trade_secret — those stay admin/research-only
      // even on a project the partner is assigned to.
      ["classification", "clear_partner"],
    ],
  },
  {
    name: "Sensory Judge",
    description:
      "Submit assessments within an assigned judging session only. Deliberately excludes " +
      "blind_mapping:view — a judge's resolved permissions cannot reach the blind-code mapping " +
      "(RBAC.md §7), regardless of what the UI shows. Clears internal but not confidential, so a " +
      "session restricted above internal is closed to the panel until someone decides otherwise.",
    permissions: [
      ["sensory", "submit_assessment"],
      // ADR-081, and the same reasoning ADR-063 applied to Farm Operator and
      // Project Viewer: enforcing a gate against a profile holding no
      // clearance makes the role useless rather than restrictive. Every
      // SensorySession defaults to `internal`, so without this grant an
      // enforced gate denies a judge every session they were assigned to.
      //
      // This profile previously held no clear_* at all, justified as keeping
      // the blind mapping out of a judge's reach. RBAC.md §7 does not describe
      // that mechanism: it puts the mapping in its own table behind
      // `blind_mapping:view`, "so a Judge's resolved permission set genuinely
      // cannot query the mapping" — which is still true here, and is the lock
      // that was actually doing the work. Withholding clearance as a second,
      // undocumented lock cost the clearance axis its own purpose.
      //
      // Granting clear_internal and enforcing is a NARROWING against today: a
      // judge currently reaches confidential and trade_secret sessions too,
      // because the gate is applied nowhere.
      ["classification", "clear_internal"],
    ],
  },
  {
    name: "Sensory Head Judge",
    description:
      "Runs a judging session: manages sessions/flights/blind samples, reveals blind-coded sample " +
      "identity, computes panel results, and can also submit assessments. RBAC.md §7's independent " +
      "authority — distinct from Sensory Judge specifically so the blind mapping isn't reachable by " +
      "every judge on the panel.",
    permissions: [
      ["sensory", "manage_session"],
      ["sensory", "submit_assessment"],
      ["blind_mapping", "view"],
      ["classification", "clear_internal"],
    ],
  },
  {
    // 2026-09-06, decisión de Daniel. Dirigir una cata y juzgar una competencia
    // son dos usos distintos del mismo módulo, y hasta hoy compartían rol: el
    // resultado era que SÓLO un Platform Admin podía montar una cata, porque
    // `sensory:manage_session` y el acceso a muestras no coincidían en ningún
    // perfil. `Sensory Head Judge` queda para competencia formal —junto a
    // Sensory Judge y, cuando exista, un director de jueces—; esto es el
    // anfitrión de una cata interna, de panel o con invitados.
    name: "Cupping Host",
    description:
      "Monta y dirige una cata: elige propósito y muestras, invita participantes, revela los " +
      "códigos ciegos y lee los resultados. Ve muestras sin poder cambiarlas (`sample:view`) — " +
      "elegir qué se cata no es editar el café. No incluye `submit_assessment` a propósito: un " +
      "anfitrión que además cata lleva también el perfil de Sensory Judge, y así se distingue en " +
      "el registro quién dirigió de quién puntuó.",
    permissions: [
      ["sensory", "manage_session"],
      ["sample", "view"],
      ["blind_mapping", "view"],
      ["classification", "clear_internal"],
    ],
  },
  {
    name: "Farm Manager",
    description:
      "Runs a coffee farm and its beneficio: everything Farm Operator does, plus the decisions a " +
      "manager makes rather than executes. Created 2026-09-16 for Bob Huerbsch, farm manager of " +
      "Finca Rosina and co-owner of beneficio Las Nubes. " +
      "Adds `equipment:manage` — Farm Operator's own comment says registering and retiring " +
      "equipment is 'del jefe de beneficio, no del operario', and this is that person. " +
      "Adds `project:manage_operations` because running the farm is the job, and `research:view` " +
      "so the manager can see what experiments run on land they are responsible for. " +
      "DELIBERATELY EXCLUDES `lot:override_balance`: overriding a mass balance should be rare, " +
      "deliberate and explained, so if it is ever needed it goes as a per-assignment `grant` " +
      "override with a written reason rather than living silently inside a profile. " +
      "DELIBERATELY EXCLUDES `platform:manage_users` and `platform:manage_permissions` — running a " +
      "farm is not running the platform. " +
      "DELIBERATELY EXCLUDES `classification:clear_confidential` and `clear_trade_secret`: " +
      "co-owning one beneficio does not imply access to another party's confidential records. " +
      "Intended scope: the farm's location, which since ADR-144 reaches everything under it — " +
      "parcels, drying facilities and beds — so one Assignment covers the whole farm.",
    permissions: [
      ["field_report", "view"],
      ["lot", "release"],
      // Artefactos de colmena §7.1: el gestor registra y MUEVE nodos; el operario no.
      ["hive_node", "manage"],
      ["lot", "manage"],
      ["lot", "view"],
      ["lot", "export"],
      ["sample", "manage"],
      // Lo que lo distingue del operario: el jefe REGISTRA y RETIRA equipo.
      ["equipment", "manage"],
      ["equipment", "view"],
      ["equipment", "report_condition"],
      ["apiary", "manage"],
      ["apiary", "view"],
      ["location", "manage_attributes"],
      // El jefe de beneficio da de alta su beneficio; el operario no.
      ["location", "create_site"],
      // …y lo edita. El operario no, salvo concesión por persona.
      ["location", "edit_beneficio"],
      ["specimen", "manage"],
      ["specimen", "view"],
      ["project", "manage_operations"],
      ["research", "view"],
      ["classification", "clear_partner"],
      ["classification", "clear_internal"],
    ],
  },
  {
    name: "Farm Operator",
    description:
      "Create/transform lots and record measurements, fermentation/drying/storage runs, and samples " +
      "within an assigned project or location. Also covers apiary (hives/colonies, A1) — extending " +
      "this profile rather than adding a parallel one, since the same person (e.g. Kenneth) often " +
      "works both coffee and apiary at one site (22_APIARY_V1_SCOPING_REPORT.md §6's draft ADR " +
      "amendment). Intended scope: project or location — the same Assignment mechanism already " +
      "proven for Partner Field Collector, since a real operator often works across multiple " +
      "projects at one physical site rather than one project alone " +
      "(docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md §26, decision record). No approval " +
      "permissions.",
    permissions: [
      ["field_report", "view"],
      ["lot", "manage"],
      ["lot", "view"],
      // A producer taking their own records out is the whole point of the
      // export (docs/implementation/README.md's "client/producer export").
      ["lot", "export"],
      ["sample", "manage"],
      // Quien fermenta y seca es quien pone el refractómetro contra el agua y
      // quien ve el airlock roto. `equipment:manage` NO se le concede: registrar
      // y retirar equipo es del jefe de beneficio, no del operario.
      ["equipment", "view"],
      ["equipment", "report_condition"],
      ["apiary", "manage"],
      ["apiary", "view"],
      // F1 — same reasoning as apiary:manage/view above: Bob and Sherry
      // are exactly who records Location terroir attributes, creates
      // microlots, and tracks Specimens/traps in the field.
      ["location", "manage_attributes"],
      ["specimen", "manage"],
      ["specimen", "view"],
      // ADR-063. This grant was originally copied from Partner Field
      // Collector, but that profile's reasoning does not transfer: a partner
      // is an external party, and ADR-029 decision 1 deliberately keeps them
      // below `internal` — `partner.task` still holds one `internal` row a
      // partner must not see, which is the property ADR-029 verified live.
      //
      // A Farm Operator is not an external party. They create the lots, and
      // every Lot defaults to `internal`, so without this grant an enforced
      // gate denies an operator the records they just wrote. Holding
      // `clear_internal` and enforcing is also a NARROWING against today,
      // where the gate is not applied and they can reach `confidential` and
      // `trade_secret` too.
      ["classification", "clear_partner"],
      ["classification", "clear_internal"],
    ],
  },
  {
    // Spec 2026-09-18 jornada y entrega de cosecha §3.4. Sólo lo propio: anotar su entrega y
    // reportar lo que ve. No ve las entregas de otros ni edita parcelas.
    name: "Recolector",
    description:
      "Recolector con cuenta: anota su propia entrega de cosecha y reporta situaciones de campo en la " +
      "jornada donde está asignado. Intended scope: location (la finca).",
    permissions: [
      ["harvest_delivery", "create_own"],
      ["field_report", "create_own"],
    ],
  },
  {
    name: "Project Viewer",
    description:
      "Read-only visibility into a project's operational and apiary data — no manage permissions at " +
      "all. Intended scope: project or location, same as Farm Operator, but for a stakeholder who " +
      "needs to see records rather than record them (A7, docs/implementation/22_APIARY_V1_SCOPING_REPORT.md).",
    permissions: [
      ["project", "view"],
      ["lot", "view"],
      ["apiary", "view"],
      ["specimen", "view"],
      // ADR-063. This profile held no clearance at all, which was invisible
      // while the gate went unapplied. Enforcing without it would make the
      // role useless rather than restrictive: 51 of 51 Lots and 3 of 5
      // Projects are `internal`, so a "read-only visibility into a project's
      // operational data" role would see none of it.
      //
      // Deliberately NOT granted to Partner Field Collector: an external party
      // ADR-029 keeps below `internal`. This note also used to cite Sensory
      // Judge as excluding clear_* on purpose; ADR-081 grants that profile
      // clear_internal and explains why the exclusion was never the mechanism
      // RBAC.md §7 describes.
      ["classification", "clear_partner"],
      ["classification", "clear_internal"],
    ],
  },
  {
    name: "Apiary Colony Event Recorder",
    description:
      "Record ColonyEvent entries (feeding/treatment/passing observation) and view hive/colony detail — " +
      "deliberately excludes apiary:manage, so this profile cannot create an Inspection or a Hive/Colony. " +
      "A7's own case: a trainee who logs routine events but records a formal Inspection only once " +
      "accompanied enough times to be trusted with one — a competence gate documented on the Assignment, " +
      "not expressed by a different permission tier here.",
    permissions: [
      ["apiary", "view"],
      ["colony_event", "manage"],
      // ADR-069 — same correction ADR-063 made for Farm Operator. Sixteen of
      // twenty-eight Locations are `internal`, which is where the hives are;
      // without this the profile holds apiary:view and colony_event:manage and
      // can reach neither. The exclusion of apiary:manage above is the real
      // boundary for this role (no Inspections, no Hives) and it is untouched:
      // this grants the clearance to see internal sites, not the authority to
      // do more at them.
      //
      // Deliberately *not* extended to Partner Field Collector or Sensory
      // Judge, which ADR-063 held back as external parties. A trainee on staff
      // is on the other side of that line.
      ["classification", "clear_internal"],
    ],
  },
] as const;
