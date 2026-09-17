"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  emitirReporteDeVisitaAction,
  completarVisitaAction,
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

/**
 * Completar la visita: el paso que la saca de borrador.
 *
 * **Sin esto el informe era inalcanzable.** «Cerrar jornada» pone `endedAt` —
 * cuándo se salió del sitio— y nada ponía `status: "completed"`, que es lo
 * único que `emitirReporteDeVisita` mira. El botón de emitir contestaba «cierra
 * la visita» justo después de cerrarla.
 *
 * Pide lo que **sólo sabe quien cierra**: cuándo toca volver —de ahí sale la
 * alerta del tablero de sitios, no de un calendario que no existe— y cuántas
 * colonias quedaron vivas, que es lo que permite ver «pérdida sin reposición».
 * Las dos son opcionales: una visita que no se puede completar porque falta un
 * dato que nadie tomó es peor que una completada sin él.
 */
export function CompletarVisitaForm({ fieldSessionId }: { fieldSessionId: string }) {
  const [estado, accion, pending] = useActionState(completarVisitaAction, inicial);
  const t = useTranslations("Traceability");

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 520 }}>
      <input type="hidden" name="fieldSessionId" value={fieldSessionId} />
      <p className="nn-muted">{t("visitCompleteHelp")}</p>

      <div className="nn-field">
        <label htmlFor="cv-next">{t("visitNextDueLabel")}</label>
        <input id="cv-next" name="nextVisitDueAt" type="date" />
        <p className="nn-muted">{t("visitNextDueHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="cv-colonies">{t("visitColoniesAliveLabel")}</label>
        <input id="cv-colonies" name="coloniesAliveCount" type="number" inputMode="numeric" min="0" step="1" />
        <p className="nn-muted">{t("visitColoniesAliveHelp")}</p>
      </div>

      {/* Las CAJAS, al lado de las colonias y no en su lugar: una caja puede estar ahí vacía
          (ADR-150). No sustituye a la cuenta de `HivePlacement` — la contradice cuando difieren,
          y esa diferencia es el dato: una caja que se fue sin registrarse, o un recuento malo. */}
      <div className="nn-field">
        <label htmlFor="cv-hives">{t("visitHivesPresentLabel")}</label>
        <input id="cv-hives" name="hivesPresentCount" type="number" inputMode="numeric" min="0" step="1" />
        <p className="nn-muted">{t("visitHivesPresentHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="cv-notes">{t("visitCompleteNotesLabel")}</label>
        <textarea id="cv-notes" name="notes" rows={3} />
      </div>

      {/* **Las tres de casa.** El protocolo las marca `stage: close`, y el §7 dice por qué:
          «que los formularios no pidan en el patio lo que puede esperar a la casa». Éste es
          el formulario de la casa, así que aquí es donde van.

          Los viáticos en blanco son `null` —«no se anotó»— y NO cero: una visita sin viáticos
          anotados no es una visita que costó cero. Y no salen en el informe del cliente salvo
          que el contrato lo pida: esa decisión ya estaba declarada antes de que el campo
          existiera. */}
      <div className="nn-field">
        <label htmlFor="cv-costo">{t("visitTravelCostLabel")}</label>
        <input id="cv-costo" name="travelCostUsd" type="number" inputMode="decimal" min="0" step="0.01" />
      </div>

      <div className="nn-field">
        <label htmlFor="cv-causa">{t("visitProbableCauseLabel")}</label>
        <textarea id="cv-causa" name="probableCause" rows={2} />
      </div>

      <div className="nn-field">
        <label htmlFor="cv-recomendacion">{t("visitRecommendationLabel")}</label>
        <textarea id="cv-recomendacion" name="recommendation" rows={3} />
      </div>

      {/* Va al `reason` del AuditEvent: por qué se completó así, no qué pasó en
          el sitio. Es la columna que distingue lo escrito en el campo de lo
          completado en la casa. */}
      <div className="nn-field">
        <label htmlFor="cv-reason">{t("visitCompleteReasonLabel")}</label>
        <input id="cv-reason" name="reason" type="text" maxLength={300} />
      </div>

      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("visitCompleteButton")}
      </button>
    </form>
  );
}
