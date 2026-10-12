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

/** El valor de un atributo, sin las entidades de React; `""` si es booleano (`checked=""`) y `null` si no está. */
function atributo(etiqueta: string, nombre: string): string | null {
  const m = new RegExp(`\\s${escapar(nombre)}(?:="([^"]*)")?(?=[\\s/>])`).exec(etiqueta);
  return m === null ? null : sinEntidades(m[1] ?? "");
}

/** Las opciones de un `<select>`, con lo que un navegador necesita saber de cada una. */
function opcionesDe(select: string): { valor: string; texto: string; marcada: boolean; apagada: boolean }[] {
  // La etiqueta de apertura ENTERA (con su `>`): `atributo` mira lo que sigue a cada atributo, y al final de una cadena sin `>` no ve nada.
  return [...select.matchAll(/(<option\b[^>]*>)([\s\S]*?)<\/option>/g)].map((o) => ({
    valor: atributo(o[1]!, "value") ?? aTexto(o[2]!),
    texto: aTexto(o[2]!),
    marcada: atributo(o[1]!, "selected") !== null,
    apagada: atributo(o[1]!, "disabled") !== null,
  }));
}

/**
 * Lo que un navegador mandaría al enviar el `cual`-ésimo `<form>` de ese html, tal cual lo dejó `renderToStaticMarkup` y sin tocar nada: el
 * `name` y el `value` de cada control, en el orden del documento. Es lo que une una prueba de un componente con la de su acción: se pinta el
 * componente, se arma este `FormData` y se le da a la acción de verdad (`componentesHaciaAcciones.test.ts`), o a `pasoDeFormulario`
 * (la ida y vuelta de `componentesDelEditor.test.ts`). Así un `name` que no es el que la acción lee, o un `value` que no es el que se pintó,
 * se ve; leer los nombres de una lista escrita a mano no los vería.
 *
 * Sigue la regla del navegador, no una más cómoda: un control sin `name` o `disabled` no se manda; un botón tampoco; una casilla o un radio
 * sólo si está marcado (`checked`), con su `value` o, sin él, `on`; un desplegable manda su última opción marcada (`selected`) y, si ninguna lo
 * está, **la primera que no esté apagada** —por eso un `defaultValue` que no casa con ninguna opción parece «sin elegir» y manda la primera—,
 * y una opción marcada pero apagada (el «— elige —» de un desplegable obligatorio) no manda nada.
 *
 * `elige` es lo que hace el operario antes de enviar: en un desplegable, el **rótulo** de la opción que elige (no su `value`: lo que se
 * comprueba es que ese rótulo lleva al `value` correcto); en un campo de texto o número, lo que teclea. Un campo o un rótulo que no existe
 * revienta, para que una prueba no «elija» algo que el formulario no ofrece.
 */
export function formDataDeHtml(html: string, cual = 0, elige: Record<string, string> = {}): FormData {
  const formularios = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)];
  const formulario = formularios[cual];
  if (formulario === undefined) throw new Error(`el html tiene ${formularios.length} formularios y se pidió el ${cual}`);
  const datos = new FormData();
  const usados = new Set<string>();
  for (const c of formulario[1]!.matchAll(/<input\b[^>]*>|<select\b[^>]*>[\s\S]*?<\/select>|<textarea\b[^>]*>[\s\S]*?<\/textarea>/g)) {
    const control = c[0];
    const abre = /^<[^>]*>/.exec(control)![0];
    const nombre = atributo(abre, "name");
    if (nombre === null || nombre === "" || atributo(abre, "disabled") !== null) continue;
    if (control.startsWith("<select")) {
      const lista = opcionesDe(control);
      if (nombre in elige) {
        usados.add(nombre);
        const quiere = lista.find((o) => o.texto === elige[nombre]);
        if (quiere === undefined) throw new Error(`el desplegable «${nombre}» no ofrece «${elige[nombre]}»: ofrece [${lista.map((o) => o.texto).join(" | ")}]`);
        if (quiere.apagada) throw new Error(`el desplegable «${nombre}» ofrece «${elige[nombre]}» pero está apagada: no se puede elegir`);
        datos.append(nombre, quiere.valor);
        continue;
      }
      const marcadas = lista.filter((o) => o.marcada);
      const marcada = marcadas.length > 0 ? marcadas[marcadas.length - 1] : lista.find((o) => !o.apagada);
      if (marcada !== undefined && !marcada.apagada) datos.append(nombre, marcada.valor);
      continue;
    }
    if (control.startsWith("<textarea")) {
      datos.append(nombre, nombre in elige ? elige[nombre]! : sinEntidades(control.replace(/^<textarea\b[^>]*>|<\/textarea>$/g, "")));
      usados.add(nombre);
      continue;
    }
    const tipo = (atributo(abre, "type") ?? "text").toLowerCase();
    if (["submit", "button", "image", "reset", "file"].includes(tipo)) continue;
    if (tipo === "checkbox" || tipo === "radio") {
      if (nombre in elige) throw new Error(`«${nombre}» es una casilla: formDataDeHtml no sabe «elegirla»`);
      if (atributo(abre, "checked") !== null) datos.append(nombre, atributo(abre, "value") ?? "on");
      continue;
    }
    usados.add(nombre);
    datos.append(nombre, nombre in elige ? elige[nombre]! : (atributo(abre, "value") ?? ""));
  }
  const sobran = Object.keys(elige).filter((k) => !usados.has(k));
  if (sobran.length > 0) throw new Error(`el formulario ${cual} no tiene ningún campo «${sobran.join("», «")}»`);
  return datos;
}

/** ¿Hay un `<fieldset>` con el atributo `disabled`? (Un `disabled` en el texto de una etiqueta no cuenta: se mira sólo la apertura del fieldset.) */
export const fieldsetDeshabilitado = (html: string): boolean => /<fieldset\b[^>]*\sdisabled(?:=""|\s|\/|>)/.test(html);

/**
 * Los controles del html (`<input>`, `<select>`, `<textarea>`, `<button>`) que quedan FUERA del primer `<fieldset>…</fieldset>`. Un control dentro de un fieldset deshabilitado
 * está deshabilitado aunque no lleve el atributo (así lo calcula un navegador), de modo que «no queda ninguno fuera» es lo que dice que la pantalla entera es de sólo lectura. Sin
 * fieldset, todos quedan fuera.
 */
export function controlesFueraDelFieldset(html: string): string[] {
  const abre = html.search(/<fieldset\b/);
  const cierra = html.indexOf("</fieldset>");
  const todos = [...html.matchAll(/<(?:input|select|textarea|button)\b[^>]*>/g)];
  return todos.filter((m) => abre === -1 || cierra === -1 || m.index < abre || m.index > cierra).map((m) => m[0]);
}
