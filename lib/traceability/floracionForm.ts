import { fechaDeDia } from "../time/localDateTime";

/**
 * Lee los dos formularios de floración (F1): registrar y «Terminó».
 *
 * **Por qué vive fuera de la acción.** Un archivo `"use server"` sólo puede exportar funciones
 * `async` (`tests/arquitectura/use-server-solo-async.test.ts`), y lo que aquí importa probar es
 * justo la lectura: que el inicio y el fin entren como **campos de día** —medianoche UTC del día
 * elegido, con `fechaDeDia`— y no como instantes. Es lo que el esquema declara y lo que el aviso
 * de polinizadores compara; ver el comentario de `RegistrarFloracionInput.endsAt`.
 *
 * Una fecha ausente sale `null` y decide la acción; una fecha que no existe lanza
 * `FechaDeDiaInvalida`, que la acción traduce.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texto = (formData: FormData, clave: string): string | null => {
  const bruto = String(formData.get(clave) ?? "").trim();
  return bruto === "" ? null : bruto;
};

export function leerFloracion(formData: FormData) {
  return {
    locationId: String(formData.get("locationId") ?? ""),
    plotBlockId: texto(formData, "plotBlockId"),
    startsAt: fechaDeDia(texto(formData, "startsAt"), "startsAt"),
    endsAt: fechaDeDia(texto(formData, "endsAt"), "endsAt"),
    observerPersonId: texto(formData, "observerPersonId"),
    notes: texto(formData, "notes"),
  };
}

export function leerCierreDeFloracion(formData: FormData) {
  const portada = texto(formData, "portadaId");
  return {
    plotBloomId: String(formData.get("plotBloomId") ?? ""),
    endsAt: fechaDeDia(texto(formData, "endsAt"), "endsAt"),
    // A qué portada se vuelve: la de la parcela desde la que se pulsó «Terminó», que puede ser la
    // madre de la microparcela que floreció. Sólo un id con forma de UUID; si no, la acción vuelve
    // a la parcela de la propia floración.
    portadaId: portada && UUID.test(portada) ? portada : null,
  };
}
