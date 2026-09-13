/**
 * El vocabulario de una aplicación fitosanitaria: contra qué y cómo. **Sin base
 * de datos**, a propósito.
 *
 * **Por qué vive aparte, y qué costó no hacerlo.** El formulario de campo es
 * `"use client"` y necesita estas listas para pintar sus desplegables. Cuando
 * vivían junto a `tratamientosPorObjetivo` —que sí lee— importarlas arrastraba
 * `lib/db` y con él `pg` al paquete del navegador: `next build` murió con
 * *«Module not found: Can't resolve 'dns'»*, y **producción se quedó sirviendo un
 * build viejo** hasta que se separaron (2026-09-13).
 *
 * Es el mismo reparto que `lib/apiary/infestacion.ts` y `lib/apiary/alimentacion.ts`
 * ya tenían: lo puro a un lado, lo que consulta al otro. La tercera vez se me
 * olvidó, y lo caza ahora `tests/arquitectura/cliente-sin-prisma.test.ts`.
 */
import type { TreatmentRoute, TreatmentTarget } from "../../generated/prisma/client";

/** Una entrada que el servicio rechaza. */
export class TratamientoInvalido extends Error {}

/** Los cinco objetivos que el dueño cerró en su protocolo. */
export const OBJETIVOS_DE_TRATAMIENTO = [
  "varroa",
  "polilla_cera",
  "escarabajo_colmena",
  "hormigas",
  "otro",
] as const satisfies readonly TreatmentTarget[];

/** Las seis vías. */
export const VIAS_DE_TRATAMIENTO = [
  "tira",
  "goteo",
  "espolvoreo",
  "vaporizacion",
  "cebo",
  "otro",
] as const satisfies readonly TreatmentRoute[];

/**
 * Las vías que **dejan algo dentro de la colmena** y por lo tanto hay que retirar.
 *
 * El Anexo lo dice de una sola: *«las tiras que no se retiran generan
 * resistencia»*. `cebo` también deja material, pero fuera del alcance de lo que él
 * escribió, así que **no se añade por deducción** — queda como pregunta suya en
 * ADR-119. Esta lista existe para que, cuando haya camino de cierre, el aviso de
 * «no retirado» tenga de dónde salir sin volver a decidirlo.
 */
export const VIAS_QUE_DEJAN_MATERIAL = ["tira"] as const satisfies readonly TreatmentRoute[];

export function exigeObjetivo(valor: unknown): TreatmentTarget {
  if (typeof valor !== "string" || !(OBJETIVOS_DE_TRATAMIENTO as readonly string[]).includes(valor)) {
    throw new TratamientoInvalido("objetivo_desconocido");
  }
  return valor as TreatmentTarget;
}

export function exigeVia(valor: unknown): TreatmentRoute {
  if (typeof valor !== "string" || !(VIAS_DE_TRATAMIENTO as readonly string[]).includes(valor)) {
    throw new TratamientoInvalido("via_desconocida");
  }
  return valor as TreatmentRoute;
}
