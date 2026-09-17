/**
 * La valoración del técnico sobre una colonia, escrita al cerrar la visita.
 *
 * ## Qué cierra
 *
 * El Anexo E pide «Valoración» como **el único campo de etapa `close` de la inspección** —los
 * otros dieciséis son de campo— y el mapa del protocolo la daba por sin sitio con la razón
 * escrita: *«`note` es la nota de campo; mezclarlas perdería cuál se escribió con el guante
 * puesto»*. Esa distinción es la que la construye.
 *
 * ## Por qué esto NO inventa un cierre de inspección
 *
 * `Inspection` **no tiene nada de cierre**: ni `completedAt`, ni ventana de edición, ni una
 * función que la complete —sólo `recordInspection` y el listado—. `FieldSession` sí tiene las
 * tres cosas, con sus reglas ya decididas: `locked` por decisión, `editWindowExpiresAt` por
 * plazo, y **se dicen distinto a propósito** porque quien lo lea necesita saber cuál de las dos.
 *
 * Inventar un segundo cierre duplicaría esa máquina y la haría derivar. Así que **la puerta es
 * la visita**: esto encuentra la sesión a la que pertenece la inspección y le aplica **sus**
 * reglas. La ruta existe porque `FieldEvent` enlaza las dos (`fieldSessionId` + `inspectionId`).
 *
 * ## Y una inspección que no pertenece a ninguna visita
 *
 * Se puede registrar una inspección sin jornada abierta, así que el enlace puede faltar. En ese
 * caso **no hay ventana que aplicar y se acepta**: negarlo dejaría esa valoración sin poder
 * escribirse nunca, que es peor que escribirla sin plazo. El servicio devuelve de dónde salió la
 * regla —`"visita"` o `"sin_visita"`— para que la pantalla lo pueda decir y nadie suponga que
 * hubo un plazo que no hubo.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireApiaryAccess } from "./hives";

export class ValoracionInvalida extends Error {}

/** De dónde salió la regla de plazo que se aplicó. */
export type OrigenDeLaVentana = "visita" | "sin_visita";

export interface RegistrarValoracionInput {
  inspectionId: string;
  /**
   * La valoración. El vacío **borra** la que hubiera —así se deshace una puesta por error, misma
   * regla que los campos de cierre de la visita— y `undefined` no es un valor válido aquí: esta
   * función existe para escribirla, no para no tocarla.
   */
  assessment: string | null;
}

export async function registrarValoracionDeInspeccion(
  userAccountId: string,
  input: RegistrarValoracionInput,
  ahora: Date = new Date(),
): Promise<{ origenDeLaVentana: OrigenDeLaVentana }> {
  const inspeccion = await prisma.inspection.findUnique({
    where: { id: input.inspectionId },
    select: {
      id: true,
      colony: { select: { hive: { select: { projectId: true, locationId: true } } } },
      // La visita a la que pertenece, si pertenece a alguna.
      fieldEvents: {
        select: { fieldSession: { select: { status: true, editWindowExpiresAt: true } } },
        take: 1,
      },
    },
  });
  if (!inspeccion) throw new ValoracionInvalida("inspeccion_no_encontrada");

  // Mismo guardia que el resto del apiario, resuelto por la colmena de la colonia.
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: inspeccion.colony.hive.projectId, locationId: inspeccion.colony.hive.locationId },
  ]);

  const sesion = inspeccion.fieldEvents[0]?.fieldSession ?? null;
  let origenDeLaVentana: OrigenDeLaVentana = "sin_visita";
  if (sesion) {
    origenDeLaVentana = "visita";
    // Las reglas son las de la VISITA, no unas nuevas. Y se distinguen entre sí, como allí.
    if (sesion.status === "locked") throw new ValoracionInvalida("visita_cerrada");
    if (sesion.editWindowExpiresAt && sesion.editWindowExpiresAt < ahora) {
      throw new ValoracionInvalida("ventana_de_edicion_vencida");
    }
  }

  const texto = input.assessment === null ? null : input.assessment.trim() === "" ? null : input.assessment.trim();

  await prisma.$transaction(async (tx) => {
    const antes = await tx.inspection.findUniqueOrThrow({
      where: { id: input.inspectionId },
      select: { assessment: true },
    });
    const despues = await tx.inspection.update({
      where: { id: input.inspectionId },
      data: { assessment: texto },
    });
    // En la MISMA transacción, como vigila `tests/arquitectura/audit-atomico.test.ts`. Y con el
    // antes: una valoración es una lectura del técnico, y saber que la cambió —y desde qué—
    // es parte de poder sostenerla.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "inspection.assessment",
        entityType: "inspection",
        entityId: despues.id,
        before: antes,
        after: { assessment: despues.assessment },
        sourceInterface: "web",
      },
      tx,
    );
  });

  return { origenDeLaVentana };
}
