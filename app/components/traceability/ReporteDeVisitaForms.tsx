"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  emitirReporteDeVisitaAction,
  publicarEnlaceDeReporteAction,
  revocarEnlaceDeReporteAction,
  type TraceabilityActionState,
  type EnlaceDeReporteState,
} from "../../actions/traceability";

const inicial: TraceabilityActionState = {};
const inicialEnlace: EnlaceDeReporteState = {};

/**
 * Emitir el informe de una visita cerrada.
 *
 * **La puerta que faltaba.** `emitirReporteDeVisita` existía desde A9.6 y no lo
 * llamaba nadie: cerrar una visita y pulsar «informe» daba 404, porque la
 * pantalla lee lo congelado y no había nada congelado.
 *
 * Sólo se ofrece con la visita cerrada — el servicio lo exige igual, y pintar
 * un botón que va a fallar es la lente de los formularios que ofrecen lo que el
 * servicio niega.
 */
export function EmitirReporteForm({ fieldSessionId }: { fieldSessionId: string }) {
  const [estado, accion, pending] = useActionState(emitirReporteDeVisitaAction, inicial);
  const t = useTranslations("Traceability");

  return (
    <form action={accion} className="nn-form">
      <input type="hidden" name="fieldSessionId" value={fieldSessionId} />
      <p className="nn-muted">{t("reportEmitHelp")}</p>
      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("reportEmitButton")}
      </button>
    </form>
  );
}

/**
 * Publicar el enlace con el que un supervisor abre el informe sin cuenta.
 *
 * **El enlace se enseña una sola vez.** La base guarda el token hasheado, así
 * que el valor en claro sólo existe en la respuesta de esta acción. Si se
 * pierde, se publica otro — no hay forma de recuperarlo, y eso es la propiedad,
 * no una carencia.
 */
export function PublicarEnlaceForm({ fieldSessionId }: { fieldSessionId: string }) {
  const [estado, accion, pending] = useActionState(publicarEnlaceDeReporteAction, inicialEnlace);
  const t = useTranslations("Traceability");

  return (
    <form action={accion} className="nn-form nn-no-print">
      <input type="hidden" name="fieldSessionId" value={fieldSessionId} />
      <div className="nn-field">
        <label htmlFor="dias">{t("reportLinkDaysLabel")}</label>
        <input id="dias" name="diasDeVigencia" type="number" inputMode="numeric" min="1" max="365" step="1" />
        <p className="nn-muted">{t("reportLinkDaysHelp")}</p>
      </div>

      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}

      {estado.enlace ? (
        <div className="nn-field">
          <p>
            <strong>{t("reportLinkReady", { expira: estado.expira ?? "" })}</strong>
          </p>
          {/* Un `readOnly` seleccionable, no un texto suelto: en un teléfono
              copiar de un `<p>` es un pulso largo y una lotería. */}
          <input
            type="text"
            readOnly
            value={estado.enlace}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t("reportLinkReady", { expira: estado.expira ?? "" })}
          />
          <p className="nn-muted">{t("reportLinkOnce")}</p>
        </div>
      ) : null}

      <button type="submit" className="nn-button" disabled={pending}>
        {t("reportLinkButton")}
      </button>
    </form>
  );
}

interface EnlacePublicado {
  id: string;
  publishedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Los enlaces ya entregados, con su botón de cortar.
 *
 * **Sin esto, publicar era un viaje de ida.** El token va a un supervisor por
 * WhatsApp o correo; poder cortarlo es la razón por la que se guarda en la base
 * en vez de firmarse. El servicio lo permitía desde A9.6 y no había pantalla.
 *
 * Un enlace revocado **no se borra de la lista**: se muestra tachado. Que
 * hubo un enlace y se cortó es parte del rastro, no ruido.
 */
export function EnlacesPublicados({
  fieldSessionId,
  enlaces,
}: {
  fieldSessionId: string;
  enlaces: EnlacePublicado[];
}) {
  const [estado, accion, pending] = useActionState(revocarEnlaceDeReporteAction, inicial);
  const t = useTranslations("Traceability");

  if (enlaces.length === 0) return null;

  const dia = (d: Date | null) => (d === null ? null : new Date(d).toISOString().slice(0, 10));

  return (
    <div className="nn-no-print">
      <h3>{t("reportLinkListHeading")}</h3>
      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <ul className="nn-list">
        {enlaces.map((e) => (
          <li key={e.id}>
            <span style={e.revokedAt ? { textDecoration: "line-through" } : undefined}>
              {t("reportLinkPublishedOn", { fecha: dia(e.publishedAt) ?? "" })}
              {e.expiresAt ? ` · ${t("reportLinkExpiresOn", { fecha: dia(e.expiresAt) ?? "" })}` : ""}
              {e.revokedAt ? ` · ${t("reportLinkRevokedOn", { fecha: dia(e.revokedAt) ?? "" })}` : ""}
            </span>{" "}
            {e.revokedAt ? null : (
              <form action={accion} style={{ display: "inline" }}>
                <input type="hidden" name="fieldSessionId" value={fieldSessionId} />
                <input type="hidden" name="publicacionId" value={e.id} />
                <button type="submit" className="nn-button-link" disabled={pending}>
                  {t("reportLinkRevokeButton")}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
