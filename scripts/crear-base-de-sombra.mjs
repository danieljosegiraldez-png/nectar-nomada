/**
 * Crea la base de sombra que `prisma migrate diff --from-migrations` necesita.
 *
 * **Por qué existe.** Prisma **no la crea** cuando se le da una URL: espera que
 * exista, y si no, corta con `P1003 Database … does not exist`. Eso tumbó la
 * compuerta con base el 2026-09-13, y lo hizo del modo correcto — el guardia de
 * `tests/derivaDeMigraciones.test.ts` distingue «error» de «sin deriva», así que
 * dijo *«no pude medir»* en vez de pasar en verde.
 *
 * **Con `pg` y no con `psql`.** `pg` es dependencia del proyecto; `psql` no
 * aparece ni una vez en el log del runner, así que apoyarse en él sería apostar a
 * que la imagen lo trae.
 *
 * Idempotente: si ya está, lo dice y sale con 0. `42P04` es «ya existe».
 */
import { Client } from "pg";

const sombra = process.env.SHADOW_DATABASE_URL;
if (!sombra) {
  console.error("Hace falta SHADOW_DATABASE_URL.");
  process.exit(1);
}

const url = new URL(sombra);
const nombre = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (!nombre) {
  console.error(`SHADOW_DATABASE_URL no nombra ninguna base: ${url.host}`);
  process.exit(1);
}
// Un identificador que no sea el esperado no se interpola a una sentencia: se
// rechaza. `CREATE DATABASE` no acepta parámetros, así que el nombre va en el
// texto, y ahí es donde una comilla ajena se volvería inyección.
if (!/^[A-Za-z0-9_]+$/.test(nombre)) {
  console.error(`Nombre de base no admitido para crear: ${nombre}`);
  process.exit(1);
}

// Se conecta a la base de mantenimiento del MISMO servidor: no se puede crear
// una base estando conectado a ella.
const mantenimiento = new URL(sombra);
mantenimiento.pathname = "/postgres";

const cliente = new Client({ connectionString: mantenimiento.toString() });
try {
  await cliente.connect();
  await cliente.query(`CREATE DATABASE "${nombre}"`);
  console.log(`Base de sombra creada: ${nombre} en ${url.host}`);
} catch (error) {
  if (error.code === "42P04") {
    console.log(`Base de sombra ya estaba: ${nombre} en ${url.host}`);
  } else {
    console.error(`No se pudo crear la base de sombra ${nombre}:`, error.message);
    process.exit(1);
  }
} finally {
  await cliente.end().catch(() => {});
}
