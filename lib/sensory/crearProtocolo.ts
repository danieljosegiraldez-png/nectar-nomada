/**
 * Escribir un protocolo, su versión, sus atributos y su vocabulario.
 *
 * **Por qué salió del script (2026-09-07).** Dentro de un `main()` no se puede
 * probar, y esto decide qué filas acaban en producción. Hasta hoy lo único que
 * había entre un archivo y la base era `validarDefinicion`, que comprueba el
 * ARCHIVO: nada comprobaba que el archivo se convirtiera en las filas que dice.
 * El día que se añadió `descriptors` eso dejó de ser teórico — un `createMany`
 * omitido habría creado el protocolo sin una sola palabra de su vocabulario, y
 * en pantalla eso se ve igual que un catador que no marcó nada.
 *
 * **Recibe `tx` y no abre transacción propia.** Quien llama decide el alcance:
 * el script la abre para meter también su `AuditEvent`, y la prueba la abre para
 * revertirla al terminar.
 */
import type { Prisma } from "../../generated/prisma/client";
import type { DefinicionDeProtocolo } from "./definicionDeProtocolo";

export interface ProtocoloCreado {
  protocolId: string;
  versionId: string;
  atributos: number;
  descriptores: number;
}

export async function crearProtocolo(
  tx: Prisma.TransactionClient,
  definicion: DefinicionDeProtocolo,
): Promise<ProtocoloCreado> {
  const protocol = await tx.sensoryProtocol.create({
    data: {
      domain: definicion.domain,
      name: definicion.name,
      description: definicion.description,
      standardSourceReference: definicion.standardSourceReference,
      standardLicenseStatus: definicion.standardLicenseStatus,
    },
  });

  const version = await tx.sensoryProtocolVersion.create({
    data: {
      protocolId: protocol.id,
      version: definicion.version,
      scoreMin: definicion.scoreMin,
      scoreMax: definicion.scoreMax,
      scoreFormula: definicion.scoreFormula ?? null,
      status: "active",
    },
  });

  // `createMany` y no un `create` por fila. Con seis atributos daba igual; con
  // los 45 descriptores de la rúbrica de miel son 51 viajes de ida y vuelta
  // dentro de una transacción interactiva, y el 2026-09-07 eso reventó contra
  // producción con `P2028` a los 5.174 ms — el techo por defecto de Prisma son
  // 5.000. Revirtió entera, comprobado leyendo el listado después: el fallo fue
  // ruidoso y no dejó nada a medias. Pero el arreglo es no dar 51 viajes, no
  // subirle el techo al reloj.
  await tx.sensoryAttribute.createMany({
    data: definicion.attributes.map((a, i) => ({
      protocolVersionId: version.id,
      name: a.name,
      displayOrder: i,
      scaleMin: a.scaleMin,
      scaleMax: a.scaleMax,
      section: a.section,
    })),
  });

  // El vocabulario entra con el resto, no después: un protocolo a medio
  // vocabulario ofrece menos descriptores de los que su estándar define, y eso
  // no se ve — se ve como que el catador no marcó nada.
  const descriptores = definicion.descriptors ?? [];
  if (descriptores.length > 0) {
    await tx.sensoryDescriptor.createMany({
      data: descriptores.map((c, i) => ({
        protocolVersionId: version.id,
        family: c.family,
        specificDescriptor: c.specificDescriptor,
        expectedPerception: c.expectedPerception ?? null,
        classification: c.classification,
        technicalCause: c.technicalCause ?? null,
        displayOrder: i,
      })),
    });
  }

  return {
    protocolId: protocol.id,
    versionId: version.id,
    atributos: definicion.attributes.length,
    descriptores: descriptores.length,
  };
}
