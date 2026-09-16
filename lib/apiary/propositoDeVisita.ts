import type { VisitPurpose } from "../../generated/prisma/client";

/**
 * El proposito de una visita -- Anexo E §4 y el protocolo de campo del dueno.
 *
 * ## De donde salen estos seis valores
 *
 * **Del protocolo, literalmente.** `protocolos/apiario-campo-v1.json` declara el item
 * `purpose` con sus `options`, y esta lista es esa lista. No se inventa ni se amplia aqui: el
 * vocabulario es del dueno y su sitio es el JSON. Un guardia comprueba que las dos digan lo
 * mismo, para que anadir un proposito en el protocolo obligue a anadirlo aqui -- y no al reves.
 *
 * ## Por que existe este modulo y no vive en el servicio
 *
 * Para que el formulario pueda importarlo sin arrastrar `prisma` --y con el `pg`-- al paquete
 * del navegador. Es la septima vez que hace falta esta particion; la vigila
 * `cliente-sin-prisma`.
 */
export const PROPOSITOS_DE_VISITA = [
  "inspeccion",
  "alimentacion",
  "tratamiento",
  "cosecha",
  "montaje",
  "diagnostico",
] as const satisfies readonly VisitPurpose[];

export class PropositoInvalido extends Error {}

/**
 * Valida lo que llega del formulario y de la cola offline, que mandan **cadenas**.
 *
 * **Rechaza el vacio**, y eso es una decision y no un descuido: el protocolo marca `purpose`
 * como `required` en el patio. Una visita sin proposito declarado es justo el agujero que este
 * campo viene a cerrar, y aceptar `[]` seria dejarlo abierto con el campo puesto.
 *
 * **Quita los repetidos** en vez de rechazarlos: marcar dos veces la misma casilla es un
 * resbalon del dedo con guante, no una respuesta distinta.
 */
export function exigePropositos(valores: readonly unknown[]): VisitPurpose[] {
  const limpios = [...new Set(valores.map((v) => String(v).trim()).filter((v) => v !== ""))];
  if (limpios.length === 0) throw new PropositoInvalido("proposito_requerido");
  const malos = limpios.filter((v) => !(PROPOSITOS_DE_VISITA as readonly string[]).includes(v));
  if (malos.length > 0) throw new PropositoInvalido(`proposito_desconocido: ${malos.join(", ")}`);
  // Se devuelven en el orden del catalogo y no en el que llegaron: dos visitas con los mismos
  // propositos se leen iguales en el informe.
  return PROPOSITOS_DE_VISITA.filter((p) => limpios.includes(p));
}
