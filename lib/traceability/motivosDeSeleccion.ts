/**
 * Los motivos por los que un trozo de parcela se **selecciona** y se maneja aparte, en el orden en
 * que se ofrecen. Una selección no le resta nada a su parcela (ADR-196): el comentario anterior
 * decía «los motivos por los que una parcela se parte en microparcelas», que es justo lo contrario.
 * Módulo aparte y sin base de datos para que un formulario del navegador pueda importarlo.
 * `satisfies` hace que el compilador avise si el enum de Prisma cambia.
 */
import type { MotivoDeSeleccion } from "../../generated/prisma/client";

export const MOTIVOS_DE_SELECCION = ["altitude", "shade", "slope", "other"] as const satisfies readonly MotivoDeSeleccion[];
