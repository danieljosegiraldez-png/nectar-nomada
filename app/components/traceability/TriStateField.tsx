"use client";

import { useTranslations } from "next-intl";

/**
 * Un sí/no que admite «sin registrar», como un desplegable de tres opciones.
 *
 * **Por qué no es una casilla.** Una casilla tiene dos estados y el dominio
 * tiene tres. El intento anterior fue una casilla más un `<input type="hidden"
 * name="XPresent">` que declaraba «el campo estuvo en el formulario», pero el
 * oculto se enviaba siempre: dejar la casilla intacta guardaba `false` —«no»—
 * cuando lo cierto era «nadie lo miró». Y como `camposDeProtocoloQueFaltan`
 * cuenta `false` como registrado, la muestra se presentaba además como
 * comparable. Ausencia convertida en afirmación (ADR-080).
 *
 * La clave viaja siempre en el `FormData`, así que `soloLoQueVino` sigue
 * pudiendo distinguir «no vino» de «vino vacío» en las correcciones.
 */
export function TriStateField({
  id,
  name,
  label,
  help,
  value,
}: {
  id: string;
  name: string;
  label: string;
  help?: string;
  /** El valor actual al corregir. `undefined` en creación. */
  value?: boolean | null;
}) {
  const t = useTranslations("Traceability");
  return (
    <div className="nn-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={name}
        defaultValue={value === true ? "yes" : value === false ? "no" : ""}
      >
        <option value="">{t("notRecorded")}</option>
        <option value="yes">{t("triStateYes")}</option>
        <option value="no">{t("triStateNo")}</option>
      </select>
      {help ? <p className="nn-muted">{help}</p> : null}
    </div>
  );
}
