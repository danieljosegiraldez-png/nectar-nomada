/**
 * La faena de colmena: «¿a qué venís hoy?» — spec 2026-09-17 §A.
 *
 * Es NAVEGACIÓN, no un dato: vive en la URL (`?faena=`) y no se guarda. Decide qué
 * sección de la colmena va abierta; las demás quedan plegadas a un toque, nunca
 * ocultas — el día que se abre la caja y aparece otra cosa, la faena que no se
 * venía a hacer está a un clic.
 *
 * Las cinco y su orden son la decisión abierta §5.2 del spec, tomadas como las
 * propuso: salen de los formularios que ya existen. Cambiarlas es editar esta lista.
 *
 * Pura, sin base: la pantalla de la colmena y el formulario de eventos (cliente)
 * la usan igual.
 */
export const FAENAS = ["revisar", "alimentar", "tratar", "varroa", "cosechar"] as const;
export type Faena = (typeof FAENAS)[number];

/** Lo que llega de la URL. Un valor desconocido es «sin faena», no un error. */
export function faenaDe(raw: string | string[] | undefined | null): Faena | null {
  const valor = Array.isArray(raw) ? raw[0] : raw;
  return (FAENAS as readonly string[]).includes(valor ?? "") ? (valor as Faena) : null;
}

/** Sin faena elegida, todo abierto: la pantalla de siempre. Con faena, sólo la suya. */
export function seccionAbierta(faena: Faena | null, seccion: Faena): boolean {
  return faena === null || faena === seccion;
}
