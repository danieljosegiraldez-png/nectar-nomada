/**
 * Guardia del carril con base: la corrida no deja filas de `core.audit_event` sin actor.
 *
 * **Por qué existe.** Una prueba que borra en su limpieza la cuenta que creó, sin borrar antes
 * lo que esa cuenta firmó, no deja filas sueltas que fallen en algún sitio: las deja con el
 * actor a NULL, porque `audit_event_actor_user_account_id_fkey` es `ON DELETE SET NULL`. Medido
 * el 2026-10-13, archivo por archivo sobre una base sembrada desde `main` en `ef42134b`: 72
 * archivos del grupo `base-sembrada` lo hacían, 876 filas por corrida, y todos en verde. Un
 * filtro por el texto de las pruebas («borra la cuenta y no menciona `actorUserAccountId`»)
 * dejaba fuera 10 de ellos, así que el guardia no lee código: cuenta lo que la corrida deja.
 *
 *   node scripts/auditoria-sin-actor.mjs contar          → imprime N (y la base, por stderr)
 *   node scripts/auditoria-sin-actor.mjs comprobar <N>   → sale 1 si ahora hay más de N
 *
 * **«No pude medir» nunca sale 0.** Sin `DATABASE_URL`, con un error de la consulta, o con una
 * cifra de partida que no sea un entero, sale 2. La última importa más de lo que parece: si
 * el `contar` de antes falla y deja la variable vacía, `Number("")` vale 0 y el guardia diría
 * «0 antes, 0 después» sin haber medido nada.
 */
import { Client } from "pg";

const [modo, partida] = process.argv.slice(2);

function noPudeMedir(motivo) {
  console.error(`auditoria-sin-actor: no se pudo medir — ${motivo}`);
  process.exit(2);
}

if (modo !== "contar" && modo !== "comprobar") noPudeMedir(`modo desconocido: ${modo ?? "(ninguno)"}`);
if (modo === "comprobar" && !/^\d+$/.test(partida ?? "")) {
  noPudeMedir(`la cifra de partida no es un entero: «${partida ?? ""}»`);
}
const url = process.env.DATABASE_URL;
if (!url) noPudeMedir("falta DATABASE_URL");

const db = new Client({ connectionString: url });
try {
  await db.connect();
  const { rows } = await db.query(
    "select current_database() as base, count(*)::int as n from core.audit_event where actor_user_account_id is null",
  );
  const { base, n } = rows[0];

  if (modo === "contar") {
    console.error(`auditoria-sin-actor: ${n} filas sin actor en ${base} antes de la corrida`);
    console.log(n);
  } else {
    const antes = Number(partida);
    console.log(`── Auditoría sin actor en ${base}: ${antes} antes de la corrida, ${n} después`);
    if (n > antes) {
      const desglose = await db.query(
        `select operation, entity_type, count(*)::int as n from core.audit_event
          where actor_user_account_id is null group by 1, 2 order by 3 desc, 1, 2 limit 20`,
      );
      console.log(`La corrida dejó ${n - antes} filas de auditoría sin actor. Todas las de la base, por operación:`);
      for (const f of desglose.rows) console.log(`   ${String(f.n).padStart(5)}  ${f.operation}  (${f.entity_type})`);
      console.log(
        "Lo normal es una limpieza que borra la cuenta de la prueba sin borrar antes su auditoría:\n" +
          "`auditEvent.deleteMany({ where: { actorUserAccountId: { in: <cuentas de la corrida> } } })` justo antes\n" +
          "del `userAccount.deleteMany`. Ver tests/sync/pushFieldEvents.test.ts. Para encontrar el archivo,\n" +
          "córrelos de uno en uno contra una base desechable y cuenta antes y después.",
      );
      process.exit(1);
    }
  }
} catch (e) {
  noPudeMedir(e instanceof Error ? e.message : String(e));
} finally {
  await db.end().catch(() => {});
}
