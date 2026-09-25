import { etiquetaDeMuestra } from "./muestraEnCata";

interface Preparacion {
  id: string;
  startedAt: Date;
  equipment: { name: string } | null;
  recipeVersion: { version: number; recipe: { name: string } } | null;
}

interface MuestraConPreparaciones {
  id: string;
  sampleCode: string;
  sampleType: string;
  description: string | null;
  lotCode: string | null;
  organizationName: string | null;
  processGrade: string | null;
  roastSessions: Preparacion[];
}

export interface OpcionDePreparacion {
  key: string;
  sampleId: string;
  roastSessionId: string | null;
  label: string;
}

export function opcionesDePreparacion(
  muestra: MuestraConPreparaciones,
  textos: {
    sinPerfil: string;
    sinEquipo: string;
    describirTueste: (datos: { date: string; profile: string; equipment: string }) => string;
  },
): OpcionDePreparacion[] {
  const base = etiquetaDeMuestra(muestra);
  if (muestra.roastSessions.length === 0) {
    return [];
  }
  return muestra.roastSessions.map((roast) => ({
    key: `${muestra.id}:${roast.id}`,
    sampleId: muestra.id,
    roastSessionId: roast.id,
    label: `${base} · ${textos.describirTueste({
      date: roast.startedAt.toISOString().slice(0, 10),
      profile: roast.recipeVersion ? `${roast.recipeVersion.recipe.name} v${roast.recipeVersion.version}` : textos.sinPerfil,
      equipment: roast.equipment?.name ?? textos.sinEquipo,
    })}`,
  }));
}
