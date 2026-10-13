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

  it("los cuatro alias del paquete están sembrados en sustrato_anadido y apuntan a doble_mosto (registro I7)", async () => {
    const alias = declarados("sustrato_anadido")
      .filter((v) => v.aliasOf !== undefined)
      .map((v) => v.value);
    expect(alias, "los alias no están declarados en lib/research/catalogs.ts").toHaveLength(4);
    const filas = await prisma.variableCatalogValue.findMany({
      where: { catalog: { key: "sustrato_anadido" }, value: { in: [...alias, "doble_mosto"] } },
      select: { id: true, value: true, aliasOfId: true },
    });
    const canonico = filas.find((f) => f.value === "doble_mosto");
    expect(canonico, "doble_mosto no está sembrado").toBeDefined();
    expect(canonico?.aliasOfId, "doble_mosto es el canónico: no apunta a nadie").toBeNull();
    const sembrados = filas.filter((f) => f.value !== "doble_mosto");
    expect(sembrados.map((f) => f.value).sort()).toEqual([...alias].sort());
    expect(sembrados.filter((f) => f.aliasOfId !== canonico?.id).map((f) => f.value)).toEqual([]);
  });

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
