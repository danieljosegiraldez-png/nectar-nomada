import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";

/**
 * Ejecuta una escritura **una sola vez por envío**.
 *
 * **El defecto que cierra (2026-09-06).** Medido contra la base, no razonado:
 * `recordLabourEntry` llamado dos veces con la misma entrada crea DOS filas
 * indistinguibles —3 trabajadores, 6 horas, «Deshierbe», dos veces—.
 * `LabourEntry`, `MaterialConsumptionEntry`, `Measurement`, `Sample` y
 * `StorageAssignment` no tienen ningún índice único que lo rechace.
 * `<BotonDeEnvio>` cerró el caso del dedo; esto cierra los dos que el botón no
 * puede ver: el reintento de red y la pestaña duplicada.
 *
 * **Sin clave no hace nada.** Una llamada sin `clave` se comporta exactamente
 * como antes. Es deliberado: la sincronización offline tiene su propia
 * idempotencia por `clientDraftId`, y las llamadas internas no deben empezar a
 * necesitar un token para escribir.
 *
 * **La escritura y la clave van en la misma transacción.** Si se guardaran por
 * separado, una caída entre las dos dejaría o una fila sin clave —duplicable de
 * nuevo— o una clave sin fila, que devolvería para siempre un resultado que no
 * existe. Lo segundo es peor que el defecto original.
 *
 * `recuperar` en vez de leer la fila aquí: `resultType` apunta a cinco tablas de
 * tres esquemas, y resolverlas por nombre en tiempo de ejecución cambiaría un
 * error de tipos por uno de datos. Cada servicio sabe leer lo suyo.
 */
export async function unaVezPorEnvio<T extends { id: string }>(
  userAccountId: string,
  clave: string | null | undefined,
  opciones: {
    tipo: string;
    crear: (tx: Prisma.TransactionClient) => Promise<T>;
    recuperar: (id: string) => Promise<T>;
  },
): Promise<T> {
  if (!clave) return prisma.$transaction((tx) => opciones.crear(tx));

  const yaAtendido = await prisma.submissionKey.findUnique({ where: { key: clave } });
  if (yaAtendido) return recuperarDeOtroEnvio(yaAtendido, userAccountId, opciones);

  try {
    return await prisma.$transaction(async (tx) => {
      const fila = await opciones.crear(tx);
      await tx.submissionKey.create({
        data: { key: clave, userAccountId, resultType: opciones.tipo, resultId: fila.id },
      });
      return fila;
    });
  } catch (error) {
    // P2002 = la clave única saltó, así que otro envío idéntico ganó la carrera
    // entre el `findUnique` de arriba y este `create`. La transacción entera se
    // deshizo, así que no queda fila huérfana: se devuelve la del ganador.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const ganador = await prisma.submissionKey.findUnique({ where: { key: clave } });
      if (ganador) return recuperarDeOtroEnvio(ganador, userAccountId, opciones);
    }
    throw error;
  }
}

/**
 * Una clave sólo vale para quien la envió y para lo que se envió. Sin estas dos
 * comprobaciones, adivinar una clave devolvería la fila de otra persona, y una
 * clave reutilizada entre formularios devolvería un tipo que el llamador no
 * espera — un fallo de autorización disfrazado de idempotencia.
 */
async function recuperarDeOtroEnvio<T extends { id: string }>(
  registro: { userAccountId: string; resultType: string; resultId: string },
  userAccountId: string,
  opciones: { tipo: string; recuperar: (id: string) => Promise<T> },
): Promise<T> {
  if (registro.userAccountId !== userAccountId || registro.resultType !== opciones.tipo) {
    throw new ClaveDeEnvioAjena("clave_de_envio_ajena");
  }
  return opciones.recuperar(registro.resultId);
}

export class ClaveDeEnvioAjena extends Error {}
