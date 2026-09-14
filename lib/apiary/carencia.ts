/**
 * La carencia vigente de una colonia: si lo que salga del panal hoy lleva
 * residuo de un tratamiento todavía sin cumplir.
 *
 * **El hueco que cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §4 marca el
 * período de carencia como **obligatorio** y como **no existente**, y dice la
 * consecuencia: *«decide cuándo se puede cosechar. Sin él, una cosecha puede
 * violar la carencia sin que el sistema lo sepa.»* El aviso ya existía en la
 * bitácora desde A9.12; el **dato** no.
 *
 * ## Lo que NO hace, y es decisión del dueño
 *
 * No bloquea. El Anexo B §5 se contradice en una sola celda —dice «bloqueo» y
 * «la cosecha avisa»— y el 2026-09-11 el dueño lo resolvió: **la cosecha se
 * registra siempre**, marcada con los días que faltaban. Si la miel ya se
 * extrajo, impedir el registro no la devuelve al panal: deja el hecho sin
 * rastro, que para trazabilidad es peor que un registro marcado.
 */
import { prisma } from "../db";

/** Milisegundos en un día. La carencia se cuenta en días enteros. */
const MS_POR_DIA = 86_400_000;

/**
 * Cuándo deja de haber carencia. **Un solo sitio decide esta aritmética.**
 *
 * Puro y exportado porque lo usan dos lectores: `carenciasVigentes`, que responde por una
 * colonia, y `destinosCandidatos` en `traslado.ts`, que responde por una lista de apiarios
 * con tres consultas en vez de un N+1. Cuando la misma cuenta vive en dos funciones,
 * derivan — y entonces la pantalla y el registro dicen cosas distintas del mismo apiario.
 */
export function libreDesdeDe(aplicadoEl: Date, diasDeCarencia: number): Date {
  return new Date(aplicadoEl.getTime() + diasDeCarencia * MS_POR_DIA);
}

/**
 * Días que faltan, **redondeados hacia arriba**, o `0` si ya se cumplió.
 *
 * Medio día de carencia sigue siendo carencia: un `Math.floor` daría cero en las últimas
 * horas, que es justo cuando alguien va a cosechar creyendo que ya puede.
 */
export function diasQueFaltanDe(libreDesde: Date, enLaFecha: Date): number {
  if (libreDesde <= enLaFecha) return 0;
  return Math.ceil((libreDesde.getTime() - enLaFecha.getTime()) / MS_POR_DIA);
}

export interface CarenciaVigente {
  colonyEventId: string;
  /** Qué se aplicó. Puede faltar en filas viejas; el servicio lo exige hoy. */
  producto: string | null;
  aplicadoEl: Date;
  diasDeCarencia: number;
  /** Cuándo deja de haber carencia. Derivado, no guardado: un solo sitio manda. */
  libreDesde: Date;
  /**
   * Días que faltan, **redondeados hacia arriba**. Medio día de carencia sigue
   * siendo carencia, y un `Math.floor` daría cero en las últimas horas — que es
   * justo el caso en que alguien va a cosechar creyendo que ya puede.
   */
  diasQueFaltan: number;
}

/**
 * Las carencias todavía sin cumplir de una colonia, en una fecha.
 *
 * **No autoriza y no pide principal**, misma disciplina que `vitalesDeSitios`,
 * `leerEnmiendas` y `coloniasPorIrregularidad`: quien llama ya obtuvo el
 * `colonyId` de una lectura que sí autoriza. Un lector que exige principal
 * parece una compuerta y termina usándose como tal.
 *
 * Devuelve **todas** las vigentes y no sólo la más larga: dos productos con
 * carencias distintas son dos hechos, y quien lea necesita saber de qué
 * tratamiento viene cada uno si aparece un residuo.
 */
export async function carenciasVigentes(colonyId: string, enLaFecha: Date): Promise<CarenciaVigente[]> {
  const tratamientos = await prisma.colonyEvent.findMany({
    where: {
      colonyId,
      eventType: "treatment",
      treatmentWithdrawalDays: { not: null },
      // Un tratamiento POSTERIOR a la fecha que se pregunta no puede imponer
      // carencia sobre ella. Sin esto, registrar una cosecha de hace un mes
      // saldría marcada por un tratamiento de la semana pasada.
      occurredAt: { lte: enLaFecha },
    },
    select: { id: true, treatmentProduct: true, occurredAt: true, treatmentWithdrawalDays: true },
    orderBy: { occurredAt: "desc" },
  });

  const vigentes: CarenciaVigente[] = [];
  for (const t of tratamientos) {
    const dias = t.treatmentWithdrawalDays!;
    const libreDesde = libreDesdeDe(t.occurredAt, dias);
    const diasQueFaltan = diasQueFaltanDe(libreDesde, enLaFecha);
    if (diasQueFaltan === 0) continue;
    vigentes.push({
      colonyEventId: t.id,
      producto: t.treatmentProduct,
      aplicadoEl: t.occurredAt,
      diasDeCarencia: dias,
      libreDesde,
      diasQueFaltan,
    });
  }
  return vigentes;
}

/**
 * Los días que faltaban de la carencia más larga, o `null` si no había ninguna.
 *
 * Es lo que se guarda en `ApiaryHarvestEvent.withinWithdrawalDays`. **La más
 * larga y no la suma**: las carencias corren en paralelo, no se acumulan, y
 * sumarlas inventaría una espera que ningún producto exige.
 */
export function diasPendientes(vigentes: readonly CarenciaVigente[]): number | null {
  if (vigentes.length === 0) return null;
  return Math.max(...vigentes.map((v) => v.diasQueFaltan));
}
