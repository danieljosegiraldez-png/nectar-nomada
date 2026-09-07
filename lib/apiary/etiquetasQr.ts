import qr from "qrcode-generator";

/**
 * A9.7 (D8) — el código que se pega en cada caja.
 *
 * **Lo más barato del alcance y lo que más toques ahorra.** La ruta ya existe
 * (`/apiaries/[id]/hives/[hiveId]`), el service worker ya precachea `/apiaries`
 * —así que abre sin señal, que es cuando se usa— y no hace falta esquema. El
 * GPS no sirve para esto: distingue el sitio, no dos cajas a tres metros.
 *
 * **El código lleva el UUID, NO el identificador de la caja.** `Hive.identifier`
 * es único **dentro de su apiario**, no globalmente: «N-01» existe en Toabré y
 * puede existir en Los Asientos. No es un detalle de implementación — decide
 * qué se imprime en cien calcomanías que después no se cambian.
 *
 * **Y lleva la ruta entera, no sólo el id.** Un QR con un identificador desnudo
 * obliga a una aplicación que sepa interpretarlo; una URL la abre la cámara del
 * teléfono sin nada instalado, que es exactamente lo que hace que esto sirva a
 * alguien que llega a ayudar un sábado.
 */
export function rutaDeColmena(apiaryId: string, hiveId: string): string {
  return `/apiaries/${apiaryId}/hives/${hiveId}`;
}

export function urlDeColmena(base: string, apiaryId: string, hiveId: string): string {
  // `new URL` normaliza la barra final del origen: pegar cadenas daría
  // `https://x//apiaries/...`, que funciona pero se ve mal impreso debajo del
  // código, donde alguien lo va a teclear a mano cuando la cámara falle.
  return new URL(rutaDeColmena(apiaryId, hiveId), base).toString();
}

/**
 * El QR como SVG, para incrustarlo en la hoja sin pedir nada a la red.
 *
 * Corrección nivel M: un QR impreso se lee arrugado, con sombra y con guantes.
 * Los niveles bajos ahorran módulos y se rinden antes; M recupera hasta un 15 %
 * del código dañado y es el que usan las etiquetas industriales.
 */
export function svgDeQr(texto: string, modulo = 4): string {
  // `0` = versión automática: el codificador elige el tamaño mínimo que cabe.
  const codigo = qr(0, "M");
  codigo.addData(texto);
  codigo.make();
  // `createSvgTag` devuelve un `<svg>` autónomo, sin `<img>` ni red.
  return codigo.createSvgTag({ cellSize: modulo, margin: modulo });
}
