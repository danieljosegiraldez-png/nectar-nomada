/**
 * La autoría de recetas — Parte 2a, tarea 3 (2026-10-04). La ÚNICA regla de quién escribe una receta.
 *
 * **Decisión de Daniel V16 (2026-10-04, diseño 2b §12):** escribir, versionar y publicar recetas es del **Coffee Process
 * Manager**, un perfil nuevo con un permiso nuevo (`lot:approve_exception`, nombre provisional). Sustituye a lo que hasta hoy
 * decidía `location:edit_beneficio` —«configurar recetas es configurar el beneficio», spec #370 §4.3—: **`edit_beneficio` ya no
 * basta**, ni siquiera a un Farm Manager que lo lleva de serie. El operario es el `Farm Operator` de hoy y no escribe recetas
 * (V13); quien lleva los dos perfiles hace las dos cosas (V14).
 *
 * **Toda escritura de autoría pasa por aquí** (registro del plan 2a, Ruling A): crear una receta, cambiarle el nombre, una
 * versión nueva (`createRecipeWithVersion`, `updateRecipeMetadata`, `createRecipeVersion`), agregar, cambiar, quitar y mover un
 * paso, publicar (`lib/recetas/pasos.ts`), y las que añadan las tareas 4, 11 y 14 (derivar, versionar, convertir una Libre).
 * **Abrir un proceso, también con la receta Libre, NO es autoría** (V13: `lot:manage`).
 *
 * **Cómo se comprueba: el MISMO camino de `exigeEditarBeneficioEnOrganizacion` (`lib/traceability/locations.ts`) con el
 * permiso nuevo**, medido el 2026-10-04 —calcado, no reinventado—:
 * - una receta de una organización: el permiso en ALGUNA ubicación de la organización (`lugaresDeOrganizacion`: las propias
 *   y las descendientes que la heredan), con la clasificación de esa ubicación, o con alcance de plataforma. El respaldo de
 *   plataforma existe porque una organización con lotes y sin ninguna `Location` no tiene contra qué probar `can()`;
 * - una plantilla (`organizationId` nulo): sólo con alcance de plataforma. Ninguna organización edita las plantillas: deriva
 *   su copia (diseño §3.4).
 *
 * **Lo que ya NO se pide: `lot:manage` sobre un lote de la organización.** La puerta de hoy lo pedía además de
 * `edit_beneficio` («la misma autoridad que opera los lotes a los que se aplicará»); con V16 esa autoridad es otra persona, y
 * un Coffee Process Manager no lleva permisos operativos. Por eso esta regla no necesita ningún lote, y `organizacion_sin_lotes`
 * sólo sale de LEER los pasos (`pasosDeLaVersion`), que sí pasa por un lote.
 *
 * **Quién LEE (Ruling C4, 2026-10-04): `puedeAutoriaDeReceta` (abajo) existe también para esto.** Las tres lecturas de las pantallas
 * de recetas (`listRecipes`, `listRecipeOrganizations`, `getRecipeForEditor`) piden hoy `lot:manage` sobre un lote, un permiso
 * operativo que el Coffee Process Manager NO lleva (ni `lot:view`: el perfil no gana ninguno de los dos). Para que ese perfil abra las
 * pantallas, el editor de recetas ensancha las tres lecturas para que acepten TAMBIÉN `puedeAutoriaDeReceta(cuenta, organización de
 * la receta)` —la misma regla, en booleano, sin copiarla—: quien puede escribir una receta puede verla; quien opera un lote, como hasta hoy.
 * Los predicados de pantalla de `app/recipes/**` siguen preguntando por `edit_beneficio` hasta que ese editor los cambie por la misma
 * gemela. Esta tarea sólo la usa en `pasosDeLaVersion`.
 */
import { can } from "../rbac/service";
import { CLASSIFICATION_NOT_APPLICABLE } from "../rbac/resolve";
import { lugaresDeOrganizacion } from "../traceability/locations";
import { RecipeError } from "./errorDeReceta";

/**
 * Lanza `RecipeError("sin_permiso_de_autoria")` si `userAccountId` no puede escribir recetas de `organizationId` (nulo = una
 * plantilla). El permiso se escribe LITERAL en las dos llamadas a `can`: así el escáner de ADR-091
 * (`tests/helpers/permissionUsage.ts`) lo ve como comprobado con su clave exacta, y no sólo por el comodín del recurso `lot`.
 */
export async function exigeAutoriaDeReceta(userAccountId: string, organizationId: string | null): Promise<void> {
  if (organizationId !== null) {
    for (const l of await lugaresDeOrganizacion(organizationId)) {
      if (await can(userAccountId, "approve_exception", "lot", { scopeType: "location", scopeRefId: l.id }, l.classification)) return;
    }
  }
  if (await can(userAccountId, "approve_exception", "lot", { scopeType: "platform", scopeRefId: null }, CLASSIFICATION_NOT_APPLICABLE)) return;
  throw new RecipeError("sin_permiso_de_autoria");
}

/**
 * La versión que pregunta en vez de exigir, para que una pantalla decida si ofrece un botón sin duplicar la regla del servidor
 * (la regla de Daniel del 2026-09-27: lo que no puedes hacer no se muestra). Misma comprobación que la escritura, y sólo se traga
 * la negativa concreta de este permiso: cualquier otro error (una organización que no existe) se relanza, porque eso no es «no
 * puede», es un id malo.
 */
export async function puedeAutoriaDeReceta(userAccountId: string, organizationId: string | null): Promise<boolean> {
  try {
    await exigeAutoriaDeReceta(userAccountId, organizationId);
    return true;
  } catch (error) {
    if (error instanceof RecipeError && error.message === "sin_permiso_de_autoria") return false;
    throw error;
  }
}
