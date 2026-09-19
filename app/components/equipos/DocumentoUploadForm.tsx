"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { confirmarSubidaDeDocumentoAction, pedirSubidaDeDocumentoAction } from "../../actions/equipos";
import type { DestinoDeDocumento } from "../../../lib/equipos/documentos";

/**
 * Adjuntar un manual, ficha técnica o certificado a un modelo o a un equipo
 * (spec de catálogos §3.5). Misma forma de dos pasos que
 * app/components/traceability/PhotoUploadForm.tsx: pedir una URL firmada,
 * subir directo a R2 desde el navegador, y confirmar — el `Asset` no se crea
 * hasta que la subida se confirma.
 *
 * No está renderizado por ninguna pantalla todavía; lo hace la Tarea 9.
 */
export function DocumentoUploadForm({ destino }: { destino: DestinoDeDocumento }) {
  const t = useTranslations("Equipos");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [procedencia, setProcedencia] = useState<"manufacturer_specification" | "original_record">(
    "manufacturer_specification",
  );
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    const requested = await pedirSubidaDeDocumentoAction(destino, file.name, file.type || "application/octet-stream");
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
      setError(t("documentoError", { detalle: "upload_failed" }));
      return;
    }

    const confirmado = await confirmarSubidaDeDocumentoAction(
      destino,
      requested.storageKey,
      file.type || "application/octet-stream",
      file.size,
      file.name,
      procedencia,
    );

    if ("error" in confirmado) {
      setStatus("error");
      setError(confirmado.error);
      return;
    }

    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  const idProcedencia = `documento-procedencia-${JSON.stringify(destino)}`;

  return (
    <div className="nn-form" style={{ maxWidth: 320, marginTop: "0.5rem" }}>
      <div className="nn-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
        <input ref={inputRef} type="file" accept=".pdf,image/*" aria-label={t("documentoSubir")} />
      </div>
      <div className="nn-field">
        <label htmlFor={idProcedencia}>{t("documentoProcedencia")}</label>
        <select
          id={idProcedencia}
          value={procedencia}
          onChange={(e) => setProcedencia(e.target.value as typeof procedencia)}
        >
          <option value="manufacturer_specification">{t("procedencia_manufacturer_specification")}</option>
          <option value="original_record">{t("procedencia_original_record")}</option>
        </select>
      </div>
      {error ? (
        <p className="nn-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="nn-button" disabled={status === "uploading"} onClick={handleUpload}>
        {status === "uploading" ? t("documentoSubiendo") : t("documentoSubir")}
      </button>
    </div>
  );
}
