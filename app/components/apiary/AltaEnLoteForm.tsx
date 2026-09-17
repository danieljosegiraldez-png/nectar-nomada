"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { altaDeColmenasEnLoteFormAction } from "../../actions/apiary";
import { identificadoresDelLote, MAXIMO_POR_LOTE, AltaEnLoteInvalida } from "../../../lib/apiary/identificadoresDeLote";
import { BotonDeEnvio } from "../BotonDeEnvio";
import type { OrigenDeColonia } from "./NewColonyForm";

const ORIGIN_TYPES = ["purchased", "captured", "split", "other"] as const;

/**
 * Dar de alta varias colmenas de una vez — ADR-149.
 *
 * **En línea y sin cola de sincronización**, igual que `NewHiveForm`: dar de alta el inventario
 * de un sitio se hace una vez y no con el guante puesto.
 *
 * **La vista previa no es un adorno: es la respuesta a una pregunta de diseño.** El relleno de
 * ceros no se puede acertar por el dueño —él ya tiene colmenas con su propio esquema, y algunas
 * llevan tres cifras— así que en vez de adivinarlo, se le enseña **exactamente** qué
 * identificadores van a salir antes de enviar. Si no son los que quiere, cambia el prefijo o el
 * número y lo ve al momento.
 *
 * Importa `identificadoresDelLote` del módulo PURO `identificadoresDeLote.ts`, no del servicio:
 * éste es `"use client"` y `altaEnLote.ts` trae `prisma` detrás.
 */
export function AltaEnLoteForm({
  locationId,
  projects,
  origenes,
}: {
  locationId: string;
  projects: readonly { id: string; name: string }[];
  /** Del catálogo `origen_de_colonia`, igual que `NewColonyForm`. */
  origenes: readonly OrigenDeColonia[];
}) {
  const t = useTranslations("Apiary");
  const [prefijo, setPrefijo] = useState("");
  const [desde, setDesde] = useState("1");
  const [cuantas, setCuantas] = useState("5");
  const [conColonia, setConColonia] = useState(false);

  // La vista previa se calcula con la MISMA función que valida en el servidor, así que lo que se
  // enseña no puede divergir de lo que se crea. Si la entrada todavía no es válida, no se
  // inventa una previa: se deja vacía.
  let previa: string[] = [];
  let errorPrevia: string | null = null;
  try {
    previa = identificadoresDelLote(prefijo, Number(desde), Number(cuantas));
  } catch (e) {
    errorPrevia = e instanceof AltaEnLoteInvalida ? e.message : null;
  }

  return (
    <form action={altaDeColmenasEnLoteFormAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="locationId" value={locationId} />

      <div className="nn-field">
        <label htmlFor="lote-prefijo">{t("lotePrefijoLabel")}</label>
        <input
          id="lote-prefijo"
          name="prefijo"
          type="text"
          value={prefijo}
          onChange={(e) => setPrefijo(e.target.value)}
          placeholder="LN-"
          required
        />
        {/* El separador va DENTRO del prefijo a propósito: adivinarle un guion es cómo se
            parte una numeración en dos familias que no ordenan juntas. */}
        <p className="nn-muted">{t("lotePrefijoAyuda")}</p>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="nn-field" style={{ flex: 1 }}>
          <label htmlFor="lote-desde">{t("loteDesdeLabel")}</label>
          <input
            id="lote-desde"
            name="desde"
            type="number"
            min="1"
            inputMode="numeric"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            required
          />
        </div>
        <div className="nn-field" style={{ flex: 1 }}>
          <label htmlFor="lote-cuantas">{t("loteCuantasLabel")}</label>
          <input
            id="lote-cuantas"
            name="cuantas"
            type="number"
            min="1"
            max={MAXIMO_POR_LOTE}
            inputMode="numeric"
            value={cuantas}
            onChange={(e) => setCuantas(e.target.value)}
            required
          />
        </div>
      </div>

      {previa.length > 0 ? (
        <p className="nn-muted" data-testid="lote-previa">
          {t("lotePreviaLabel")} <strong>{previa.join(", ")}</strong>
        </p>
      ) : (
        <p className="nn-muted">{errorPrevia ? t(`loteError_${errorPrevia.split(":")[0]}`) : ""}</p>
      )}

      {projects.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="lote-proyecto">{t("projectLabel")}</label>
          <select id="lote-proyecto" name="projectId" defaultValue="">
            <option value="" />
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="nn-field">
        <label htmlFor="lote-instalada">{t("installedAtLabel")}</label>
        <input id="lote-instalada" name="installedAt" type="date" />
      </div>

      {/* La colonia, opcional y EXPLÍCITA. `originType` no tiene valor por omisión en el
          servicio porque su propio comentario lo llama «a capture-or-lose-it fact»: crear N
          colonias de oficio obligaría a inventarles un origen. Marcándolo, el dueño AFIRMA que
          las N vienen del mismo sitio — que es cierto cuando llegan juntas, y él lo sabe. */}
      <div className="nn-field">
        <label>
          <input
            type="checkbox"
            name="conColonia"
            value="si"
            checked={conColonia}
            onChange={(e) => setConColonia(e.target.checked)}
          />{" "}
          {t("loteConColoniaLabel")}
        </label>
        <p className="nn-muted">{t("loteConColoniaAyuda")}</p>
      </div>

      {conColonia ? (
        <>
          <div className="nn-field">
            <label htmlFor="lote-origen-tipo">{t("originTypeLabel")}</label>
            <select id="lote-origen-tipo" name="originType" defaultValue="purchased" required>
              {ORIGIN_TYPES.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {t(`originType_${tipo}`)}
                </option>
              ))}
            </select>
          </div>
          {origenes.length > 0 ? (
            <div className="nn-field">
              <label htmlFor="lote-origen-fuente">{t("originSourceLabel")}</label>
              <select id="lote-origen-fuente" name="originSourceValueId" defaultValue="">
                <option value="" />
                {origenes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.value}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="nn-field">
            <label htmlFor="lote-origen-nota">{t("originNoteLabel")}</label>
            <input id="lote-origen-nota" name="originNote" type="text" placeholder={t("originNotePlaceholder")} />
          </div>
        </>
      ) : null}

      <BotonDeEnvio>{t("loteAltaSubmit")}</BotonDeEnvio>
    </form>
  );
}
