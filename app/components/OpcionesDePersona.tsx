import { useTranslations } from "next-intl";

/**
 * Las opciones de un selector de «quién lo hizo», en dos bloques: «De esta finca» y «Equipo Néctar
 * Nómada» (decisión P-G, 2026-09-21). La persona propia va suelta arriba, antes de los bloques,
 * porque es la respuesta más común (ADR-080).
 *
 * Sólo pinta `<option>` y `<optgroup>`: el `<select>`, su `name` y sus opciones fijas —«nadie en
 * particular», «elige…»— siguen en cada formulario, que es quien sabe cuáles lleva.
 *
 * Sin `"use client"` a propósito: `useTranslations` sirve en los dos lados, y así lo pueden usar
 * tanto los formularios de cliente como las páginas de servidor.
 */
export interface OpcionDePersona {
  id: string;
  displayName: string;
  grupo?: "yo" | "finca" | "equipo";
}

export function OpcionesDePersona({ personas, selfPersonId }: { personas: readonly OpcionDePersona[]; selfPersonId?: string | null }) {
  const t = useTranslations("QuienLoHizo");
  const propia = (p: OpcionDePersona) => p.id === selfPersonId || p.grupo === "yo";
  const opcion = (p: OpcionDePersona) => (
    <option key={p.id} value={p.id}>
      {propia(p) ? t("yo", { name: p.displayName }) : p.displayName}
    </option>
  );
  const sueltas = personas.filter((p) => propia(p) || !p.grupo);
  const finca = personas.filter((p) => !propia(p) && p.grupo === "finca");
  const equipo = personas.filter((p) => !propia(p) && p.grupo === "equipo");
  return (
    <>
      {sueltas.map(opcion)}
      {finca.length ? <optgroup label={t("deEstaFinca")}>{finca.map(opcion)}</optgroup> : null}
      {equipo.length ? <optgroup label={t("equipoNectarNomada")}>{equipo.map(opcion)}</optgroup> : null}
    </>
  );
}
