/**
 * Los códigos de las corrientes que salen de una selección, derivados del padre.
 *
 * **NO se inventa una convención: se continúa la del dueño.** Sus lotes reales
 * ya la traen — `PE-90` produjo `PE-90-A` y `PE-90-B`; `PE-95` produjo `-A`,
 * `-B` y `-C`. Padre más letra. Lo único que faltaba era que no tuviera que
 * teclearlas a mano, que es lo que pidió el 2026-09-11: «for the rejects we
 * should have an automatically generated code».
 *
 * **Por qué derivar y no contar.** Un contador en el servidor sería más corto,
 * y `schema.prisma` explica por qué no: un código único global es «un riesgo de
 * colisión sin señal — dos aparatos desconectados acuñando "PE-79"». Hoy la
 * selección exige red, pero `/lots` ya está en las rutas que el service worker
 * guarda para trabajar sin ella. Derivar del padre no puede chocar: es una
 * función del código que ya existe, no de un estado compartido.
 *
 * **Se saltan los sufijos ya usados.** Seleccionar dos veces el mismo lote —o
 * corregir una selección— no debe reclamar una letra que ya tiene dueño;
 * `lot_code` es único por organización y un choque aborta la transacción entera.
 *
 * **Un padre que ya lleva sufijo recibe otro**: `PE-87-A` → `PE-87-A-A`. Es
 * largo y es feo, y es la opción honesta: acortar reutilizando el nivel del
 * padre produciría el código de un hermano. La longitud dice la profundidad.
 */

/** A…Z, AA, AB… como las columnas de una hoja de cálculo. Sin techo. */
export function letraDeOrden(indice: number): string {
  if (!Number.isInteger(indice) || indice < 0) throw new RangeError("indice debe ser un entero >= 0");
  let n = indice;
  let salida = "";
  do {
    salida = String.fromCharCode(65 + (n % 26)) + salida;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return salida;
}

/**
 * `cuantos` códigos derivados de `codigoPadre`, saltando los de `yaUsados`.
 *
 * Devuelve exactamente `cuantos`, en orden. La comparación de lo ya usado es
 * **insensible a mayúsculas**, porque `PE-90-a` y `PE-90-A` se leen como el
 * mismo código aunque la base los admita como distintos.
 */
export function codigosDerivados(
  codigoPadre: string,
  cuantos: number,
  yaUsados: readonly string[] = [],
): string[] {
  const padre = codigoPadre.trim();
  if (!padre) throw new RangeError("codigoPadre no puede estar vacío");
  if (!Number.isInteger(cuantos) || cuantos < 0) throw new RangeError("cuantos debe ser un entero >= 0");

  const tomados = new Set(yaUsados.map((c) => c.trim().toUpperCase()));
  const salida: string[] = [];
  for (let i = 0; salida.length < cuantos; i++) {
    // Sin techo por diseño, pero un bucle sin freno ante una entrada absurda es
    // un cuelgue: 26² sufijos son más de los que cabe defender en una selección.
    if (i > 700) throw new RangeError(`no quedan sufijos libres para ${padre}`);
    const candidato = `${padre}-${letraDeOrden(i)}`;
    if (tomados.has(candidato.toUpperCase())) continue;
    tomados.add(candidato.toUpperCase());
    salida.push(candidato);
  }
  return salida;
}
