/**
 * **Un campo nuevo tiene que llegar por TODAS las puertas que lo escriben.**
 *
 * ## El incidente que lo motiva (2026-09-13), y la forma que tiene hoy
 *
 * Se añadieron `everyHours` y `expectedHours` a la receta con su validación y su migración, y **ninguna pantalla podía escribirlos**. Cerrado eso, quedó el
 * fallo de verdad, que encontró la revisión independiente de Codex y no yo: **hay DOS caminos que escriben objetivos de receta** —crear receta y crear VERSIÓN— y
 * sólo se cerró uno. `createRecipeVersion` no persistía `everyHours` ni aceptaba `expectedHours`, así que **publicar la v2 le borraba el ritmo a la receta en
 * silencio**: la versión vigente quedaba sin él aunque la v1 lo tuviera. Es pérdida de dato sin aviso en el núcleo de trazabilidad. El patrón
 * —añadir un campo y cerrar sólo una de sus puertas— ya se había cometido dos veces el mismo día. Una promesa de tener cuidado no lo caza; esto sí.
 *
 * **Reescrito el 2026-10-03 (Parte 2a, tarea 14), en la misma tarea que sustituyó los formularios que leía.** La receta con pasos cambió de sitio las puertas:
 * un campo del PASO se declara en `PasoEditable` y tiene que llegar a (1) `completar`, (2) `columnas` y `escribirHijos` —lo que se escribe—, (3) `leerPasos`
 * —lo que se lee—, (4) el lector del formulario (`pasoDeFormulario`), (5) el formulario (que lo manda y lo PRECARGA), (6) lo que el formulario precarga
 * (`valoresDelFormulario`), y (7) la copia a la versión siguiente, que copia la fila ENTERA y no campo a campo. Las colecciones del paso —adiciones, fines
 * y metas— tienen sus propios campos y se vigilan igual, fila por fila. Y la clase hermana, la del servicio sin pantalla, también: cada operación del editor
 * tiene su acción y cada acción la importa algún componente.
 *
 * **Y la regla de quién escribe (2026-10-04, Ruling A, V16).** Toda escritura del editor pasa por una sola regla, `exigeAutoriaDeReceta` (el permiso del Coffee
 * Process Manager). Que la llame cada operación es lo que se vigila aquí, por la fuente: la prueba con base dice que RECHAZA al Farm Manager, y ésta dice que la regla
 * no se perdió de camino —quitar la llamada de una de las ocho deja a esa escritura abierta a quien tenga `edit_beneficio`, y no falla en rojo—. Es el defecto de
 * la clase, con otro campo: una puerta que se cierra en una función y no en su hermana.
 *
 * **Lo que NO se vigila ya, y por qué.** Los formularios `RecipeForm` y `RecipeVersionForm`, `parseTargetRows` y las cuatro puertas de `expectedHours`
 * desaparecieron con la pantalla de metas: sin pasos, ninguna pantalla escribe metas de VERSIÓN. **Y los dos servicios que las escribían —`createRecipeWithVersion`
 * y `createRecipeVersion`— se borraron en la misma tarea** (Parte E): tras quitar sus acciones sólo los llamaban pruebas, y lo que escriben una receta con metas de versión y
 * sin pasos ni se puede publicar (`version_sin_pasos`). Con ellos se fue su vigilancia de las dos puertas de las metas de versión, que sólo tenía sentido mientras existían.
 *
 * ## Cómo mide, y su control positivo, sin el cual no valdría nada
 *
 * Lee la fuente SIN sus comentarios (un campo nombrado en una explicación a cien líneas no cuenta como presente) y localiza cada puerta por la función que la
 * contiene, contando paréntesis desde el `(` y no por la sangría. Un guardia que lee la fuente con expresiones regulares falla en silencio cuando la forma del archivo cambia:
 * deja de encontrar campos, no encuentra incumplimientos, y **pasa en verde sin haber mirado nada**. Por eso la primera prueba afirma **cuántos campos encontró** y nombra
 * los que espera, y cada localizador lanza —«el guardia está ciego»— en vez de devolver un bloque vacío.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sinComentarios } from "../helpers/sinComentarios";

const RAIZ = join(__dirname, "..", "..");
const leer = (r: string) => readFileSync(join(RAIZ, r), "utf8");
const sinComentariosDe = (r: string) => sinComentarios(leer(r));

const SERVICIO_DE_PASOS = "lib/recetas/pasos.ts";
const SERVICIO_DE_VERSIONES = "lib/recetas/versiones.ts";
const LECTOR_DEL_FORMULARIO = "lib/recetas/formularioDePaso.ts";
const FORMULARIO_DEL_PASO = "app/components/traceability/FormularioDePaso.tsx";
const ACCIONES = "app/actions/traceability.ts";
const COMPONENTES = "app/components/traceability";

// ---------------------------------------------------------------------------------------------------------------------------
// Localizadores: por paréntesis y llaves, no por sangría
// ---------------------------------------------------------------------------------------------------------------------------

/** El texto desde `desde` (donde está el `(` o la `{`) hasta su pareja, saltando lo que va entre comillas. */
function emparejado(src: string, desde: number, abre: "(" | "{", cierra: ")" | "}"): string {
  let profundidad = 0;
  let comilla: string | null = null;
  for (let i = desde; i < src.length; i++) {
    const c = src[i]!;
    if (comilla) {
      if (c === "\\") i++;
      else if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") comilla = c;
    else if (c === abre) profundidad++;
    else if (c === cierra && --profundidad === 0) return src.slice(desde, i + 1);
  }
  throw new Error(`el «${abre}» de la posición ${desde} no se cierra: el guardia está ciego`);
}

/**
 * El cuerpo de la función que empieza en `marcador`, que termina en el `(` de sus parámetros. Un tipo de retorno puede llevar llaves
 * (`Promise<{ id: string }>`, el de `agregarPaso`): el cuerpo es la primera `{` que NO está dentro de unos `<…>`.
 */
function cuerpoDeFuncion(src: string, marcador: string): string {
  const i = src.indexOf(marcador);
  if (i < 0) throw new Error(`no encuentro «${marcador}»: la función cambió de nombre o de sitio y el guardia está ciego`);
  const abreParametros = i + marcador.length - 1;
  const parametros = emparejado(src, abreParametros, "(", ")");
  let j = abreParametros + parametros.length;
  let angulo = 0;
  for (; j < src.length; j++) {
    const c = src[j]!;
    if (c === "<") angulo++;
    else if (c === ">") angulo--;
    else if (c === "{" && angulo === 0) break;
  }
  if (j >= src.length) throw new Error(`«${marcador}» no tiene cuerpo: el guardia está ciego`);
  return emparejado(src, j, "{", "}");
}

/** Lo que hay entre los paréntesis de la llamada que empieza en `marcador`, que termina en su `(`. */
function llamada(src: string, marcador: string): string {
  const i = src.indexOf(marcador);
  if (i < 0) throw new Error(`no encuentro la llamada «${marcador}»: el guardia está ciego`);
  return emparejado(src, i + marcador.length - 1, "(", ")");
}

/** Los campos de una interfaz exportada, con la sangría de dos espacios que tiene el archivo. */
function camposDeInterfaz(src: string, nombre: string): string[] {
  const i = src.indexOf(`export interface ${nombre} {`);
  if (i < 0) throw new Error(`no encuentro la interfaz ${nombre}`);
  const cuerpo = emparejado(src, src.indexOf("{", i), "{", "}");
  return [...cuerpo.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1]!);
}

const conDosPuntos = (campo: string) => new RegExp(`\\b${campo}:`);
const citadoComoCadena = (campo: string) => new RegExp(`["'\`]${campo}["'\`]`);
/** `adiciones[${i}][cantidad]`: el campo de una fila de una colección, tal como lo escribe el formulario y lo lee la acción. */
const comoFila = (coleccion: string, campo: string) => new RegExp(`${coleccion}\\[\\$\\{\\w+\\}\\]\\[${campo}\\]`);
const faltan = (lista: readonly string[], esta: (campo: string) => boolean) => lista.filter((c) => !esta(c));

/** Los campos de `PasoEditable` y de sus tres colecciones, leídos de `lib/recetas/pasos.ts`. */
function analisis() {
  const pasos = sinComentariosDe(SERVICIO_DE_PASOS);
  const campos = camposDeInterfaz(pasos, "PasoEditable");
  const colecciones = {
    adiciones: camposDeInterfaz(pasos, "AdicionDelPaso"),
    fines: camposDeInterfaz(pasos, "FinDelPaso"),
    metas: camposDeInterfaz(pasos, "MetaDelPaso"),
  };
  const aparte = new Set<string>([...Object.keys(colecciones), "capacidadesRequeridas"]);
  return { pasos, campos, colecciones, escalares: campos.filter((c) => !aparte.has(c)) };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Los campos del paso
// ---------------------------------------------------------------------------------------------------------------------------

describe("un campo del paso llega por todas las puertas que lo escriben", () => {
  /** **El control positivo del propio análisis.** Si el parseo se rompe, cae aquí y no en un vacío. */
  it("el análisis encuentra los campos que se sabe que existen", () => {
    const { campos, colecciones, escalares } = analisis();
    expect(campos.length, `parseó ${campos.length} campos: ${campos.join(", ")}`).toBeGreaterThanOrEqual(20);
    for (const esperado of ["stepTypeValueId", "horasSugeridas", "volteoCadaHoras", "mucilagoObjetivo", "reglaDeFin", "adiciones", "fines", "metas", "capacidadesRequeridas"]) {
      expect(campos, `falta ${esperado} — el parseo está ciego`).toContain(esperado);
    }
    expect(escalares.length).toBeGreaterThanOrEqual(18);
    expect(colecciones.adiciones).toEqual(expect.arrayContaining(["categoriaValueId", "cantidad", "unidad", "momento"]));
    expect(colecciones.fines).toEqual(expect.arrayContaining(["variable", "operador", "valor", "unidad", "desdeLecturaId"]));
    expect(colecciones.metas).toEqual(expect.arrayContaining(["variable", "moment", "unit", "targetValue", "minValue", "maxValue", "note", "everyHours"]));
  });

  it("`completar` nombra cada campo del paso", () => {
    const { pasos, campos } = analisis();
    const bloque = cuerpoDeFuncion(pasos, "function completar(");
    const sin = faltan(campos, (c) => conDosPuntos(c).test(bloque));
    expect(sin, `completar no nombra: ${sin.join(", ")}`).toEqual([]);
  });

  it("`columnas` y `escribirHijos` escriben cada campo, y cada hija con todos los suyos", () => {
    const { pasos, escalares, colecciones } = analisis();
    const columnas = cuerpoDeFuncion(pasos, "function columnas(");
    const sinColumna = faltan(escalares, (c) => conDosPuntos(c).test(columnas));
    expect(sinColumna, `columnas no escribe: ${sinColumna.join(", ")}`).toEqual([]);

    const hijos = cuerpoDeFuncion(pasos, "function escribirHijos(");
    const hijas: [string, string, readonly string[]][] = [
      ["adiciones", "processRecipeStepAddition.createMany(", colecciones.adiciones],
      ["fines", "processRecipeStepEnd.createMany(", colecciones.fines],
      ["metas", "processTarget.createMany(", colecciones.metas],
    ];
    for (const [coleccion, marcador, subcampos] of hijas) {
      expect(new RegExp(`\\bpaso\\.${coleccion}\\b`).test(hijos), `escribirHijos no lee paso.${coleccion}`).toBe(true);
      const bloque = llamada(hijos, marcador);
      const sin = faltan(subcampos, (c) => conDosPuntos(c).test(bloque));
      expect(sin, `escribirHijos no escribe ${coleccion}[…]: ${sin.join(", ")}`).toEqual([]);
    }
    expect(/\bpaso\.capacidadesRequeridas\b/.test(hijos), "escribirHijos no lee paso.capacidadesRequeridas").toBe(true);
    expect(/processRecipeStepRequirement\.createMany\(/.test(hijos), "escribirHijos no escribe los requisitos").toBe(true);
  });

  it("`leerPasos` devuelve cada campo, y cada colección con todos los suyos", () => {
    const { pasos, campos, colecciones } = analisis();
    const bloque = cuerpoDeFuncion(pasos, "function leerPasos(");
    const sin = faltan(campos, (c) => conDosPuntos(c).test(bloque));
    expect(sin, `leerPasos no devuelve: ${sin.join(", ")}`).toEqual([]);

    // Cada colección ocupa el tramo entre su clave y la siguiente: así «unidad» de las adiciones no cubre la de los fines.
    const posiciones = ["adiciones", "fines", "capacidadesRequeridas", "metas"].map((c) => bloque.search(conDosPuntos(c)));
    expect(
      posiciones.every((p, i) => p >= 0 && (i === 0 || p > posiciones[i - 1]!)),
      `el orden de las colecciones en leerPasos cambió (posiciones ${posiciones.join(", ")}): el guardia está ciego`,
    ).toBe(true);
    const [iAdiciones, iFines, iCapacidades, iMetas] = posiciones as [number, number, number, number];
    const tramos: [string, string, readonly string[]][] = [
      ["adiciones", bloque.slice(iAdiciones, iFines), colecciones.adiciones],
      ["fines", bloque.slice(iFines, iCapacidades), colecciones.fines],
      ["metas", bloque.slice(iMetas), colecciones.metas],
    ];
    for (const [coleccion, tramo, subcampos] of tramos) {
      const faltantes = faltan(subcampos, (c) => conDosPuntos(c).test(tramo));
      expect(faltantes, `leerPasos no devuelve ${coleccion}[…]: ${faltantes.join(", ")}`).toEqual([]);
    }
  });

  it("el lector del formulario lee cada campo, y cada fila con todos sus campos", () => {
    const { colecciones, escalares } = analisis();
    const lector = sinComentariosDe(LECTOR_DEL_FORMULARIO);
    const sin = faltan([...escalares, "capacidadesRequeridas"], (c) => citadoComoCadena(c).test(lector));
    expect(sin, `${LECTOR_DEL_FORMULARIO} no lee: ${sin.join(", ")}`).toEqual([]);
    for (const [coleccion, subcampos] of Object.entries(colecciones)) {
      const faltantes = faltan(subcampos, (c) => comoFila(coleccion, c).test(lector));
      expect(faltantes, `${LECTOR_DEL_FORMULARIO} no lee ${coleccion}[i][…]: ${faltantes.join(", ")}`).toEqual([]);
    }
  });

  it("lo que el formulario precarga (`PasoInicial`) tiene todos los campos de `PasoEditable`, y `valoresDelFormulario` los devuelve", () => {
    const { campos } = analisis();
    const lector = sinComentariosDe(LECTOR_DEL_FORMULARIO);
    const inicial = camposDeInterfaz(lector, "PasoInicial");
    const sinCampo = faltan(campos, (c) => inicial.includes(c));
    expect(sinCampo, `PasoInicial no tiene: ${sinCampo.join(", ")}`).toEqual([]);
    const bloque = cuerpoDeFuncion(lector, "function valoresDelFormulario(");
    const sinValor = faltan(campos, (c) => conDosPuntos(c).test(bloque));
    expect(sinValor, `valoresDelFormulario no devuelve: ${sinValor.join(", ")}`).toEqual([]);
  });

  it("el formulario manda cada campo, PRECARGA cada uno y manda cada fila con todos sus campos", () => {
    const { campos, colecciones, escalares } = analisis();
    const formulario = sinComentariosDe(FORMULARIO_DEL_PASO);
    const sinNombre = faltan([...escalares, "capacidadesRequeridas"], (c) => citadoComoCadena(c).test(formulario));
    expect(sinNombre, `${FORMULARIO_DEL_PASO} no manda: ${sinNombre.join(", ")}`).toEqual([]);
    // Editar no puede perder datos: un campo que el formulario manda pero no precarga se borra al guardar sin tocarlo.
    const sinPrecarga = faltan(campos, (c) => new RegExp(`\\binicial\\.${c}\\b`).test(formulario));
    expect(sinPrecarga, `${FORMULARIO_DEL_PASO} no precarga (inicial.<campo>): ${sinPrecarga.join(", ")}`).toEqual([]);
    for (const [coleccion, subcampos] of Object.entries(colecciones)) {
      const faltantes = faltan(subcampos, (c) => comoFila(coleccion, c).test(formulario));
      expect(faltantes, `${FORMULARIO_DEL_PASO} no manda ${coleccion}[i][…]: ${faltantes.join(", ")}`).toEqual([]);
    }
  });

  it("la copia a la versión siguiente copia la fila ENTERA de cada paso, no campo a campo", () => {
    // Si la copia nombrara las columnas una por una, una columna nueva se perdería en la versión siguiente sin que nada lo dijera: el defecto
    // del 2026-09-13 con los pasos por delante. `...sinClaves(fila, [...])` copia lo que haya.
    const { escalares } = analisis();
    const bloque = cuerpoDeFuncion(sinComentariosDe(SERVICIO_DE_VERSIONES), "function copiarContenidoDeVersion(");
    const enteras = (bloque.match(/\.\.\.sinClaves\(/g) ?? []).length;
    expect(enteras, `copiarContenidoDeVersion copia ${enteras} colecciones con la fila entera (tienen que ser al menos 5: pasos, adiciones, fines, requisitos y metas)`).toBeGreaterThanOrEqual(5);
    const nombradas = escalares.filter((c) => conDosPuntos(c).test(bloque));
    expect(nombradas, `copiarContenidoDeVersion nombra columnas una a una: ${nombradas.join(", ")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// El servicio sin pantalla: la clase hermana (el ritmo de la cola, la tanda de volteo)
// ---------------------------------------------------------------------------------------------------------------------------

const OPERACIONES = [
  ["crearRecetaEnBorrador", "crearRecetaAction"],
  ["agregarPaso", "agregarPasoAction"],
  ["actualizarPaso", "actualizarPasoAction"],
  ["quitarPaso", "quitarPasoAction"],
  ["moverPaso", "moverPasoAction"],
  ["publicarVersion", "publicarVersionAction"],
  ["nuevaVersionBorrador", "nuevaVersionBorradorAction"],
  ["derivarReceta", "derivarRecetaAction"],
] as const;

describe("cada operación del editor tiene su acción, y cada acción su pantalla", () => {
  const componentes = () =>
    readdirSync(join(RAIZ, COMPONENTES))
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => ({ ruta: `${COMPONENTES}/${f}`, src: sinComentariosDe(`${COMPONENTES}/${f}`) }));

  it("el buscador de componentes ve los archivos (control positivo)", () => {
    const todos = componentes();
    expect(todos.length, "el buscador de componentes está ciego").toBeGreaterThan(30);
    expect(todos.map((c) => c.ruta)).toContain(FORMULARIO_DEL_PASO);
  });

  for (const [servicio, accion] of OPERACIONES) {
    it(`${servicio} tiene su acción (${accion}) y algún componente la usa`, () => {
      const acciones = sinComentariosDe(ACCIONES);
      expect(acciones, `${ACCIONES} no define ${accion}`).toMatch(new RegExp(`export async function ${accion}\\(`));
      expect(acciones, `${accion} no llama a ${servicio}`).toMatch(new RegExp(`await ${servicio}\\(`));
      const importa = new RegExp(`import\\s*\\{[^}]*\\b${accion}\\b[^}]*\\}\\s*from\\s*"[^"]*actions/traceability"`);
      const usos = componentes().filter((c) => importa.test(c.src)).map((c) => c.ruta);
      expect(usos, `${accion} no la importa ningún componente: el editor calcula la operación y nadie la ofrece`).not.toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------------
// La autoría: una sola regla, y cada escritura del editor la alcanza (Ruling A, V16)
// ---------------------------------------------------------------------------------------------------------------------------

/** Dónde vive cada operación y por dónde alcanza `exigeAutoriaDeReceta`: la llama ella o una puerta privada de su archivo que sí la llama. */
const PUERTA_DE_AUTORIA: Record<(typeof OPERACIONES)[number][0], { archivo: string; llama: string }> = {
  crearRecetaEnBorrador: { archivo: SERVICIO_DE_VERSIONES, llama: "exigeAutoriaDeReceta(" },
  nuevaVersionBorrador: { archivo: SERVICIO_DE_VERSIONES, llama: "exigeAutoriaDeReceta(" },
  derivarReceta: { archivo: SERVICIO_DE_VERSIONES, llama: "exigeAutoriaDeReceta(" },
  agregarPaso: { archivo: SERVICIO_DE_PASOS, llama: "versionParaEscribir(" },
  actualizarPaso: { archivo: SERVICIO_DE_PASOS, llama: "pasoParaEscribir(" },
  quitarPaso: { archivo: SERVICIO_DE_PASOS, llama: "pasoParaEscribir(" },
  moverPaso: { archivo: SERVICIO_DE_PASOS, llama: "pasoParaEscribir(" },
  publicarVersion: { archivo: SERVICIO_DE_PASOS, llama: "versionParaEscribir(" },
};

describe("toda escritura del editor pasa por la regla de autoría de recetas", () => {
  it("las dos puertas privadas de `pasos.ts` la llaman, o llegan a la que la llama (control positivo del localizador)", () => {
    const pasos = sinComentariosDe(SERVICIO_DE_PASOS);
    expect(cuerpoDeFuncion(pasos, "async function versionParaEscribir("), "versionParaEscribir ya no llama a exigeAutoriaDeReceta").toContain("await exigeAutoriaDeReceta(");
    expect(cuerpoDeFuncion(pasos, "async function pasoParaEscribir("), "pasoParaEscribir ya no llega a versionParaEscribir").toContain("await versionParaEscribir(");
  });

  for (const [servicio] of OPERACIONES) {
    it(`${servicio} la alcanza`, () => {
      const { archivo, llama } = PUERTA_DE_AUTORIA[servicio];
      const cuerpo = cuerpoDeFuncion(sinComentariosDe(archivo), `export async function ${servicio}(`);
      expect(cuerpo, `${servicio} (${archivo}) no llama a ${llama}: queda abierta a quien tenga edit_beneficio y no al Coffee Process Manager`).toContain(`await ${llama}`);
    });
  }
});
