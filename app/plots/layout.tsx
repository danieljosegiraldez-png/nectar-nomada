import { FieldSyncControls } from "../components/traceability/FieldSyncControls";

/**
 * La cola de campo, en la pantalla donde se llena.
 *
 * **El hueco que cierra, medido en la revisión final de la cola de parcela.**
 * `FieldSyncControls` —contador, botón de sincronizar, aviso de borradores
 * rancios y de purgados— se montaba en **un solo sitio**,
 * `app/field-sessions/[id]/page.tsx`. Los cuatro formularios de captura de
 * parcela viven en `/plots/[id]`, que no lo montaba y no tenía layout, así que
 * lo que se encolaba desde la parcela se quedaba en IndexedDB **sin contador y
 * sin botón**: la cola es explícita por diseño —no sincroniza sola—, o sea que
 * no había ninguna forma de enviarlo. Y `purgeStaleFieldDrafts` lo borra a los
 * 21 días, con el aviso de la purga en la pantalla que el operador no visita.
 *
 * **Layout y no un montaje dentro de la página**, que es la otra forma que ya
 * usa la casa: `app/apiaries/layout.tsx` monta así `OfflineSyncIndicator`.
 * Encaja mejor aquí porque `/plots/[id]` reparte sus formularios por seis
 * secciones —no hay un «junto al formulario» que sea el sitio— y porque cubre
 * también `/plots`, que es desde donde el operador entra.
 */
export default function PlotsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <FieldSyncControls />
      {children}
    </div>
  );
}
