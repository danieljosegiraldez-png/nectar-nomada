/** Los rechazos de las bandejas de secado, con un código que la pantalla traduce. */
export type CodigoBandeja =
  | "corrida_no_encontrada" | "bandeja_no_encontrada" | "secado_cerrado" | "corrida_con_cama"
  | "no_es_bandeja" | "bandeja_de_otra_organizacion" | "bandeja_sin_acceso" | "bandeja_retirada"
  | "bandeja_ocupada" | "fecha_antes_del_secado" | "fecha_antes_de_cargar" | "ya_bajada"
  | "la_ultima_cierra_el_secado" | "quedan_otras_bandejas" | "bandejas_sin_bajar"
  | "posicion_invalida" | "bandeja_fija" | "bandeja_cambio" | "fecha_antes_del_ultimo_traslado";

export class BandejaError extends Error {
  constructor(readonly codigo: CodigoBandeja) { super(codigo); this.name = "BandejaError"; }
}
