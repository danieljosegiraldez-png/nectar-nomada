"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { requestLotAssetUploadAction, finalizeLotAssetUploadAction } from "../../actions/traceability";
import type { LotAssetParent } from "../../../lib/traceability/media";

interface ObserverOption {
  id: string;
  displayName: string;
}

/**
 * T12.5 §6. Same two-step round trip as app/components/AssetUploadForm.tsx
 * (request a presigned PUT URL, upload directly to R2 from the browser,
 * then finalize) generalized over which of the six attachment points this
 * instance is wired to. One shared component, six call sites.
 *
 * §6's field constraint: photo attachment must never block saving the
 * underlying record. This form is never rendered until its parent record
 * already exists (every call site passes an already-created lotId plus,
 * where relevant, an already-created harvestEventId/measurementId/etc.) —
 * there is no shared "create record + attach photo" form, so a record with
 * no photo is never an incomplete submission, only a photo-less one.
 */
export function PhotoUploadForm({
  lotId,
  parent,
  observers,
  selfPersonId,
}: {
  lotId: string;
  parent: LotAssetParent;
  observers: ObserverOption[];
  selfPersonId: string | null;
}) {
  const t = useTranslations("Traceability");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [creatorPersonId, setCreatorPersonId] = useState(selfPersonId ?? "");
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    const requested = await requestLotAssetUploadAction(lotId, file.name, file.type || "application/octet-stream");
    if ("error" in requested) {
      setStatus("error");
      setError(requested.error);
      return;
    }

    const putResponse = await fetch(requested.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });

    if (!putResponse.ok) {
      setStatus("error");
      setError(t("error_upload_failed"));
      return;
    }

    const finalized = await finalizeLotAssetUploadAction(
      lotId,
      requested.storageKey,
      file.type || "application/octet-stream",
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
          <label htmlFor={`photo-by-${lotId}-${JSON.stringify(parent)}`}>{t("photographedByLabel")}</label>
          <select
            id={`photo-by-${lotId}-${JSON.stringify(parent)}`}
            value={creatorPersonId}
            onChange={(e) => setCreatorPersonId(e.target.value)}
          >
            {observers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === selfPersonId ? t("observerSelfOption", { name: person.displayName }) : person.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? <p className="nn-error">{error}</p> : null}
      <button type="button" className="nn-button" disabled={status === "uploading"} onClick={handleUpload}>
        {status === "uploading" ? t("uploadingButton") : t("addPhotoButton")}
      </button>
    </div>
  );
}
