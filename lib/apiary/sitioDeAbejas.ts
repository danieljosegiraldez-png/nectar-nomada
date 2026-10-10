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

/**
 * Si las cajas de este tipo de sitio se manejan **en cuadros**.
 *
 * **El defecto que cierra.** `InspectionForm` pregunta «cuadros cubiertos de abeja» a TODA
 * inspeccion, sin mirar donde esta la colonia. Los meliponinos no se manejan en cuadros, asi que
 * a un meliponario se le hace una pregunta que no tiene respuesta — y un campo vacio se lee
 * despues como «no se conto», no como «aqui no aplica».
 *
 * **La especie no esta en `Colony` ni en `Hive`** —medido el 2026-10-08— y no es un olvido: vive
 * en el TIPO DE SITIO, y el comentario de `LocationType.meliponary` en el esquema explica por
 * que, citando el manual de ANSA (Gennari, INTA): *las cajas, sus modulos y sus medidas cambian
 * por especie*, y las especies con tendencia al pillaje «deben ser manejadas en meliponarios
 * separados». Con la especie en las colonias, un meliponario vacio no podia decir de que era.
 *
 * **Es un `Record` total y no un `if`, a proposito.** Anadir un tipo de sitio de abejas deja de
 * compilar hasta que alguien decida si se maneja en cuadros. Un tipo que no compila es mejor
 * guardia que un test que hay que acordarse de mirar.
 *
 * **Lo que esto NO hace:** decir que se pregunta en su lugar. Eso es oficio del dueno y no se
 * inventa aqui; de momento la pregunta simplemente no se hace.
 */
export const SE_MANEJA_EN_CUADROS: Record<TipoDeSitioDeAbejas, boolean> = {
  apiary_site: true,
  meliponary: false,
};

export function seManejaEnCuadros(tipo: LocationType | string | null | undefined): boolean {
  const v = String(tipo ?? "");
  return (TIPOS_DE_SITIO_DE_ABEJAS as readonly string[]).includes(v)
    ? SE_MANEJA_EN_CUADROS[v as TipoDeSitioDeAbejas]
    : true;
}
