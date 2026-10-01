import type { PlotInterventionTarget } from "../../generated/prisma/client";

/**
 * Las plagas y enfermedades que una intervención puede tener por objetivo, y —desde el 2026-09-30—
 * también las que un producto fitosanitario declara cubrir.
 *
 * **Vive aquí y no en el formulario porque ahora la usan dos sitios.** Estaba como `TARGETS` dentro
 * de `IntervencionForm.tsx`, que es un componente de cliente; el alta de producto la necesita desde
 * una acción de servidor, y importarla de allí habría arrastrado el módulo del cliente. Dos listas
 * en dos archivos habrían derivado: el día que se añada una plaga, una la tendría y la otra no, y
 * nada lo diría — la intervención podría apuntar a algo que ningún producto puede declarar.
 *
 * **La lista es de Daniel** (spec §2.5). Crecerla es una migración de una línea, y `lib/…/plagas`
 * y el enum de Prisma tienen que crecer juntos: lo exige `tests/traceability/plagas.test.ts`.
 *
 * El orden es el de la pantalla, no el del enum.
 */
export const PLAGAS: readonly PlotInterventionTarget[] = [
  "arana_roja",
  "broca",
  "minador_hoja",
  "cochinillas",
  "nematodos",
  "jobotos",
  "roya",
  "ojo_de_gallo",
  "mancha_de_hierro",
  "antracnosis",
  "llaga_macana",
  "chasparria",
  "otro",
];

/** ¿Es una de las plagas declaradas? Para no aceptar cualquier cadena que llegue de un formulario. */
export function esPlaga(valor: unknown): valor is PlotInterventionTarget {
  return typeof valor === "string" && (PLAGAS as readonly string[]).includes(valor);
}
