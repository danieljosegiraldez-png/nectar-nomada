/**
 * La pestaña del tablero de parcela va en la URL (`?pestana=trampas`), spec §3: así los
 * enlaces de los avisos llevan directo a ella y desaparecen los plegables con `id`
 * dentro que el navegador no siempre abre al navegar a un fragmento.
 */
export const PESTANAS_DE_PARCELA = ["resumen", "trampas", "condiciones", "muestras"] as const;
export type PestanaDeParcela = (typeof PESTANAS_DE_PARCELA)[number];

export function pestanaValida(valor: string | undefined): PestanaDeParcela {
  return (PESTANAS_DE_PARCELA as readonly string[]).includes(valor ?? "")
    ? (valor as PestanaDeParcela)
    : "resumen";
}
