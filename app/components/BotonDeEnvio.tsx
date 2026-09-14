"use client";

import { useFormStatus } from "react-dom";

/**
 * Un botón de envío que se apaga mientras el envío está en curso.
 *
 * **Por qué existe (2026-09-06).** 19 archivos tenían botones de envío sin
 * ninguna protección: se podía pulsar dos veces. Medido contra la base, no
 * razonado — `recordLabourEntry` llamado dos veces con la misma entrada crea
 * **dos filas indistinguibles**: 3 trabajadores, 6 horas, «Deshierbe», dos
 * veces. `LabourEntry`, `MaterialConsumptionEntry`, `Measurement`, `Sample` y
 * `StorageAssignment` no tienen ningún índice único que lo rechace, y la web no
 * usa el `clientDraftId` que sí protege la cola de sincronización. Una semana
 * después nadie sabe si fue un jornal o dos.
 *
 * `useFormStatus` y no `useActionState` a propósito: lee el estado del `<form>`
 * que lo envuelve, así que sirve igual dentro de un formulario de servidor
 * —catorce de los diecinueve lo eran— sin convertir la página en cliente. Los
 * 32 archivos que ya se apagaban con el `pending` de `useActionState` se quedan
 * como están: esto no los toca.
 *
 * No arregla el reenvío desde otra pestaña ni un reintento de red. Eso pide
 * idempotencia en el servidor, y es otro trabajo — este botón cierra el caso
 * que se puede provocar con un dedo.
 */
export function BotonDeEnvio({
  children,
  className = "nn-button",
  disabled,
  ...resto
}: React.ComponentPropsWithoutRef<"button">) {
  const { pending } = useFormStatus();
  return (
    // `disabled` se SACA de `resto` y se combina, no se deja pasar detrás.
    //
    // **Era un defecto real, medido el 2026-09-13.** Con `disabled={pending} {...resto}`,
    // un llamador que pasara su propio `disabled` lo sobrescribía y **perdía la protección
    // del doble toque sin que nada lo dijera** — el botón parecía protegido porque usaba
    // este componente. Le pasaba a `app/sensory/[sessionId]/page.tsx`, que pasa
    // `disabled={...assessments.length === 0}`: con una evaluación en la lista, ese botón
    // se podía pulsar dos veces. Lo destapó `envio-sin-doble-toque` al rechazar un botón
    // nuevo, no una lectura de este archivo.
    //
    // Lo vigila el `it` «el propio botón combina el disabled del llamador» de ese guardia.
    <button type="submit" className={className} disabled={pending || disabled} {...resto}>
      {children}
    </button>
  );
}
