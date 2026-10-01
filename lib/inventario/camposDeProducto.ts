/**
 * Qué se pregunta de un PRODUCTO, y cuáles según su clase.
 *
 * **Vive en un módulo puro porque lo usan los dos lados.** Estaba dos veces: en
 * `lib/inventario/recepcion.ts`, que es de servidor, y copiado a mano en
 * `app/components/inventario/RecibirMedicamentoForm.tsx`, que es de cliente y no puede importar
 * aquel. El comentario de la copia lo decía —«Copia de `camposDe`»— y eso es una deriva esperando:
 * el día que se añada un campo, uno de los dos lo tendría. Pasó el 2026-09-30 al añadir la dosis.
 *
 * Aquí no hay imports de servidor, así que los dos pueden depender de esto.
 */

/** Los campos del producto. El orden es el de la pantalla. */
export const CAMPOS_DEL_PRODUCTO = [
  "manufacturer",
  "activeIngredient",
  "sanitaryRegistration",
  "defaultWithdrawalDays",
  "avisarDiasAntes",
  "storageConditions",
  "safetyNotes",
  "defaultReentryHours",
  // **Sólo para fitosanitarios.** Decisión de Daniel, 2026-09-30: qué hace el producto y a qué
  // dosis son del PRODUCTO y no de cada aplicación, así que se escriben una vez.
  "plantProtectionUse",
  "doseMin",
  "doseMax",
  "doseUnit",
  "harmfulToPollinators",
] as const;

export type CampoDelProducto = (typeof CAMPOS_DEL_PRODUCTO)[number];

/** Medicamento de botiquín o producto de manejo fitosanitario. */
export type ClaseDeProducto = "medicamento" | "fitosanitario";

/**
 * Los que se escriben como número **entero**: días y horas. Cero es una respuesta válida —«sin
 * carencia»— y un negativo no.
 */
export const CAMPOS_ENTEROS: ReadonlySet<CampoDelProducto> = new Set([
  "defaultWithdrawalDays",
  "avisarDiasAntes",
  "defaultReentryHours",
]);

/**
 * Los que admiten **decimales**, y ésa es toda la razón de que esta distinción exista: una dosis
 * típica es «1,5 L/ha». Están en `Decimal(12,4)`. Contarlos como enteros —que es lo que había
 * hasta que se separaron las dos listas— rechaza en silencio la mitad de las dosis reales.
 */
export const CAMPOS_DECIMALES: ReadonlySet<CampoDelProducto> = new Set(["doseMin", "doseMax"]);

/** Los que se escriben como número, de cualquiera de las dos clases. Para la pantalla. */
export const CAMPOS_NUMERICOS: ReadonlySet<CampoDelProducto> = new Set([...CAMPOS_ENTEROS, ...CAMPOS_DECIMALES]);

/** Los que piden más de una línea. */
export const CAMPOS_LARGOS: ReadonlySet<CampoDelProducto> = new Set(["storageConditions", "safetyNotes"]);

/** El que se elige de una lista cerrada en vez de escribirse. */
export const CAMPOS_DE_OPCIONES: ReadonlySet<CampoDelProducto> = new Set(["plantProtectionUse", "harmfulToPollinators"]);

/**
 * Qué valores acepta cada uno de esos campos. **Es la única fuente**: la pantalla pinta de aquí y
 * el servicio valida contra esto, así que no pueden derivar. Tiene que casar con el enum
 * `PlantProtectionUse` de Prisma, y lo comprueba `tests/inventario/camposDeProducto.test.ts`.
 */
export const VALORES_DE_OPCIONES: Readonly<Partial<Record<CampoDelProducto, readonly string[]>>> = {
  plantProtectionUse: ["preventivo", "control"],
  // **Tres valores y no un sí/no.** Dejar sin responder tiene que ser distinguible de «no daña»:
  // lo primero es un hueco, lo segundo una afirmación sobre un producto real. El aviso sólo salta
  // con `si`, así que un hueco nunca produce ruido.
  harmfulToPollinators: ["si", "no"],
};

/**
 * Los que no significan nada para un medicamento de colmena: la reentrada al lote tratado, y todo
 * lo que describe un producto fitosanitario.
 */
const SOLO_FITOSANITARIO: ReadonlySet<CampoDelProducto> = new Set([
  "defaultReentryHours",
  "plantProtectionUse",
  "doseMin",
  "doseMax",
  "doseUnit",
  "harmfulToPollinators",
]);

/** Qué campos se piden según la clase del producto. */
export function camposDe(clase: ClaseDeProducto): readonly CampoDelProducto[] {
  return clase === "fitosanitario" ? CAMPOS_DEL_PRODUCTO : CAMPOS_DEL_PRODUCTO.filter((c) => !SOLO_FITOSANITARIO.has(c));
}
