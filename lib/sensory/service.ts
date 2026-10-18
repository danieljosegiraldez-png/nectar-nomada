/**
 * Slice 6 (Sensory Evaluation). Per DOMAIN_MODEL.md, Assessments are
 * immutable once submitted — corrections are new versioned rows
 * (`supersedesAssessmentId`), never an in-place update. There is
 * deliberately no `updateAssessment` function in this file; the schema
 * supports corrections, but building the correction *workflow* UI is out of
 * scope for this slice (DECISIONS.md ADR-030) — `submitAssessment` simply
 * rejects a second submission from the same evaluator for the same sample.
 *
 * Blind-identity access follows RBAC.md §7 literally: every function that
 * would reveal a `SensoryBlindMapping` row requires `blind_mapping:view`,
 * which the "Sensory Judge" Role Profile does not hold — see
 * lib/rbac/catalog.ts.
 */
import { requireLotAccess, TraceabilityAccessError } from "../traceability/lots";
import { prisma } from "../db";
import { UUID } from "../validation/uuid";
import { Prisma } from "../../generated/prisma/client";
import { resolvedPermissionKeys } from "../rbac/service";
import { clearsClassification } from "../rbac/scopeClassification";
import { permissionKey } from "../rbac/types";
import { recordAuditEvent } from "../audit";
import type { ScopeTarget } from "../rbac/types";
import { ATRIBUTOS_CVA_AFECTIVO, FORMULA_CVA_AFECTIVO, puntajeAfectivoCva } from "./puntajeCva";
import { FORMULA_SUMA_DE_ATRIBUTOS, puntajeSumaDeAtributos } from "./puntajeSuma";

export class SensoryAccessError extends Error {}

/**
 * S2 §2a — raised when something tries to aggregate a session that has not
 * declared what it was evaluating for. Distinct from SensoryAccessError: this
 * is not a permission problem, it is a missing declaration, and the fix is for
 * a human to state the purpose rather than for anyone to be granted more.
 */
export class SensoryPurposeNotDeclaredError extends Error {
  constructor(readonly sessionName: string) {
    super(`sensory_purpose_not_declared:${sessionName}`);
    this.name = "SensoryPurposeNotDeclaredError";
  }
}

/**
 * Permission keys for one session, refusing outright unless the caller clears
 * that session's own classification — ADR-081.
 *
 * Every gate in this file used to resolve permission keys and stop there.
 * `SensorySession.classification` has existed since the column was added, with
 * a comment on it promising "the same independent AND-gate as every other
 * module", and nothing read it: a judge assigned to a `confidential` session
 * opened it on the strength of `sensory:submit_assessment` alone. The gate is
 * applied here, once, so no call site can resolve keys without it.
 *
 * A session that cannot be loaded is refused rather than treated as public —
 * the same rule scopeClassification.ts states for a missing Project or
 * Location, and for the same reason: a stale id must not become a bypass.
 *
 * The refusal reuses `no_session_access` deliberately. "You lack clearance"
 * and "you have no assignment here" are different facts, and which one applies
 * is itself information about the session.
 */
async function grantedKeysForSession(userAccountId: string, sessionId: string): Promise<Set<string>> {
  // El id llega de la URL de `sensory/[sessionId]`. Sin forma de UUID, Prisma lanzaba `P2007` y la
  // página daba 500 (PENDING_IMPLEMENTATIONS/026); recibe lo mismo que una sesión que no existe.
  if (!UUID.test(sessionId)) throw new SensoryAccessError("no_session_access");
  const target: ScopeTarget = { scopeType: "session", scopeRefId: sessionId };
  const [grantedKeys, session] = await Promise.all([
    resolvedPermissionKeys(userAccountId, target),
    prisma.sensorySession.findUnique({ where: { id: sessionId }, select: { classification: true } }),
  ]);
  if (!session) throw new SensoryAccessError("no_session_access");
  if (!clearsClassification(grantedKeys, session.classification)) {
    throw new SensoryAccessError("no_session_access");
  }
  return grantedKeys;
}

/**
 * Sessions this user has an active session-scoped Assignment for — same
 * "assignment scope is the filter" pattern as Partner Workspace
 * (lib/partner/workspace.ts).
 *
 * Filtered on the same two conditions `getSessionForJudge` gates opening on:
 * an action permission for that session, and clearance for its classification.
 * ADR-079 found the partner list and the partner open-gate had drifted apart,
 * and this list had drifted the same way — it filtered on the Assignment
 * alone, so a session-scoped Role Profile holding no `sensory:*` permission
 * saw its sessions listed and hit `no_session_access` on opening one. A list
 * that shows what cannot be opened is its own defect; a list that shows the
 * *names* of sessions above the reader's clearance is the leak.
 */
export async function getJudgeSessions(userAccountId: string) {
  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    where: {
      userAccountId,
      status: "active",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      scope: { scopeType: "session" },
    },
    include: { scope: true },
  });

  const sessionIds = [
    ...new Set(assignments.map((a) => a.scope.scopeRefId).filter((id): id is string => id !== null)),
  ];
  if (sessionIds.length === 0) return [];

  const candidates = await prisma.sensorySession.findMany({
    where: { id: { in: sessionIds } },
    include: { protocolVersion: { include: { protocol: true } } },
    orderBy: { scheduledAt: "desc" },
  });

  const visible: typeof candidates = [];
  for (const session of candidates) {
    const grantedKeys = await resolvedPermissionKeys(userAccountId, {
      scopeType: "session",
      scopeRefId: session.id,
    });
    const holdsSensoryAction =
      grantedKeys.has(permissionKey("sensory", "submit_assessment")) ||
      grantedKeys.has(permissionKey("sensory", "manage_session"));
    if (holdsSensoryAction && clearsClassification(grantedKeys, session.classification)) {
      visible.push(session);
    }
  }
  return visible;
}

export async function getSessionForJudge(userAccountId: string, sessionId: string) {
  const grantedKeys = await grantedKeysForSession(userAccountId, sessionId);

  const canSubmitAssessment = grantedKeys.has(permissionKey("sensory", "submit_assessment"));
  const canManageSession = grantedKeys.has(permissionKey("sensory", "manage_session"));
  const canViewBlindMapping = grantedKeys.has(permissionKey("blind_mapping", "view"));

  if (!canSubmitAssessment && !canManageSession) {
    throw new SensoryAccessError("no_session_access");
  }

  const session = await prisma.sensorySession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      protocolVersion: {
        include: {
          protocol: true,
          attributes: { orderBy: { displayOrder: "asc" } },
          descriptors: { orderBy: { displayOrder: "asc" } },
        },
      },
      flights: {
        orderBy: { sequenceOrder: "asc" },
        include: {
          blindSamples: {
            orderBy: { blindCode: "asc" },
            include: {
              assessments: {
                where: { evaluatorUserAccountId: userAccountId, status: "submitted" },
              },
            },
          },
        },
      },
    },
  });

  return {
    session,
    canSubmitAssessment,
    canManageSession,
    canViewBlindMapping,
  };
}

/**
 * Lo único que `resolverPuntajeTotal` necesita — que NO incluye la muestra
 * ciega. Un informe externo no tiene una cuando se calcula su total, y pasarle
 * una cadena vacía para satisfacer el tipo es cómo se cuela un identificador
 * inventado en una fila.
 */
export interface EntradasDelPuntaje {
  overallScore?: number | null;
  nonUniformCups?: number | null;
  defectiveCups?: number | null;
  attributeResponses: ReadonlyArray<{ attributeId: string; value: number; comment?: string | null }>;
}

export interface SubmitAssessmentInput extends EntradasDelPuntaje {
  blindSampleId: string;
  comment?: string | null;
  // R1 (docs/implementation/33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md §2) —
  // additive alongside attributeResponses and comment, never a replacement
  // for either: a structured descriptor/defect pick, with its own optional
  // per-response confidence ("creo que hay fenólico, no estoy seguro" is
  // different information from a flat assertion). Free text still works
  // exactly as before whether or not this is given.
  descriptorResponses?: ReadonlyArray<{
    descriptorId: string;
    confidence?: "low" | "medium" | "high" | null;
    comment?: string | null;
  }>;
}

/**
 * De dónde sale el puntaje total de una valoración, y qué se guarda con él.
 *
 * **Exportada desde el 2026-09-07** para que el registro de un informe externo
 * (`lib/sensory/informeExterno.ts`) decida el total por el mismo camino. Tener
 * dos implementaciones de «cómo se obtiene el puntaje» es cómo se acaba con una
 * equivocada ganando en silencio.
 *
 * **Dos regímenes, y el viejo no cambia.** Un protocolo sin `scoreFormula` es
 * todo lo que existía antes del 2026-09-06: el total lo teclea quien cata y se
 * guarda tal cual. Uno con fórmula deja de aceptar el tecleado —lo ignora en
 * vez de rechazarlo, porque el formulario ya no lo pide y un cliente viejo no
 * debe quedarse sin poder enviar— y lo calcula a partir de los atributos.
 *
 * **Por qué los atributos se leen del protocolo y no del envío.** Un envío
 * puede traer siete respuestas, o dos veces la misma, o una de otro protocolo.
 * Recorrer los ocho atributos que el protocolo declara y buscar el valor de
 * cada uno convierte «falta Sweetness» en un error con nombre, en vez de en un
 * puntaje calculado sobre siete números que parecería correcto.
 */
export function resolverPuntajeTotal(
  protocolVersion: {
    scoreFormula: string | null;
    attributes: ReadonlyArray<{ id: string; name: string; scaleMin: Prisma.Decimal; scaleMax: Prisma.Decimal }>;
  },
  input: EntradasDelPuntaje,
): { overallScore: number | null; nonUniformCups: number | null; defectiveCups: number | null } {
  if (protocolVersion.scoreFormula === null) {
    return { overallScore: input.overallScore ?? null, nonUniformCups: null, defectiveCups: null };
  }

  if (protocolVersion.scoreFormula === FORMULA_SUMA_DE_ATRIBUTOS) {
    // Se recorren los atributos del PROTOCOLO, no las respuestas del envío, por
    // lo mismo que en el CVA: así «falta uno» es un error con nombre en vez de
    // una suma sobre cinco criterios que parecería correcta.
    const valorPorAtributo = new Map(input.attributeResponses.map((r) => [r.attributeId, r.value]));
    const aSumar = protocolVersion.attributes.map((a) => {
      const value = valorPorAtributo.get(a.id);
      if (value === undefined) throw new SensoryAccessError("responses_incomplete");
      return { name: a.name, scaleMin: a.scaleMin.toNumber(), scaleMax: a.scaleMax.toNumber(), value };
    });
    try {
      return { overallScore: puntajeSumaDeAtributos(aSumar), nonUniformCups: null, defectiveCups: null };
    } catch {
      throw new SensoryAccessError("score_out_of_range");
    }
  }

  if (protocolVersion.scoreFormula !== FORMULA_CVA_AFECTIVO) {
    // Una fórmula que la base tiene y este código no conoce. Calcular algo
    // sería inventar; guardar un total tecleado bajo un protocolo que dice
    // calcularlo, también.
    throw new SensoryAccessError("unknown_score_formula");
  }

  const porNombre = new Map(protocolVersion.attributes.map((a) => [a.name, a.id]));
  const valorPorAtributo = new Map(input.attributeResponses.map((r) => [r.attributeId, r.value]));

  const valores: number[] = [];
  for (const nombre of ATRIBUTOS_CVA_AFECTIVO) {
    const attributeId = porNombre.get(nombre);
    if (attributeId === undefined) throw new SensoryAccessError("protocol_missing_attribute");
    const valor = valorPorAtributo.get(attributeId);
    if (valor === undefined) throw new SensoryAccessError("responses_incomplete");
    valores.push(valor);
  }

  const nonUniformCups = input.nonUniformCups ?? 0;
  const defectiveCups = input.defectiveCups ?? 0;

  let overallScore: number;
  try {
    overallScore = puntajeAfectivoCva({ valores, tazasNoUniformes: nonUniformCups, tazasDefectuosas: defectiveCups });
  } catch {
    // El mensaje de `PuntajeCvaInvalido` nombra el atributo y su valor, pero
    // esto viaja a un navegador: se traduce por clave, como el resto.
    throw new SensoryAccessError("score_out_of_range");
  }

  return { overallScore, nonUniformCups, defectiveCups };
}

export async function submitAssessment(userAccountId: string, input: SubmitAssessmentInput) {
  const blindSample = await prisma.sensoryBlindSample.findUnique({
    where: { id: input.blindSampleId },
    include: {
      flight: {
        include: {
          session: {
            include: { protocolVersion: { include: { attributes: { orderBy: { displayOrder: "asc" } } } } },
          },
        },
      },
    },
  });
  if (!blindSample) throw new SensoryAccessError("blind_sample_not_found");

  const sessionId = blindSample.flight.sessionId;
  const grantedKeys = await grantedKeysForSession(userAccountId, sessionId);
  if (!grantedKeys.has(permissionKey("sensory", "submit_assessment"))) {
    throw new SensoryAccessError("no_session_access");
  }

  if (input.attributeResponses.length === 0) {
    throw new SensoryAccessError("responses_required");
  }

  const total = resolverPuntajeTotal(blindSample.flight.session.protocolVersion, input);

  // The real guarantee against a double submission is the DB-level unique
  // constraint on (blindSampleId, evaluatorUserAccountId) — a pre-check
  // query here would still leave a race between two concurrent requests
  // (e.g. a double-click). Catch the constraint violation instead of
  // relying on check-then-create.

  // La escritura y su AuditEvent en la misma transacción desde el 2026-09-06.
  // Esta fue la última de todo el repositorio, y la que se aplazó dos veces por
  // su manejo de errores: el `try/catch` envolvía el bloque ENTERO, así que
  // meter el audit dentro habría hecho que un P2002 del audit —improbable, pero
  // posible— se reportara como `already_submitted`. Un error distinto
  // disfrazado de otro, y disfrazado del que el juez ve en pantalla.
  //
  // Por eso el manejo del P2002 va atado al `create` y sólo a él. Cualquier
  // fallo del audit sale tal cual, revierte la evaluación y se ve.
  const assessment = await prisma.$transaction(async (tx) => {
    const creada = await tx.assessment
      .create({
        data: {
          blindSampleId: input.blindSampleId,
          evaluatorUserAccountId: userAccountId,
          overallScore: total.overallScore,
          nonUniformCups: total.nonUniformCups,
          defectiveCups: total.defectiveCups,
          comment: input.comment ?? null,
          attributeResponses: {
            create: input.attributeResponses.map((r) => ({
              attributeId: r.attributeId,
              value: r.value,
              comment: r.comment ?? null,
            })),
          },
          descriptorResponses: {
            create: (input.descriptorResponses ?? []).map((r) => ({
              descriptorId: r.descriptorId,
              confidence: r.confidence ?? null,
              comment: r.comment ?? null,
            })),
          },
        },
        include: { attributeResponses: true, descriptorResponses: true },
      })
      .catch((error: unknown) => {
        // Atado al `create`: aquí un P2002 sólo puede ser la unicidad
        // (blindSampleId, evaluatorUserAccountId), que es exactamente «ya
        // enviaste esta muestra».
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new SensoryAccessError("already_submitted");
        }
        throw error;
      });

    // C1 §3: a judge's original, immutable submission is evidentiary even
    // though Assessment doesn't carry the generic provenanceClass column
    // (Part C's own drift finding) — it uses immutability + supersession
    // instead. One audit row for the whole submission, not one per
    // AttributeResponse child row.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "assessment.create",
        entityType: "assessment",
        entityId: creada.id,
        after: creada,
        sourceInterface: "sensory.service",
      },
      tx,
    );

    return creada;
  });

  return assessment;
}

/**
 * An evaluator's own submitted assessments across every session — CLAUDE.md
 * §14/§27's "My Tastings, Sensory History." Ownership is the query itself
 * (same pattern as lib/experiences/bookings.ts's getBookingsForUser). Never
 * reveals blind-sample identity (RBAC.md §7): the blind code and
 * protocol/session names are a judge's own submitted record, not the real
 * sample behind another judge's blind mapping.
 *
 * Ownership is not sufficient on its own, though, which is why this is gated
 * too (ADR-081). The rows are the caller's, but each one carries the session
 * and protocol *names* alongside, and those belong to the session's
 * classification rather than to the evaluator. A session reclassified upward
 * — or an evaluator whose clearance is withdrawn — must stop surfacing those
 * names here, or "My Tastings" becomes the way around the gate everything
 * else applies.
 *
 * The assessment itself is untouched by this: it remains stored, immutable and
 * auditable, and returns to the list the moment clearance does. What the
 * filter withholds is the reading, never the record.
 */
export async function getAssessmentHistoryForEvaluator(userAccountId: string) {
  const assessments = await prisma.assessment.findMany({
    where: { evaluatorUserAccountId: userAccountId, status: "submitted" },
    include: {
      blindSample: {
        include: {
          flight: {
            include: {
              session: { include: { protocolVersion: { include: { protocol: true } } } },
            },
          },
        },
      },
      attributeResponses: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  // Resolved once per distinct session rather than once per assessment: a
  // judge commonly submits many assessments in one session, and each
  // resolution is a full Assignment query.
  const clearedBySession = new Map<string, boolean>();
  const visible: typeof assessments = [];
  for (const assessment of assessments) {
    const session = assessment.blindSample.flight.session;
    let cleared = clearedBySession.get(session.id);
    if (cleared === undefined) {
      const grantedKeys = await resolvedPermissionKeys(userAccountId, {
        scopeType: "session",
        scopeRefId: session.id,
      });
      cleared = clearsClassification(grantedKeys, session.classification);
      clearedBySession.set(session.id, cleared);
    }
    if (cleared) visible.push(assessment);
  }
  return visible;
}

export async function getSessionForHeadJudge(userAccountId: string, sessionId: string) {
  const grantedKeys = await grantedKeysForSession(userAccountId, sessionId);
  if (!grantedKeys.has(permissionKey("blind_mapping", "view"))) {
    throw new SensoryAccessError("no_blind_mapping_access");
  }

  const session = await prisma.sensorySession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      protocolVersion: {
        include: {
          protocol: true,
          attributes: { orderBy: { displayOrder: "asc" } },
          descriptors: { orderBy: { displayOrder: "asc" } },
        },
      },
      flights: {
        orderBy: { sequenceOrder: "asc" },
        include: {
          blindSamples: {
            orderBy: { blindCode: "asc" },
            include: {
              blindMapping: {
                include: {
                  sample: true,
                  roastSession: {
                    include: {
                      equipment: { select: { name: true } },
                      roaster: { select: { displayName: true } },
                      transformations: { select: {
                        inputs: { select: { lot: { select: { lotCode: true, projectId: true, locationId: true, classification: true } } } },
                        outputs: { select: { lot: { select: { lotCode: true, lotType: true, projectId: true, locationId: true, classification: true } } } },
                      } },
                      recipeVersion: { include: { recipe: { select: { name: true } } } },
                    },
                  },
                },
              },
              assessments: {
                where: { status: "submitted" },
                include: { evaluator: { include: { person: true } }, attributeResponses: true },
              },
              panelResults: { include: { attribute: true } },
            },
          },
        },
      },
    },
  });

  for (const flight of session.flights) {
    for (const blindSample of flight.blindSamples) {
      for (const transformation of blindSample.blindMapping?.roastSession?.transformations ?? []) {
        const visibleInputs = [];
        for (const input of transformation.inputs) {
          try { await requireLotAccess(userAccountId, "view", [input.lot]); visibleInputs.push(input); }
          catch (error) { if (!(error instanceof TraceabilityAccessError)) throw error; }
        }
        const visibleOutputs = [];
        for (const output of transformation.outputs) {
          try { await requireLotAccess(userAccountId, "view", [output.lot]); visibleOutputs.push(output); }
          catch (error) { if (!(error instanceof TraceabilityAccessError)) throw error; }
        }
        transformation.inputs = visibleInputs;
        transformation.outputs = visibleOutputs;
      }
    }
  }
  return session;
}

/**
 * Recomputes (delete + recreate, not upsert — a nullable attributeId means
 * Postgres wouldn't enforce "at most one overall row" via a unique
 * constraint alone) PanelResult rows from every current 'submitted'
 * Assessment on this blind sample. CLAUDE.md §28: a derived metric, stored
 * with its method and computation time, never hand-edited.
 */
export async function computePanelResult(userAccountId: string, blindSampleId: string) {
  const blindSample = await prisma.sensoryBlindSample.findUnique({
    where: { id: blindSampleId },
    include: { flight: { include: { session: true } } },
  });
  if (!blindSample) throw new SensoryAccessError("blind_sample_not_found");

  const grantedKeys = await grantedKeysForSession(userAccountId, blindSample.flight.sessionId);
  if (!grantedKeys.has(permissionKey("sensory", "manage_session"))) {
    throw new SensoryAccessError("no_session_access");
  }

  // S2 §2a. Aggregating assessments asserts they measure the same thing. A
  // panel result drawn from a session whose purpose nobody declared asserts
  // that without anyone having said what was being measured or why — and §6
  // forbids inferring it after the fact. Refuse rather than average.
  //
  // This is the reason `purpose` is nullable and unbackfilled: legacy sessions
  // surface here, as a specific error a human resolves by declaring the
  // purpose, instead of disappearing into a mean.
  if (blindSample.flight.session.purpose === null) {
    throw new SensoryPurposeNotDeclaredError(blindSample.flight.session.name);
  }

  const assessments = await prisma.assessment.findMany({
    where: { blindSampleId, status: "submitted" },
    include: { attributeResponses: true },
  });

  return prisma.$transaction(async (tx) => {
    await tx.panelResult.deleteMany({ where: { blindSampleId } });

    const rows: { attributeId: string | null; values: number[] }[] = [];

    const overallValues = assessments
      .map((a) => a.overallScore)
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .map((v) => v.toNumber());
    if (overallValues.length > 0) {
      rows.push({ attributeId: null, values: overallValues });
    }

    const byAttribute = new Map<string, number[]>();
    for (const assessment of assessments) {
      for (const response of assessment.attributeResponses) {
        const list = byAttribute.get(response.attributeId) ?? [];
        list.push(response.value.toNumber());
        byAttribute.set(response.attributeId, list);
      }
    }
    for (const [attributeId, values] of byAttribute) {
      rows.push({ attributeId, values });
    }

    const created = [];
    for (const row of rows) {
      const mean = row.values.reduce((sum, v) => sum + v, 0) / row.values.length;
      created.push(
        await tx.panelResult.create({
          data: {
            blindSampleId,
            attributeId: row.attributeId,
            responseCount: row.values.length,
            meanValue: mean,
            minValue: Math.min(...row.values),
            maxValue: Math.max(...row.values),
          },
        }),
      );
    }
    return created;
  });
}
