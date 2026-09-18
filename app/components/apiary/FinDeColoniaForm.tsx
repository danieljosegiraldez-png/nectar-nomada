"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { queueDraft } from "../../../lib/apiary/offlineQueue";
import { APIARY_DRAFTS_CHANGED_EVENT } from "./OfflineSyncIndicator";
import { Ayuda } from "./Ayuda";

/**
 * Registrar que una colonia se perdió, **sin señal**.
 *
 * ## Por qué pasa por la cola y ya no por una acción de servidor
 *
 * Una caja vacía se descubre en el campo. Hasta el 2026-09-10 este formulario
 * era el único de apiario que exigía cobertura: los otros dos —inspección y
 * evento de colonia— escriben primero en IndexedDB y sincronizan después.
 * Había que volver con señal para poder anotar **el hecho más caro del
 * apiario**, y entre medias el conteo del sitio seguía mintiendo.
 *
 * Ahora sigue el mismo camino que sus hermanos, y por la razón que ya estaba
 * escrita en `InspectionForm`: ninguno toca la red directamente, así que
 * **guardar no puede fallar** — sólo la sincronización posterior, y ésa se ve
 * en `OfflineSyncIndicator`.
 *
 * ## Lo que se pierde al hacerlo, dicho en voz alta
 *
 * El rechazo deja de ser inmediato. Si no tienes permiso sobre el sitio, o si
 * alguien dio la colonia por perdida antes, eso ya no sale al pulsar: sale al
 * sincronizar, marcado en la cola. Es el mismo trato que aceptan las otras dos
 * pantallas de campo, y el precio de poder anotar sin cobertura.
 *
 * ## Lo que NO cambia
 *
 * El paso deliberado. Es una transición de una vez y sin deshacer: marcar
 * muerta la colonia equivocada con el pulgar en el móvil es más fácil que
 * corregirlo después, así que primero se abre y luego se confirma.
 *
 * Y la fecha se sigue pidiendo: es cuándo se perdió, no cuándo se anota. Aquí
 * **no** hace falta `TimezoneOffsetField` —que sí hacía falta con la acción de
 * servidor— porque el `new Date()` del navegador interpreta el `datetime-local`
 * en la zona del propio aparato, que es la de quien lo teclea.
 */
export interface CausaOfrecida {
  id: string;
  value: string;
  /** De dónde salió esta causa. Se enseña: ver el comentario del bloque. */
  definition: string | null;
}

export function FinDeColoniaForm({ colonyId, causas }: { colonyId: string; causas: readonly CausaOfrecida[] }) {
  const t = useTranslations("Apiary");
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState("");
  const [cuando, setCuando] = useState("");
  const [motivo, setMotivo] = useState("");
  /** id de la causa → clase de procedencia. Ausente = no elegida. */
  const [clasePorCausa, setClasePorCausa] = useState<Record<string, string>>({});
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);

  async function guardar() {
    setErrorLocal(null);
    try {
      await queueDraft("colonyEnd", {
        colonyId,
        status: estado,
        // Instante declarado por quien lo teclea, en su propia zona.
        endedAt: new Date(cuando).toISOString(),
        reason: motivo.trim() || null,
        causas: Object.entries(clasePorCausa)
          .filter(([, clase]) => clase !== "")
          .map(([causeValueId, provenanceClass]) => ({ causeValueId, provenanceClass })),
      });
    } catch {
      // El guardado LOCAL falló —cuota de almacenamiento, modo privado—. Quien
      // está delante tiene que verlo ahora, no descubrir el hueco después.
      setErrorLocal(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setGuardado(t("colonyEndSavedLocally"));
    setAbierto(false);
  }

  if (guardado) return <p className="nn-muted">{guardado}</p>;

  if (!abierto) {
    return (
      <button type="button" className="nn-button-quiet" onClick={() => setAbierto(true)}>
        {t("colonyEndOpenButton")}
      </button>
    );
  }

  // `estado` y `cuando` son lo único obligatorio: sin ellos no hay hecho que
  // anotar. Las causas pueden faltar —hay pérdidas que se anotan sin saber por
  // qué— y para decirlo existe el valor «desconocido», que se elige.
  const puedeGuardar = estado !== "" && cuando !== "";

  return (
    <div className="nn-form" style={{ maxWidth: 420 }}>
      <p className="nn-muted">{t("colonyEndWarning")}</p>

      <div className="nn-field">
        <label htmlFor="colony-end-status">{t("colonyEndStatusLabel")}</label>
        {/* Sin preseleccionar: «murió», «se fugó» y «se combinó» son hechos
            distintos y el valor por defecto sería uno que nadie declaró. */}
        <select id="colony-end-status" value={estado} onChange={(e) => setEstado(e.target.value)} required>
          <option value="" disabled />
          <option value="dead">{t("colonyStatus_dead")}</option>
          <option value="absconded">{t("colonyStatus_absconded")}</option>
        </select>
        {/* Spec 2026-09-18 §3: «se combinó» se registra con Unir, que dice CON CUÁL. Por aquí
            quedaría una colonia combinada sin receptora, y el servicio ya la rechaza. */}
        <p className="nn-muted">{t("colonyEndCombinarEnUnir")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="colony-end-at">{t("colonyEndAtLabel")}</label>
        <input
          id="colony-end-at"
          type="datetime-local"
          value={cuando}
          onChange={(e) => setCuando(e.target.value)}
          required
        />
      </div>

      {/* Las causas. UN control por causa, no dos: un desplegable de cuatro
          opciones dice las dos cosas —si se elige y cuán seguro estás—, que en
          un teléfono en el campo son catorce controles en vez de veintiocho.

          Y se enseña la DEFINICIÓN de cada una, que es lo que evita marcar
          «Saqueo» queriendo decir «se fue». */}
      <fieldset className="nn-field">
        <legend>{t("colonyEndCausesLegend")}</legend>
        <Ayuda resumen={t("ayudaResumen")}>{t("colonyEndCausesHelp")}</Ayuda>
        {causas.map((c) => (
          <div key={c.id} className="nn-field">
            <label htmlFor={`causa-${c.id}`}>{c.value}</label>
            <select
              id={`causa-${c.id}`}
              value={clasePorCausa[c.id] ?? ""}
              onChange={(e) => setClasePorCausa((prev) => ({ ...prev, [c.id]: e.target.value }))}
            >
              <option value="">{t("colonyEndCauseNo")}</option>
              <option value="hypothesis">{t("colonyEndCause_hypothesis")}</option>
              <option value="conclusion">{t("colonyEndCause_conclusion")}</option>
              <option value="direct_observation">{t("colonyEndCause_direct_observation")}</option>
            </select>
            {c.definition ? <p className="nn-muted">{c.definition}</p> : null}
          </div>
        ))}
      </fieldset>

      <div className="nn-field">
        <label htmlFor="colony-end-reason">{t("colonyEndReasonLabel")}</label>
        <input
          id="colony-end-reason"
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={t("colonyEndReasonPlaceholder")}
        />
      </div>

      {errorLocal ? <p className="nn-error">{errorLocal}</p> : null}

      <button type="button" className="nn-button" disabled={!puedeGuardar} onClick={() => void guardar()}>
        {t("colonyEndButton")}
      </button>
      <button type="button" className="nn-button-quiet" onClick={() => setAbierto(false)}>
        {t("cancelButton")}
      </button>
    </div>
  );
}
