/**
 * Los motivos por los que una parcela se parte en microparcelas, en el orden en que se ofrecen.
 * Módulo aparte y sin base de datos para que un formulario del navegador pueda importarlo.
 * `satisfies` hace que el compilador avise si el enum de Prisma cambia.
 */
import type { SubdivisionReason } from "../../generated/prisma/client";

export const MOTIVOS_DE_SUBDIVISION = ["altitude", "shade", "slope", "other"] as const satisfies readonly SubdivisionReason[];
