/**
 * Se niega a aplicar migraciones —o a sembrar, o a empujar el esquema— contra una base remota.
 *
 * **El incidente, 2026-09-27.** Un comando de cuatro palabras, `npx prisma migrate deploy`, corrido
 * a mano desde un portátil para poner al día la base LOCAL. Sin `DATABASE_URL` delante toma el
 * `.env` del repositorio, así que apuntó a producción. Aquella vez no escribió nada —«No pending
 * migrations to apply», confirmado después contra el registro— pero con una migración pendiente la
 * habría aplicado a producción fuera del pipeline de Vercel, que es donde eso debe pasar y donde
 * `scripts/vercel-build.sh` lo hace con su orden y sus comprobaciones.
 *
 * `next dev` ya tenía su guardia (`scripts/dev-guard.ts`) y la suite el suyo (`tests/setup.ts`).
 * La CLI de Prisma era el hueco: la única de las tres que escribe en la base sin que nada pregunte.
 * Los tres comparten la definición de «local» en vez de reescribirla (ADR-084, `lib/databaseHost.ts`).
 *
 * **Sólo se bloquean las órdenes que ESCRIBEN.** `generate`, `migrate status`, `validate` y `format`
 * pasan siempre: leer a dónde apunta uno, o mirar si hay migraciones pendientes, es justo lo que hace
 * falta poder hacer contra producción sin ceremonia. Un guardia que estorba lo inocuo se aprende a
 * esquivar, y entonces ya no guarda nada.
 *
 * La salida de escape es explícita a propósito, como la de sus hermanos: `ALLOW_REMOTE_MIGRATE=1`.
 * Y `VERCEL_ENV=production` pasa sin ella, porque ése es el camino que SÍ debe aplicar.
 *
 * **`db seed` NO está en la lista de arriba, y es deliberado.** La CLI lo ejecuta lanzando
 * `tsx prisma/seed.ts` (lo dice `prisma.config.ts`), así que la siembra la guarda el propio
 * `prisma/seed.ts` con `vigilarSiembra()`. Ponerlo en los dos sitios obligaría a exportar DOS
 * variables para un solo comando, y una puerta con dos cerrojos se deja abierta. Guardar por
 * EFECTO y no por herramienta tiene además la ventaja que buscábamos: `npm run db:seed`, que no
 * pasa por la CLI, queda cubierto igual.
 */
import { hostOf, isLocalDatabaseUrl } from "../lib/databaseHost";

/**
 * Las que escriben. **`migrate resolve` está dentro** aunque no toque tablas: reescribe el registro
 * de migraciones de la base, y marcar una como aplicada en producción sin que lo esté es más difícil
 * de deshacer que casi cualquier otra cosa de esta lista.
 */
const ORDENES_QUE_ESCRIBEN = [
  "migrate deploy",
  "migrate dev",
  "migrate reset",
  "migrate resolve",
  "db push",
  "db execute",
] as const;

export interface Veredicto {
  bloquear: boolean;
  /** La orden reconocida, para que el mensaje y las pruebas digan cuál se juzgó. */
  orden: string | null;
}

/**
 * Puro: no lee el entorno ni el proceso, y por eso se puede probar sin base y sin CLI.
 *
 * **`argv` llega con la orden entera en UN elemento** —`["…/prisma", "migrate deploy"]`, no
 * `["migrate", "deploy"]`—, medido el 2026-09-27 sondeando `prisma.config.ts` en tres órdenes
 * distintas. Por eso se une y se normaliza antes de comparar: la versión que comparaba `argv[2]`
 * con `"migrate"` no habría disparado nunca, y un guardia que no dispara se lee igual que uno que
 * funciona.
 */
export function juzgar(argv: readonly string[], env: Record<string, string | undefined>): Veredicto {
  const dicho = argv.slice(2).join(" ").trim().replace(/\s+/g, " ");
  const orden = ORDENES_QUE_ESCRIBEN.find((o) => dicho === o || dicho.startsWith(`${o} `)) ?? null;
  if (!orden) return { bloquear: false, orden: null };
  if (isLocalDatabaseUrl(env.DATABASE_URL)) return { bloquear: false, orden };
  if (env.ALLOW_REMOTE_MIGRATE === "1") return { bloquear: false, orden };
  // El pipeline de producción SÍ debe aplicar: es su trabajo, y lo hace tras `next build`.
  if (env.VERCEL_ENV === "production") return { bloquear: false, orden };
  return { bloquear: true, orden };
}

export function mensaje(orden: string, url: string | undefined): string {
  return [
    "",
    `Me niego a correr \`prisma ${orden}\` contra una base remota (${hostOf(url) ?? "DATABASE_URL vacía o ilegible"}).`,
    "",
    "La CLI de Prisma lee el `.env` del repositorio, así que sin `DATABASE_URL` delante esto",
    "es PRODUCCIÓN. Las migraciones de producción las aplica el pipeline en",
    "`scripts/vercel-build.sh`, después de `next build` y antes de la siembra.",
    "",
    "Para la base local:",
    "",
    '  DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test" npx prisma ' + orden,
    "",
    "Si de verdad quieres tocar la remota desde aquí, dilo:",
    "",
    `  ALLOW_REMOTE_MIGRATE=1 npx prisma ${orden}`,
    "",
  ].join("\n");
}

/** El efecto, separado de la decisión para que `juzgar` se pueda probar sin matar el proceso. */
export function vigilar(argv: readonly string[] = process.argv, env = process.env): void {
  const { bloquear, orden } = juzgar(argv, env);
  if (!bloquear || !orden) return;
  console.error(mensaje(orden, env.DATABASE_URL));
  process.exit(1);
}

/**
 * La siembra, que no llega por `argv` sino por ejecución directa de `prisma/seed.ts`.
 *
 * Es un upsert idempotente y por eso menos grave que una migración — pero escribe en la base, y
 * hasta el 2026-09-27 `npm run db:seed` contra producción no lo impedía nada.
 */
export function juzgarSiembra(env: Record<string, string | undefined>): boolean {
  if (isLocalDatabaseUrl(env.DATABASE_URL)) return false;
  if (env.ALLOW_REMOTE_SEED === "1") return false;
  if (env.VERCEL_ENV === "production") return false;   // `vercel-build.sh` siembra ahí a propósito
  return true;
}

export function mensajeDeSiembra(url: string | undefined): string {
  return [
    "",
    `Me niego a sembrar contra una base remota (${hostOf(url) ?? "DATABASE_URL vacía o ilegible"}).`,
    "",
    "`prisma/seed.ts` lee el `.env` del repositorio, así que sin `DATABASE_URL` delante esto es",
    "PRODUCCIÓN. La siembra de producción la hace el pipeline en `scripts/vercel-build.sh`,",
    "después de `prisma migrate deploy` y con las banderas `SEED_DEMO_*` limpiadas.",
    "",
    "Para la base local:",
    "",
    '  DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test" npm run db:seed',
    "",
    "Si de verdad quieres sembrar la remota desde aquí, dilo:",
    "",
    "  ALLOW_REMOTE_SEED=1 npm run db:seed",
    "",
  ].join("\n");
}

export function vigilarSiembra(env = process.env): void {
  if (!juzgarSiembra(env)) return;
  console.error(mensajeDeSiembra(env.DATABASE_URL));
  process.exit(1);
}
