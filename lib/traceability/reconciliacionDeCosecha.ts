/**
 * Qué enseña la reconciliación de una cosecha, y con qué advertencias.
 *
 * **Por qué es una función pura y vive aquí.** La decisión estaba dentro del
 * `HarvestSourcesForm`, donde no se puede probar —el repositorio no tiene
 * entorno DOM— y ahí se coló un defecto que ninguna de las cuatro revisiones
 * anteriores podía ver, porque no estaba en el servicio: estaba en la pantalla
 * deshaciendo lo que el servicio se había molestado en distinguir.
 *
 * **El defecto, encontrado el 2026-09-05.** `getHarvestSourceContext` devuelve
 * `alreadyRecordedKg = null` a propósito cuando ningún aporte se pesó —«decir 0
 * sería una afirmación (ADR-080)»— y el componente hacía `?? 0` para calcular la
 * diferencia. Con tres aportes registrados **sin pesar** y uno nuevo de 120 kg
 * contra un declarado de 500, la pantalla decía «diferencia: 380 kg» en negrita.
 * El operador lo lee como «me faltan 380 kg de cereza». Lo cierto es que hay
 * tres bloques cuyo peso nadie anotó.
 *
 * Y lo mismo con los aportes que el RBAC oculta: el servicio cuenta cuántos son
 * precisamente para que la reconciliación no parezca cuadrar con menos aportes
 * de los que hay — y la pantalla no los pintaba.
 *
 * **La decisión del dueño (2026-09-05): la diferencia se muestra, con
 * advertencia.** No se oculta: verla mientras se escribe es lo que distingue
 * «faltan 5 kg de redondeo» de «me olvidé un bloque entero», y ése es el punto
 * del diseño. Pero deja de presentarse como si fuera completa.
 */

export interface EntradaDeReconciliacion {
  /** Peso declarado del evento de cosecha. `null` si nadie lo declaró. */
  declaredTotalKg: number | null;
  /** Suma de los aportes ya guardados QUE SE PESARON. `null` si ninguno. */
  alreadyRecordedKg: number | null;
  /** Los pesos que el operador está escribiendo ahora. */
  pesosEnPantalla: number[];
  /** Aportes guardados y visibles a los que nadie puso peso. */
  sinPesar: number;
  /** Aportes que existen pero el RBAC oculta a este usuario. */
  ocultos: number;
}

export interface Reconciliacion {
  /** `null` = no hay nada que sumar todavía; no se enseña un total. */
  totalDeBloques: number | null;
  /** `null` = no hay diferencia que mostrar. */
  diferenciaKg: number | null;
  /** La diferencia no cuenta todo lo que existe: hay que decirlo. */
  incompleta: boolean;
  sinPesar: number;
  ocultos: number;
}

export function reconciliarCosecha(e: EntradaDeReconciliacion): Reconciliacion {
  const escritos = e.pesosEnPantalla.filter((n) => Number.isFinite(n) && n !== 0);
  const hayAlgoQueSumar = e.alreadyRecordedKg != null || escritos.length > 0;

  // Sin nada pesado no se enseña un total: «sumado de los bloques: 0 kg» se lee
  // como que los bloques aportaron cero, y lo que pasa es que no se sabe.
  const totalDeBloques = hayAlgoQueSumar
    ? Number(((e.alreadyRecordedKg ?? 0) + escritos.reduce((s, n) => s + n, 0)).toFixed(3))
    : null;

  const diferenciaKg =
    e.declaredTotalKg != null && totalDeBloques != null
      ? Number((e.declaredTotalKg - totalDeBloques).toFixed(3))
      : null;

  return {
    totalDeBloques,
    diferenciaKg,
    // Sólo importa si hay una diferencia que cualificar. Sin diferencia no hay
    // nada que la advertencia pueda corregir, y avisar igual sería ruido.
    incompleta: diferenciaKg != null && (e.sinPesar > 0 || e.ocultos > 0),
    sinPesar: e.sinPesar,
    ocultos: e.ocultos,
  };
}
