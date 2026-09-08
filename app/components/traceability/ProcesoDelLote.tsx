"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  abrirProcesoAction,
  cambiarIntencionAction,
  cambiarObjetivoAction,
  cerrarProcesoAction,
  devolverASecadoAction,
  registrarIntervencionAction,
  type TraceabilityActionState,
} from "../../actions/traceability";

const inicial: TraceabilityActionState = {};

export interface OpcionSimple {
  id: string;
  label: string;
}

/**
 * Abrir el proceso de un lote.
 *
 * **Los dos campos obligatorios van primero y sin nada entre medias**: la
 * intención y el % H al que se almacenará. Son la decisión del dueño —«no se
 * abre un proceso sin decir a qué humedad se va a almacenar»— y en un teléfono,
 * en el campo, lo que está debajo del pliegue se rellena peor.
 */
export function AbrirProcesoForm({
  lotId,
  recetas,
  grados,
  estadosDeCereza,
}: {
  lotId: string;
  recetas: OpcionSimple[];
  grados: OpcionSimple[];
  estadosDeCereza: OpcionSimple[];
}) {
  const [estado, accion, pending] = useActionState(abrirProcesoAction, inicial);
  const t = useTranslations("Traceability");

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />

      <div className="nn-field">
        <label htmlFor="p-intent">{t("processIntentLabel")}</label>
        <textarea id="p-intent" name="intent" rows={3} required placeholder={t("processIntentPlaceholder")} />
        <p className="nn-muted">{t("processIntentHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="p-target">{t("processTargetMoistureLabel")}</label>
        <input
          id="p-target"
          name="targetMoisturePct"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0.1"
          max="100"
          required
        />
      </div>

      {/* Grado y estado de la cereza van JUNTO a la intención y antes de la
          receta: son lo que el reporte agrupa, y en un teléfono lo que está
          arriba se rellena. Anulables, así que ninguno lleva `required`. */}
      <div className="nn-field">
        <label htmlFor="p-grade">{t("processGradeLabel")}</label>
        <select id="p-grade" name="processGradeValueId" defaultValue="">
          <option value="">{t("processNotDeclared")}</option>
          {grados.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="p-cherry">{t("processCherryStateLabel")}</label>
        <select id="p-cherry" name="cherryStateValueId" defaultValue="">
          <option value="">{t("processNotDeclared")}</option>
          {estadosDeCereza.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="p-recipe">{t("processRecipeLabel")}</label>
        <select id="p-recipe" name="processRecipeVersionId" defaultValue="">
          <option value="">{t("processNoRecipe")}</option>
          {recetas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="nn-muted">{t("processNoRecipeHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="p-notes">{t("notesLabel")}</label>
        <textarea id="p-notes" name="notes" rows={2} />
      </div>

      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("openProcessButton")}
      </button>
    </form>
  );
}

/** Registrar un manejo: flotado, choque térmico, trasiego. */
export function IntervencionForm({
  lotProcessId,
  lotId,
  opciones,
}: {
  lotProcessId: string;
  lotId: string;
  opciones: OpcionSimple[];
}) {
  const [estado, accion, pending] = useActionState(registrarIntervencionAction, inicial);
  const t = useTranslations("Traceability");

  if (opciones.length === 0) {
    return <p className="nn-muted">{t("processNoInterventionVocabulary")}</p>;
  }

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotProcessId" value={lotProcessId} />
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="i-kind">{t("processInterventionLabel")}</label>
        <select id="i-kind" name="catalogValueId" defaultValue="" required>
          <option value="">{t("chooseOption")}</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="i-notes">{t("notesLabel")}</label>
        <input id="i-notes" name="notes" type="text" />
      </div>
      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("recordProcessInterventionButton")}
      </button>
    </form>
  );
}

/**
 * Cerrar el proceso eligiendo la medición de humedad que lo terminó.
 *
 * **Se elige de una lista, no se teclea un número.** El servicio guarda el
 * puntero a la medición, no una copia: si aquí se escribiera el valor a mano
 * habría dos verdades, y la de la pantalla no tendría ni fecha ni quién la tomó.
 */
export function CerrarProcesoForm({
  lotProcessId,
  lotId,
  mediciones,
}: {
  lotProcessId: string;
  lotId: string;
  mediciones: OpcionSimple[];
}) {
  const [estado, accion, pending] = useActionState(cerrarProcesoAction, inicial);
  const t = useTranslations("Traceability");

  if (mediciones.length === 0) {
    return <p className="nn-muted">{t("processNoMoistureYet")}</p>;
  }

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotProcessId" value={lotProcessId} />
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="c-measurement">{t("processClosingMoistureLabel")}</label>
        <select id="c-measurement" name="closingMoistureMeasurementId" defaultValue="" required>
          <option value="">{t("chooseOption")}</option>
          {mediciones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("closeProcessButton")}
      </button>
    </form>
  );
}

/** Cambiar el % H objetivo o la intención. Los dos dejan rastro en el servidor. */
export function CambiarObjetivoForm({ lotProcessId, lotId, actual }: { lotProcessId: string; lotId: string; actual: number }) {
  const [estado, accion, pending] = useActionState(cambiarObjetivoAction, inicial);
  const t = useTranslations("Traceability");

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotProcessId" value={lotProcessId} />
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="o-target">{t("processNewTargetLabel")}</label>
        <input
          id="o-target"
          name="targetMoisturePct"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0.1"
          max="100"
          defaultValue={actual}
          required
        />
      </div>
      <div className="nn-field">
        <label htmlFor="o-reason">{t("processChangeReasonLabel")}</label>
        <input id="o-reason" name="razon" type="text" />
      </div>
      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button nn-button-secondary" disabled={pending}>
        {t("processChangeTargetButton")}
      </button>
    </form>
  );
}

export function CambiarIntencionForm({
  lotProcessId,
  lotId,
  actual,
}: {
  lotProcessId: string;
  lotId: string;
  actual: string;
}) {
  const [estado, accion, pending] = useActionState(cambiarIntencionAction, inicial);
  const t = useTranslations("Traceability");

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotProcessId" value={lotProcessId} />
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="n-intent">{t("processNewIntentLabel")}</label>
        <textarea id="n-intent" name="intent" rows={3} defaultValue={actual} required />
        <p className="nn-muted">{t("processIntentChangeHelp")}</p>
      </div>
      <div className="nn-field">
        <label htmlFor="n-reason">{t("processChangeReasonLabel")}</label>
        <input id="n-reason" name="razon" type="text" />
      </div>
      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button nn-button-secondary" disabled={pending}>
        {t("processChangeIntentButton")}
      </button>
    </form>
  );
}

/**
 * Devolver el lote a secado.
 *
 * **El motivo es obligatorio y por eso es un campo, no un botón suelto.**
 * Reabrir un proceso cerrado contradice «cerrado no se toca»; sin motivo sería
 * indistinguible de un descuido, y el servidor lo rechaza igual.
 */
export function DevolverASecadoForm({ lotId }: { lotId: string }) {
  const [estado, accion, pending] = useActionState(devolverASecadoAction, inicial);
  const t = useTranslations("Traceability");

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="s-reason">{t("processBackToDryingReasonLabel")}</label>
        <input id="s-reason" name="motivo" type="text" required placeholder={t("processBackToDryingPlaceholder")} />
      </div>
      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("processBackToDryingButton")}
      </button>
    </form>
  );
}
