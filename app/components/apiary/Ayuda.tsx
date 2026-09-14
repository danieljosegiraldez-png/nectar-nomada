import type { ReactNode } from "react";

/**
 * Un texto de ayuda, colapsado.
 *
 * **Qué cierra.** `48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md` §6: *«Los textos de
 * ayuda van colapsados y reescritos para apicultura.»* Medido el 2026-09-13, los
 * formularios de apiario tenían **10** textos de ayuda y **cero** `<details>`: los
 * diez se leían siempre, empujando hacia abajo el campo siguiente en una pantalla de
 * 390 px.
 *
 * **La otra mitad de esa frase ya estaba hecha, y conviene decirlo en vez de
 * repetirla.** El Anexo dice que los textos actuales *«hablan de fósforo Bray contra
 * Mehlich y de perfiles de suelo compactado»*. Medido: el namespace `Apiary` tiene
 * **10 ayudas propias y ninguna con palabra de suelo ni de fósforo**; la única clave
 * con Bray/Mehlich es `sampleExtractionHelp`, del namespace `Traceability`, que pinta
 * `SampleForms.tsx` —una pantalla de muestras de café—. Así que aquí no hay nada que
 * reescribir; queda por confirmar con el dueño qué pantalla vio.
 *
 * **Sin `useTranslations` a propósito.** El texto y el rótulo llegan ya traducidos por
 * quien llama, así que este componente sirve igual a un formulario de cliente y a una
 * página de servidor. Meter el hook aquí lo volvería sólo de cliente y habría que
 * duplicarlo para las tres páginas que también tienen ayudas.
 */
export function Ayuda({ resumen, children }: { resumen: string; children: ReactNode }) {
  return (
    <details className="nn-ayuda">
      <summary>{resumen}</summary>
      <p className="nn-muted">{children}</p>
    </details>
  );
}
