/**
 * Ticket A1 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §2-3), A2
 * (§1a, §3 REVISED) added Colony's origin fields below. Hive/Colony are
 * much smaller than lib/traceability/lots.ts's shape: no transformation
 * DAG, just physical/biological entities and an RBAC check mirroring
 * requireLotAccess's own project/location leaf-scope containment
 * (RBAC.md §3), against the `apiary` subject instead of `lot`.
 *
 * Inspection/ColonyEvent (recordInspection/recordColonyEvent) live in
 * ./inspections and ./colonyEvents, not here — both resolve RBAC via
 * their parent Colony's own Hive, using requireApiaryAccess exported
 * below (reuse, not a second RBAC helper).
 */
import { prisma } from "../db";
import { TIPOS_DE_SITIO_DE_ABEJAS, esSitioDeAbejas, exigeTipoDeSitioDeAbejas, type TipoDeSitioDeAbejas } from "./sitioDeAbejas";
import { LIST_LIMIT, truncate } from "../listLimit";
import { can } from "../rbac/service";
import { classificationForTarget, loadScopeClassifications } from "../rbac/scopeClassification";
import { recordAuditEvent } from "../audit";
import { DEFAULT_NEW_RECORD_CLASSIFICATION } from "../traceability/lots";
import type { ScopeTarget } from "../rbac/types";
import type { ClassificationLevel, ColonyOriginType, ColonyStatus, DataQuality, Prisma, ProvenanceClass } from "../../generated/prisma/client";
import { CATALOGO_DE_CAUSA_DE_PERDIDA, esClaseDeCausa, type ClaseDeCausa } from "./causaDePerdida";

export class ApiaryAccessError extends Error {}

/** Every concrete scope target a Hive (or a to-be-created Hive's parent context) resolves against — never just one. */
export function apiaryScopeTargetsFor(input: { projectId?: string | null; locationId?: string | null }): ScopeTarget[] {
  const targets: ScopeTarget[] = [];
  if (input.projectId) targets.push({ scopeType: "project", scopeRefId: input.projectId });
  if (input.locationId) targets.push({ scopeType: "location", scopeRefId: input.locationId });
  if (targets.length === 0) targets.push({ scopeType: "platform", scopeRefId: null });
  return targets;
}

export async function requireApiaryAccess(
  userAccountId: string,
  action: "manage" | "view",
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  const puede = (t: ScopeTarget, c: ClassificationLevel) => can(userAccountId, action, "apiary", t, c);
  if (!(await algunAmbitoDeColmena(candidates, puede))) throw new ApiaryAccessError("no_apiary_access");
}

/**
 * Artefactos de colmena, Tarea 4 — registrar, instalar, mover o retirar un nodo de sensores.
 * Mismo ámbito y misma clasificación que el apiario, con su propio permiso: mover un nodo
 * reasigna sus datos, y todo `Farm Operator` tiene `apiary:manage` (spec §7.1).
 */
export async function requireHiveNodeAccess(
  userAccountId: string,
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  const puede = (t: ScopeTarget, c: ClassificationLevel) => can(userAccountId, "manage", "hive_node", t, c);
  if (!(await algunAmbitoDeColmena(candidates, puede))) {
    throw new ApiaryAccessError("no_hive_node_access");
  }
}

/**
 * ¿Pasa `puede` en alguno de los ámbitos de la colmena? Cada puerta le pasa su propia llamada a
 * `can` con el recurso ESCRITO —`"apiary"`, `"hive_node"`—: así lo ve el inventario de permisos
 * (`tests/rbac/permissionCoverage.test.ts`), que no sigue un recurso guardado en una variable.
 */
async function algunAmbitoDeColmena(
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
  puede: (target: ScopeTarget, classification: ClassificationLevel) => Promise<boolean>,
) {
  // A Hive and a Colony carry no classification; the Location the hives stand
  // at, and the Project the work belongs to, do (ADR-069).
  const classifications = await loadScopeClassifications(candidates);

  for (const candidate of candidates) {
    for (const target of apiaryScopeTargetsFor(candidate)) {
      const classification = classificationForTarget(target, classifications);
      if (classification === null) continue;
      if (await puede(target, classification)) return true;
    }
  }
  return false;
}

/**
 * A7 — recordColonyEvent's own gate: accepts the broad `apiary:manage`
 * (Farm Operator and anyone else with full apiary write access) OR the
 * narrower `colony_event:manage` (Apiary Colony Event Recorder — a
 * trainee who can log events but not create a Hive/Colony/Inspection).
 * recordInspection deliberately does NOT use this — it stays gated by
 * apiary:manage alone, per §7's own requirement that ColonyEvent access
 * never implies Inspection access.
 */
export async function requireColonyEventWriteAccess(
  userAccountId: string,
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  const classifications = await loadScopeClassifications(candidates);

  for (const candidate of candidates) {
    for (const target of apiaryScopeTargetsFor(candidate)) {
      const classification = classificationForTarget(target, classifications);
      if (classification === null) continue;
      // Both routes are gated on the same classification: the narrower
      // colony_event:manage is a smaller *authority*, not a lower clearance.
      if (await can(userAccountId, "manage", "apiary", target, classification)) return;
      if (await can(userAccountId, "manage", "colony_event", target, classification)) return;
    }
  }
  throw new ApiaryAccessError("no_apiary_access");
}

export interface CreateHiveInput {
  identifier: string;
  locationId: string;
  projectId?: string | null;
  installedAt?: Date | null;
  status?: "active" | "empty" | "retired";
}

/**
 * La colocación con la que nace una colmena: donde está, desde cuándo, sin fin.
 *
 * **Existe porque la invariante vivía en un comentario y se olvidó a la primera.** ADR-126
 * creó `HivePlacement` y dejó dicho que `createHive` no la abría; `scripts/apiario-toabre.ts`
 * la creó a mano con esa nota al lado, y `scripts/apiario-las-nubes.ts` —escrito el mismo
 * día, por el mismo camino— no. Resultado medido el 2026-09-15 sobre la copia local con los
 * datos reales: **10 de 29 colmenas sin ninguna colocación**, y son justo las diez de Apiario
 * Las Nubes. Para `apiarioDeColmenaEn` esas diez no constan en ningún sitio, y
 * `colmenasDeLaVentana` —el §9 entero, la primera pregunta histórica del módulo— no las
 * cuenta.
 *
 * `reason` queda `null` a propósito, igual que en el relleno de ADR-126: el Anexo fija cuatro
 * motivos de traslado y ninguno describe «aquí es donde nació». Inventarle uno sería afirmar
 * un hecho que nadie dijo.
 *
 * **Recibe el `tx` y no lo abre**, porque la colmena y su colocación son un solo hecho: una
 * colmena guardada sin su colocación es exactamente el estado que esto viene a impedir.
 */
export async function crearColocacionInicial(
  tx: Prisma.TransactionClient,
  input: { hiveId: string; locationId: string; startedAt: Date; createdBy?: string | null },
) {
  return tx.hivePlacement.create({
    data: {
      hiveId: input.hiveId,
      locationId: input.locationId,
      startedAt: input.startedAt,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function createHive(userAccountId: string, input: CreateHiveInput) {
  await requireApiaryAccess(userAccountId, "manage", [input]);

  return prisma.$transaction(async (tx) => {
    const hive = await tx.hive.create({
      data: {
        identifier: input.identifier,
        locationId: input.locationId,
        projectId: input.projectId ?? null,
        installedAt: input.installedAt ?? null,
        status: input.status ?? "active",
        createdBy: userAccountId,
      },
    });

    // **`installedAt` cuando la hay, porque es la fecha que alguien DECLARÓ.** Es la misma
    // regla que el relleno de ADR-126 —`COALESCE(installed_at, created_at)`—, y tenerla en
    // dos sitios que dicen lo mismo es a propósito: uno es la historia y el otro el futuro.
    await crearColocacionInicial(tx, {
      hiveId: hive.id,
      locationId: hive.locationId,
      startedAt: hive.installedAt ?? hive.createdAt,
      createdBy: userAccountId,
    });

    // **Y aquí no había rastro.** Los tres guiones de datos escriben su `hive.create` en el
    // audit; el camino de la aplicación —el único que usa una persona— no escribía ninguno.
    // Se añade ahora porque esta escritura ya es una transacción: una colmena que aparece sin
    // decir quién la creó es el mismo agujero que el módulo cierra en todas sus demás
    // escrituras.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "hive.create",
        entityType: "hive",
        entityId: hive.id,
        after: hive,
        sourceInterface: "web",
      },
      tx,
    );

    return hive;
  });
}

export interface CreateColonyInput {
  hiveId: string;
  startedAt: Date;
  status?: "active" | "dead" | "absconded";
  // §1's boundary analysis: "Pass, required — a capture-or-lose-it fact."
  // No default — a colony's origin, once forgotten, is not reconstructable
  // from anything else the platform records.
  originType: ColonyOriginType;
  originNote?: string | null;
  // A9.10 (D6) — el origen AGRUPABLE, que es lo que `originNote` no podía ser
  // siendo texto libre. Opcional a propósito: una colonia de un origen que
  // todavía no está en el catálogo se registra igual, con su `originNote` de
  // siempre, en vez de bloquear la captura de campo. El catálogo crece por
  // semilla (precedente P1), no por migración.
  originSourceValueId?: string | null;
  // No default here either, matching every other provenance-carrying
  // write's convention (ADR-038) — the action layer must state a real
  // class.
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

/** Una colonia que no se puede crear así. Spec 2026-09-18 §3. */
export class ColoniaInvalida extends Error {}

export async function createColony(userAccountId: string, input: CreateColonyInput) {
  const hive = await prisma.hive.findUnique({ where: { id: input.hiveId } });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "manage", [{ projectId: hive.projectId, locationId: hive.locationId }]);
  // Una división se hace con `dividirColonia`, que sabe de cuál sale: crearla aquí dejaría una
  // «división» sin madre, que es justo lo que la genealogía existe para evitar (la base también
  // la rechaza, `colony_division_con_madre`).
  if (input.originType === "split") throw new ColoniaInvalida("division_sin_madre");

  const colony = await prisma.$transaction(async (tx) => {
    const colony = await tx.colony.create({
      data: {
        hiveId: input.hiveId,
        startedAt: input.startedAt,
        status: input.status ?? "active",
        originType: input.originType,
        originNote: input.originNote ?? null,
        originSourceValueId: input.originSourceValueId ?? null,
        provenanceClass: input.provenanceClass,
        dataQuality: input.dataQuality ?? null,
        createdBy: userAccountId,
      },
    });

    // C1 §3: evidentiary write — a colony's origin, once forgotten, is not
    // reconstructable (§1's own "capture-or-lose-it" framing for this field).
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "colony.create",
        entityType: "colony",
        entityId: colony.id,
        after: colony,
        sourceInterface: "apiary.service",
      },
      tx,
    );

    return colony;
  });

  return colony;
}

export class ColonyEndError extends Error {}

/**
 * Cómo puede terminar una colonia. **`active` no está**, y por eso esto existe
 * en tiempo de ejecución y no sólo en el tipo.
 *
 * El agujero, encontrado el 2026-09-10 al arreglar lo que cazó el guardia de
 * `procedencia-declarada.test.ts`: la acción metía la cadena del formulario con
 * `as never` y el servicio escribía `input.status` sin mirarlo. Un envío con
 * `status=active` pasaba el `where` —que exige `status: "active"`— y escribía
 * **`status = active` con `ended_at` puesto**: una colonia viva con fecha de
 * muerte. No la habría rechazado nada.
 */
export const ESTADOS_DE_FIN: readonly Exclude<ColonyStatus, "active">[] = ["dead", "absconded", "combined"];

export function esEstadoDeFin(valor: string): valor is Exclude<ColonyStatus, "active"> {
  return (ESTADOS_DE_FIN as readonly string[]).includes(valor);
}

/** Estrecha lo que llega de un formulario, o lanza. Misma forma que `exigeClaseDeCausa`. */
export function exigeEstadoDeFin(valor: string): Exclude<ColonyStatus, "active"> {
  if (!esEstadoDeFin(valor)) throw new ColonyEndError(`estado_de_fin_invalido: ${valor}`);
  return valor;
}

/** Una causa declarada, tal como llega del formulario. */
export interface CausaDeclarada {
  /** Una fila de `causa_de_perdida_de_colonia`. Se valida que sea de ESE catálogo. */
  causeValueId: string;
  /** Cómo se estableció. Sólo las tres de `CLASES_DE_CAUSA`. */
  provenanceClass: ClaseDeCausa;
  dataQuality?: DataQuality | null;
  /** Una línea para lo que el catálogo no cubre. */
  note?: string | null;
}

export interface RegistrarFinDeColoniaInput {
  colonyId: string;
  /**
   * Cómo terminó. `active` no es un fin y se rechaza.
   *
   * `combined` entró el 2026-09-09: el estándar internacional cuenta como
   * pérdida la colonia con problema de reina irresoluble —viva, no
   * recuperable, se combina—, y sin ese valor se quedaba `active` para siempre
   * inflando el conteo de polinización.
   */
  status: Exclude<ColonyStatus, "active">;
  /** Cuándo se perdió, no cuándo se anota. Se suele registrar días después. */
  endedAt: Date;
  /**
   * Por qué, del catálogo y **varias a la vez**. El dueño lo pidió así: «cuando
   * hay pérdida de colonia hay múltiples razones y/o causales y situaciones».
   * Una caja vacía puede ser varroa y hambre, y elegir una falsearía el
   * registro.
   *
   * Vacío es legítimo y no se rellena solo: hay pérdidas que se anotan sin
   * saber por qué, y para decirlo existe el valor «desconocido», que se elige
   * — no se supone.
   */
  causas?: readonly CausaDeclarada[];
  /**
   * La clave del borrador que declaró este fin, cuando viene de la cola
   * offline. La web no la trae: un formulario con señal no necesita
   * idempotencia porque no reintenta.
   */
  clientDraftId?: string | null;
  /**
   * Texto libre, para lo que no cabe en ninguna causa. Sigue yendo al `reason`
   * del AuditEvent. Ya **no** es el único sitio donde vive el porqué: ese
   * párrafo, que este comentario tuvo hasta el 2026-09-09, dejó de ser cierto
   * el día que el dueño dio el vocabulario.
   */
  reason?: string | null;
  /**
   * Con cuál se unió, cuando `status = combined` — y sólo entonces. Obligatorio ahí desde el
   * 2026-09-18 (spec «faenas, división y reinas» §3): una colonia «combinada» sin receptora no
   * dice con qué se juntó. `unirColonias` es la puerta de la pantalla; ésta es la única que escribe.
   */
  combinedIntoColonyId?: string | null;
}

/**
 * Registra que una colonia dejó de existir.
 *
 * **El hueco que cierra, medido el 2026-09-08:** `ColonyStatus` tenía `dead` y
 * `absconded` desde A1 y **ningún servicio los escribía jamás**. Una colonia
 * nacía `active` y no había camino de código que la marcara muerta, así que el
 * hecho más caro del apiario no se podía registrar.
 *
 * Y eso hacía que **`coloniasActivas` sólo pudiera subir**: su divergencia con
 * el conteo declarado en la visita (A9.8/A9.9) era estructural, no deriva. Los
 * tres lectores que ya filtran por `status: "active"` se vuelven correctos sin
 * tocarlos.
 *
 * **Es una transición de una vez.** Una colonia que ya terminó no se vuelve a
 * terminar: la escritura va condicionada a que siga activa, con `updateMany`,
 * porque entre leer y escribir cabe otra petición — el mismo razonamiento que
 * `endFieldSession` y que señaló una revisión independiente. `count === 0`
 * significa exactamente que otra ganó.
 */
export async function registrarFinDeColonia(userAccountId: string, input: RegistrarFinDeColoniaInput) {
  const colony = await prisma.colony.findUnique({ where: { id: input.colonyId }, include: { hive: true } });
  if (!colony) throw new ApiaryAccessError("colony_not_found");
  await requireApiaryAccess(userAccountId, "manage", [{ projectId: colony.hive.projectId, locationId: colony.hive.locationId }]);

  // La frontera comprueba otra vez lo que la acción ya estrechó: este servicio
  // se puede llamar desde la cola de sincronización sin pasar por un formulario.
  if (!esEstadoDeFin(input.status)) throw new ColonyEndError(`estado_de_fin_invalido: ${String(input.status)}`);

  if (colony.status !== "active") throw new ColonyEndError("colony_already_ended");
  // La unión dice CON CUÁL (spec 2026-09-18 §3). Todo es `ColonyEndError`, así que la cola de
  // campo lo trata como rechazo y no lo reintenta.
  const receptoraId = input.combinedIntoColonyId ?? null;
  if (input.status === "combined") {
    if (!receptoraId) throw new ColonyEndError("union_sin_receptora");
    if (receptoraId === colony.id) throw new ColonyEndError("union_consigo_misma");
    const receptora = await prisma.colony.findUnique({ where: { id: receptoraId }, include: { hive: true } });
    if (!receptora) throw new ColonyEndError("receptora_no_encontrada");
    await requireApiaryAccess(userAccountId, "manage", [{ projectId: receptora.hive.projectId, locationId: receptora.hive.locationId }]);
    // Unir es juntar las abejas de dos cajas en un mismo sitio; entre apiarios sería un traslado.
    if (receptora.hive.locationId !== colony.hive.locationId) throw new ColonyEndError("union_entre_apiarios");
    if (receptora.status !== "active") throw new ColonyEndError("receptora_no_activa");
    if (input.endedAt < receptora.startedAt) throw new ColonyEndError("union_antes_de_empezar");
  } else if (receptoraId) {
    throw new ColonyEndError("receptora_solo_en_union");
  }
  // Terminar antes de empezar es un problema de reloj, no un registro.
  if (input.endedAt < colony.startedAt) throw new ColonyEndError("ended_before_started");

  const causas = input.causas ?? [];

  // La misma causa dos veces no añade nada y chocaría contra el índice único
  // como un P2002 ilegible. Se rechaza aquí, con nombre propio.
  if (new Set(causas.map((c) => c.causeValueId)).size !== causas.length) {
    throw new ColonyEndError("causa_repetida");
  }

  // **La FK no basta.** Apunta a `variable_catalog_value` entera, no a este
  // catálogo, así que sin esta comprobación se podría colgar una levadura de
  // una colonia muerta y la base lo aceptaría encantada. Se comprueba que cada
  // id sea de `causa_de_perdida_de_colonia` y que no sea un alias.
  const validas = causas.length
    ? await prisma.variableCatalogValue.findMany({
        where: {
          id: { in: causas.map((c) => c.causeValueId) },
          catalog: { key: CATALOGO_DE_CAUSA_DE_PERDIDA },
          aliasOfId: null,
        },
        select: { id: true, impliesUnknownIdentity: true },
      })
    : [];
  if (validas.length !== causas.length) throw new ColonyEndError("causa_desconocida");

  const porId = new Map(validas.map((v) => [v.id, v]));
  for (const c of causas) {
    // Sólo las tres clases que significan algo aquí. Sin esto, `measured_fact`
    // pasaría y convertiría una conjetura sobre una caja vacía en una medición.
    if (!esClaseDeCausa(c.provenanceClass)) throw new ColonyEndError("clase_de_causa_invalida");
  }

  // «Desconocido» no convive con otra causa. Decir «varroa y no sabemos por
  // qué» no es más información que decir «varroa»: es una contradicción, y en
  // un reporte la fila se contaría en las dos columnas.
  //
  // Se probó primero la regla del precedente `TreatmentBatchVariableValue`
  // —exigir `dataQuality` cuando el valor declara identidad desconocida— y se
  // descartó: allí califica cuán firme es una cepa sin nombre, y aquí sería
  // ceremonia sobre un «no sabemos» que ya es completo. Ésta sí impide un
  // registro incoherente.
  if (causas.length > 1 && causas.some((c) => porId.get(c.causeValueId)?.impliesUnknownIdentity)) {
    throw new ColonyEndError("desconocido_no_admite_compania");
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.colony.updateMany({
      where: { id: input.colonyId, status: "active" },
      data: { status: input.status, endedAt: input.endedAt, endClientDraftId: input.clientDraftId ?? null, combinedIntoColonyId: receptoraId },
    });
    if (count === 0) throw new ColonyEndError("colony_already_ended");

    for (const c of causas) {
      await tx.colonyLossCause.create({
        data: {
          colonyId: input.colonyId,
          causeValueId: c.causeValueId,
          provenanceClass: c.provenanceClass,
          dataQuality: c.dataQuality ?? null,
          note: c.note ?? null,
          createdBy: userAccountId,
        },
      });
    }

    const despues = await tx.colony.findUniqueOrThrow({
      where: { id: input.colonyId },
      // Las causas van DENTRO del `after` del rastro. Si quedaran fuera, el
      // AuditEvent diría que la colonia murió y no por qué, que es la mitad
      // que se acaba de añadir.
      include: { lossCauses: { include: { cause: { select: { value: true } } } } },
    });

    // C1 §3: escritura con valor probatorio. Perder una colonia es el hecho que
    // más caro sale y el que menos avisa; sin rastro, «¿desde cuándo?» y «¿quién
    // lo vio?» no tienen respuesta.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "colony.end",
        entityType: "colony",
        entityId: colony.id,
        before: colony,
        after: despues,
        reason: input.reason ?? undefined,
        sourceInterface: "apiary.service",
      },
      tx,
    );

    return despues;
  });
}

export async function getHive(userAccountId: string, hiveId: string) {
  const hive = await prisma.hive.findUnique({
    where: { id: hiveId },
    include: {
      colonies: { include: { assets: true, originSource: { select: { value: true } } } },
      assets: true,
      // El tipo de sitio decide si se pregunta por cuadros (`seManejaEnCuadros`): la especie
      // no esta en la colmena ni en la colonia, vive aqui.
      location: { select: { locationType: true } },
    },
  });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "view", [{ projectId: hive.projectId, locationId: hive.locationId }]);
  return hive;
}

/**
 * A5 (§3). What apiary_site Locations a user can see for the `/apiaries`
 * list — the same "aggregate the concrete scope refs an Assignment
 * actually grants" reasoning `lib/traceability/lots.ts`'s
 * `resolveLotVisibility` already uses for `/lots`, against the `apiary`
 * subject instead of `lot`. A platform-scoped Assignment sees every
 * apiary; a project/location-scoped one sees only apiaries reachable
 * through those scopes; no qualifying Assignment sees none.
 */
interface ApiaryVisibility {
  mode: "all" | "none" | "scoped";
  projectIds: string[];
  locationIds: string[];
}

async function resolveApiaryVisibility(userAccountId: string, action: "view" | "manage" = "view"): Promise<ApiaryVisibility> {
  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    where: {
      userAccountId,
      status: "active",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    include: { scope: true, roleProfile: { include: { permissions: { include: { permission: true } } } } },
  });

  const granting = assignments.filter((a) =>
    a.roleProfile.permissions.some((rp) => rp.permission.resourceType === "apiary" && rp.permission.action === action),
  );

  if (granting.some((a) => a.scope.scopeType === "platform")) {
    return { mode: "all", projectIds: [], locationIds: [] };
  }

  const projectIds = [
    ...new Set(
      granting
        .filter((a) => a.scope.scopeType === "project")
        .map((a) => a.scope.scopeRefId)
        .filter((id): id is string => id != null),
    ),
  ];
  const locationIds = [
    ...new Set(
      granting
        .filter((a) => a.scope.scopeType === "location")
        .map((a) => a.scope.scopeRefId)
        .filter((id): id is string => id != null),
    ),
  ];

  if (projectIds.length === 0 && locationIds.length === 0) {
    return { mode: "none", projectIds: [], locationIds: [] };
  }
  return { mode: "scoped", projectIds, locationIds };
}

/**
 * Capped at 200, newest-named-first is meaningless for a handful of
 * apiary sites — ordered by name instead, matching how few rows this
 * table will realistically ever hold relative to `/lots`.
 */
export async function getApiaryList(userAccountId: string) {
  const visibility = await resolveApiaryVisibility(userAccountId);
  if (visibility.mode === "none") {
    // `sinAmbito` distingue «no hay apiarios» de «no puedes ver ninguno», que
    // hasta aquí llegaban a la pantalla como el mismo array vacío: `/apiaries`
    // decía «Todavía no hay apiarios», una afirmación sobre la finca hecha a
    // quien simplemente no tiene asignaciones. Misma forma que `getLotList`.
    return {
      ...truncate<
        Prisma.LocationGetPayload<{
          include: {
            hives: true;
            parentLocation: { select: { id: true; name: true; locationType: true } };
            organization: { select: { name: true } };
          };
        }>
      >([]),
      sinAmbito: true,
    };
  }

  const where: Prisma.LocationWhereInput = {
    // Los DOS tipos de sitio de abejas: un meliponario se lista con los apiarios (ADR-145).
    locationType: { in: [...TIPOS_DE_SITIO_DE_ABEJAS] },
    ...(visibility.mode === "scoped"
      ? {
          OR: [
            { id: { in: visibility.locationIds } },
            { hives: { some: { projectId: { in: visibility.projectIds } } } },
          ],
        }
      : {}),
  };

  const rows = await prisma.location.findMany({
    where,
    include: {
      hives: true,
      // El lugar que contiene al apiario y de quien es. La jerarquia YA estaba en estas dos
      // columnas y la lista no las miraba: dibujaba ocho apiarios en fila, mezclando duenos.
      // Son dos `select` anidados sobre la misma consulta, no consultas nuevas.
      parentLocation: { select: { id: true, name: true, locationType: true } },
      organization: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: LIST_LIMIT + 1,
  });
  return { ...truncate(rows), sinAmbito: false };
}

export async function getApiaryDetail(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: { hives: { include: { colonies: true }, orderBy: { identifier: "asc" } } },
  });
  if (!location || !esSitioDeAbejas(location.locationType)) throw new ApiaryAccessError("apiary_not_found");

  // Reachable either directly (a location-scoped Assignment against this
  // apiary itself) or through any Hive already sited here (a project-
  // scoped Assignment against whatever Project that Hive belongs to) —
  // the same "try every concrete candidate" discipline requireApiaryAccess
  // already applies everywhere else, just fed more than one candidate.
  const candidates = [{ locationId: location.id }, ...location.hives.map((h) => ({ projectId: h.projectId, locationId: h.locationId }))];
  await requireApiaryAccess(userAccountId, "view", candidates);

  return location;
}

/**
 * Optional Project dropdown for the "New Hive" form — mirrors
 * `lib/traceability/lots.ts`'s `getManageableContext` for `lot`, against
 * `apiary` instead. `Hive.projectId` is genuinely optional (A1's own
 * note: a location-scoped Assignment already suffices on its own), so an
 * empty list here just means the form omits the dropdown, not an error.
 */
export async function getManageableApiaryProjects(userAccountId: string) {
  const visibility = await resolveApiaryVisibility(userAccountId, "manage");
  if (visibility.mode === "none") return [];
  if (visibility.mode === "all") return prisma.project.findMany({ orderBy: { name: "asc" } });
  return prisma.project.findMany({ where: { id: { in: visibility.projectIds } }, orderBy: { name: "asc" } });
}

export interface CrearApiarioInput {
  /** Cómo lo llama el apicultor: «Apiario 3 — Finca Rosina». */
  name: string;
  /** La finca a la que pertenece. Sin ella el sitio no tiene dueño. */
  organizationId: string;
  /** El proyecto bajo el que se trabaja, si lo hay: decide quién lo ve. */
  projectId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /**
   * Apiario o meliponario. Por defecto `apiary_site`, que es lo que hacía antes: quien no
   * elija sigue creando un apiario de Apis y nada cambia para él.
   */
  tipo?: TipoDeSitioDeAbejas | string | null;
  /**
   * El lugar que lo contiene — un lote, una microparcela, el beneficio.
   *
   * **Hasta el 2026-09-16 esta entrada no existía**, así que un apiario creado desde la
   * aplicación nacía sin padre y quedaba fuera del agrupado por lugar (ADR-137). Los cuatro
   * apiarios reales lo tienen porque se lo pusieron los guiones de datos.
   */
  parentLocationId?: string | null;
}

/*
 * **Sin altitud ni notas, y a proposito.** `Location` no tiene columna para
 * una altitud puntual: tiene `altitudeMinM`/`altitudeMaxM`, que son un RANGO y
 * describen una parcela, no un punto. Escribir el mismo numero en las dos
 * afirmaria «el rango es cero», que nadie declaro. Y `notes` no existe en
 * `Location` en absoluto. Las dos se cayeron al medir el esquema, no al
 * escribir el formulario: el compilador no las ve porque `location.create` las
 * rechaza en tiempo de ejecucion. Si hacen falta, van por
 * `updateLocationAttributes`, que ya existe y sabe de rangos.
 */

/**
 * Crear un apiario.
 *
 * **El hueco que cierra, medido el 2026-09-09.** No había forma de crear uno
 * desde la aplicación: los tres que existen salieron de `prisma/seed.ts` y de
 * `scripts/import-cafelino-pe.ts`. El único `location.create` de la aplicación
 * era `createMicrolot`, que subdivide una parcela existente y no sirve aquí.
 * Así que un apicultor podía registrar colmenas, colonias, inspecciones y
 * visitas — y no podía registrar **el sitio donde ocurre todo eso**.
 *
 * **La puerta es la del apiario, no la de las ubicaciones.** `createMicrolot`
 * usa `requireLocationAttributeAccess` porque parte de una ubicación que ya
 * existe y hereda su ámbito. Aquí no hay ubicación de la que heredar, así que
 * se pregunta lo que de verdad corresponde: ¿puede esta cuenta gestionar
 * apiarios en este proyecto? Es la misma pregunta que ya hace `createHive`.
 *
 * **Sin proyecto, sólo quien gestiona apiarios en toda la plataforma.** Un
 * sitio sin proyecto no tiene ámbito del que colgar, y dejarlo crear a
 * cualquiera con una asignación acotada abriría un sitio que su propio autor
 * no podría volver a ver.
 */
export async function crearApiario(userAccountId: string, input: CrearApiarioInput) {
  if (!input.name.trim()) throw new ApiaryAccessError("name_required");

  const organizacion = await prisma.organization.findUnique({ where: { id: input.organizationId } });
  if (!organizacion) throw new ApiaryAccessError("organization_not_found");

  /**
   * **Exige ámbito de PLATAFORMA, y esto se descubrió midiendo.**
   *
   * `Location` no tiene `projectId`: un apiario se asocia a un proyecto **a
   * través de sus colmenas** (`resolveApiaryVisibility` filtra por
   * `hives.some.projectId`). Un sitio recién creado no tiene ninguna, así que
   * **es invisible para quien sólo tiene ámbito de proyecto** — incluido quien
   * acaba de crearlo. La primera versión de esto usaba la puerta normal y su
   * prueba lo cazó: el apiario se creaba y `getApiaryDetail` contestaba
   * `no_apiary_access` a su propio autor.
   *
   * Dejarlo así habría creado sitios huérfanos que nadie puede abrir. La
   * alternativa —dar `projectId` a `Location`— es un cambio de esquema que
   * toca la visibilidad de todo, y es decisión del dueño; queda en
   * `SESSION_STATE.md` §3.
   */
  const visibilidad = await resolveApiaryVisibility(userAccountId, "manage");
  if (visibilidad.mode !== "all") throw new ApiaryAccessError("apiary_create_needs_platform_scope");

  return prisma.$transaction(async (tx) => {
    const sitio = await tx.location.create({
      data: {
        name: input.name.trim(),
        // Apiario o meliponario, lo dice quien crea. Se valida en la frontera: un `as never`
        // dejaria crear un "apiario" cuyo tipo es `plot` (ADR-112).
        locationType: exigeTipoDeSitioDeAbejas(input.tipo ?? "apiary_site"),
        // El lugar que lo contiene. Hasta hoy `crearApiario` NO lo aceptaba, asi que los
        // cuatro apiarios reales tienen padre porque se lo pusieron los guiones de datos y
        // ninguno creado desde la aplicacion lo tenia. El dueno lo pidio explicito: «pueden
        // haber apiarios por lote de finca rosina y tambien bajo beneficio las nubes».
        parentLocationId: input.parentLocationId ?? null,
        organizationId: organizacion.id,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        status: "approved",
        classification: DEFAULT_NEW_RECORD_CLASSIFICATION,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.create_apiary",
        entityType: "location",
        entityId: sitio.id,
        after: sitio,
        sourceInterface: "apiary.service",
      },
      tx,
    );

    return sitio;
  });
}

/**
 * Las fincas bajo las que esta cuenta puede colgar un apiario.
 *
 * **`mode === "all"`, la MISMA puerta que `crearApiario`.** La primera version
 * pedia `mode !== "none"` y su prueba lo cazo: a un Farm Operator con ambito de
 * proyecto se le ofrecian fincas que el servicio iba a rechazar. Un formulario
 * que ofrece lo que el servicio niega es la lente que ya se aplico en
 * `/sensory/new` y en `/sensory/external-report`.
 */
/**
 * Los lugares que pueden contener un sitio de abejas.
 *
 * **Por qué existe.** El dueño lo pidió explícito el 2026-09-16: «pueden haber apiarios por
 * lote de finca rosina y también bajo beneficio las nubes, serían distintos sitios». Hasta
 * entonces `crearApiario` no aceptaba lugar padre **ninguno**, así que un apiario creado desde
 * la aplicación nacía huérfano y quedaba fuera del agrupado por lugar (ADR-137).
 *
 * **Qué se ofrece y por qué.** Fincas y sitios (`site`), parcelas (`plot`) y microparcelas
 * (`micro_plot`): los tres niveles que el dueño nombró. NO se ofrecen otros sitios de abejas
 * —un apiario dentro de otro apiario no significa nada— ni provincias o países, que son
 * geografía administrativa y no un lugar donde se ponen cajas.
 *
 * **No autoriza.** Misma disciplina que `organizacionesParaApiario`: sólo devuelve lista a
 * quien ya tiene ámbito de plataforma, y `crearApiario` vuelve a comprobarlo al escribir.
 */
export async function lugaresParaSitioDeAbejas(userAccountId: string, organizationId?: string | null) {
  const visibility = await resolveApiaryVisibility(userAccountId, "manage");
  if (visibility.mode !== "all") return [];
  return prisma.location.findMany({
    where: {
      locationType: { in: ["site", "plot", "micro_plot"] },
      status: "approved",
      ...(organizationId ? { organizationId } : {}),
    },
    select: { id: true, name: true, locationType: true },
    orderBy: { name: "asc" },
    take: LIST_LIMIT,
  });
}

export async function organizacionesParaApiario(userAccountId: string) {
  const visibility = await resolveApiaryVisibility(userAccountId, "manage");
  if (visibility.mode !== "all") return [];
  return prisma.organization.findMany({
    where: { status: "approved" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
