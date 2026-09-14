/**
 * El vocabulario del traslado, **sin `prisma` detrás**.
 *
 * **Por qué existe este archivo y no vive en `traslado.ts`.** `TrasladoForm.tsx` es
 * `"use client"` y necesita los cuatro motivos para pintar su desplegable. Importar un
 * **valor** de `traslado.ts` arrastra `prisma` —y con él `pg`— al paquete del navegador,
 * que es lo que rompió producción durante una hora el 2026-09-13. Es la cuarta vez que el
 * módulo apícola necesita este reparto: `infestacion.ts`, `alimentacion.ts` y
 * `vocabularioDeTratamiento.ts` existen por lo mismo, y lo vigila
 * `tests/arquitectura/cliente-sin-prisma.test.ts` — que cazó esta importación antes de que
 * llegara a un PR, nombrando el símbolo.
 *
 * Un `import type` no habría hecho daño: TypeScript lo borra. El problema es el valor.
 */

/** Una entrada que el traslado rechaza. */
export class TrasladoInvalido extends Error {}

/**
 * Los cuatro motivos del Anexo E §8: *«polinización, corrección del emplazamiento,
 * consolidación, rescate»*.
 *
 * **No es un enum del esquema**, y la razón está en la columna: la colocación que creó el
 * relleno de la migración **no tiene motivo** —nadie trasladó nada, es dónde estaba la
 * colmena cuando se empezó a registrar— y un enum obligatorio habría pedido inventarle uno.
 */
export const MOTIVOS_DE_TRASLADO = [
  "polinizacion",
  "correccion_de_emplazamiento",
  "consolidacion",
  "rescate",
] as const;

export type MotivoDeTraslado = (typeof MOTIVOS_DE_TRASLADO)[number];

export function exigeMotivoDeTraslado(valor: unknown): MotivoDeTraslado {
  if (typeof valor !== "string" || !(MOTIVOS_DE_TRASLADO as readonly string[]).includes(valor)) {
    throw new TrasladoInvalido("motivo_de_traslado_desconocido");
  }
  return valor as MotivoDeTraslado;
}
