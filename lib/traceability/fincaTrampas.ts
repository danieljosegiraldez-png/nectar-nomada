import { prisma } from "../db";
import { can } from "../rbac/service";
import type { ScopeTarget } from "../rbac/types";
import type { PlotBlockType } from "../../generated/prisma/client";
import type { NivelDeBroca, ReglaParaAviso } from "./pendienteDeTrampas";
import { idsBajoLaFinca } from "./fincas";

export class FincaTrapAccessError extends Error {}

/**
 * ¿Puede esta persona usar `/finca/trampas`? La misma pregunta que decide si el
 * índice de `/finca` ofrece el destino «Trampas» (Fix round 1, Tarea 8) —
 * extraída para que exista un solo sitio que la responda y una prueba con base
 * pueda afirmarla directamente, en vez de repetir `granted.has(...)` en cada
 * llamador.
 */
export function puedeVerTrampasDeFinca(granted: ReadonlySet<string>): boolean {
  return granted.has("specimen:view") || granted.has("specimen:manage");
}

async function puedeVerTrampasDelLote(
  userAccountId: string,
  plot: { id: string; classification: import("../../generated/prisma/client").ClassificationLevel },
): Promise<boolean> {
  const target: ScopeTarget = { scopeType: "location", scopeRefId: plot.id };
  return (
    (await can(userAccountId, "view", "specimen", target, plot.classification)) ||
    (await can(userAccountId, "manage", "specimen", target, plot.classification))
  );
}

export interface FincaTrampa {
  id: string;
  trapNumber: number | null;
  plotId: string;
  plotName: string;
  bloque: { name: string; blockType: PlotBlockType | null } | null;
  /** El bloque de VERDAD (FK) — ver el mismo campo en `TrampaParaAviso`. */
  plotBlockId: string | null;
  status: "active" | "removed" | "dead";
  ultimaRevision: { id: string; observedAt: Date; brocaLevel: NivelDeBroca | null } | null;
  instaladaEl: Date | null;
}

/**
 * Todas las trampas de una finca, de los lotes que esta persona puede ver — nunca una
 * lista vacía por falta de permiso, que se leería como «no hay trampas» (spec §6): sin
 * ningún lote accesible, se lanza.
 *
 * La regla de la finca se lee directamente, sin pasar por `getTrapRule` (que exige
 * `location:manage_attributes`): igual que en `getPlotDetail`, queda detrás de la
 * compuerta de specimen que ya se comprobó arriba, sin exigir un segundo permiso.
 */
export async function getFincaTrampas(userAccountId: string, farmLocationId: string) {
  const finca = await prisma.location.findUnique({
    where: { id: farmLocationId },
    select: { id: true, name: true, timezone: true },
  });
  if (!finca) throw new FincaTrapAccessError("farm_not_found");

  // Cualquier `plot` bajo la finca, A CUALQUIER PROFUNDIDAD, no sólo hijo directo. Una
  // microparcela (spec fincas y parcelas §3.3) es una Location `plot` cuyo padre es OTRA
  // `plot`, creada con `createMicrolot` (`lib/traceability/locations.ts`): es nieta del sitio,
  // no hija. Filtrar por `parentLocationId: sitio.id` la dejaba fuera; `idsBajoLaFinca` camina
  // el árbol entero.
  //
  // El `where` se queda acotado a `plot | micro_plot` a propósito, no `findMany()` sin filtro:
  // un plot/microparcela sólo cuelga de un sitio o de otro plot, y la base de pruebas es
  // compartida y puede tener valores de `LocationType` que otra sesión está introduciendo y que
  // el cliente de Prisma de ESTA sesión no conoce todavía (visto en vivo: `drying_rack`) — pedir
  // esa columna sin filtrar revienta la deserialización en cuanto topa una fila así.
  //
  // (Esta explicación vivía en `getFincasConTrampas`, que servía al selector de fincas de
  // `/finca/trampas`. El 2026-09-21 la pantalla pasó a usar la finca elegida de la sección y
  // esa función quedó sin uso, así que se quitó y su explicación se trajo aquí.)
  const ubicaciones = await prisma.location.findMany({
    where: { locationType: { in: ["plot", "micro_plot"] } },
    select: { id: true, name: true, parentLocationId: true, locationType: true, classification: true },
  });
  const bajo = idsBajoLaFinca(ubicaciones, farmLocationId);
  const lotes = ubicaciones
    .filter(
      (u) => u.id !== farmLocationId && bajo.has(u.id) && (u.locationType === "plot" || u.locationType === "micro_plot"),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const accesibles = [] as typeof lotes;
  for (const lote of lotes) if (await puedeVerTrampasDelLote(userAccountId, lote)) accesibles.push(lote);
  if (accesibles.length === 0) throw new FincaTrapAccessError("no_specimen_access_in_farm");

  const accesibleIds = accesibles.map((l) => l.id);
  const trampasCrudas = await prisma.specimen.findMany({
    where: { locationId: { in: accesibleIds }, specimenType: "trap" },
    select: {
      id: true,
      trapNumber: true,
      status: true,
      locationId: true,
      plotBlock: { select: { id: true, name: true, blockType: true } },
      observations: {
        where: { observationType: "trap_check" },
        orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true, observedAt: true, brocaLevel: true },
      },
    },
    orderBy: [{ locationId: "asc" }, { trapNumber: "asc" }],
  });

  const instalaciones = await prisma.specimenObservation.findMany({
    where: {
      specimenId: { in: trampasCrudas.map((t) => t.id) },
      observationType: { in: ["installed", "reinstalled"] },
    },
    orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
    select: { specimenId: true, observedAt: true },
  });
  const instaladaEl = new Map<string, Date>();
  for (const i of instalaciones) if (!instaladaEl.has(i.specimenId)) instaladaEl.set(i.specimenId, i.observedAt);

  const nombrePorLote = new Map(accesibles.map((l) => [l.id, l.name]));
  const trampas: FincaTrampa[] = trampasCrudas.map((t) => ({
    id: t.id,
    trapNumber: t.trapNumber,
    plotId: t.locationId,
    plotName: nombrePorLote.get(t.locationId) ?? "",
    bloque: t.plotBlock ? { name: t.plotBlock.name, blockType: t.plotBlock.blockType } : null,
    plotBlockId: t.plotBlock?.id ?? null,
    status: t.status,
    instaladaEl: instaladaEl.get(t.id) ?? null,
    ultimaRevision: t.observations[0]
      ? { id: t.observations[0].id, observedAt: t.observations[0].observedAt, brocaLevel: t.observations[0].brocaLevel }
      : null,
  }));

  const reglaDeTrampas: ReglaParaAviso | null = await prisma.trapRule.findUnique({
    where: { farmLocationId },
    select: {
      triggerLevel: true,
      normalDays: true,
      alertDays: true,
      suggestedAction: true,
      suggestedMaterial: { select: { id: true, name: true } },
    },
  });

  return {
    farmLocationId: finca.id,
    farmName: finca.name,
    // Tarea 10, ruling del controlador — el «hoy» que precarga la fecha del
    // formulario corto de la ronda se calcula en el servidor con la zona de
    // LA FINCA, no la del dispositivo: la misma razón que `diaDeHoy` ya usa
    // para los avisos, aplicada ahora a un valor por defecto en vez de a una
    // comparación de vencimiento.
    farmTimezone: finca.timezone,
    // `parentPlotId` es la parcela que contiene a una microparcela, para que la pantalla agrupe
    // por parcela → microparcela → bloque (Daniel, 2026-09-21). Sólo si ese padre es un lote de
    // esta finca: una parcela colgada directamente del sitio lleva `null`.
    plots: accesibles.map((l) => ({
      id: l.id,
      name: l.name,
      parentPlotId: l.parentLocationId && bajo.has(l.parentLocationId) && l.parentLocationId !== farmLocationId ? l.parentLocationId : null,
    })),
    trampas,
    reglaDeTrampas,
  };
}
