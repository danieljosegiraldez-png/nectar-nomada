/**
 * Los catálogos de la receta con pasos están SEMBRADOS, no sólo declarados (Parte 2a, tarea 2).
 *
 * Un catálogo llega a la base SÓLO por la semilla (`seedVariableCatalogs`, `prisma/seed.ts:89`), nunca
 * por migración: en producción la corre `scripts/vercel-build.sh` después de `migrate deploy`; en CI,
 * `scripts/ci-con-base.sh` antes de las pruebas. En local, la base propia de la 2a se resiembra con
 * `npm run db:seed` —con `DATABASE_URL` apuntando a ELLA— antes de correr esto. Es lo que ninguna lectura
 * del código puede afirmar; el patrón es `tests/apiary/origenDeColonia.test.ts`.
 *
 * Sólo LEE: no crea filas, así que no hay limpieza. Grupo `base-sembrada`.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { VARIABLE_CATALOGS } from "../../lib/research/catalogs";

const declarados = (clave: string) => VARIABLE_CATALOGS.find((c) => c.key === clave)?.values ?? [];

function sembrados(clave: string) {
  return prisma.variableCatalogValue.findMany({
    where: { catalog: { key: clave } },
    select: { value: true, definition: true, displayOrder: true, aliasOfId: true },
  });
}

describe("el vocabulario de la receta con pasos está sembrado, no sólo declarado", () => {
  it.each(["tipo_paso", "fisico", "capacidad", "estado_cereza", "fuente_microbiana", "grado_proceso", "sustrato_anadido"])(
    "«%s»: cada valor declarado está sembrado, en su posición y con su definición",
    async (clave) => {
      const declarado = declarados(clave);
      expect(declarado.length, `${clave} no está declarado en lib/research/catalogs.ts`).toBeGreaterThan(0);
      const porValor = new Map((await sembrados(clave)).map((v) => [v.value, v]));
      // Se recorre lo DECLARADO, no la tabla: una base restaurada de producción puede traer valores añadidos
      // en ejecución (`addVariableCatalogValue`) que no viven en el archivo.
      const mal = declarado.flatMap((v, i) => {
        const fila = porValor.get(v.value);
        if (!fila) return [`${v.value}: no está sembrado`];
        if (fila.displayOrder !== i) return [`${v.value}: posición ${fila.displayOrder}, declarada ${i}`];
        if (fila.definition !== (v.definition ?? null)) return [`${v.value}: su definición no es la declarada`];
        return [];
      });
      expect(mal, "¿se corrió `npm run db:seed` contra esta base?").toEqual([]);
    },
  );

  it.each(["tipo_paso", "fisico", "capacidad"])(
    "«%s» es nuevo y sólo la semilla le escribe: lo sembrado es exactamente lo declarado, sin alias",
    async (clave) => {
      const declarado = declarados(clave).map((v) => v.value);
      expect(declarado.length, `${clave} no está declarado`).toBeGreaterThan(0);
      const sembrado = await sembrados(clave);
      expect(sembrado.map((v) => v.value).sort()).toEqual([...declarado].sort());
      expect(sembrado.filter((v) => v.aliasOfId !== null).map((v) => v.value)).toEqual([]);
    },
  );
});
