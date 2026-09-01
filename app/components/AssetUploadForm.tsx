"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { requestUploadAction, finalizeUploadAction } from "../actions/partner";

/**
 * Two server-action round trips around one client-side PUT, not a single
 * server action — the file bytes go straight from the browser to R2
 * (lib/integrations/storage), never through the Next.js server, per
 * lib/partner/workspace.ts's requestAssetUpload doc comment. useActionState
 * doesn't fit this shape (it's not a single form submission), hence plain
 * client-side state.
 */
export function AssetUploadForm({ projectId }: { projectId: string }) {
  const t = useTranslations("Partner");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    const requested = await requestUploadAction(projectId, file.name, file.type || "application/octet-stream");
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

    const finalized = await finalizeUploadAction(
      projectId,
      requested.storageKey,
      file.type || "application/octet-stream",
      file.size,
      file.name,
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
    <div className="nn-form" style={{ maxWidth: 320 }}>
      <div className="nn-field">
        <label htmlFor="asset-upload">{t("uploadLabel")}</label>
        <input ref={inputRef} id="asset-upload" type="file" accept="image/*,video/*,application/pdf" />
      </div>
      {error ? <p className="nn-error" role="alert">{error}</p> : null}
      <button type="button" className="nn-button" disabled={status === "uploading"} onClick={handleUpload}>
        {status === "uploading" ? t("uploadingButton") : t("uploadButton")}
      </button>
    </div>
  );
}
