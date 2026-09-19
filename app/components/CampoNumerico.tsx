"use client";

import type { ComponentProps, WheelEvent } from "react";

/**
 * Un `<input type="number">` que la rueda del ratón no puede cambiar.
 *
 * **Por qué existe (2026-09-18).** En Chrome, girar la rueda sobre un campo
 * numérico con foco cambia su valor. Medido en el recorrido de trampas de
 * broca: desde vacío, un paso abajo con `min=0` deja **0**. En un formulario
 * de campo eso convierte «no se contó» en «cero» sin que nadie lo vea, y
 * ADR-080 dice que un dato ausente nunca se guarda como 0.
 *
 * Soltar el foco al primer giro basta: sin foco, el navegador no toca el valor
 * y la rueda vuelve a desplazar la página, que es lo que quería quien la giró.
 *
 * Es de cliente para poder llevar el manejador, pero se usa igual desde una
 * página de servidor: el resto de atributos pasan tal cual.
 */
export function soltarFocoConLaRueda(e: WheelEvent<HTMLInputElement>) {
  if (e.currentTarget.type === "number") e.currentTarget.blur();
}

export function CampoNumerico({ onWheel, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      {...props}
      type="number"
      onWheel={(e) => {
        soltarFocoConLaRueda(e);
        onWheel?.(e);
      }}
    />
  );
}
