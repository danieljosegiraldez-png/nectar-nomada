/**
 * Las tablas que son catálogo de referencia (spec de catálogos, §2.8).
 *
 * **Una tabla de catálogo que no se registra aquí NO queda protegida** por
 * `tests/arquitectura/catalogos-con-contrato.test.ts`: el guardia lee esta lista.
 * Cada clase nueva (levaduras, especies, varietales…) se añade en su propio PR.
 */
export interface EntradaDelRegistro {
  modelo: string;
  delegado: string;
}

export const CATALOGOS: readonly EntradaDelRegistro[] = [{ modelo: "EquipmentModel", delegado: "equipmentModel" }];
