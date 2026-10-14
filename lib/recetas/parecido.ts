/**
 * El parecido de una receta Libre con las publicadas — Parte 2a, tarea 10 (diseño §5.2, 2026-10-03).
 *
 * **Puro, a propósito.** No importa Prisma ni nada que toque la base (sólo un TIPO de `./vocabulario`), para que su prueba sea
 * hermética y para que la pregunta «¿qué hace a dos secuencias la misma?» tenga UN sitio, que lo mismo leen la pregunta de la
 * pantalla (`parecidoDeLaLibre`) y la creación de la Libre (`crearRecetaLibreEnTx`). Quien lo usa está en `./libre`.
 *
 * **La identidad de un paso** es su tipo y cada eje que dice QUÉ se hace con el café: el estado del fruto, el mucílago objetivo
 * (lo que QUEDA: 0 = Lavado, 100 = Honey; Ruling M), el oxígeno, la temperatura (el manejo y su rango), la fuente microbiana, el
 * medio, lo físico y el modo de secado; y sus adiciones, por categoría y momento. **No son identidad** las horas, el volteo, la
 * banda de humedad, la intención, `opcional`, los fines, las metas, los requisitos de capacidad ni la cantidad y la unidad de
 * una adición: son la afinación de una receta que sigue siendo la misma. **Dos secuencias coinciden si son IGUALES en esto**, en
 * el mismo orden y con el mismo número de pasos: un eje que una declara y la otra no las distingue (decisión de la tarea 10, con
 * su porqué: no se marca casi toda Libre).
 *
 * **Y los dos topes de lo que una Libre acepta** (revisión del 2026-10-05, R6 y R8): `MAX_PASOS_PLANEADOS` —cuántos pasos planeados
 * entran: lo lee la pantalla de abrir (`libreDelFormulario`, tarea 13, que lo re-exporta) y lo hace cumplir `validarPasosPlaneados`, con
 * UN solo número— y `MAX_INTENCION_EN_EL_NOMBRE` —cuánto de la intención va en el nombre—. Viven aquí y no en `pasos.ts` porque este
 * módulo es puro: un componente de cliente puede importarlos sin arrastrar Prisma.
 *
 * **Es inferencia de la casa, no del paquete «farm-to-green v2»** (regla 13 del plan): el paquete no define cuándo dos recetas
 * son la misma. Si Daniel corrige la regla, se cambia aquí y en `tests/recetas/parecido.test.ts`; ninguna migración depende de esto.
 */
import type { EjeDelPaso } from "./vocabulario";

/**
 * Cuántos pasos planeados admite una Libre al abrir (R6). **Un solo número, dos lectores:** la pantalla de abrir lee a lo sumo tantas
 * filas (`libreDelFormulario`, tarea 13: re-exporta ésta, no declara otra) y el servicio (`validarPasosPlaneados`) rechaza más con
 * `libre_demasiados_pasos` antes de tocar la base. El 100 es el que la pantalla ya tenía. `tests/arquitectura/pasos-planeados-un-solo-camino.test.ts`
 * impide que haya una segunda declaración.
 */
export const MAX_PASOS_PLANEADOS = 100;

/**
 * Cuántos caracteres de la intención entran en el NOMBRE de la Libre, la elipsis incluida (R8). El nombre va a
 * `@@unique([organizationId, name])`, un índice btree que rechaza una entrada de unos 2,7 KB con un error que no es un `P2002`; la
 * intención entera vive en `description`, sin tope.
 */
export const MAX_INTENCION_EN_EL_NOMBRE = 120;

/**
 * Lo mínimo de un paso para compararlo. `PasoEditable` (lo que escribe quien arma la Libre) y lo que se lee de un paso
 * publicado lo cumplen sin conversión: los campos se llaman igual. El modo de secado va como texto: aquí no importa de qué enum.
 */
export interface PasoParaComparar {
  stepTypeValueId: string;
  estadoFrutoValueId?: string | null;
  mucilagoObjetivo?: number | null;
  oxigenoValueId?: string | null;
  temperaturaValueId?: string | null;
  temperaturaMinC?: number | null;
  temperaturaMaxC?: number | null;
  fuenteMicrobianaValueId?: string | null;
  medioValueId?: string | null;
  fisicoValueId?: string | null;
  modoSecado?: string | null;
  adiciones?: readonly { categoriaValueId: string; momento: string }[];
}

type ColumnaDeIdentidad = Exclude<keyof PasoParaComparar, "stepTypeValueId" | "adiciones">;

/**
 * Las columnas de identidad de cada eje. **El tipo es TOTAL sobre `EjeDelPaso`**: un eje nuevo en `vocabulario.ts` no compila
 * hasta que se diga aquí qué columnas lo guardan, en vez de quedar fuera de la huella en silencio (la lección de «un tipo que no
 * compila es mejor guardia que un test que hay que acordarse de mirar»). Las adiciones no son una columna del paso, sino filas
 * hijas: se comparan aparte, abajo.
 */
export const COLUMNAS_DEL_EJE = {
  estadoFruto: ["estadoFrutoValueId"],
  mucilagoObjetivo: ["mucilagoObjetivo"],
  oxigeno: ["oxigenoValueId"],
  temperatura: ["temperaturaValueId", "temperaturaMinC", "temperaturaMaxC"],
  fuenteMicrobiana: ["fuenteMicrobianaValueId"],
  medio: ["medioValueId"],
  fisico: ["fisicoValueId"],
  modoSecado: ["modoSecado"],
  adiciones: [],
} as const satisfies Record<EjeDelPaso, readonly ColumnaDeIdentidad[]>;

const COLUMNAS: readonly ColumnaDeIdentidad[] = (Object.values(COLUMNAS_DEL_EJE) as readonly (readonly ColumnaDeIdentidad[])[]).flatMap(
  (c) => [...c],
);

/**
 * `undefined` y `null` son «no se declaró»: lo mismo. **El 0 SÍ es un valor**: es el mucílago de un Lavado, y compararlo con `||`
 * lo confundiría con «no se declaró». Un número ya llega como número (un `Decimal` se convierte antes de comparar).
 */
function valor(v: string | number | null | undefined): string | number | null {
  return v === undefined ? null : v;
}

/**
 * La huella de una secuencia de pasos: un texto que es igual para dos secuencias que coinciden y distinto si no. Cada paso
 * aporta su tipo, sus columnas de identidad en un orden fijo y sus adiciones (`categoría|momento`, ordenadas: el orden en que se
 * escribieron no es identidad).
 */
export function huellaDeLaSecuencia(pasos: readonly PasoParaComparar[]): string {
  return JSON.stringify(
    pasos.map((p) => [
      p.stepTypeValueId,
      ...COLUMNAS.map((c) => valor(p[c])),
      (p.adiciones ?? []).map((a) => `${a.categoriaValueId}|${a.momento}`).sort(),
    ]),
  );
}

/**
 * El nombre de la receta Libre: «Libre — <intención> — <código del lote> <AAAA-MM-DD>» (registro del plan, 2026-10-03).
 *
 * La marca de una Libre es la columna `esLibre`, no este nombre: una receta propia que se llame «Libre» a secas no se
 * confunde con ella ni choca con ningún nombre generado. El código del lote es único dentro de la organización
 * (`@@unique([organizationId, lotCode])`), así que dos Libres de lotes distintos nunca se llaman igual; sólo repetir la misma
 * intención sobre el mismo lote el mismo día lo repite, y eso lo dice `libre_repetida`. La fecha es la del inicio del proceso, en
 * UTC: es una etiqueta, no un dato de la finca. La intención va en una sola línea (los espacios y los saltos se juntan) y **recortada a
 * `MAX_INTENCION_EN_EL_NOMBRE` caracteres con «…»** (R8, 2026-10-05): es texto libre del operario, el nombre es lo único suyo que va a un
 * índice btree, y una intención de varios KB lo reventaría con un error que no es un `P2002` y saldría como un 500. El recorte es por
 * PUNTOS DE CÓDIGO, no por unidades de UTF-16: partir un par sustituto deja medio carácter que la base guarda como basura. La
 * `description` de la receta conserva el texto entero. Dos intenciones largas que sólo difieran después del corte, sobre el mismo lote el
 * mismo día, dan el mismo nombre, y eso lo dice `libre_repetida`.
 */
export function nombreDeLaLibre(datos: { intencion: string; lotCode: string; fecha: Date }): string {
  const completa = datos.intencion.replace(/\s+/g, " ").trim();
  const letras = [...completa];
  const intencion = letras.length > MAX_INTENCION_EN_EL_NOMBRE ? `${letras.slice(0, MAX_INTENCION_EN_EL_NOMBRE - 1).join("")}…` : completa;
  return `Libre — ${intencion} — ${datos.lotCode} ${datos.fecha.toISOString().slice(0, 10)}`;
}
