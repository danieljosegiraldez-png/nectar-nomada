/**
 * La escoba de `core.audit_event` en la base LOCAL de pruebas.
 *
 * **Por qué existe.** La suite escribe rastro de auditoría por diseño: hay un
 * único escritor, `recordAuditEvent`, y 50 módulos lo llaman. Medido el
 * 2026-09-11 en la base local: **40.043 filas, 98 operaciones distintas, y la
 * que más pesa es el 8 %**. No hay una prueba culpable a la que ponerle un
 * `deleteMany`; son 57 archivos, y 33 de ellos en `traceability`. Arreglarlos
 * uno a uno es un cambio enorme y con mucho roce entre sesiones, así que la
 * decisión del dueño fue barrer en vez de reescribir la suite.
 *
 * **El discriminador, y por qué se sostiene.** Se borra sólo lo que tiene
 * `actorUserAccountId` nulo. La FK es `SET NULL`: una fila queda sin actor
 * exactamente cuando la cuenta que la escribió se borró, y las cuentas sólo se
 * borran en la limpieza de un fixture. El rastro real conserva su actor — el
 * mismo día, las 506 filas con actor vivo eran todas de dos personas reales,
 * Daniel Giráldez (496) y Sherry Huerbsch (10).
 *
 * Ese razonamiento es una hipótesis sobre los datos, no un teorema, así que el
 * script la comprueba antes de borrar en vez de confiar en ella: si alguna fila
 * sin actor apuntara a una `user_account` que todavía existe, aborta. Esa es la
 * única forma barata de que «sin actor» signifique otra cosa.
 *
 * **No hay bandera para correrlo contra una base remota.** `tests/setup.ts`
 * tiene `ALLOW_REMOTE_TEST_DB` porque leer producción a veces se quiere; borrar
 * su rastro de auditoría, nunca. La regla de qué es «local» se importa de
 * `lib/databaseHost.ts` (ADR-084) en vez de copiarse: una segunda copia escrita
 * a mano es como dos guardias acaban discrepando sobre qué significa local.
 *
 * Uso — **no borra nada salvo que se le diga**:
 *
 *   npm run limpiar:audit              # dice qué haría
 *   npm run limpiar:audit -- --aplicar # lo hace
 */
import type { PrismaClient } from "../generated/prisma/client";
import { hostOf, isLocalDatabaseUrl } from "../lib/databaseHost";

/**
 * **El cliente NO se importa aquí, y esa es la parte importante.** `lib/db`
 * construye su adaptador con `DATABASE_URL` en el momento de importarse,
 * mientras que este script decide con `TEST_DATABASE_URL`. Importarlo arriba
 * significaba comprobar una base y borrar en otra: con un `.env` que apunte a
 * Neon —lo normal en un worktree— el guardia habría dicho «127.0.0.1, adelante»
 * y el `deleteMany` habría caído sobre producción. Se vio al correrlo por
 * primera vez, porque aquí `DATABASE_URL` estaba vacía y el contador reventó;
 * con un `.env` presente no habría reventado: habría funcionado, en la base
 * equivocada. Por eso `main()` iguala las dos variables ANTES de importar, y
 * por eso las funciones de abajo reciben el cliente en vez de cogerlo de un
 * global.
 */
type Db = Pick<PrismaClient, "auditEvent" | "$queryRaw">;

export interface Veredicto {
  ok: boolean;
  host: string | null;
  motivo?: string;
}

/** Qué URL manda. `TEST_DATABASE_URL` gana, como en `tests/setup.ts`. */
export function urlAUsar(env: Record<string, string | undefined>): string {
  return (env.TEST_DATABASE_URL ?? env.DATABASE_URL ?? "").trim();
}

/** Decide si una URL puede recibir un borrado. Pura: sin I/O ni entorno. */
export function decidirBase(url: string | undefined): Veredicto {
  const host = hostOf(url);
  if (host === null) {
    return { ok: false, host, motivo: "no se pudo leer a qué base apunta la URL" };
  }
  if (!isLocalDatabaseUrl(url)) {
    return { ok: false, host, motivo: `${host} no es una base de esta máquina` };
  }
  return { ok: true, host };
}

export interface Recuento {
  total: number;
  sinActor: number;
  conActorVivo: number;
  sinActorPeroCuentaViva: number;
}

/** Lo que hay, contado antes de tocar nada. */
export async function contar(db: Db): Promise<Recuento> {
  const [total, sinActor] = await Promise.all([
    db.auditEvent.count(),
    db.auditEvent.count({ where: { actorUserAccountId: null } }),
  ]);
  // El control de la hipótesis, en SQL porque es un `exists` contra otra tabla:
  // una fila sin actor cuyo `entityId` sea una cuenta que TODAVÍA existe
  // querría decir que «sin actor» no marca lo que creemos. Se mira contra
  // cualquier `entityId`, no sólo los de tipo `user_account`, que es la versión
  // estricta de la pregunta.
  const filas = await db.$queryRaw<{ n: bigint }[]>`
    select count(*) as n from core.audit_event a
    where a.actor_user_account_id is null
      and exists (select 1 from core.user_account u where u.id = a.entity_id)`;
  const sinActorPeroCuentaViva = Number(filas[0]?.n ?? 0);
  return { total, sinActor, conActorVivo: total - sinActor, sinActorPeroCuentaViva };
}

export class LimpiezaInsegura extends Error {}

/** Borra las filas sin actor. Devuelve cuántas. Aborta si el control falla. */
export async function limpiar(db: Db): Promise<number> {
  const antes = await contar(db);
  if (antes.sinActorPeroCuentaViva > 0) {
    throw new LimpiezaInsegura(
      `${antes.sinActorPeroCuentaViva} fila(s) sin actor apuntan a una cuenta que todavía existe: ` +
        `«sin actor» ya no significa «fixture borrado». Mirar antes de barrer.`,
    );
  }
  const { count } = await db.auditEvent.deleteMany({ where: { actorUserAccountId: null } });
  return count;
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  const url = urlAUsar(process.env);
  const veredicto = decidirBase(url);

  // La fila patrón va primero, y nombra la base: un recuento sin decir de dónde
  // sale es el error que este repositorio lleva escrito desde septiembre.
  console.log(`base: ${veredicto.host ?? "(ilegible)"}   modo: ${aplicar ? "APLICAR" : "ensayo"}`);
  if (!veredicto.ok) {
    console.error(`✗ me niego a borrar: ${veredicto.motivo}.`);
    console.error(`  Esto sólo corre contra la base local de pruebas, y no hay bandera para saltárselo.`);
    process.exitCode = 1;
    return;
  }

  // Igualar antes de importar: el cliente se conecta con `DATABASE_URL`, y el
  // guardia acaba de aprobar `url`. Si no se hace aquí, no son la misma base.
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../lib/db");

  const antes = await contar(prisma);
  console.log(`  total ${antes.total} · con actor vivo ${antes.conActorVivo} · sin actor ${antes.sinActor}`);
  console.log(`  control: ${antes.sinActorPeroCuentaViva} sin actor apuntan a una cuenta viva (debe ser 0)`);

  if (!aplicar) {
    console.log(`\n  Ensayo: no se ha borrado nada. Para hacerlo:  npm run limpiar:audit -- --aplicar`);
    return;
  }

  const borradas = await limpiar(prisma);
  const despues = await contar(prisma);
  console.log(`\n✓ borradas ${borradas}. Quedan ${despues.total}, y las ${despues.conActorVivo} con actor vivo siguen ahí.`);
  if (despues.conActorVivo !== antes.conActorVivo) {
    console.error(`✗ el rastro con actor cambió de ${antes.conActorVivo} a ${despues.conActorVivo}: eso no debía pasar.`);
    process.exitCode = 1;
  }
}

// Sólo corre como programa; importarlo desde una prueba no borra nada.
if (process.argv[1]?.includes("limpiar-audit-de-pruebas")) {
  main()
    .catch((e) => {
      console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      // Sólo si se llegó a importar: un rechazo por base remota no abre nada.
      if (process.env.DATABASE_URL) (await import("../lib/db")).prisma.$disconnect();
    });
}
