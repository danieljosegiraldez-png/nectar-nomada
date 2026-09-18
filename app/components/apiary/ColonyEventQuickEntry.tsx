"use client";

import type { FrascoParaTratar } from "../../../lib/inventario/frascosParaTratar";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { queueDraft } from "../../../lib/apiary/offlineQueue";
import { METODOS_DE_ALIMENTACION } from "../../../lib/apiary/alimentacion";
import { MATERIALES_DE_ALIMENTACION, MATERIAL_QUE_EXIGE_CUAL } from "../../../lib/apiary/vocabularioDeAlimentacion";
import { OBJETIVOS_DE_TRATAMIENTO, VIAS_DE_TRATAMIENTO } from "../../../lib/apiary/vocabularioDeTratamiento";
import { fechaDeDia } from "../../../lib/time/localDateTime";
import { APIARY_DRAFTS_CHANGED_EVENT } from "./OfflineSyncIndicator";
import { Ayuda } from "./Ayuda";

/**
 * §1a/§4: three siblings of the Inspection form, not nested inside it —
 * "Log feeding" (material, quantity — two field-taps + submit), "Log
 * treatment" (product, batch label, dose — three field-taps + submit,
 * one more than feeding specifically because treatmentBatchLabel is
 * required), "Log observation" (one free-text field + submit). Each
 * fixes its own eventType; never operator-selected. Always visible, not
 * behind an expand toggle — a beekeeper who only feeds twelve hives in
 * sequence taps "Log feeding" twelve times without re-expanding anything.
 */
export function ColonyEventQuickEntry({
  colonyId,
  selfPersonId,
  frascos = [],
}: {
  colonyId: string;
  selfPersonId: string | null;
  /** Botiquín, Tarea 7 — los frascos que quien mira puede descontar. Vacío: sin selector. */
  frascos?: readonly FrascoParaTratar[];
}) {
  const t = useTranslations("Apiary");

  /** Del vocabulario (ADR-148). El texto de al lado es el «cual» de `otro`. */
  const [feedingMaterialKind, setFeedingMaterialKind] = useState("");
  const [feedingMaterial, setFeedingMaterial] = useState("");
  const [feedingQuantity, setFeedingQuantity] = useState("");
  const [feedingUnit, setFeedingUnit] = useState("kg");
  /**
   * A9 · Anexo B §3 — «Alcanza hasta», **el campo que faltó en Toabré**. La
   * columna existía desde el 2026-09-07 y los vitales del sitio ya la leían, pero
   * **ninguna pantalla podía escribirla**: medido el 2026-09-13, una alimentación
   * en la copia local y ninguna con este valor.
   *
   * Se exige para guardar —el protocolo dice `"required": true`— y el servicio NO
   * la exige, a propósito: una alimentación de urgencia se registra sin saberlo, y
   * perder el registro es peor que no poder avisar. Cuando falta,
   * `alcanceDelAlimento` la devuelve como `sin_fecha` en vez de contarla entre las
   * tranquilas.
   */
  const [coverageUntil, setCoverageUntil] = useState("");
  const [feedingMethod, setFeedingMethod] = useState("");
  const [feedingSaved, setFeedingSaved] = useState(false);

  const [treatmentProduct, setTreatmentProduct] = useState("");
  const [treatmentBatchLabel, setTreatmentBatchLabel] = useState("");
  const [treatmentDose, setTreatmentDose] = useState("");
  const [treatmentDoseUnit, setTreatmentDoseUnit] = useState("");
  /** Cadena y no número: el campo vacío y el cero son distintos, y `Number("")` es 0. */
  const [treatmentWithdrawalDays, setTreatmentWithdrawalDays] = useState("");
  /**
   * A9 · Anexo B §4 — contra qué. El último campo que ese Anexo marcaba
   * obligatorio y que no existía: sin él, «qué se trató contra varroa esta
   * temporada» no es una consulta.
   */
  const [treatmentTarget, setTreatmentTarget] = useState("");
  const [treatmentRoute, setTreatmentRoute] = useState("");
  const [frascoId, setFrascoId] = useState("");
  const frasco = frascos.find((f) => f.id === frascoId) ?? null;
  // Día del dispositivo: el formulario sólo AVISA; la marca que vale la calcula
  // el servidor con el día del sitio.
  const hoy = new Date().toLocaleDateString("en-CA");
  const frascoVencido = frasco?.vence != null && frasco.vence <= hoy;

  /**
   * Elegir frasco PRECARGA producto, lote, unidad y la carencia del producto —
   * a la vista y editables. El servicio nunca rellena la carencia: si el
   * operario la cambia, manda la suya.
   */
  function elegirFrasco(id: string) {
    setFrascoId(id);
    const f = frascos.find((x) => x.id === id);
    if (!f) return;
    setTreatmentProduct(f.producto);
    setTreatmentBatchLabel(f.batchLabel);
    setTreatmentDoseUnit(f.unidad);
    if (f.carenciaDelProducto != null) setTreatmentWithdrawalDays(String(f.carenciaDelProducto));
  }
  const [treatmentSaved, setTreatmentSaved] = useState(false);

  const [observationNote, setObservationNote] = useState("");
  const [observationSaved, setObservationSaved] = useState(false);

  // A5.5 §2: one shared error surface — same underlying failure mode (the
  // local IndexedDB write itself failed) regardless of which of the three
  // mini-forms triggered it.
  const [saveError, setSaveError] = useState<string | null>(null);

  async function logFeeding() {
    setSaveError(null);
    try {
      await queueDraft("colonyEvent", {
        colonyId,
        eventType: "feeding",
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        feedingMaterial: feedingMaterial.trim() || null,
        feedingQuantity: feedingQuantity.trim() ? Number(feedingQuantity) : null,
        feedingUnit: feedingUnit.trim() || null,
        // Campo de DÍA: se fija a medianoche UTC con el MISMO parser que usa el
        // servidor. Mandarlo como reloj de pared lo movería un día según la zona,
        // que es el fallo que tumbó la creación de colmenas el 2026-09-11.
        coverageUntil: coverageUntil ? fechaDeDia(coverageUntil, "coverageUntil")!.toISOString() : null,
        feedingMethod: feedingMethod || null,
        feedingMaterialKind: feedingMaterialKind || null,
      });
    } catch {
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setFeedingSaved(true);
    setFeedingMaterialKind("");
    setFeedingMaterial("");
    setFeedingQuantity("");
    setCoverageUntil("");
    setFeedingMethod("");
  }

  // Cero es un valor LEGÍTIMO —hay productos sin carencia—, así que la
  // condición mira si el campo está vacío, no si el número es falsy. Un
  // `!Number(x)` habría rechazado el 0 y obligado a mentir poniendo un 1.
  const carenciaPuesta = treatmentWithdrawalDays.trim() !== "" && Number.isInteger(Number(treatmentWithdrawalDays)) && Number(treatmentWithdrawalDays) >= 0;

  async function logTreatment() {
    if (!treatmentBatchLabel.trim() || !carenciaPuesta) return;
    setSaveError(null);
    try {
      await queueDraft("colonyEvent", {
        colonyId,
        eventType: "treatment",
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        treatmentProduct: treatmentProduct.trim() || null,
        treatmentBatchLabel: treatmentBatchLabel.trim(),
        treatmentDose: treatmentDose.trim() ? Number(treatmentDose) : null,
        treatmentDoseUnit: treatmentDoseUnit.trim() || null,
        treatmentTarget: treatmentTarget || null,
        treatmentRoute: treatmentRoute || null,
        treatmentWithdrawalDays: Number(treatmentWithdrawalDays),
        consumableLotId: frascoId || null,
      });
    } catch {
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setTreatmentSaved(true);
    setTreatmentProduct("");
    setTreatmentBatchLabel("");
    setTreatmentDose("");
    setTreatmentDoseUnit("");
    setTreatmentWithdrawalDays("");
    setTreatmentTarget("");
    setTreatmentRoute("");
    setFrascoId("");
  }

  async function logObservation() {
    if (!observationNote.trim()) return;
    setSaveError(null);
    try {
      await queueDraft("colonyEvent", {
        colonyId,
        eventType: "passing_observation",
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        note: observationNote.trim(),
      });
    } catch {
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setObservationSaved(true);
    setObservationNote("");
  }

  return (
    <div>
      {saveError ? (
        <p className="nn-error" role="alert" style={{ marginBottom: "0.5rem" }}>
          {saveError}
        </p>
      ) : null}
      <div className="nn-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="nn-form" style={{ margin: 0 }}>
          <h4>{t("logFeedingHeading")}</h4>
          <div className="nn-field">
            <label htmlFor={`feed-material-kind-${colonyId}`}>{t("feedingMaterialLabel")}</label>
            <select
              id={`feed-material-kind-${colonyId}`}
              value={feedingMaterialKind}
              onChange={(e) => setFeedingMaterialKind(e.target.value)}
            >
              <option value="" />
              {MATERIALES_DE_ALIMENTACION.map((m) => (
                <option key={m} value={m}>
                  {t(`feedingMaterial_${m}`)}
                </option>
              ))}
            </select>
          </div>
          {/* El «cual» sale SOLO con `otro`, y entonces es obligatorio: un «otro» que no dice
              cual no es informacion. Fuera de ese caso el campo sigue disponible como
              precision --«miel de cana, de la finca de al lado»-- sin estorbar. */}
          {feedingMaterialKind === MATERIAL_QUE_EXIGE_CUAL ? (
            <div className="nn-field">
              <label htmlFor={`feed-material-${colonyId}`}>{t("feedingMaterialWhichLabel")}</label>
              <input
                id={`feed-material-${colonyId}`}
                value={feedingMaterial}
                onChange={(e) => setFeedingMaterial(e.target.value)}
                required
              />
            </div>
          ) : null}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div className="nn-field" style={{ flex: 1 }}>
              <label htmlFor={`feed-qty-${colonyId}`}>{t("feedingQuantityLabel")}</label>
              <input id={`feed-qty-${colonyId}`} type="number" inputMode="decimal" value={feedingQuantity} onChange={(e) => setFeedingQuantity(e.target.value)} />
            </div>
            <div className="nn-field" style={{ flex: 1 }}>
              <label htmlFor={`feed-unit-${colonyId}`}>{t("unitLabel")}</label>
              <input id={`feed-unit-${colonyId}`} value={feedingUnit} onChange={(e) => setFeedingUnit(e.target.value)} />
            </div>
          </div>
          {/* «Alcanza hasta»: `type="date"` porque es un día estimado, no un
              instante. Es lo que dispara el aviso ANTES de que las reservas lo
              digan — sin él el sistema sólo puede reaccionar a lo ya observado, que
              es lo que pasó en Toabré entre julio y septiembre. */}
          <div className="nn-field">
            <label htmlFor={`feed-coverage-${colonyId}`}>{t("coverageUntilLabel")}</label>
            <input
              id={`feed-coverage-${colonyId}`}
              type="date"
              value={coverageUntil}
              onChange={(e) => setCoverageUntil(e.target.value)}
              required
            />
            <Ayuda resumen={t("ayudaResumen")}>{t("coverageUntilHelp")}</Ayuda>
          </div>
          <div className="nn-field">
            <label htmlFor={`feed-method-${colonyId}`}>{t("feedingMethodLabel")}</label>
            <select id={`feed-method-${colonyId}`} value={feedingMethod} onChange={(e) => setFeedingMethod(e.target.value)}>
              <option value="" />
              {METODOS_DE_ALIMENTACION.map((m) => (
                <option key={m} value={m}>
                  {t(`feedingMethod_${m}`)}
                </option>
              ))}
            </select>
          </div>
          {/* Deshabilitado sin la fecha, como el tratamiento sin su lote: el
              protocolo la marca obligatoria y aquí exigirla no cuesta un dato
              perdido, porque quien está delante puede ponerla. */}
          <button
            type="button"
            className="nn-button"
            onClick={() => void logFeeding()}
            disabled={coverageUntil === ""}
          >
            {t("logFeedingButton")}
          </button>
          {feedingSaved ? <p className="nn-muted">{t("savedLocally")}</p> : null}
        </div>

        <div className="nn-form" style={{ margin: 0 }}>
          <h4>{t("logTreatmentHeading")}</h4>
          {frascos.length > 0 ? (
            <div className="nn-field">
              <label htmlFor={`treat-frasco-${colonyId}`}>{t("treatmentFrascoLabel")}</label>
              <select id={`treat-frasco-${colonyId}`} value={frascoId} onChange={(e) => elegirFrasco(e.target.value)}>
                <option value="">{t("treatmentFrascoNinguno")}</option>
                {frascos.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.producto} · {f.batchLabel}
                    {f.vence ? ` · ${t("treatmentFrascoVence", { fecha: f.vence })}` : ""}
                  </option>
                ))}
              </select>
              {frascoVencido ? <p className="nn-muted">{t("treatmentFrascoVencido", { fecha: frasco!.vence! })}</p> : null}
            </div>
          ) : null}
          <div className="nn-field">
            <label htmlFor={`treat-product-${colonyId}`}>{t("treatmentProductLabel")}</label>
            <input id={`treat-product-${colonyId}`} value={treatmentProduct} onChange={(e) => setTreatmentProduct(e.target.value)} />
          </div>
          <div className="nn-field">
            <label htmlFor={`treat-batch-${colonyId}`}>{t("treatmentBatchLabelLabel")}</label>
            <input id={`treat-batch-${colonyId}`} value={treatmentBatchLabel} onChange={(e) => setTreatmentBatchLabel(e.target.value)} required />
          </div>
          {/* La carencia, con la misma fuerza que el lote: el Anexo B §4 la marca
              obligatoria porque decide cuándo se puede cosechar. `min={0}`
              porque hay productos sin carencia y cero es una respuesta, no un
              hueco. */}
          <div className="nn-field">
            <label htmlFor={`treat-withdrawal-${colonyId}`}>{t("treatmentWithdrawalDaysLabel")}</label>
            <input
              id={`treat-withdrawal-${colonyId}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={treatmentWithdrawalDays}
              onChange={(e) => setTreatmentWithdrawalDays(e.target.value)}
              required
            />
          </div>
          {/* Contra qué: obligatorio, y por eso deshabilita el botón. Sin
              preseleccionar —«varroa» sería el valor cómodo y nadie lo habría
              declarado— porque de esto depende que la eficacia se pueda agrupar. */}
          <div className="nn-field">
            <label htmlFor={`treat-target-${colonyId}`}>{t("treatmentTargetLabel")}</label>
            <select
              id={`treat-target-${colonyId}`}
              value={treatmentTarget}
              onChange={(e) => setTreatmentTarget(e.target.value)}
              required
            >
              <option value="" disabled />
              {OBJETIVOS_DE_TRATAMIENTO.map((o) => (
                <option key={o} value={o}>
                  {t(`treatmentTarget_${o}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor={`treat-route-${colonyId}`}>{t("treatmentRouteLabel")}</label>
            <select id={`treat-route-${colonyId}`} value={treatmentRoute} onChange={(e) => setTreatmentRoute(e.target.value)}>
              <option value="" />
              {VIAS_DE_TRATAMIENTO.map((v) => (
                <option key={v} value={v}>
                  {t(`treatmentRoute_${v}`)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div className="nn-field" style={{ flex: 1 }}>
              <label htmlFor={`treat-dose-${colonyId}`}>{t("treatmentDoseLabel")}</label>
              <input id={`treat-dose-${colonyId}`} type="number" inputMode="decimal" value={treatmentDose} onChange={(e) => setTreatmentDose(e.target.value)} />
            </div>
            <div className="nn-field" style={{ flex: 1 }}>
              <label htmlFor={`treat-dose-unit-${colonyId}`}>{t("unitLabel")}</label>
              <input id={`treat-dose-unit-${colonyId}`} value={treatmentDoseUnit} onChange={(e) => setTreatmentDoseUnit(e.target.value)} />
            </div>
          </div>
          <button type="button" className="nn-button" onClick={() => void logTreatment()} disabled={!treatmentBatchLabel.trim() || !carenciaPuesta || treatmentTarget === ""}>
            {t("logTreatmentButton")}
          </button>
          {treatmentSaved ? <p className="nn-muted">{t("savedLocally")}</p> : null}
        </div>

        <div className="nn-form" style={{ margin: 0 }}>
          <h4>{t("logObservationHeading")}</h4>
          <div className="nn-field">
            <label htmlFor={`obs-note-${colonyId}`}>{t("noteLabel")}</label>
            <textarea id={`obs-note-${colonyId}`} value={observationNote} onChange={(e) => setObservationNote(e.target.value)} rows={2} />
          </div>
          <button type="button" className="nn-button" onClick={() => void logObservation()} disabled={!observationNote.trim()}>
            {t("logObservationButton")}
          </button>
          {observationSaved ? <p className="nn-muted">{t("savedLocally")}</p> : null}
        </div>
      </div>
    </div>
  );
}
