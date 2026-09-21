"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { requestFincaLogoUploadAction, finalizeFincaLogoUploadAction } from "../../actions/fincas";

/** Lado máximo del logotipo, en píxeles (spec: 128×128 conservando proporción). */
const LADO_MAXIMO = 128;

/**
 * Reduce la imagen en el navegador antes de subirla: canvas → máximo 128×128 conservando
 * proporción → WebP calidad ~0,8; si el navegador no produce WebP, `canvas.toBlob` cae solo a
 * PNG (el estándar exige soportar al menos ese formato), y el `blob.type` resultante ya lo dice —
 * no hace falta un segundo intento explícito.
 */
async function reducirParaLogotipo(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, LADO_MAXIMO / bitmap.width, LADO_MAXIMO / bitmap.height);
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_2d_no_disponible");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
  if (!blob) throw new Error("no_se_pudo_generar_la_imagen");
  return blob;
}

/**
 * Cambiar el logotipo de una finca (spec fincas y parcelas, formulario completo). Mismo viaje de
 * dos pasos que `LandPhotoUploadForm`: el navegador sube directo a R2, y sólo entonces se
 * finaliza el `Asset`. Aquí además se reduce la imagen antes del primer paso.
 */
export function CambiarLogotipoForm({ siteId, volverA }: { siteId: string; volverA: string }) {
  const t = useTranslations("Fincas");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setStatus("working");
    setError(null);
    try {
      const reducida = await reducirParaLogotipo(file);
      const contentType = reducida.type || "image/png";

      const requested = await requestFincaLogoUploadAction(siteId, contentType);
      if ("error" in requested) {
        setStatus("error");
        setError(requested.error);
        return;
      }

      const putResponse = await fetch(requested.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: reducida,
      });
      if (!putResponse.ok) {
        setStatus("error");
        setError(t("error_generico"));
        return;
      }

      const finalized = await finalizeFincaLogoUploadAction(
        siteId,
        requested.storageKey,
        contentType,
        reducida.size,
        file.name,
      );
      if ("error" in finalized) {
        setStatus("error");
        setError(finalized.error);
        return;
      }

      if (inputRef.current) inputRef.current.value = "";
      setStatus("idle");
      router.push(volverA);
      router.refresh();
    } catch {
      setStatus("error");
      setError(t("error_generico"));
    }
  }

  return (
    <div className="nn-form" style={{ maxWidth: 320 }}>
      <div className="nn-field">
        <label htmlFor="logotipo-archivo">{t("logotipoArchivo")}</label>
        <input ref={inputRef} id="logotipo-archivo" type="file" accept="image/*" />
      </div>
      {error ? (
        <p className="nn-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="nn-button" disabled={status === "working"} onClick={handleGuardar}>
        {status === "working" ? t("logotipoGuardando") : t("logotipoGuardarBoton")}
      </button>
    </div>
  );
}
