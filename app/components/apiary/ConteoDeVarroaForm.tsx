"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { queueDraft } from "../../../lib/apiary/offlineQueue";
import { METODOS_DE_VARROA, infestacionPorCiento } from "../../../lib/apiary/infestacion";
import { APIARY_DRAFTS_CHANGED_EVENT } from "./OfflineSyncIndicator";
import { Ayuda } from "./Ayuda";

/**
 * Contar varroa, **sin señal**, con la caja abierta.
 *
 * Mismo camino que inspección, evento de colonia y fin de colonia: escribe en
 * IndexedDB y sincroniza después, así que **guardar no puede fallar**. El rechazo
 * —no tener permiso, un tratamiento que no es de esta colonia— sale al
 * sincronizar, marcado en la cola, y eso se ve en `OfflineSyncIndicator`.
 *
 * ## El porcentaje se enseña y NO se manda
 *
 * Se calcula aquí mientras se teclea porque el umbral de tratamiento se lee de
 * él: quien cuenta necesita ver «3 %» antes de decidir. Pero viaja **sólo** lo
 * contado —abejas y ácaros—, nunca el porcentaje: es derivado, y mandarlo crearía
 * un segundo número que puede discrepar del primero.
 *
 * Por eso `infestacionPorCiento` vive en `lib/apiary/infestacion.ts` y no en el
 * servicio: importar el servicio traería `prisma` al paquete del navegador.
 *
 * ## El tratamiento que se evalúa es opcional a propósito
 *
 * Contar **para decidir** si hay que tratar es el caso normal. Ligarlo a un
 * tratamiento anterior es el otro caso —«¿sirvió?»—, y es el que el A9 nombra:
 * *«una relación entre dos visitas, no un campo»*.
 */
export interface TratamientoOfrecido {
  id: string;
  occurredAt: string;
  product: string | null;
}

export function ConteoDeVarroaForm({
  colonyId,
  selfPersonId,
  tratamientos,
}: {
  colonyId: string;
  selfPersonId: string | null;
  tratamientos: readonly TratamientoOfrecido[];
}) {
  const t = useTranslations("Apiary");
  const [abierto, setAbierto] = useState(false);
  const [metodo, setMetodo] = useState("");
  const [abejas, setAbejas] = useState("");
  const [acaros, setAcaros] = useState("");
  const [cuando, setCuando] = useState("");
  const [evalua, setEvalua] = useState("");
  const [notas, setNotas] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);

  const nAbejas = Number(abejas);
  const nAcaros = Number(acaros);
  const numerosListos =
    Number.isInteger(nAbejas) && nAbejas > 0 && Number.isInteger(nAcaros) && nAcaros >= 0 && nAcaros <= nAbejas;

  // El porcentaje, en vivo. Sólo cuando los dos números son usables: con la
  // muestra vacía `infestacionPorCiento` lanza a propósito —«no se sabe» no es
  // «cero»— y aquí eso se traduce en no enseñar nada todavía.
  const infestacion = numerosListos ? infestacionPorCiento(nAbejas, nAcaros) : null;

  async function guardar() {
    setErrorLocal(null);
    try {
      await queueDraft("varroaCount", {
        colonyId,
        method: metodo,
        sampleBees: nAbejas,
        mitesCounted: nAcaros,
        // Instante declarado por quien lo teclea, en su propia zona: el
        // `new Date()` del navegador interpreta el `datetime-local` con el
        // desfase del aparato, que es el de quien lo está escribiendo.
        occurredAt: new Date(cuando).toISOString(),
        evaluatesColonyEventId: evalua || null,
        operatorPersonId: selfPersonId,
        notes: notas.trim() || null,
      });
    } catch {
      // El guardado LOCAL falló —cuota, modo privado—. Quien está delante tiene
      // que verlo ahora, no descubrir el hueco después.
      setErrorLocal(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setGuardado(t("varroaSavedLocally"));
    setAbierto(false);
  }

  if (guardado) return <p className="nn-muted">{guardado}</p>;

  if (!abierto) {
    return (
      <button type="button" className="nn-button-quiet" onClick={() => setAbierto(true)}>
        {t("varroaOpenButton")}
      </button>
    );
  }

  const puedeGuardar = metodo !== "" && cuando !== "" && numerosListos;

  return (
    <div className="nn-form" style={{ maxWidth: 420 }}>
      <div className="nn-field">
        <label htmlFor="varroa-method">{t("varroaMethodLabel")}</label>
        {/* Sin preseleccionar: el método cambia lo que el número significa, y un
            valor por defecto sería uno que nadie declaró. */}
        <select id="varroa-method" value={metodo} onChange={(e) => setMetodo(e.target.value)} required>
          <option value="" disabled />
          {METODOS_DE_VARROA.map((m) => (
            <option key={m} value={m}>
              {t(`varroaMethod_${m}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="varroa-sample">{t("varroaSampleBeesLabel")}</label>
        {/* `inputMode="numeric"` además de `type="number"`: en el teléfono abre el
            teclado de cifras, que es donde esto se teclea. */}
        <input
          id="varroa-sample"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={abejas}
          onChange={(e) => setAbejas(e.target.value)}
          required
        />
      </div>

      <div className="nn-field">
        <label htmlFor="varroa-mites">{t("varroaMitesLabel")}</label>
        <input
          id="varroa-mites"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={acaros}
          onChange={(e) => setAcaros(e.target.value)}
          required
        />
      </div>

      {/* El derivado, en vivo y rotulado como derivado. */}
      {infestacion !== null ? (
        <p className="nn-muted">{t("varroaInfestation", { valor: infestacion.toFixed(1) })}</p>
      ) : null}

      <div className="nn-field">
        <label htmlFor="varroa-at">{t("varroaAtLabel")}</label>
        <input id="varroa-at" type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} required />
      </div>

      {tratamientos.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="varroa-evaluates">{t("varroaEvaluatesLabel")}</label>
          <select id="varroa-evaluates" value={evalua} onChange={(e) => setEvalua(e.target.value)}>
            {/* «Ninguno» primero y por defecto: contar para decidir es el caso
                normal, y preseleccionar un tratamiento atribuiría una eficacia
                que nadie afirmó. */}
            <option value="">{t("varroaEvaluatesNone")}</option>
            {tratamientos.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.occurredAt}
                {tr.product ? ` — ${tr.product}` : ""}
              </option>
            ))}
          </select>
          <Ayuda resumen={t("ayudaResumen")}>{t("varroaEvaluatesHelp")}</Ayuda>
        </div>
      ) : null}

      <div className="nn-field">
        <label htmlFor="varroa-notes">{t("varroaNotesLabel")}</label>
        <input id="varroa-notes" type="text" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      {errorLocal ? <p className="nn-error">{errorLocal}</p> : null}

      <button type="button" className="nn-button" disabled={!puedeGuardar} onClick={() => void guardar()}>
        {t("varroaSaveButton")}
      </button>
      <button type="button" className="nn-button-quiet" onClick={() => setAbierto(false)}>
        {t("cancelButton")}
      </button>
    </div>
  );
}
