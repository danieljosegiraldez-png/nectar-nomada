/**
 * ¿Qué fermentadores están libres **y** sanos?
 *
 * Dominio puro: clasifica hechos ya leídos, sin Prisma y sin red.
 *
 * ## Por qué la pregunta necesita los tres ejes separados
 *
 * `material.vessel` planeaba un `status [available | in_use | retired]` que junta
 * tres hechos independientes, y por eso **esta pregunta no se le puede hacer**:
 * un fermentador puede estar en uso **y** tener el airlock roto, y «retirado» no
 * es ninguna de las dos cosas. Con un solo campo hay que elegir cuál se pierde.
 *
 * Aquí: el ciclo de vida es columna, la **asignación se deriva** de la corrida
 * que referencia el equipo, y la condición es el último informe sin resolver.
 *
 * ## Y por qué esto importa más que los consumibles
 *
 * Decisión de Daniel del 2026-09-14, y el argumento es la perecibilidad: que
 * falten filtros es caro y recuperable —alguien va al pueblo—; que falte
 * capacidad de tanque **descubierta con la cereza ya en el beneficio** es pérdida
 * irreversible de cosecha. La cereza que llega el jueves no espera a una cola de
 * reparación.
 */

/** Por qué un equipo no está disponible. **Se devuelven TODOS los que apliquen.** */
export type MotivoNoDisponible = "EN_USO" | "RETIRADO" | "CONDICION";

export interface HechosDelEquipo {
  readonly id: string;
  readonly lifecycleStatus: "active" | "retired" | "disposed";
  /** El último informe **sin resolver**. `null` = nadie ha informado de nada. */
  readonly condicion: "operational" | "needs_cleaning" | "needs_maintenance" | "faulty" | "out_of_service" | null;
  /** Derivado: hay una corrida que lo referencia y no ha terminado. */
  readonly enUso: boolean;
}

export interface Clasificacion {
  readonly id: string;
  /** Libre **y** sano: las dos cosas, que es lo que la pregunta pide. */
  readonly libreYSano: boolean;
  /**
   * **Todos** los motivos que aplican, no el primero.
   *
   * Un tanque ocupado Y averiado tiene dos problemas distintos: uno se resuelve
   * solo cuando la fermentación termine, el otro necesita que alguien vaya. Un
   * único motivo elegido por orden escondería el segundo, que es justo el que
   * alguien tiene que ir a arreglar.
   */
  readonly motivos: readonly MotivoNoDisponible[];
}

/**
 * Una condición que impide usar el equipo.
 *
 * **`needs_cleaning` cuenta**, y conviene decir por qué: un fermentador sucio no
 * se puede llenar sin lavarlo antes, así que a efectos de «¿cuántos tengo listos
 * para la cereza que llega?» no está listo. Es una condición barata de resolver,
 * no una condición ausente, y la pantalla dice cuál es.
 */
const CONDICIONES_QUE_IMPIDEN = new Set(["needs_cleaning", "needs_maintenance", "faulty", "out_of_service"]);

export function clasificar(e: HechosDelEquipo): Clasificacion {
  const motivos: MotivoNoDisponible[] = [];
  // `disposed` no debería llegar aquí —la consulta lo excluye— pero si llega, no
  // se cuenta como disponible: un equipo dado de baja no está libre, está fuera.
  if (e.lifecycleStatus !== "active") motivos.push("RETIRADO");
  if (e.enUso) motivos.push("EN_USO");
  if (e.condicion !== null && CONDICIONES_QUE_IMPIDEN.has(e.condicion)) motivos.push("CONDICION");
  return { id: e.id, libreYSano: motivos.length === 0, motivos };
}

export interface ResumenDeDisponibilidad {
  readonly total: number;
  readonly libresYSanos: number;
  readonly enUso: number;
  /** No disponibles por algo que **no** es estar en uso: alguien tiene que ir. */
  readonly requierenIntervencion: number;
}

/**
 * El recuento, que es lo que la §5 llama «capacidad ahora».
 *
 * **`enUso` y `requierenIntervencion` se solapan a propósito**, y sumar las tres
 * columnas no da el total. Es correcto: un tanque ocupado y averiado aparece en
 * las dos porque son dos hechos que piden dos acciones distintas. Forzar que
 * sumen obligaría a elegir uno, que es el colapso que §4 rechaza.
 */
export function resumir(clasificaciones: readonly Clasificacion[]): ResumenDeDisponibilidad {
  return {
    total: clasificaciones.length,
    libresYSanos: clasificaciones.filter((c) => c.libreYSano).length,
    enUso: clasificaciones.filter((c) => c.motivos.includes("EN_USO")).length,
    requierenIntervencion: clasificaciones.filter((c) =>
      c.motivos.some((m) => m === "CONDICION" || m === "RETIRADO"),
    ).length,
  };
}
