"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { requestApiaryAssetUploadAction, finalizeApiaryAssetUploadAction } from "../../actions/apiary";
import type { ApiaryAssetParent } from "../../../lib/apiary/media";

interface ObserverOption {
  id: string;
  displayName: string;
}

/**
 * A6. Same two-step round trip as
 * app/components/traceability/PhotoUploadForm.tsx (request a presigned PUT
 * URL, upload directly to R2 from the browser, then finalize), reusing that
 * component's shared i18n keys ("Traceability" namespace) rather than
 * duplicating them — this form differs from PhotoUploadForm only in which
 * parent kind and revalidation path it carries.
 *
 * Online-only, like every other apiary form except Inspection/ColonyEvent
 * quick-entry (§7's A0 scope note) — a photo attachment is not part of the
 * offline draft queue.
 */
export function ApiaryPhotoUploadForm({
  parent,
  revalidationPath,
  observers,
  selfPersonId,
}: {
  parent: ApiaryAssetParent;
  revalidationPath: string;
  observers: ObserverOption[];
  selfPersonId: string | null;
}) {
  const t = useTranslations("Traceability");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [creatorPersonId, setCreatorPersonId] = useState(selfPersonId ?? "");
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const fieldId = `apiary-photo-by-${parent.kind}-${JSON.stringify(parent)}`;

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    const requested = await requestApiaryAssetUploadAction(parent, file.name, file.type || "application/octet-stream");
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

    const finalized = await finalizeApiaryAssetUploadAction(
      parent,
      requested.storageKey,
      file.type || "application/octet-stream",
      file.size,
      file.name,
      creatorPersonId || null,
      revalidationPath,
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
          <label htmlFor={fieldId}>{t("photographedByLabel")}</label>
          <select id={fieldId} value={creatorPersonId} onChange={(e) => setCreatorPersonId(e.target.value)}>
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
