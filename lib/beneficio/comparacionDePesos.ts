/**
 * El neto de una recepción y la comparación de las dos básculas: la de la finca (o lo que declara
 * un productor de fuera) contra la del beneficio.
 *
 * Spec: docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md §3.4.
 *
 * **No es el balance de una etapa.** Usa la tolerancia normativa de
 * `12_mass_balance_byproducts.md` §2 (`POLITICA_POR_DEFECTO`) y sus nombres de estado, pero compara
 * dos básculas y **nunca bloquea nada**: Daniel, 2026-09-18, «se registran los dos y se avisa;
 * pasada la tolerancia, quien recibe escribe una nota». El balance de la selección es otra
 * evaluación, con sus propias consecuencias.
 *
 * **La base es la referencia, no el neto** (hallazgo de Codex): con 100 kg de referencia y 100,502
 * de neto, la tolerancia es 0,5 kg y la diferencia la supera; calcularla sobre el neto la haría
 * pasar. Sin una base fija, el mismo par de pesos daría dos veredictos.
 */
import { POLITICA_POR_DEFECTO, SchemaError, type BalancePolicy } from "./balanceDeMasas";

/** A 3 decimales, como `Decimal(10,3)` y como lo recalcula el CHECK `recepcion_de_cereza_pesos`. */
const a3 = (x: number) => Math.round(x * 1000) / 1000;

export function netoDeRecepcion(brutoKg: number, recipientes: number, taraPorRecipienteKg: number): number {
  if (!(Number.isFinite(brutoKg) && brutoKg > 0)) throw new SchemaError("bruto_invalido");
  if (!(Number.isInteger(recipientes) && recipientes >= 0)) throw new SchemaError("recipientes_invalidos");
  if (!(Number.isFinite(taraPorRecipienteKg) && taraPorRecipienteKg >= 0)) throw new SchemaError("tara_invalida");
  const neto = a3(a3(brutoKg) - recipientes * a3(taraPorRecipienteKg));
  if (!(neto > 0)) throw new SchemaError("neto_no_positivo");
  return neto;
}

export interface ComparacionDeBasculas {
  readonly referenciaKg: number;
  readonly netoKg: number;
  readonly diferenciaKg: number;
  readonly diferenciaPct: number;
  readonly toleranciaKg: number;
  readonly estado: "BALANCED" | "DISCREPANCY_FLAGGED" | "GROSS_IMBALANCE";
  readonly politica: BalancePolicy;
}

export function compararBasculas(referenciaKg: number, netoKg: number, politica: BalancePolicy = POLITICA_POR_DEFECTO): ComparacionDeBasculas {
  if (!(Number.isFinite(referenciaKg) && referenciaKg > 0)) throw new SchemaError("referencia_no_positiva");
  if (!(Number.isFinite(netoKg) && netoKg > 0)) throw new SchemaError("neto_no_positivo");
  const diferenciaKg = a3(netoKg - referenciaKg);
  const diferenciaPct = diferenciaKg / referenciaKg;
  const toleranciaKg = a3(Math.max(referenciaKg * politica.relativeTolerance, politica.absoluteFloorKg));
  const estado =
    Math.abs(diferenciaKg) <= toleranciaKg ? "BALANCED" : Math.abs(diferenciaPct) <= politica.grossThreshold ? "DISCREPANCY_FLAGGED" : "GROSS_IMBALANCE";
  return { referenciaKg, netoKg, diferenciaKg, diferenciaPct, toleranciaKg, estado, politica };
}
