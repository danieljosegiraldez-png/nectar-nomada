/**
 * Consolidar dos fichas de la MISMA persona en una.
 *
 * **Por qué existe.** §2 del paquete prohíbe duplicar personas canónicas, y aun
 * así pasó: el 2026-09-17 se crearon fichas nuevas para gente que ya estaba en la
 * base desde agosto. La forma es siempre la misma — la vieja tiene la membresía y
 * su título, la nueva tiene el correo y una cuenta que ya actuó — y el síntoma que
 * lo destapa es `people:set-email` diciendo «matches 2 people».
 *
 * **Qué ficha sobrevive, y por qué no es una elección libre.** Sobrevive la
 * CANÓNICA (la que tiene la membresía), y sobrevive la CUENTA de la duplicada,
 * porque esa cuenta ya escribió en `audit_event` como actor. El registro de
 * auditoría es de sólo añadir (§35): repuntar un actor sería reescribir historia.
 * Y `user_account.person_id` es ÚNICO, así que una persona no puede quedarse con
 * dos cuentas — una tiene que desaparecer, y sólo puede ser la que no ha actuado.
 *
 * De ahí sale el orden, que no es negociable:
 *
 *   1. las asignaciones de la cuenta vieja pasan a la cuenta que se queda
 *   2. se borra la cuenta vieja —ya sin referencias—, liberando el índice único
 *   3. la cuenta que se queda se repunta a la persona canónica
 *   4. el correo se suelta de la duplicada y se pone en la canónica (es `@unique`)
 *   5. se borra la ficha duplicada, que ya no tiene nada
 *
 * **La guarda que de verdad protege** no es ninguna de esas: es comprobar, EN EL
 * MOMENTO Y GENERADO DEL ESQUEMA, que la ficha duplicada no esté referenciada en
 * ninguna otra parte. Son 51 columnas apuntando a `core.person` y una lista
 * escrita a mano envejecería en el primer modelo nuevo — que es exactamente cómo
 * el guardia de `grant-platform-admin` acabó comparando contra un 89 congelado.
 * Si algo la referencia, esto ABORTA y dice qué tabla.
 *
 * Uso:
 *   npm run people:consolidar                          # lista los nombres repetidos
 *   npm run people:consolidar -- <idCanónica> <idDuplicada>
 *   npm run people:consolidar -- <idCanónica> <idDuplicada> --aplicar
 *
 * Sin `--aplicar` **no escribe nada**: mide, enseña el plan y las post-condiciones
 * que exigirá. Un ensayo que no se distingue de la corrida real es un ensayo que
 * nadie hace.
 */

// Debe ir primero: lib/db lee DATABASE_URL al importarse.
import "dotenv/config";

import { prisma } from "../lib/db";

function fail(mensaje: string, ...detalle: string[]): never {
  console.error(`\n  ${mensaje}`);
  for (const l of detalle) console.error(`  ${l}`);
  console.error("");
  process.exit(1);
}

/**
 * Las columnas que apuntan a `core.<tabla>.<columna>`, preguntadas al esquema.
 *
 * Parametrizada porque hay DOS cosas que este guion hace desaparecer —una ficha de persona y una
 * cuenta— y durante un día midió sólo la primera. Ver la segunda guarda en `consolidar`.
 */
async function columnasQueApuntanA(
  tablaDestino: string,
  columnaDestino: string,
): Promise<{ esquema: string; tabla: string; columna: string }[]> {
  return prisma.$queryRaw<{ esquema: string; tabla: string; columna: string }[]>`
    select tc.table_schema as esquema, tc.table_name as tabla, kcu.column_name as columna
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'core' and ccu.table_name = ${tablaDestino} and ccu.column_name = ${columnaDestino}
    order by tc.table_schema, tc.table_name, kcu.column_name`;
}

async function referenciasA(
  id: string,
  destino: { tabla: string; columna: string } = { tabla: "person", columna: "id" },
): Promise<{ donde: string; n: number }[]> {
  const columnas = await columnasQueApuntanA(destino.tabla, destino.columna);
  if (columnas.length === 0) {
    fail(`el esquema no devolvió ninguna columna que apunte a core.${destino.tabla}.${destino.columna} — la guarda no puede medir`);
  }
  const salida: { donde: string; n: number }[] = [];
  for (const c of columnas) {
    const filas = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*)::bigint as n from "${c.esquema}"."${c.tabla}" where "${c.columna}" = $1::uuid`,
      id,
    );
    const n = Number(filas[0]?.n ?? 0);
    if (n > 0) salida.push({ donde: `${c.esquema}.${c.tabla}.${c.columna}`, n });
  }
  return salida;
}

async function listar(): Promise<void> {
  const repetidos = await prisma.$queryRaw<{ display_name: string; cuantas: bigint }[]>`
    select display_name, count(*)::bigint as cuantas
    from core.person group by display_name having count(*) > 1 order by display_name`;

  console.log("\n  Nombres que aparecen más de una vez\n");
  if (repetidos.length === 0) console.log("  (ninguno)");
  for (const r of repetidos) {
    const fichas = await prisma.person.findMany({
      where: { displayName: r.display_name },
      select: {
        id: true, email: true, status: true, createdAt: true,
        userAccount: { select: { id: true, status: true } },
        _count: { select: { organizationMemberships: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`  ${r.display_name}`);
    for (const f of fichas) {
      console.log(
        `    ${f.id}  ${f.createdAt.toISOString().slice(0, 10)}  ` +
          `${(f.email ?? "(sin correo)").padEnd(26)} ` +
          `${f._count.organizationMemberships} memb.  ` +
          `cuenta ${f.userAccount ? f.userAccount.status : "(ninguna)"}`,
      );
    }
    console.log("");
  }
  console.log("  La que SOBREVIVE es la que tiene la membresía — es la canónica.");
  console.log("  Consolidar:  npm run people:consolidar -- <idCanónica> <idDuplicada>\n");
  console.log("  **Dos fichas con nombres DISTINTOS no salen aquí** —«Bob» y «Robert» no se");
  console.log("  parecen para un `group by`— así que esta lista es una ayuda, no un censo.\n");
}

async function consolidar(canonicaId: string, duplicadaId: string, aplicar: boolean): Promise<void> {
  if (canonicaId === duplicadaId) fail("son el mismo id");

  const campos = {
    id: true, displayName: true, email: true, status: true,
    userAccount: { select: { id: true, status: true } },
    _count: { select: { organizationMemberships: true } },
  } as const;
  const canonica = await prisma.person.findUnique({ where: { id: canonicaId }, select: campos });
  const duplicada = await prisma.person.findUnique({ where: { id: duplicadaId }, select: campos });
  if (!canonica) fail(`no existe la ficha canónica ${canonicaId}`);
  if (!duplicada) fail(`no existe la ficha duplicada ${duplicadaId}`);

  console.log("\n  Canónica (sobrevive)");
  console.log(`    ${canonica.displayName}  ${canonica.id}`);
  console.log(`    correo: ${canonica.email ?? "(ninguno)"}  ·  membresías: ${canonica._count.organizationMemberships}`);
  console.log(`    cuenta: ${canonica.userAccount ? `${canonica.userAccount.id} (${canonica.userAccount.status})` : "(ninguna)"}`);
  console.log("\n  Duplicada (se borra)");
  console.log(`    ${duplicada.displayName}  ${duplicada.id}`);
  console.log(`    correo: ${duplicada.email ?? "(ninguno)"}  ·  membresías: ${duplicada._count.organizationMemberships}`);
  console.log(`    cuenta: ${duplicada.userAccount ? `${duplicada.userAccount.id} (${duplicada.userAccount.status})` : "(ninguna)"}`);

  // LA GUARDA. Generada del esquema, no de una lista.
  const refs = await referenciasA(duplicadaId);
  const fuera = refs.filter((r) => r.donde !== "core.user_account.person_id");
  console.log(`\n  Referencias a la duplicada, medidas en ${(await columnasQueApuntanA("person", "id")).length} columnas:`);
  for (const r of refs) console.log(`    ${r.donde}: ${r.n}`);
  if (fuera.length > 0) {
    fail(
      "la ficha duplicada SÍ tiene historia — no se consolida así:",
      ...fuera.map((r) => `  ${r.donde}: ${r.n}`),
      "Repuntar esas filas es otra decisión y no la toma este guion.",
    );
  }
  if (!duplicada.userAccount) fail("la duplicada no tiene cuenta: no hay nada que mover, bórrala a mano si procede");
  if (canonica._count.organizationMemberships === 0) {
    console.log("\n  AVISO: la canónica no tiene ninguna membresía. ¿Seguro que es la canónica?");
  }

  const cuentaQueSeQueda = duplicada.userAccount.id;
  const cuentaQueSeVa = canonica.userAccount?.id ?? null;

  // **LA SEGUNDA GUARDA: lo que apunta a la CUENTA QUE SE BORRA.**
  //
  // La guarda de arriba mide referencias a la PERSONA duplicada, y durante un día fue la única. No
  // ve nada de esto: el paso 2 borra una `core.user_account`, y
  // `core.audit_event.actor_user_account_id` es `ON DELETE SET NULL` —leído en la migración
  // `20260809221638_init_identity`, no deducido del esquema—. Así que borrar una cuenta que haya
  // actuado **no falla**: deja sus filas de auditoría sin actor, en silencio, que es exactamente lo
  // que §35 prohíbe. Lo mismo con cada `created_by` de la base, y `core.external_identity` es
  // `ON DELETE CASCADE`: su enlace con Google desaparecería sin dejar rastro.
  //
  // La cabecera de este archivo ya decía que sobrevive la cuenta que ya actuó. Lo que faltaba era
  // COMPROBARLO en vez de suponerlo por su `status`.
  if (cuentaQueSeVa) {
    const columnasDeCuenta = await columnasQueApuntanA("user_account", "id");
    const refsCuenta = await referenciasA(cuentaQueSeVa, { tabla: "user_account", columna: "id" });
    // Las asignaciones no cuentan: el paso 1 las mueve antes de borrar.
    const fueraDeCuenta = refsCuenta.filter((r) => r.donde !== "core.assignment.user_account_id");
    console.log(`\n  Referencias a la cuenta que se borra (${cuentaQueSeVa}), medidas en ${columnasDeCuenta.length} columnas:`);
    if (refsCuenta.length === 0) console.log("    (ninguna)");
    for (const r of refsCuenta) console.log(`    ${r.donde}: ${r.n}`);
    if (fueraDeCuenta.length > 0) {
      fail(
        "la cuenta que se iba a borrar TIENE historia — borrarla la perdería en silencio:",
        ...fueraDeCuenta.map((r) => `  ${r.donde}: ${r.n}`),
        "core.audit_event.actor_user_account_id es ON DELETE SET NULL: el borrado no falla, deja la fila sin actor (§35).",
        "Qué hacer con esas filas es otra decisión y no la toma este guion.",
      );
    }
  }

  const asignacionesQueSeMueven = cuentaQueSeVa
    ? await prisma.assignment.count({ where: { userAccountId: cuentaQueSeVa } })
    : 0;
  // **Las que la cuenta superviviente YA TIENE, y por eso existe esta variable.**
  // La post-condicion de abajo comparaba las de despues contra las que se mueven, y esa
  // igualdad solo vale cuando la superviviente esta vacia. En la pareja real de Chris
  // Huerbsch no lo estaba: `grant-platform-admin.sql` concede buscando
  // `p.email = :email AND ua.auth_provider = 'credentials'`, y ese correo vive en la ficha
  // DUPLICADA, asi que su Platform Admin cuelga justo de la cuenta que sobrevive. Con 2 que
  // se mueven y 1 propia, la post-condicion habria dicho «esperaba 2, hay 3» sobre una
  // consolidacion CORRECTA — y se lee despues de confirmar la transaccion, asi que habria
  // dejado el escrito hecho y un error en pantalla. Es la misma forma que el 89 congelado y
  // el recuento sin ambito de ese mismo guion: una post-condicion que mide algo distinto de
  // lo que afirma.
  const asignacionesPropias = await prisma.assignment.count({ where: { userAccountId: cuentaQueSeQueda } });
  const asignacionesEsperadas = asignacionesQueSeMueven + asignacionesPropias;
  const totalAsignaciones = await prisma.assignment.count();
  const totalAuditoria = await prisma.auditEvent.count();

  console.log("\n  Plan");
  console.log(`    1. mover ${asignacionesQueSeMueven} asignación(es) de ${cuentaQueSeVa ?? "(no hay cuenta vieja)"} a ${cuentaQueSeQueda}`);
  console.log(`    2. borrar la cuenta ${cuentaQueSeVa ?? "(nada que borrar)"}`);
  console.log(`    3. repuntar la cuenta ${cuentaQueSeQueda} a la persona ${canonicaId}`);
  console.log(`    4. mover el correo ${duplicada.email ?? "(ninguno)"} a la canónica`);
  console.log(`    5. borrar la ficha ${duplicadaId}`);
  console.log("\n  Post-condiciones que se exigirán");
  console.log(`    · la canónica tiene el correo y EXACTAMENTE una cuenta`);
  console.log(
    `    · esa cuenta tiene ${asignacionesEsperadas} asignación(es): ${asignacionesPropias} propia(s) + ${asignacionesQueSeMueven} movida(s)`,
  );
  console.log(`    · la duplicada ya no existe`);
  console.log(`    · core.assignment sigue en ${totalAsignaciones} filas (no se crea ni se pierde ninguna)`);
  console.log(
    `    · la fila de core.audit_event de esto se puede volver a leer, y el total (${totalAuditoria}) no decrece`,
  );

  if (!aplicar) {
    console.log("\n  ENSAYO: no se escribió nada. Añade --aplicar para hacerlo.\n");
    return;
  }

  const correo = duplicada.email;
  // La transacción devuelve el id de SU fila de auditoría: la post-condición la busca por ese id
  // en vez de deducirla de un recuento global. Ver el comentario de abajo.
  const idDeAuditoria = await prisma.$transaction(async (tx) => {
    if (cuentaQueSeVa) {
      await tx.assignment.updateMany({ where: { userAccountId: cuentaQueSeVa }, data: { userAccountId: cuentaQueSeQueda } });
      await tx.userAccount.delete({ where: { id: cuentaQueSeVa } });
    }
    await tx.userAccount.update({ where: { id: cuentaQueSeQueda }, data: { personId: canonicaId } });
    if (correo) {
      await tx.person.update({ where: { id: duplicadaId }, data: { email: null } });
      await tx.person.update({ where: { id: canonicaId }, data: { email: correo } });
    }
    await tx.person.delete({ where: { id: duplicadaId } });

    // §35: un cambio de identidad se audita, y el `before`/`after` dice qué se
    // fusionó con qué. El actor es nulo porque esto corre fuera de la aplicación,
    // igual que `grant-platform-admin`, y el registro lo dice en vez de nombrar a
    // un apoderado.
    const fila = await tx.auditEvent.create({
      select: { id: true },
      data: {
        actorUserAccountId: null,
        operation: "update",
        entityType: "person",
        entityId: canonicaId,
        before: { duplicada: { id: duplicadaId, displayName: duplicada.displayName, email: correo }, cuentaBorrada: cuentaQueSeVa },
        after: {
          id: canonicaId,
          displayName: canonica.displayName,
          email: correo,
          cuenta: cuentaQueSeQueda,
          asignacionesMovidas: asignacionesQueSeMueven,
          asignacionesPropias,
        },
        reason: "consolidación de dos fichas de la misma persona (§2: no se duplican personas canónicas)",
        sourceInterface: "cli",
      },
    });
    return fila.id;
  });

  // Post-condiciones, leídas DESPUÉS y fuera de la transacción.
  const despues = await prisma.person.findUnique({ where: { id: canonicaId }, select: campos });
  const siguePresente = await prisma.person.findUnique({ where: { id: duplicadaId }, select: { id: true } });
  const asignacionesDespues = await prisma.assignment.count({ where: { userAccountId: cuentaQueSeQueda } });
  const totalAsignacionesDespues = await prisma.assignment.count();
  const totalAuditoriaDespues = await prisma.auditEvent.count();
  // **SU fila se busca por id; el total sólo se usa para la regla de §35.**
  // Esta comprobación exigía `totalAuditoria + 1`, y `core.audit_event` es la tabla más escrita de
  // la aplicación: cada operación deja fila, un inicio de sesión incluido. Si alguien usa la
  // aplicación durante la consolidación —y el día que se escribió esto se le estaba dando acceso
  // justo a la persona que se consolida— el total crece de más, la consolidación es CORRECTA y la
  // post-condición grita. Es la misma forma que la de las asignaciones: una invariante global que
  // esta operación no posee. Lo que sí posee es su propia fila.
  const filaDeAuditoria = await prisma.auditEvent.findUnique({ where: { id: idDeAuditoria }, select: { id: true } });

  const problemas: string[] = [];
  if (correo && despues?.email !== correo) problemas.push(`la canónica no tiene el correo: ${despues?.email ?? "(ninguno)"}`);
  if (!despues?.userAccount) problemas.push("la canónica quedó sin cuenta");
  if (despues?.userAccount && despues.userAccount.id !== cuentaQueSeQueda) problemas.push("la cuenta de la canónica no es la que debía quedarse");
  if (siguePresente) problemas.push("la ficha duplicada sigue existiendo");
  if (asignacionesDespues !== asignacionesEsperadas) {
    problemas.push(
      `asignaciones en ${cuentaQueSeQueda}: esperaba ${asignacionesEsperadas} (${asignacionesPropias} propias + ${asignacionesQueSeMueven} movidas), hay ${asignacionesDespues}`,
    );
  }
  if (totalAsignacionesDespues !== totalAsignaciones) problemas.push(`core.assignment pasó de ${totalAsignaciones} a ${totalAsignacionesDespues}`);
  if (!filaDeAuditoria) problemas.push(`la fila de core.audit_event ${idDeAuditoria} no se puede volver a leer: la transacción no confirmó`);
  if (totalAuditoriaDespues < totalAuditoria + 1) {
    problemas.push(
      `core.audit_event pasó de ${totalAuditoria} a ${totalAuditoriaDespues}: no creció, y §35 dice que es de sólo-añadir`,
    );
  }

  if (problemas.length > 0) {
    fail("la consolidación se escribió pero las post-condiciones NO cuadran:", ...problemas.map((p) => `  ${p}`));
  }
  console.log(`\n  Hecho. ${despues!.displayName} · ${despues!.email ?? "(sin correo)"} · cuenta ${cuentaQueSeQueda} con ${asignacionesDespues} asignación(es).`);
  console.log(`  Entra con Google usando ${despues!.email ?? "su correo"}; no hay contraseña que fijar (ADR-083).\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--aplicar");
  const aplicar = process.argv.includes("--aplicar");
  if (args.length === 0) return listar();
  if (args.length !== 2) fail("uso: npm run people:consolidar -- <idCanónica> <idDuplicada> [--aplicar]");
  return consolidar(args[0]!, args[1]!, aplicar);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
