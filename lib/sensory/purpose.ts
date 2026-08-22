/**
 * S2 (docs/implementation/37_S2_PROPOSITO_SENSORIAL_NAVEGACION.md §2a) — which
 * sensory results may be compared with which.
 *
 * The platform already refuses to mix consumer liking with technical judgement
 * (`CONSUMER_SENSORY_FEEDBACK.md`, CLAUDE.md §49). S2's point is that the same
 * discipline applies between the technical purposes: a competition score and a
 * QC verdict are not interchangeable readings just because both are "sensory".
 * §2a asks for this to be recommended with reasoning *and enforced in the
 * model*, not merely documented — so it lives here as pure functions the
 * service layer calls, rather than as prose in an ADR.
 *
 * Everything in this file is deliberately free of Prisma and of I/O: the rules
 * are the kind of thing that must be testable exhaustively and cheaply.
 */

import type { SensoryPurpose, SensorySubject } from "../../generated/prisma/client";

export type ComparabilityVerdict = { comparable: true } | { comparable: false; reason: string };

export interface SessionComparabilityFacts {
  /** For error messages that name the offender rather than just failing. */
  label: string;
  purpose: SensoryPurpose | null;
  subject: SensorySubject | null;
  protocolVersionId: string;
  /** §2b — an attribute of the subject, never a reason to refuse comparison. */
  preparationMethod?: string | null;
}

/**
 * Purposes that may be compared with each other, ignoring protocol and subject.
 *
 * - `rank` and `characterize` are mutually comparable. Both read the same
 *   scales on the same scoresheet; what differs is what the reader does with
 *   the result afterwards, which is not a property of the measurement.
 * - `verify_conformance` compares only with itself. Its output is a verdict
 *   against a specification, not a position on a shared scale — averaging a
 *   pass/fail with an 87.5 produces a number that means nothing.
 * - `select` compares only with itself, and see the caveat in
 *   `comparePurposes`: a choice is made *within* an option set and does not
 *   travel outside it.
 * - `hedonic` compares only with itself. This is the existing rule, not a new
 *   one; S2 merely stops it being a special case.
 */
const MUTUALLY_COMPARABLE: readonly (readonly SensoryPurpose[])[] = [
  ["rank", "characterize"],
  ["verify_conformance"],
  ["select"],
  ["hedonic"],
];

export function comparePurposes(a: SensoryPurpose | null, b: SensoryPurpose | null): ComparabilityVerdict {
  // An undeclared purpose is not a wildcard, and two undeclared purposes are
  // not "the same". §6 forbids inferring what a past session was for, so the
  // only honest answer here is a refusal that names the missing declaration —
  // which is also what surfaces the sessions predating this model rather than
  // quietly folding them into an average.
  if (a === null || b === null) {
    return { comparable: false, reason: "purpose_not_declared" };
  }

  const group = MUTUALLY_COMPARABLE.find((g) => g.includes(a));
  if (!group || !group.includes(b)) {
    return { comparable: false, reason: `purpose_not_comparable:${a}_vs_${b}` };
  }
  return { comparable: true };
}

export function areSessionsComparable(
  a: SessionComparabilityFacts,
  b: SessionComparabilityFacts,
): ComparabilityVerdict {
  const purposes = comparePurposes(a.purpose, b.purpose);
  if (!purposes.comparable) return purposes;

  // Same reasoning as purpose: an undeclared subject cannot be assumed to
  // match another undeclared one.
  if (a.subject === null || b.subject === null) {
    return { comparable: false, reason: "subject_not_declared" };
  }
  if (a.subject !== b.subject) {
    return { comparable: false, reason: `subject_mismatch:${a.subject}_vs_${b.subject}` };
  }

  // rank↔characterize is the only cross-purpose pairing, and §2a allows it
  // only on a shared protocol: the two are comparable because they read the
  // same scales, which stops being true across scoresheets. Within a single
  // purpose the same argument applies — two scores on different protocols are
  // not the same measurement.
  if (a.protocolVersionId !== b.protocolVersionId) {
    return { comparable: false, reason: "protocol_version_mismatch" };
  }

  // preparationMethod is deliberately NOT consulted. §2b: extraction method is
  // how a cup was prepared, an attribute of the subject rather than a subject
  // of its own. Two evaluations of the same beverage brewed differently stay
  // comparable — which is precisely what a barista needs and what modelling
  // brew method as a subject would have broken.
  return { comparable: true };
}

export class SensoryComparabilityError extends Error {
  constructor(
    readonly reason: string,
    readonly left: string,
    readonly right: string,
  ) {
    super(`sensory_results_not_comparable:${reason} (${left} vs ${right})`);
    this.name = "SensoryComparabilityError";
  }
}

/**
 * Throws unless every session in the set may be aggregated together. Callers
 * that aggregate across sessions must go through this; it is the enforcement
 * §2a asks for.
 */
export function assertSessionsComparable(sessions: readonly SessionComparabilityFacts[]): void {
  if (sessions.length < 2) return;
  const [first, ...rest] = sessions;
  for (const other of rest) {
    const verdict = areSessionsComparable(first!, other);
    if (!verdict.comparable) {
      throw new SensoryComparabilityError(verdict.reason, first!.label, other.label);
    }
  }
}

/** Human-facing summary of what a purpose is for, used by the navigation. */
export const PURPOSE_DESCRIPTIONS: Readonly<Record<SensoryPurpose, string>> = {
  rank: "Score against a standard in order to rank.",
  verify_conformance: "Check against a specification: passes or does not.",
  characterize: "Describe what is there and how the process expressed itself.",
  select: "Decide between options for an end.",
  hedonic: "Liking — consumer response, never mixed with technical judgement.",
};
