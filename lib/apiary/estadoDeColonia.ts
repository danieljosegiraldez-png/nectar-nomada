/**
 * El estado de la colonia: vocabulario y reglas. **Sin base de datos**, a
 * propósito.
 *
 * **Qué cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.2 —«Estado de la
 * colonia, nuevo, por protocolo»— son siete campos con su motivo al lado y
 * ninguno existía. El que el dueño subraya: *«Celdas reales → **aviso de
 * enjambrazón antes de perder la colonia.** Directamente relevante al
 * ausentamiento de Toabré»*.
 *
 * **El vocabulario no se inventa aquí.** Sale de
 * `protocolos/apiario-campo-v1.json`, que el dueño escribió, y que este trabajo
 * **no modifica**: su propia cabecera lo prohíbe —*«cambiar esto después no es
 * editar aquí: es crear una versión 2, para que las respuestas ya dadas sigan
 * significando lo mismo»*—. Lo que este módulo hace es sostener en esquema lo
 * que esa lista pregunta.
 *
 * **Separado del servicio** por la misma razón que `lib/apiary/infestacion.ts`:
 * el formulario de captura es `"use client"` y necesita las listas para pintar
 * sus desplegables; importar el servicio traería `prisma` al paquete del
 * navegador.
 */
import type { BroodStage, ColonyPopulation, QueenCellKind, StoresLevel } from "../../generated/prisma/client";

/** Una entrada que el servicio rechaza. La lanza `lib/apiary/inspections.ts`. */
export class EstadoDeColoniaInvalido extends Error {}

/**
 * Las cuatro listas, como listas y no sólo como tipos. **Un tipo no viaja por
 * HTTP**: el formulario manda cadenas y la cola offline manda cadenas, así que la
 * frontera tiene que ser una función que falla y no un `as never` (ADR-112).
 */
/** La ñ es la ortografia del dueno, y la que su protocolo ya usaba (ADR-153). */
export const POBLACIONES = ["baja", "normal", "apiñada"] as const satisfies readonly ColonyPopulation[];
export const ETAPAS_DE_CRIA = ["huevo", "larva", "operculada", "pupa"] as const satisfies readonly BroodStage[];
export const CELDAS_REALES = ["no_hay", "emergencia", "enjambrazon", "reemplazo"] as const satisfies readonly QueenCellKind[];
export const NIVELES_DE_RESERVA = ["alta", "media", "baja"] as const satisfies readonly StoresLevel[];

/**
 * Las celdas que avisan de que la colonia se va a ir o ya perdió la reina.
 * `no_hay` no está —es la buena noticia— y `reemplazo` tampoco: una colonia que
 * cambia de reina por su cuenta no se está yendo.
 */
export const CELDAS_QUE_AVISAN = ["emergencia", "enjambrazon"] as const satisfies readonly QueenCellKind[];

function exige<T extends string>(lista: readonly T[], valor: unknown, campo: string): T {
  if (typeof valor !== "string" || !(lista as readonly string[]).includes(valor)) {
    throw new EstadoDeColoniaInvalido(`${campo}_desconocido`);
  }
  return valor as T;
}

export const exigePoblacion = (v: unknown) => exige(POBLACIONES, v, "poblacion");
export const exigeCeldaReal = (v: unknown) => exige(CELDAS_REALES, v, "celda_real");
export const exigeNivelDeReserva = (v: unknown) => exige(NIVELES_DE_RESERVA, v, "nivel_de_reserva");

/**
 * Las etapas de cría presentes, limpias.
 *
 * **Deduplica y valida, y devuelve el orden del protocolo.** El orden importa
 * para leerlas —huevo, larva, operculada, pupa es la secuencia de la cría— y
 * dejarlo en el que vino del formulario haría que dos inspecciones iguales se
 * vieran distintas.
 */
export function exigeEtapasDeCria(valores: readonly unknown[] | null | undefined): BroodStage[] {
  const vistas = new Set<string>();
  for (const v of valores ?? []) {
    exige(ETAPAS_DE_CRIA, v, "etapa_de_cria");
    vistas.add(v as string);
  }
  return ETAPAS_DE_CRIA.filter((e) => vistas.has(e));
}

/**
 * Un entero contado, o nada.
 *
 * **Cero es una respuesta legítima** —cero cuadros cubiertos describe una caja
 * que se está muriendo, y es justo lo que hay que poder decir— así que un
 * `!valor` lo rechazaría mal. Lo que no vale es un negativo ni un decimal: no se
 * cuentan tres cuartos de cuadro.
 *
 * **Sin techo a propósito.** Cuántos cuadros caben lo dice la configuración de la
 * caja, que es el §2.4 del Anexo y **todavía no existe**. Inventar un máximo aquí
 * sería una regla sin fuente que rechazaría una colmena grande de verdad.
 */
export function exigeEnteroContado(valor: unknown, campo: string): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isInteger(n) || n < 0) throw new EstadoDeColoniaInvalido(`${campo}_invalido`);
  return n;
}

export interface CeldasReales {
  kind: QueenCellKind | null;
  count: number | null;
}

/**
 * Las celdas reales y cuántas, comprobadas **juntas**.
 *
 * Son dos columnas y una sola afirmación, así que las combinaciones imposibles
 * hay que negarlas aquí o la fila las guarda:
 *
 * - **«no hay» con un número mayor que cero** es una contradicción escrita. Se
 *   rechaza en vez de guardar un dato que después nadie sabe leer.
 * - **un número sin tipo** no dice de qué hay tres. Se rechaza.
 *
 * Lo que sí se acepta: un tipo **sin** número —se vieron celdas de enjambrazón y
 * nadie las contó, que es lo normal con la caja abierta y las manos ocupadas— y
 * `no_hay` con cero, que es consistente.
 */
export function exigeCeldasReales(kindCrudo: unknown, countCrudo: unknown): CeldasReales {
  const count = exigeEnteroContado(countCrudo, "celdas_reales_cuantas");
  const hayKind = kindCrudo !== null && kindCrudo !== undefined && kindCrudo !== "";
  if (!hayKind) {
    if (count !== null) throw new EstadoDeColoniaInvalido("celdas_sin_tipo");
    return { kind: null, count: null };
  }
  const kind = exigeCeldaReal(kindCrudo);
  if (kind === "no_hay" && count !== null && count > 0) {
    throw new EstadoDeColoniaInvalido("no_hay_celdas_pero_trae_cuantas");
  }
  return { kind, count };
}
