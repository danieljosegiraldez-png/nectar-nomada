import { prisma } from "../db";
import { can } from "../rbac/service";
import type { ScopeTarget } from "../rbac/types";
import type { PlotBlockType } from "../../generated/prisma/client";
import type { NivelDeBroca, ReglaParaAviso } from "./pendienteDeTrampas";

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

/**
 * La elección de finca que resuelven `/finca/trampas` y `/finca/trampas/ronda` —
 * mismo criterio en las dos pantallas: una sola finca entra directo, varias
 * ofrecen un selector por `?finca=`. El valor crudo de la URL se manda tal cual a
 * `getFincaTrampas`, que es la autoridad y lo revalida (Fix round 1, Tarea 8) — así
 * que aquí NO se comprueba contra `fincas`. Extraída para que la ronda no repita la
 * lógica en vez de copiarla.
 */
export function elegirFincaDeTrampas(
  fincas: readonly { id: string; name: string }[],
  fincaElegida: string | undefined,
): string | null {
  return fincaElegida ?? (fincas.length === 1 ? fincas[0]!.id : null);
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

/**
 * Las fincas donde esta persona puede ver o gestionar trampas, spec §6: el ámbito
 * puede estar en la finca o en uno de sus lotes, y comprobarlo lote por lote cubre
 * las dos formas porque una asignación a la finca alcanza a sus descendientes
 * (`lib/rbac/service.ts`, decisión de Daniel 2026-09-16).
 */
export async function getFincasConTrampas(userAccountId: string): Promise<{ id: string; name: string }[]> {
  const sitios = await prisma.location.findMany({
    where: { locationType: "site" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const accesibles: { id: string; name: string }[] = [];
  for (const sitio of sitios) {
    const lotes = await prisma.location.findMany({
      where: { parentLocationId: sitio.id, locationType: { in: ["plot", "micro_plot"] } },
      select: { id: true, classification: true },
    });
    let puede = false;
    for (const lote of lotes) {
      if (await puedeVerTrampasDelLote(userAccountId, lote)) {
        puede = true;
        break;
      }
    }
    if (puede) accesibles.push(sitio);
  }
  return accesibles;
}

export interface FincaTrampa {
  id: string;
  trapNumber: number | null;
  plotId: string;
  plotName: string;
  bloque: { name: string; blockType: PlotBlockType | null } | null;
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
    select: { id: true, name: true },
  });
  if (!finca) throw new FincaTrapAccessError("farm_not_found");

  const lotes = await prisma.location.findMany({
    where: { parentLocationId: farmLocationId, locationType: { in: ["plot", "micro_plot"] } },
    select: { id: true, name: true, classification: true },
    orderBy: { name: "asc" },
  });

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
      plotBlock: { select: { name: true, blockType: true } },
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
    status: t.status,
    instaladaEl: instaladaEl.get(t.id) ?? null,
    ultimaRevision: t.observations[0]
      ? { id: t.observations[0].id, observedAt: t.observations[0].observedAt, brocaLevel: t.observations[0].brocaLevel }
      : null,
  }));

  const reglaDeTrampas: ReglaParaAviso | null = await prisma.trapRule.findUnique({
    where: { farmLocationId },
    select: { triggerLevel: true, normalDays: true, alertDays: true, suggestedAction: true },
  });

  return {
    farmLocationId: finca.id,
    farmName: finca.name,
    plots: accesibles.map((l) => ({ id: l.id, name: l.name })),
    trampas,
    reglaDeTrampas,
  };
}
