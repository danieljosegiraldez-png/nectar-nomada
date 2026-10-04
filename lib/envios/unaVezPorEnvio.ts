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
/**
 * Cuánto vive una clave de envío. Treinta días, decidido por Daniel el
 * 2026-09-06.
 *
 * Qué significa el número: pasado ese plazo, reenviar el MISMO formulario
 * —una pestaña abierta un mes, un reintento muy tardío— cuenta como intención
 * nueva y escribe otra fila. Por debajo del plazo se devuelve la de siempre.
 * Treinta días es holgadísimo para el caso real, que se mide en segundos; el
 * plazo existe para que la tabla no crezca sin fin, no para acotar el reintento.
 */
export const DIAS_DE_VIDA_DE_UNA_CLAVE = 30;

function limiteDeCaducidad(): Date {
  return new Date(Date.now() - DIAS_DE_VIDA_DE_UNA_CLAVE * 24 * 60 * 60 * 1000);
}

export async function unaVezPorEnvio<T extends { id: string }>(
  userAccountId: string,
  clave: string | null | undefined,
  opciones: {
    tipo: string;
    crear: (tx: Prisma.TransactionClient) => Promise<T>;
    recuperar: (id: string) => Promise<T>;
    /**
     * Las opciones de la transacción interactiva (`timeout`, `maxWait`), para quien bloquea filas dentro de `crear` y no
     * cabe en los 5 s por defecto de Prisma: `moveLotToStorage`, que bloquea el linaje (Parte 1, revisión final, ronda de
     * arreglo 1, 2026-10-03). Sin ellas, las de Prisma, como siempre.
     */
    transaccion?: { timeout?: number; maxWait?: number };
  },
): Promise<T> {
  if (!clave) return prisma.$transaction((tx) => opciones.crear(tx), opciones.transaccion);

  const limite = limiteDeCaducidad();
  const yaAtendido = await prisma.submissionKey.findUnique({ where: { key: clave } });
  if (yaAtendido) {
    if (yaAtendido.createdAt >= limite) return recuperarDeOtroEnvio(yaAtendido, userAccountId, opciones);
    // Caducada. Se borra ANTES de seguir, o el `create` de abajo chocaría contra
    // la clave única y este envío acabaría devolviendo justo la fila vieja que
    // acabamos de decidir no honrar. `deleteMany` y no `delete` porque otra
    // corrida concurrente puede habérsela llevado ya, y eso no es un error.
    await prisma.submissionKey.deleteMany({ where: { key: clave } });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const fila = await opciones.crear(tx);
      await tx.submissionKey.create({
        data: { key: clave, userAccountId, resultType: opciones.tipo, resultId: fila.id },
      });
      // Barrido acotado a esta cuenta: mantiene la tabla en su sitio sin
      // inventar un cron que este proyecto no tiene. Deja fuera las claves de
      // cuentas que dejaron de escribir; son pocas, y un barrido global pediría
      // una tarea periódica y una ruta protegida — decisión aparte, no ésta.
      //
      // Dentro de la transacción a propósito: si el barrido falla, falla el
      // envío y se ve. Fuera, fallaría en silencio y la tabla crecería igual
      // mientras todo parecía correcto.
      await tx.submissionKey.deleteMany({ where: { userAccountId, createdAt: { lt: limite } } });
      return fila;
    }, opciones.transaccion);
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
