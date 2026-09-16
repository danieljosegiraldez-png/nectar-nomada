import type { LocationType } from "../../generated/prisma/client";

/**
 * Los tipos de lugar que son «sitio de abejas», y por que hay un predicado en vez de diez
 * comparaciones de cadena.
 *
 * ## La decision del dueno (2026-09-16)
 *
 * *"Diria tener meliponiarios y tener apiarios separado, aunque el apicultor tiene acceso a
 * ambas si se configura asi."* O sea: **el sitio declara lo que es**, y el acceso es
 * configuracion — que es como ya funciona, porque los permisos son por sitio y por proyecto.
 *
 * Y resuelve un borde que estaba senalado: un meliponario **vacio** ya no se confunde con un
 * apiario vacio. Con la especie viviendo solo en las colonias, un sitio sin colonias no podia
 * decir de que era; ahora lo dice el sitio.
 *
 * ## Por que un predicado y no diez cadenas
 *
 * Medido antes de tocar nada: `"apiary_site"` aparece **diez veces** en `lib/` y `app/` como
 * afirmacion suelta —la lista, la ficha, el traslado, la consulta a vecinos por dos sitios, la
 * jornada de campo, la ruta de la pantalla—. Anadir un tipo y repasar diez cadenas a mano es
 * como se deja una fuera, y la que se queda fuera **no falla en rojo**: simplemente rechaza un
 * meliponario con un mensaje de «no es apiario». Con el predicado, anadir un tipo se hace en
 * una linea y el guardia comprueba que nadie vuelva a comparar la cadena a mano.
 *
 * ## Lo que este predicado NO decide
 *
 * **Que se pueda mover una colonia de un apiario a un meliponario.** Eso no es una pregunta de
 * familia sino de compatibilidad: una colonia de Apis en una caja de melipona no existe. El
 * traslado exige que origen y destino sean del MISMO tipo, y eso se comprueba aparte.
 */
export const TIPOS_DE_SITIO_DE_ABEJAS = ["apiary_site", "meliponary"] as const satisfies readonly LocationType[];

export type TipoDeSitioDeAbejas = (typeof TIPOS_DE_SITIO_DE_ABEJAS)[number];

/** Si en este lugar viven colmenas, sean de Apis o sin aguijon. */
export function esSitioDeAbejas(tipo: LocationType | string | null | undefined): boolean {
  return typeof tipo === "string" && (TIPOS_DE_SITIO_DE_ABEJAS as readonly string[]).includes(tipo);
}

export class TipoDeSitioInvalido extends Error {}

/**
 * Valida lo que llega del formulario, que manda **cadenas**.
 *
 * Un `as never` dejaria entrar cualquier valor del enum de lugares -- incluido `plot`, que
 * crearia un "apiario" que es una parcela. Es el fallo que ADR-112 documenta.
 */
export function exigeTipoDeSitioDeAbejas(valor: unknown): TipoDeSitioDeAbejas {
  const v = String(valor ?? "").trim();
  if (!(TIPOS_DE_SITIO_DE_ABEJAS as readonly string[]).includes(v)) {
    throw new TipoDeSitioInvalido(`tipo_de_sitio_invalido: ${v || "(vacio)"}`);
  }
  return v as TipoDeSitioDeAbejas;
}
