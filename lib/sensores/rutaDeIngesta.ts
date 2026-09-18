/**
 * `POST /v1/ingest/notehub` — el punto de entrada de los nodos — artefactos de colmena, Tarea 7.
 *
 * Del paquete Smart Hive (`PLATFORM_API.md` y `SECURITY_OTA.md`):
 * - «un secreto portador dedicado y rotable, guardado en Notehub y en el almacén de secretos de
 *   la API, nunca en el firmware, un QR o el navegador»;
 * - «configurar una transformación de ruta que mapee los metadatos VERIFICADOS del aparato a
 *   `notecard_uid`, `notehub_event_uid`, `received_at` y `body`»;
 * - «rechazar cuerpos de más de 16 KiB»; duplicado exacto = 200, mismo id con otro contenido =
 *   409 en cuarentena, malformado = 400, autenticación = 401/403, fallo transitorio = 503 sin
 *   acuse.
 *
 * **Cerrada por defecto.** Sin secreto configurado (`NOTEHUB_ROUTE_SECRET`) toda petición es 401:
 * una ruta de ingestión abierta sería peor que ninguna. El secreto lo pone Daniel en Vercel; no
 * vive en el repositorio.
 *
 * Vive fuera de `app/` para poder probarse sin arrastrar `next-auth`, como `parsearMutaciones`.
 */
import { timingSafeEqual } from "node:crypto";
import { AparatoNoAutorizado, ingerirObservacion, ObservacionEnConflicto, ObservacionRechazada } from "./ingesta";

export const LIMITE_DE_CUERPO = 16 * 1024;

/** Comparación en tiempo constante: un `===` filtra por cronometraje cuántos caracteres acertaste. */
export function verificarSecretoDeRuta(cabecera: string | null, secreto: string | null | undefined): boolean {
  if (!secreto || !cabecera?.startsWith("Bearer ")) return false;
  const dado = Buffer.from(cabecera.slice("Bearer ".length));
  const esperado = Buffer.from(secreto);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

const respuesta = (status: number, cuerpo: Record<string, unknown>) => Response.json(cuerpo, { status });

export async function atenderIngesta(request: Request, secreto: string | null | undefined): Promise<Response> {
  if (!verificarSecretoDeRuta(request.headers.get("authorization"), secreto)) {
    return respuesta(401, { error: "no_autenticada" });
  }

  // El tamaño se mide sobre lo que llegó, no sobre lo que dice la cabecera.
  const texto = await request.text();
  if (Buffer.byteLength(texto, "utf8") > LIMITE_DE_CUERPO) return respuesta(413, { error: "cuerpo_demasiado_grande" });

  let sobre: unknown;
  try {
    sobre = JSON.parse(texto);
  } catch {
    return respuesta(400, { error: "json_invalido" });
  }
  const { notecard_uid, body } = (sobre ?? {}) as Record<string, unknown>;
  if (typeof notecard_uid !== "string" || !notecard_uid) return respuesta(400, { error: "notecard_uid_requerido" });
  if (body === undefined) return respuesta(400, { error: "body_requerido" });

  try {
    const r = await ingerirObservacion(body, { notecardUid: notecard_uid });
    return r.duplicado ? respuesta(200, { id: r.id, duplicado: true }) : respuesta(202, { id: r.id });
  } catch (error) {
    if (error instanceof ObservacionRechazada) return respuesta(400, { error: error.message });
    if (error instanceof AparatoNoAutorizado) return respuesta(403, { error: error.message });
    if (error instanceof ObservacionEnConflicto) return respuesta(409, { error: "conflicto_en_cuarentena" });
    // Cualquier otra cosa es transitoria para quien manda: 503 y SIN acuse, para que Notehub
    // reintente. Decir 200 aquí perdería el dato.
    return respuesta(503, { error: "no_disponible" });
  }
}
