import type { CerrarVisitaInput } from "./fieldSessions";

/**
 * Lee el formulario de cierre de una visita y lo convierte en la entrada de `completarVisita`.
 *
 * **Por qué vive fuera de la acción.** Un archivo `"use server"` sólo puede exportar funciones
 * `async` (`tests/arquitectura/use-server-solo-async.test.ts`), y este defecto vivía justo en la
 * lectura: había que poder probarla sin sesión ni base. Mismo patrón que `leerInspeccion` en
 * `secadoForm.ts`.
 *
 * **El vacío NO borra lo ya anotado** (revisión de Apiario del 2026-10-08, V-1). Colonias, cajas,
 * clima y notas pueden venir de antes del cierre —los vitales se anotan estando en el sitio
 * (ADR-157) y las notas al abrir la visita—, y el formulario de cierre no los trae. Convertir su
 * vacío en `null` los sobrescribía, porque `completarVisita` sólo deja quieto lo `undefined`. Ahora
 * un vacío es «no tocar», la misma regla que la acción ya aplicaba a las casillas de condiciones del
 * sitio. Lo que se escribe sí corrige, y el servicio quita entonces la marca de «anotado en sitio».
 *
 * **Los cinco que sólo se anotan al cerrar** —próxima visita, viáticos, causa probable,
 * recomendación y motivo— conservan su regla: vacío es `null`, «no se anotó», y NO cero (una visita
 * sin viáticos anotados no costó cero). Se completan una sola vez, así que ese `null` no pisa nada.
 */
export function leerCompletarVisita(formData: FormData): CerrarVisitaInput {
  const texto = (clave: string) => String(formData.get(clave) ?? "").trim();
  /** Vacío = no tocar; lo demás, tal cual. */
  const sinTocarSiVacio = (clave: string) => {
    const v = texto(clave);
    return v === "" ? undefined : v;
  };
  const numeroSinTocarSiVacio = (clave: string) => {
    const v = texto(clave);
    // Vacío es «no tocar», y NO cero: un apiario vaciado se cuenta como cero, y ese cero es un
    // dato distinto de no haber contado (ADR-080).
    return v === "" ? undefined : Number(v);
  };
  const nuloSiVacio = (clave: string) => {
    const v = texto(clave);
    return v === "" ? null : v;
  };

  const proxima = texto("nextVisitDueAt");
  const costo = texto("travelCostUsd");
  const casillas = formData.getAll("siteConditions");

  return {
    fieldSessionId: texto("fieldSessionId"),
    // Día, no instante: «cuándo toca volver» es una fecha de calendario. Se trata como los demás
    // campos de día —medianoche UTC— y NO se convierte con el desfase del dispositivo, que la
    // movería un día.
    nextVisitDueAt: proxima === "" ? null : new Date(`${proxima}T00:00:00Z`),
    coloniesAliveCount: numeroSinTocarSiVacio("coloniesAliveCount"),
    hivesPresentCount: numeroSinTocarSiVacio("hivesPresentCount"),
    // Cadena, validada por el servicio. El protocolo la marca opcional.
    weatherObserved: sinTocarSiVacio("weatherObserved"),
    // Sin ninguna casilla marcada NO se toca: las casillas no pueden decir «lo de antes», y borrar
    // lo que se anotó en el sitio por no volver a marcarlo al cerrar sería perderlo.
    ...(casillas.length === 0
      ? {}
      : { siteConditions: casillas.map(String), siteConditionOtherNote: nuloSiVacio("siteConditionOtherNote") }),
    notes: sinTocarSiVacio("notes"),
    travelCostUsd: costo === "" ? null : Number(costo),
    probableCause: nuloSiVacio("probableCause"),
    recommendation: nuloSiVacio("recommendation"),
    reason: nuloSiVacio("reason"),
  };
}
