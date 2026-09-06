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
  ...resto
}: React.ComponentPropsWithoutRef<"button">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} {...resto}>
      {children}
    </button>
  );
}
