/**
 * Quita los comentarios de un archivo TypeScript **sin confundir una cadena con
 * un comentario**.
 *
 * **Por qué existe, y es una regresión que yo mismo introduje el 2026-10-02.**
 * Dos guardias de este repositorio leen la fuente buscando un patrón, y los dos
 * marcaban código correcto cuando el patrón aparecía dentro de un comentario que
 * explicaba la regla. Los «arreglé» borrando, con dos expresiones regulares, los
 * bloques entre barra-asterisco y todo lo que va de dos barras al fin de línea —
 * y eso **los dejó ciegos de otra forma**, que es peor: un par de barras dentro
 * de una cadena corta la línea. Medido, no razonado:
 *
 * ```
 * <input placeholder="https://ejemplo" type="number" />
 *   → '<input placeholder="https:'        (el type="number" desaparece)
 * ```
 *
 * Lo encontró una revisión independiente. Un guardia que marca código correcto
 * enseña a ignorarlo; un guardia que **deja de ver** el incumplimiento es peor,
 * porque sigue en verde y nadie vuelve a mirar. De las dos orillas, esta es la
 * que no avisa.
 *
 * **Por eso es un recorrido y no una expresión regular.** Una expresión regular
 * no puede saber si está dentro de una cadena; hay que llevar ese estado. El
 * recorrido es corto a propósito y sólo distingue lo que estos guardias
 * necesitan: cadenas con `"`, `'` y acento grave —con su escape—, comentarios de
 * línea y comentarios de bloque. No es un lexer de TypeScript: una expresión
 * regular literal (`/ab\/c/`) se trataría como división y no pasa nada, porque
 * ninguno de los dos guardias busca dentro de una.
 *
 * Vive aquí, compartido, y no copiado en cada guardia: el mismo error en dos
 * sitios es el que acabo de cometer.
 */
export function sinComentarios(fuente: string): string {
  let salida = "";
  let i = 0;
  // Ninguna, o la comilla que abrió la cadena en la que estamos.
  let comilla: '"' | "'" | "`" | null = null;

  while (i < fuente.length) {
    const c = fuente[i]!;

    if (comilla) {
      salida += c;
      if (c === "\\") {
        // Un escape se lleva al siguiente carácter con él: `"\\\""` no cierra.
        if (i + 1 < fuente.length) salida += fuente[i + 1];
        i += 2;
        continue;
      }
      if (c === comilla) comilla = null;
      // Una cadena con `"` o `'` no sobrevive a un salto de línea; si lo hay,
      // es que el archivo estaba mal o que la comilla era un apóstrofo de prosa.
      // Cerrarla evita arrastrar el resto del archivo dentro de una cadena.
      if (c === "\n" && comilla !== "`") comilla = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      comilla = c;
      salida += c;
      i += 1;
      continue;
    }

    if (c === "/" && fuente[i + 1] === "/") {
      while (i < fuente.length && fuente[i] !== "\n") i += 1;
      continue; // el `\n` lo copia la vuelta siguiente
    }

    if (c === "/" && fuente[i + 1] === "*") {
      const fin = fuente.indexOf("*/", i + 2);
      i = fin === -1 ? fuente.length : fin + 2;
      continue;
    }

    salida += c;
    i += 1;
  }

  return salida;
}
