/**
 * Leer el HTML que se renderiza en las pruebas del editor de recetas — Parte 2a, tarea 14. Sin dependencias: expresiones regulares sobre
 * lo que `renderToStaticMarkup` y `renderToReadableStream` escriben. Mira `<input>` y `<select>` enteros, por su `name`, y los textos de las
 * opciones: lo que el operario ve y lo que el formulario manda.
 */
/** Lo que React escapa al escribir texto (`'` → `&#x27;`, `&` → `&amp;`…): se deshace DESPUÉS de quitar las etiquetas, para que un `&lt;` no se lea como una. */
const sinEntidades = (s: string): string =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export const aTexto = (html: string): string => sinEntidades(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Cada `<input>`/`<select>` del html, entero, opcionalmente sólo los de ese `name`. */
export function campos(html: string, nombre?: string): string[] {
  const todos = [...html.matchAll(/<(?:input|select)\b[^>]*>/g)].map((m) => m[0]);
  return nombre === undefined ? todos : todos.filter((e) => e.includes(`name="${nombre}"`));
}

export const tieneCampo = (html: string, nombre: string): boolean => campos(html, nombre).length > 0;

/** Los textos de las opciones de un desplegable. */
export function opciones(html: string, nombre: string): string[] {
  const m = new RegExp(`<select\\b[^>]*name="${escapar(nombre)}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
  return m === null ? [] : [...m[1]!.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/g)].map((o) => aTexto(o[1]!));
}
