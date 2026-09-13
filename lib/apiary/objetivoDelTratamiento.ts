/**
 * Contra qué y cómo se trató: el vocabulario, y el reporte que lo justifica.
 *
 * **Qué cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §4 marca «Objetivo» como
 * **obligatorio** —el último de esa columna que seguía sin existir— y dice para
 * qué: *«eficacia por objetivo; hoy no se puede agrupar»*. Sin este campo, «qué se
 * trató contra varroa esta temporada» no es una consulta, igual que antes de
 * ADR-114 no lo era «todas las colonias con varroa».
 *
 * **Vocabulario propio, no el catálogo de irregularidades**, aunque cuatro valores
 * se llamen igual. Misma distinción que ADR-114: **lo que se observa no es lo que
 * se trata**. La lista de irregularidades tiene trece valores y ninguno de los
 * otros nueve —moho, loque, alas deformadas, obrera ponedora— es algo contra lo
 * que se aplique un producto.
 *
 * **Este archivo es puro y NO lee la base**, porque el formulario de campo es
 * `"use client"` y lo importa. Estaba escrito en dos mitades —catálogo arriba,
 * reporte abajo— y esa frontera no existe para el empaquetador: un
 * `import { prisma }` a nivel de módulo se traza **da igual qué export uses**, así
 * que el navegador acababa pidiendo `pg`, y con él `dns`, `fs`, `net` y `tls`.
 * Rompió el build de `main` el 2026-09-13. El reporte vive ahora en
 * `tratamientosPorObjetivo.ts`, que es el reparto que este módulo ya tenía con
 * `alimentacion.ts` / `alcanceDelAlimento.ts`.
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
