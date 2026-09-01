/**
 * Recorta una fecha a lo que admite el input de esa precisión.
 *
 * Vive aquí y no dentro del componente para poder probarlo: el fallo que cubre
 * —perder lo que el usuario escribió al cambiar de precisión— es de lógica, no
 * de pintado, y un test de navegador sería la forma cara de comprobarlo.
 *
 * Al subir de precisión se completa con el primer día o mes. Es visible y
 * corregible; lo que no se hace es volver al valor original, que era el fallo.
 */
export function recortarPorPrecision(valor: string, precision: string): string {
  if (!valor) return "";
  const completo = valor.padEnd(10, "-01");
  if (precision === "year") return completo.slice(0, 4);
  if (precision === "month") return completo.slice(0, 7);
  return completo.slice(0, 10);
}
