/**
 * Which action a batch is waiting for — ADR-096.
 *
 * The batch detail page offered five buttons of identical weight: start
 * fermentation, start drying, move to storage, create sample, view report.
 * All the same size, all the same colour, in one flex row. Nothing on the page
 * said which one a batch at this stage was actually waiting for, so the
 * operator had to know the answer before arriving — which they usually do, but
 * it makes the page a list of capabilities rather than a place work happens
 * (ADR-080 deferred this deliberately, as a design question rather than a
 * defect).
 *
 * The sequence encoded here is the product owner's, confirmed rather than
 * inferred: cherry is waiting to ferment, processing to dry, drying to be
 * stored. Green and roasted coffee is waiting to be tasted.
 *
 * **This suggests, it never restricts.** Every action the page offered before
 * is still offered and still reachable in one click. The only change is that
 * one of them is drawn as the expected next step. A batch that skips a stage —
 * and they do — costs the operator nothing extra.
 *
 * Pure function of a lot's type and whether a run is under way: no I/O, no
 * Prisma, trivially testable, same shape as lib/navigation.ts.
 */
import type { LotType } from "../../generated/prisma/client";

// `roast` se añadió el 2026-09-06, cuando el tueste dejó de ser un servicio sin
// pantalla. Está en el tipo para poder OFRECER el botón, y a propósito NO entra
// en `nextActionFor`: la secuencia de arriba es del dueño y dice que el café
// verde espera a ser CATADO. Sugerir tostar en su lugar sería revocar esa
// decisión desde el código, y este módulo sugiere, no restringe.
// `process` se añadió el 2026-09-07, con la pantalla del proceso del lote. Está
// en el tipo para poder OFRECER el botón, y a propósito NO entra en
// `nextActionFor`, por el mismo motivo que `roast`: la secuencia de arriba es
// del dueño, y cambiarla desde aquí sería revocar su decisión desde el código.
export type BatchAction =
  | "measurement"
  | "selection"
  | "fermentation"
  | "drying"
  | "process"
  | "storage"
  | "sample"
  | "hulling"
  | "green_grading"
  | "roast"
  // ADR-161 — los dos pasos de un lote de miel.
  | "honey_process"
  | "packaging"
  | "split"
  | "report";

/**
 * The action a batch of this type is expected to need next, or `null` when
 * there is no meaningful answer.
 *
 * `null` is a real result, not a gap to be filled later. A `sample` is an end
 * state — it goes to sensory, not to another processing stage. `honey` reaches
 * a Lot through A3's "a honey batch is a Lot" decision and does not travel the
 * coffee sequence at all. `other` exists precisely because the material did not
 * fit a stage, so guessing one for it would be inventing a fact.
 */
export function nextActionFor(lotType: LotType, hasActiveRun: boolean, alreadySelected = true): BatchAction | null {
  // A batch already fermenting or drying is not waiting for a new stage — but
  // it is not waiting for nothing either, which is what this returned at first.
  // The product owner opened PE-96-A mid-fermentation and said plainly what the
  // page should have said: it needs a measurement.
  //
  // That is what a run *is*. You do not start a fermentation and walk away; you
  // take a reading, and another, and you end the run when the numbers say to.
  // Suggesting a new stage here would point away from the work in progress;
  // suggesting nothing pretended there was none.
  if (hasActiveRun) return "measurement";

  switch (lotType) {
    // P3 follow-up, product owner 2026-08-28. ADR-096 recorded "cherry is
    // waiting to ferment" as the product owner's own confirmed sequence — and
    // it was, in a world where selección was not an operation the platform
    // could perform. It is now, and at a mill it comes first: cherry arrives,
    // is sorted, and only then ferments.
    //
    // `alreadySelected` is what keeps this from suggesting the same step
    // twice. An accepted output is *also* a cherry lot, so a batch that has
    // just been sorted would otherwise be told to sort it again, which reads
    // as the page not knowing what happened to it.
    //
    // Defaults to `true` so an existing caller that has not been taught to
    // resolve lineage keeps ADR-096's original behaviour rather than silently
    // acquiring a new suggestion.
    case "cherry":
      return alreadySelected ? "fermentation" : "selection";
    case "processing":
      return "drying";
    case "drying":
    case "parchment":
    case "dry_cherry":
      return "storage";
    // Green and roasted coffee is waiting to be tasted. Both land on the same
    // action for the same reason, and are listed separately rather than
    // collapsed so that changing one later does not silently change the other.
    case "green":
      return "sample";
    case "roast":
      return "sample";
    case "sample":
    case "honey":
    case "other":
      return null;
  }
}

/**
 * La sugerencia, sólo si la ficha OFRECE esa acción en este momento — o ninguna (tarea 9, ronda de arreglo 1, 2026-10-02).
 *
 * `nextActionFor` responde por el tipo del lote y no sabe del proceso: desde la Parte 1, «Empezar fermentación» y «Empezar
 * secado» sólo se ofrecen con un proceso abierto que cubra al lote, y «Selección» no se ofrece bajo uno ni en un lote dividido.
 * La ficha decía «Siguiente paso sugerido» sobre un botón que no estaba. Sugerir no restringe, pero sugerir lo que no se ofrece
 * es una pista falsa.
 */
export function sugerenciaOfrecida(sugerida: BatchAction | null, ofrecidas: readonly BatchAction[]): BatchAction | null {
  return sugerida !== null && ofrecidas.includes(sugerida) ? sugerida : null;
}
