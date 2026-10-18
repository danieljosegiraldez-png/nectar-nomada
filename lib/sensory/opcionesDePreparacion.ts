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
  /** Tarea 9, ronda de arreglo 1: el linaje del lote de origen pasa del tope de R1 y no se sabe su grado. */
  linajeDemasiadoHondo?: boolean;
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
    /** Lo que va en el sitio del grado cuando el linaje es demasiado hondo para saberlo. */
    linajeDemasiadoHondo: string;
    describirTueste: (datos: { date: string; profile: string; equipment: string; reference: string }) => string;
  },
): OpcionDePreparacion[] {
  // Tarea 9, ronda de arreglo 1 (2026-10-02): sin grado porque no se pudo saber no es sin grado porque no lo tiene. Se dice
  // en el sitio del grado.
  const base = etiquetaDeMuestra(
    muestra.linajeDemasiadoHondo ? { ...muestra, processGrade: textos.linajeDemasiadoHondo } : muestra,
  );
  if (muestra.roastSessions.length === 0) {
    return [];
  }
  return muestra.roastSessions.map((roast) => ({
    key: `${muestra.id}:${roast.id}`,
    sampleId: muestra.id,
    roastSessionId: roast.id,
    label: `${base} · ${textos.describirTueste({
      date: roast.startedAt.toISOString().slice(0, 10),
      reference: roast.id,
      profile: roast.recipeVersion ? `${roast.recipeVersion.recipe.name} v${roast.recipeVersion.version}` : textos.sinPerfil,
      equipment: roast.equipment?.name ?? textos.sinEquipo,
    })}`,
  }));
}
