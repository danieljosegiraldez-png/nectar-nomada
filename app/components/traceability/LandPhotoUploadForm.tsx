"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  requestLandAssetUploadAction,
  finalizeLandAssetUploadAction,
} from "../../actions/traceability";
import type { LandAssetParent } from "../../../lib/traceability/landMedia";

interface ObserverOption {
  id: string;
  displayName: string;
}

/**
 * Subir una fotografía de la tierra: del bloque, del retorte, de un perfil.
 *
 * Gemelo de `PhotoUploadForm` y **no** una generalización suya: aquél lleva un
 * `lotId` en cada llamada y se autoriza con `lot:manage`. Compartir el
 * componente habría obligado a pasarle acciones de servidor como props —una
 * frontera que Next no cruza bien— o a un `if` sobre qué ámbito es, dentro de
 * un componente que no debería saberlo. Lo que se comparte es la forma del
 * viaje de dos pasos, y esa está documentada en los dos sitios.
 *
 * El navegador sube el archivo **directo a R2**: los bytes no pasan por el
 * servidor de Next. La fila `Asset` se crea sólo cuando el PUT ha respondido
 * bien, así que una subida abandonada no deja una fila apuntando a nada.
 */
export function LandPhotoUploadForm({
  locationId,
  parent,
  observers,
  selfPersonId,
}: {
  locationId: string;
  parent: LandAssetParent;
  observers: ObserverOption[];
  selfPersonId: string | null;
}) {
  const t = useTranslations("Traceability");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // **El valor inicial se normaliza contra la lista, no se supone.**
  // `getObserverCandidates` sólo devuelve personas activas, pero incluye la
  // propia aunque no lo esté. Con `useState(selfPersonId ?? "")` el estado
  // podía quedarse en un id que no era ninguna opción: el navegador enseñaba
  // la primera de la lista y al subir se enviaba la que React guardaba. La
  // atribución de una fotografía no puede depender de eso. Lo encontró la
  // quinta revisión independiente.
  const propioEsElegible = observers.some((p) => p.id === selfPersonId);
  const [creatorPersonId, setCreatorPersonId] = useState(
    propioEsElegible ? (selfPersonId as string) : "",
  );
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const idDelCampo = `land-photo-${locationId}-${JSON.stringify(parent)}`;

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);
    const contentType = file.type || "application/octet-stream";

    const requested = await requestLandAssetUploadAction(locationId, file.name, contentType);
    if ("error" in requested) {
      setStatus("error");
      setError(requested.error);
      return;
    }

    const putResponse = await fetch(requested.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });

    if (!putResponse.ok) {
      setStatus("error");
      setError(t("error_upload_failed"));
      return;
    }

    const finalized = await finalizeLandAssetUploadAction(
      locationId,
      requested.storageKey,
      contentType,
      file.size,
      file.name,
      parent,
      creatorPersonId || null,
    );

    if ("error" in finalized) {
      setStatus("error");
      setError(finalized.error);
      return;
    }

    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="nn-form" style={{ maxWidth: 320, marginTop: "0.5rem" }}>
      <div className="nn-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
        <input ref={inputRef} type="file" accept="image/*" aria-label={t("photoUploadLabel")} />
      </div>
      {observers.length > 0 ? (
        <div className="nn-field">
          <label htmlFor={idDelCampo}>{t("photographedByLabel")}</label>
          <select id={idDelCampo} value={creatorPersonId} onChange={(e) => setCreatorPersonId(e.target.value)}>
            {/* Sin esta opción, un valor que no coincide con ninguna no tiene
                representación y el desplegable muestra otra cosa. */}
            <option value="">{t("notRecorded")}</option>
            {observers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === selfPersonId ? t("observerSelfOption", { name: person.displayName }) : person.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? <p className="nn-error" role="alert">{error}</p> : null}
      <button type="button" className="nn-button" disabled={status === "uploading"} onClick={handleUpload}>
        {status === "uploading" ? t("uploadingButton") : t("addPhotoButton")}
      </button>
    </div>
  );
}
