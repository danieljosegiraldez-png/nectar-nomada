/**
 * Filas `insumo_i_lote`, `insumo_i_cantidad`, `insumo_i_unidad` del formulario
 * de registrar (spec 2026-09-19 §5, `TarjetaDeRutina`/`RutinasDeLugar`). Vacío
 * = sin cantidad, nunca 0 (CLAUDE.md: «ausencia no es cero»).
 *
 * Módulo puro aparte, sin `prisma`: `app/actions/rutinas.ts` es `"use server"`
 * y de ahí sólo se puede exportar funciones `async`
 * (`tests/arquitectura/use-server-solo-async.test.ts`) — esta función es
 * síncrona y de uso interno de esa acción.
 */
import { RutinaError } from "./error";

export function insumosDelFormulario(f: FormData): { consumableLotId: string; quantity: number | null; unit: string | null }[] {
  const salida: { consumableLotId: string; quantity: number | null; unit: string | null }[] = [];
  for (let i = 0; i < 3; i++) {
    const lote = String(f.get(`insumo_${i}_lote`) ?? "");
    if (!lote) continue;
    const texto = String(f.get(`insumo_${i}_cantidad`) ?? "").trim();
    const quantity = texto === "" ? null : Number(texto);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) throw new RutinaError("cantidad_invalida");
    const unit = String(f.get(`insumo_${i}_unidad`) ?? "").trim() || null;
    if (quantity !== null && unit === null) throw new RutinaError("unidad_obligatoria");
    salida.push({ consumableLotId: lote, quantity, unit });
  }
  return salida;
}
