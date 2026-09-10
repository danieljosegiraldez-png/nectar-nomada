/**
 * El vocabulario de causas de pérdida de colonia, del catálogo y no de una
 * lista escrita a mano.
 *
 * Mismo molde que `origenDeColonia.ts` (A9.10) y por las mismas razones:
 * filtra por `catalog.key` —el nombre visible es texto de interfaz y puede
 * cambiar— y vive aparte de `hives.ts` porque es una **lectura sin sujeto**,
 * sin colonia ni ubicación contra la que comprobar permisos.
 *
 * La diferencia con el origen es que aquí sí se devuelve la `definition`: cada
 * causa dice de dónde salió —el estándar internacional, el Anexo B del dueño, o
 * un caso registrado de la finca— y esa procedencia es justo lo que hace que el
 * vocabulario no sea una lista inventada. Enseñarla en el formulario es lo que
 * evita que alguien elija «Saqueo» cuando quería decir «se fue».
 */
import { prisma } from "../db";
import type { ProvenanceClass } from "../../generated/prisma/client";

/** La misma clave que siembra `VARIABLE_CATALOGS` en `lib/research/catalogs.ts`. */
export const CATALOGO_DE_CAUSA_DE_PERDIDA = "causa_de_perdida_de_colonia";

/**
 * Cómo se estableció una causa. **No es todo `ProvenanceClass`**: de sus diez
 * valores, siete no significan nada aquí —`measured_fact` no aplica a una
 * conjetura sobre una caja vacía, y `ai_suggestion` no es algo que una persona
 * declare en un formulario—. Se acota a tres, y el servicio rechaza el resto.
 *
 * El orden es de menos a más compromiso, que es como se ofrece en pantalla:
 * lo normal al anotar una pérdida es sospechar, no haber visto.
 */
export const CLASES_DE_CAUSA = ["hypothesis", "conclusion", "direct_observation"] as const;

export type ClaseDeCausa = (typeof CLASES_DE_CAUSA)[number];

export function esClaseDeCausa(valor: string): valor is ClaseDeCausa {
  return (CLASES_DE_CAUSA as readonly string[]).includes(valor);
}

/**
 * Estrecha a las tres clases admitidas. Existe para que la comprobación viva en
 * un solo sitio: el servicio y el formulario preguntan lo mismo.
 */
export function claseDeCausa(valor: ProvenanceClass): ClaseDeCausa | null {
  return esClaseDeCausa(valor) ? valor : null;
}

export async function causasDePerdida() {
  return prisma.variableCatalogValue.findMany({
    where: { catalog: { key: CATALOGO_DE_CAUSA_DE_PERDIDA }, aliasOfId: null },
    select: { id: true, value: true, definition: true, impliesUnknownIdentity: true },
    orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
  });
}

/**
 * Estrecha una cadena recibida de un formulario, o lanza.
 *
 * **Existe por el guardia de `tests/arquitectura/procedencia-declarada.test.ts`,
 * y el guardia tiene razón.** La primera versión de la acción hacía
 * `provenanceClass: clase as never` y se justificaba diciendo que el servicio
 * validaba después. Pero `as never` no convierte: **apaga al compilador**, y
 * deja el sitio exacto donde mañana alguien quita la comprobación del servicio
 * sin que nada se queje. Esto devuelve el tipo estrecho de verdad, así que la
 * acción no necesita mentirle a TypeScript.
 *
 * El servicio sigue comprobando lo mismo. No es duplicar por gusto: la acción
 * protege al compilador y el servicio es la frontera — se puede llamar desde
 * la cola de sincronización sin pasar por ningún formulario.
 */
export function exigeClaseDeCausa(valor: string): ClaseDeCausa {
  if (!esClaseDeCausa(valor)) throw new ClaseDeCausaInvalida(valor);
  return valor;
}

export class ClaseDeCausaInvalida extends Error {
  constructor(valor: string) {
    super(`clase_de_causa_invalida: ${valor}`);
  }
}
