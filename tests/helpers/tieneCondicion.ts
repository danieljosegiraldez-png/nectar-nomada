const esHoja = (v: unknown) => v === null || typeof v !== "object" || v instanceof Date;
const esValor = (v: unknown) => v !== undefined && esHoja(v);

/** Las claves cuya lista es una lista de FILTROS (cada elemento es un filtro completo). */
const LISTAS_DE_FILTROS = new Set(["AND", "OR"]);

/**
 * Las claves cuyo contenido NO es una restricción positiva: lo que cuelgue de ellas no cuenta.
 * Una línea por clave, con la forma que niega, para que quitar una se vea y se pueda probar sola.
 */
const NO_RESTRINGEN = new Set([
  "NOT", // { NOT: filtro } y { NOT: [filtros] }
  "not", // { campo: { not: valor | filtro } }
  "notIn", // { campo: { notIn: [valores] } }
  "isNot", // { relación: { isNot: filtro } }
  "none", // { relación: { none: filtro } }
  "every", // { relación: { every: filtro } }: cuantificador vacuo, una relación SIN filas lo cumple
  "mode", // { campo: { mode: "insensitive" } }: cambia cómo se compara, no restringe nada
]);

/**
 * ¿Tiene el filtro una RESTRICCIÓN POSITIVA con un valor no vacío, por la que tenga que pasar todo lo que case? Es
 * la guarda de `borrarProcesosDeLotesDonde` (`procesoDePrueba.ts`). Vive en este módulo, sin importar la base ni
 * Prisma, para probarla DIRECTAMENTE con entradas hostiles (`tieneCondicion.test.ts`) también en el carril
 * hermético de CI, donde no hay base.
 *
 * **Lo que mide, y su límite.** Mide la ESTRUCTURA del filtro, no cuánto estrecha un valor. Un valor no vacío que
 * casa con casi todo pasa: medido el 2026-10-01 en `nectar_test_recetas` (104 lotes, sólo `count`; todas las
 * cifras de aquí están en `.superpowers/sdd/…/out/r2-formas-vacias.txt`, `r3-formas-negativas.txt` y
 * `r4-formas.txt`), `{ lotCode: { contains: '-' } }` casa con 101, y
 * `{ createdAt: { gte: new Date(0) } }` y `{ classification: 'internal' }` con los 104, y los tres cuentan aquí
 * como condición. Ninguna guarda estructural puede verlo: haría falta saber qué hay en la base. Tampoco se midieron
 * los operadores de listas escalares ni de Json (`has…`, `isEmpty`, `path`…): `Lot` no tiene campos así.
 *
 * **Cómo se combinan las ramas.** Las claves de un objeto y la lista de `AND` son una INTERSECCIÓN: basta UNA
 * rama que estreche, y lo negado a su lado sólo recorta más (`{ id: { in: ['x'] }, NOT: { lotCode: 'y' } }`
 * vale). `OR` es una UNIÓN: casa con lo que case CUALQUIERA de sus ramas, así que tienen que estrechar TODAS, y
 * una lista vacía no estrecha. Medido: `{ OR: [{ id: { in: [real] } }, { NOT: { id: ninguno } }] }`,
 * `{ OR: [{ id: { in: [] } }, { id: { notIn: [] } }] }` y `{ OR: [{ id: { in: [real] } }, { lotProcesses:
 * { every: … } }] }` casan con los 104. Con una rama `{}` o `{ AND: [] }` el OR casa con 1, sólo lo de la rama
 * real, y `{ OR: [] }` y `{ OR: [{}] }` con 0; esas ramas no estrechan y se rechazan igual, por conservadoras.
 *
 * **Lo que no cuenta, por la clave que lo lleva** (`NO_RESTRINGEN`): `NOT`, `not`, `notIn`, `isNot` y `none`
 * niegan; `every` es vacuo; `mode` sólo modifica. Medido: casan con los 104 `{ id: { notIn: [] } }`,
 * `{ id: { notIn: ['x'] } }`, `{ NOT: { id: { in: [] } } }`, `{ NOT: { id: 'x' } }`, `{ id: { not: { in: [] } } }`,
 * `{ id: { not: 'x' } }`, `{ organization: { isNot: … } }`, `{ measurements: { none: … } }`,
 * `{ lotProcesses: { every: … } }` (con 0 procesos en la base) y `{ lotCode: { mode: 'insensitive' } }`; y
 * `{ measurements: { every: … } }` con 94 (los lotes sin mediciones). `some` e `is` sí cuentan:
 * `{ measurements: { some: { id: ninguno } } }` casa con 0.
 *
 * **Lo que no cuenta, por estar vacío:** `undefined`, `null`, `''`, `{}` y las listas de filtros vacías. Medido:
 * casan con los 104 `{}`, `{ id: {} }`, `{ id: undefined }`, `{ AND: [] }`, `{ NOT: [] }`, `{ AND: [{}] }`,
 * `{ AND: {} }`, `{ NOT: {} }` y `{ NOT: [{}] }`; con `''`, `contains`, `startsWith`, `endsWith` (también con
 * `mode`), `gte` y `gt`; y con `null`, `{ releasedAt: null }` y `{ greenGradeNote: { equals: null } }`. Otras
 * formas vacías casan con pocos y se rechazan igual, por conservadoras: `{ lotCode: '' }`, `equals: ''`,
 * `lt: ''` y `lte: ''` casan con 0, y `{ projectId: null }` y `{ project: { is: null } }` con 3.
 *
 * **La excepción: una lista de VALORES vacía SÍ es una condición.** Bajo cualquier clave que no sea `AND`/`OR`
 * (`in`…) la lista es de valores, y `in: []` no casa con nada (medido: 0). Es lo que queda en el `afterAll` cuando
 * el `beforeAll` no llegó a crear ningún lote: si se rechazara, esa limpieza lanzaría y abandonaría el resto.
 *
 * Una clave de CAMPO que se llamara como una de `NO_RESTRINGEN` se rechazaría de más: es el lado seguro, y ningún
 * campo de `Lot` se llama así.
 */
export function tieneCondicion(w: unknown): boolean {
  if (w === undefined || w === null || w === "") return false;
  if (esHoja(w)) return true;
  if (Array.isArray(w)) return w.every(esValor) || w.some(tieneCondicion);
  return Object.entries(w as Record<string, unknown>).some(([clave, v]) => {
    if (NO_RESTRINGEN.has(clave)) return false;
    if (!LISTAS_DE_FILTROS.has(clave) || !Array.isArray(v)) return tieneCondicion(v);
    return clave === "OR" ? v.length > 0 && v.every(tieneCondicion) : v.some(tieneCondicion);
  });
}
