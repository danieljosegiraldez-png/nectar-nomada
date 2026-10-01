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
  "mode", // { campo: { mode: "insensitive" } }: cambia cómo se compara, no restringe nada
]);

/**
 * ¿Tiene el filtro alguna RESTRICCIÓN POSITIVA con valor definido, a cualquier profundidad? Es la guarda de
 * `borrarProcesosDeLotesDonde` (`procesoDePrueba.ts`). Vive en este módulo, sin importar la base ni Prisma,
 * para probarla DIRECTAMENTE con entradas hostiles (`tieneCondicion.test.ts`) también en el carril hermético
 * de CI, donde no hay base.
 *
 * **Sólo cuenta lo que restringe en positivo.** Nada que cuelgue de `NOT`, `not`, `notIn`, `isNot` o `none`
 * cuenta por sí solo: negar una condición casa con casi todo, venga con valores o vacía. Medido el 2026-10-01 en
 * `nectar_test_recetas` (104 lotes, sólo `count`; `.superpowers/sdd/…/out/r3-formas-negativas.txt`): casan con
 * TODOS los lotes `{ id: { notIn: [] } }`, `{ id: { notIn: ['x'] } }`, `{ NOT: { id: { in: [] } } }`,
 * `{ NOT: { id: 'x' } }`, `{ id: { not: { in: [] } } }`, `{ id: { not: 'x' } }`, `{ organization: { isNot: … } }`
 * y `{ measurements: { none: … } }`; y también un modificador solo, `{ lotCode: { mode: 'insensitive' } }`.
 * Un filtro cuyas únicas condiciones son esas se rechaza; uno con al menos UNA positiva y además negaciones
 * sí vale (`{ id: { in: ['x'] }, NOT: { lotCode: 'y' } }`: lo positivo estrecha, lo negado sólo recorta).
 *
 * Y tampoco cuentan las formas vacías. Medido el mismo día: casan con TODOS `{}`, `{ id: {} }`,
 * `{ id: undefined }`, `{ AND: [] }`, `{ NOT: [] }`, `{ AND: [{}] }`, `{ AND: {} }`, `{ NOT: {} }` y
 * `{ NOT: [{}] }`; no casan con ninguno `{ OR: [] }`, `{ OR: [{}] }` e `{ id: { in: [] } }`. Ninguna de las
 * del primer grupo cuenta como condición, ni las de `OR`, que no borrarían nada pero se rechazan por
 * conservadoras.
 *
 * **Una lista significa dos cosas, según la clave que la lleve.** Bajo `AND`/`OR` es una lista de FILTROS:
 * cuenta si alguno tiene condición, y una lista vacía no tiene ninguna (`[].every(...)` daría `true` y dejaba
 * pasar `{ AND: [] }`: así falló la ronda 1). Bajo cualquier otra clave (`in`, `hasSome`…) es una lista de
 * VALORES: aunque esté vacía SÍ es una condición, porque `in: []` no casa con nada, y es lo que queda en el
 * `afterAll` cuando el `beforeAll` no llegó a crear ningún lote.
 *
 * **No mide cuánto estrecha un filtro, sólo que haya una restricción positiva.** Un valor que casa con todo
 * cuenta como condición: `{ lotCode: { contains: '' } }` casa con 104 de 104 y pasa esta guarda. Y una clave
 * de campo que se llamara como una de las negaciones (`mode`, `none`…) se rechazaría de más: es el lado seguro.
 */
export function tieneCondicion(w: unknown): boolean {
  if (w === undefined) return false;
  if (esHoja(w)) return true;
  if (Array.isArray(w)) return w.every(esValor) || w.some(tieneCondicion);
  return Object.entries(w as Record<string, unknown>).some(([clave, v]) => {
    if (NO_RESTRINGEN.has(clave)) return false;
    return LISTAS_DE_FILTROS.has(clave) && Array.isArray(v) ? v.some(tieneCondicion) : tieneCondicion(v);
  });
}
