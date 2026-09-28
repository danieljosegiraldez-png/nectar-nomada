/**
 * El guardia que se niega a migrar contra una base remota (`scripts/migrate-guard.ts`).
 *
 * **El incidente, 2026-09-27.** `npx prisma migrate deploy` corrido a mano para poner al día la base
 * LOCAL tomó el `.env` del repositorio y apuntó a producción. No escribió nada esa vez, pero con una
 * migración pendiente la habría aplicado fuera del pipeline.
 *
 * `juzgar` es pura a propósito: así esto corre en el carril hermético, sin base y sin CLI. La otra
 * mitad —que la CLI de Prisma de verdad carga `prisma.config.ts` y por tanto llama al guardia— no la
 * puede probar un test hermético; está medida a mano y anotada en el PR.
 */
import { describe, expect, it } from "vitest";
import { juzgar } from "../../scripts/migrate-guard";

const REMOTA = "postgresql://u:c@ep-algo.neon.tech/neondb";
const LOCAL = "postgresql://postgres@127.0.0.1:55433/nectar_test";
const cli = (orden: string) => ["/bin/node", "/x/node_modules/.bin/prisma", orden];

describe("el guardia de migraciones", () => {
  it("bloquea las órdenes que escriben contra una base remota", () => {
    for (const orden of ["migrate deploy", "migrate dev", "migrate reset", "migrate resolve", "db push", "db execute", "db seed"]) {
      expect(juzgar(cli(orden), { DATABASE_URL: REMOTA }), orden).toEqual({ bloquear: true, orden });
    }
  });

  it("deja pasar las que sólo leen, aunque la base sea remota", () => {
    // El control de que la lista de arriba no es «bloquea todo»: si esto cayera, el guardia estaría
    // estorbando lo inocuo, que es como se aprende a esquivarlo.
    for (const orden of ["generate", "migrate status", "validate", "format", "version"]) {
      expect(juzgar(cli(orden), { DATABASE_URL: REMOTA }), orden).toEqual({ bloquear: false, orden: null });
    }
  });

  it("no estorba contra una base local", () => {
    expect(juzgar(cli("migrate deploy"), { DATABASE_URL: LOCAL })).toEqual({ bloquear: false, orden: "migrate deploy" });
  });

  it("las dos salidas de escape, y sólo ésas", () => {
    expect(juzgar(cli("migrate deploy"), { DATABASE_URL: REMOTA, ALLOW_REMOTE_MIGRATE: "1" }).bloquear).toBe(false);
    expect(juzgar(cli("migrate deploy"), { DATABASE_URL: REMOTA, VERCEL_ENV: "production" }).bloquear).toBe(false);
    // Controles: ni un valor distinto de "1", ni un entorno de Vercel que no sea producción, ni una
    // variable de nombre parecido. Sin estas tres, «deja pasar» no diría que la puerta es estrecha.
    expect(juzgar(cli("migrate deploy"), { DATABASE_URL: REMOTA, ALLOW_REMOTE_MIGRATE: "true" }).bloquear).toBe(true);
    expect(juzgar(cli("migrate deploy"), { DATABASE_URL: REMOTA, VERCEL_ENV: "preview" }).bloquear).toBe(true);
    expect(juzgar(cli("migrate deploy"), { DATABASE_URL: REMOTA, ALLOW_REMOTE_MIGRAR: "1" }).bloquear).toBe(true);
  });

  it("la orden llega en UN solo elemento de argv, que es como la pasa Prisma", () => {
    // Medido el 2026-09-27 sondeando `prisma.config.ts`: argv es
    // ["…/node", "…/prisma", "migrate deploy"], con la orden entera junta. La versión que comparaba
    // argv[2] con "migrate" no habría disparado NUNCA, y eso se lee igual que un guardia que va bien.
    expect(juzgar(["/bin/node", "/x/prisma", "migrate deploy"], { DATABASE_URL: REMOTA }).bloquear).toBe(true);
    // Y partido en dos también, por si una versión de Prisma cambia de forma.
    expect(juzgar(["/bin/node", "/x/prisma", "migrate", "deploy"], { DATABASE_URL: REMOTA }).bloquear).toBe(true);
    // Con sus banderas detrás.
    expect(juzgar(cli("migrate deploy --schema prisma/schema.prisma"), { DATABASE_URL: REMOTA }).bloquear).toBe(true);
  });

  it("sin DATABASE_URL se bloquea: no saber dónde apuntas no es saber que es local", () => {
    expect(juzgar(cli("migrate deploy"), {}).bloquear).toBe(true);
    expect(juzgar(cli("migrate deploy"), { DATABASE_URL: "esto no es una url" }).bloquear).toBe(true);
  });
});
