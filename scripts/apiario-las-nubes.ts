/**
 * Los dos apiarios reales de Néctar Nómada, dichos por el dueño el 2026-09-14.
 *
 * ## Lo que el dueño declaró, literal en lo que importa
 *
 * - **Son dos apiarios**, los dos **propiedad de Néctar Nómada**.
 * - El de Finca Rosina «vamos a llamarlo **apiario finca rosina**, tiene **2 colmenas
 *   vacías, sin colonias**, con sus patas y tapa».
 * - El otro, **Apiario Las Nubes**: 5 colmenas **NN-0043 a NN-0047**, todas con colonia
 *   activa y reina. «Núcleos jóvenes traídos de **Parita, Herrera**; **Chayanne López** es
 *   el apicultor quien las crió, trasladó y vendió.»
 * - «Este apiario se implementó el **4 de septiembre 6AM**; se hizo un **trasiego** de las
 *   colonias a cada cámara de cría correspondiente ya en sitio, elaborada con su propia
 *   **madera del bosque de Cerro Azul, un roble** que estaba en el piso y se secó y trató
 *   para uso de apicultura.»
 * - La relación con Finca Rosina importa porque «puede tener relación con finca rosina
 *   café» y porque **en el futuro, no ahora**, quieren polinización dirigida.
 *
 * ## Por qué las colonias de Rosina se BORRAN y no se cierran
 *
 * Las dos colmenas de `Apiario 1 — Finca Rosina` tienen hoy una colonia activa cada una.
 * El dueño dice que en la realidad **están vacías**. O sea que esas colonias no son
 * historia: son **datos equivocados**. Cerrarlas con `registrarFinDeColonia` exigiría una
 * causa de pérdida y **afirmaría una muerte de colonia que no ocurrió** — inventar un hecho,
 * que es la primera prohibición de `CLAUDE.md` §3. Borrarlas corrige un registro.
 *
 * La colmena `PRUEBA-apiario-1788975585395` se renombra y no se borra: la caja **existe**
 * físicamente («2 colmenas vacías, con sus patas y tapa»), lo que estaba mal era su nombre.
 *
 * ## La relación con el café ya está hecha, y no por este guion
 *
 * Los dos apiarios ya cuelgan de la ubicación `Finca Rosina` por `parentLocationId`, que a
 * su vez cuelga de la localidad `Cerro Azul`. Medido el 2026-09-14. Eso es lo que permite
 * preguntar por el café y la miel del mismo sitio, y **no se toca**. Lo que falta y este
 * guion sí pone es el **dueño**: los dos estaban `(sin organización)`.
 *
 * ## Lo que NO se toca, a propósito
 *
 * - `Finca Las Nubes (Jaramillo Arriba, Boquete)`: es **otra finca en otra provincia**, y
 *   el guion de renombrado de 2026-08-27 ya avisó de esta colisión de nombre. Se compara
 *   por nombre **exacto**, nunca por `contains`.
 * - El `parentLocationId` de los dos apiarios.
 * - La organización `Finca Rosina`, que sigue siendo la dueña de la finca.
 * - El valor de catálogo `Parita, Chitré`. **Parece estar mal** —Parita es distrito de
 *   Herrera, y el dueño dijo «Parita, Herrera»— pero corregir un catálogo es otra decisión
 *   y se señala en vez de hacerse en silencio.
 *
 * ## Lo que este guion NO puede guardar, y hay que decirlo
 *
 * - **«Con sus patas y tapa»**: `Hive` no tiene columnas para soporte ni tapa.
 * - **La madera de roble de Cerro Azul**: `Hive` no tiene columna de material ni de nota.
 *   El hecho se guarda en un `ColonyEvent` de tipo `other`, porque **`ColonyEventType` no
 *   tiene un valor de instalación** —sólo `feeding`, `treatment`, `passing_observation` y
 *   `other`— aunque el Anexo E §4 pide «Instalación o retiro de colmena» como tipo propio.
 *   Es un apaño consciente, no un diseño: cuando ese tipo exista, estas filas se migran.
 * - **La reina**: `Colony` no tiene campo de reina. «Todas con reina» se afirma en una
 *   inspección (`queenSighted`), no en el alta, y este guion **no inventa una inspección**
 *   que nadie hizo.
 *
 * ## Uso
 *
 *   npm run data:apiario-las-nubes -- --rosina-a=NN-0041 --rosina-b=NN-0042        (ensayo)
 *   npm run data:apiario-las-nubes -- --rosina-a=NN-0041 --rosina-b=NN-0042 --apply
 *
 * `--rosina-a` y `--rosina-b` son los identificadores reales de las dos colmenas de
 * Rosina, **en el orden en que el guion las lista** (alfabético por el identificador que
 * tienen hoy): `H-0014` primero y `PRUEBA-apiario-1788975585395` después. El dueño los dio
 * el 2026-09-14 —NN-0041 y NN-0042— y **continúan su numeración**: las cinco de Las Nubes
 * son NN-0043 a NN-0047.
 *
 * **Ninguno tiene valor por defecto a propósito**: un identificador inventado es un dato
 * falso con aspecto de bueno, y el guion imprime el mapeo antes de escribir para que un
 * cruce se vea.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const RAZON =
  "Dueño, 2026-09-14: dos apiarios, los dos de Néctar Nómada. El de Finca Rosina queda " +
  "con 2 colmenas vacías; Apiario Las Nubes se implementó el 4 de septiembre con 5 " +
  "colmenas NN-0043..NN-0047, núcleos de Parita (Herrera) criados y vendidos por Chayanne " +
  "López, con trasiego a cámaras de cría de roble de Cerro Azul.";

/** Medidos contra la copia restaurada el 2026-09-14. Se verifican antes de escribir. */
const ESPERADO = {
  apiarioRosina: { id: "e8ca9b29-33d9-4a16-af9a-13bad3ce5efa", nombre: "Apiario 1 — Finca Rosina" },
  apiarioLasNubes: { id: "51bf788e-8743-4960-9de6-fd3cd77ae805", nombre: "Apiario 2 — Finca Rosina" },
  orgNectarNomada: { id: "ae25a78a-9ad8-4be0-9a82-0a79dbc0daad", nombre: "Néctar Nómada" },
  personaApicultor: { id: "b6303100-0dd4-4c9d-9c02-c7a159fb0023", nombre: "Chayanne López" },
  colmenaRosinaA: "H-0014",
  colmenaRosinaB: "PRUEBA-apiario-1788975585395",
} as const;

const NOMBRE_ROSINA = "Apiario Finca Rosina";
const NOMBRE_LAS_NUBES = "Apiario Las Nubes";
const IDENTIFICADORES = ["NN-0043", "NN-0044", "NN-0045", "NN-0046", "NN-0047"] as const;

/**
 * 4 de septiembre de 2026, 6:00 de la mañana **en Panamá** (UTC−5) = 11:00 UTC.
 *
 * Se escribe en UTC explícito y no como `new Date("2026-09-04T06:00")`, que se
 * interpretaría en la zona del proceso: en un runner en UTC eso guardaría las 06:00 UTC,
 * o sea la 1 de la madrugada de Panamá. Es el fallo de ADR-112, y aquí no hay formulario
 * que mande el desfase.
 */
const IMPLEMENTADO_EN = new Date("2026-09-04T11:00:00.000Z");

const NOTA_DE_ORIGEN =
  "Núcleo joven criado, trasladado y vendido por Chayanne López (Parita, Herrera). " +
  "Declarado por el dueño el 2026-09-14.";

const NOTA_DE_TRASIEGO =
  "Trasiego de la colonia a su cámara de cría, ya en sitio, el 2026-09-04 a las 6:00 " +
  "(hora de Panamá). La cámara se elaboró con madera del bosque de Cerro Azul: un roble " +
  "que estaba en el piso, secado y tratado para uso apícola. " +
  "Se registra como evento `other` porque `ColonyEventType` no tiene un valor de " +
  "instalación; el Anexo E §4 lo pide y todavía no existe.";

function argumento(nombre: string): string | null {
  const pref = `--${nombre}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length).trim() || null : null;
}

async function main() {
  const aplicar = process.argv.includes("--apply");
  const rosinaA = argumento("rosina-a");
  const rosinaB = argumento("rosina-b");

  console.log(aplicar ? "APLICANDO\n" : "ENSAYO — no se escribe nada\n");

  // ── Fila patrón: se lee ANTES de cualquier veredicto ────────────────────────
  // Si el mundo no es el que se midió, el guion no adivina: aborta y dice qué difiere.
  const rosina = await prisma.location.findUnique({ where: { id: ESPERADO.apiarioRosina.id } });
  const lasNubes = await prisma.location.findUnique({ where: { id: ESPERADO.apiarioLasNubes.id } });
  const org = await prisma.organization.findUnique({ where: { id: ESPERADO.orgNectarNomada.id } });
  const apicultor = await prisma.person.findUnique({ where: { id: ESPERADO.personaApicultor.id } });

  const problemas: string[] = [];
  if (!rosina) problemas.push(`no existe la ubicación ${ESPERADO.apiarioRosina.id}`);
  else if (rosina.name !== ESPERADO.apiarioRosina.nombre && rosina.name !== NOMBRE_ROSINA)
    problemas.push(`la ubicación de Rosina se llama «${rosina.name}», no «${ESPERADO.apiarioRosina.nombre}»`);
  if (!lasNubes) problemas.push(`no existe la ubicación ${ESPERADO.apiarioLasNubes.id}`);
  else if (lasNubes.name !== ESPERADO.apiarioLasNubes.nombre && lasNubes.name !== NOMBRE_LAS_NUBES)
    problemas.push(`la ubicación de Las Nubes se llama «${lasNubes.name}», no «${ESPERADO.apiarioLasNubes.nombre}»`);
  if (!org) problemas.push("no existe la organización Néctar Nómada");
  if (!apicultor) problemas.push("no existe la persona Chayanne López");

  const colmenasRosina = await prisma.hive.findMany({
    where: { locationId: ESPERADO.apiarioRosina.id },
    include: { colonies: { include: { colonyEvents: true, inspections: true, varroaCounts: true, apiaryHarvestEvents: true, lossCauses: true, assets: true } } },
    orderBy: { identifier: "asc" },
  });
  console.log(`Apiario de Rosina: ${colmenasRosina.length} colmena(s)`);
  for (const h of colmenasRosina) {
    const dep = h.colonies.flatMap((c) => [
      ...c.colonyEvents.map(() => "evento"),
      ...c.inspections.map(() => "inspección"),
      ...c.varroaCounts.map(() => "varroa"),
      ...c.apiaryHarvestEvents.map(() => "cosecha"),
      ...c.lossCauses.map(() => "causa"),
      ...c.assets.map(() => "foto"),
    ]);
    console.log(`  ${h.identifier}: ${h.colonies.length} colonia(s), dependientes: ${dep.length ? dep.join(", ") : "ninguna"}`);
  }

  // Cosechas o fotos colgando de una colonia serían historia de verdad, y entonces
  // borrarla NO es corregir un registro: es perder un hecho. El guion se niega.
  const conHistoriaReal = colmenasRosina.flatMap((h) =>
    h.colonies.filter((c) => c.apiaryHarvestEvents.length > 0 || c.assets.length > 0 || c.varroaCounts.length > 0),
  );
  if (conHistoriaReal.length > 0) {
    problemas.push(
      `${conHistoriaReal.length} colonia(s) de Rosina tienen cosechas, fotos o conteos de varroa: ` +
        "eso es historia y no un dato equivocado. Hay que decidirlo a mano.",
    );
  }

  const yaEnLasNubes = await prisma.hive.count({ where: { locationId: ESPERADO.apiarioLasNubes.id } });
  console.log(`Apiario de Las Nubes: ${yaEnLasNubes} colmena(s)\n`);
  if (yaEnLasNubes > 0) problemas.push(`el apiario de Las Nubes ya tiene ${yaEnLasNubes} colmena(s); se esperaba 0`);

  if (!rosinaA || !rosinaB) {
    problemas.push(
      "faltan --rosina-a= y --rosina-b=: los nombres reales de las dos colmenas de Rosina, " +
        `en el orden en que se listan arriba (${ESPERADO.colmenaRosinaA}, ${ESPERADO.colmenaRosinaB}). ` +
        "No se inventan.",
    );
  } else if (rosinaA === rosinaB) {
    problemas.push("--rosina-a y --rosina-b son el mismo identificador: dos colmenas del mismo apiario no pueden llamarse igual.");
  } else if (IDENTIFICADORES.includes(rosinaA as (typeof IDENTIFICADORES)[number]) || IDENTIFICADORES.includes(rosinaB as (typeof IDENTIFICADORES)[number])) {
    // Un cruce con las cinco de Las Nubes pasaría el `@@unique([locationId, identifier])`
    // —son apiarios distintos— y dejaría dos colmenas con el mismo nombre en la finca.
    problemas.push(`--rosina-a/--rosina-b chocan con los identificadores de Las Nubes (${IDENTIFICADORES.join(", ")}).`);
  }

  if (problemas.length > 0) {
    console.log("ABORTA — el mundo no es el que se midió, o falta un dato:");
    for (const p of problemas) console.log(`  · ${p}`);
    process.exitCode = 1;
    return;
  }

  console.log("Plan:");
  console.log(`  1. «${rosina!.name}» → «${NOMBRE_ROSINA}», dueño ${ESPERADO.orgNectarNomada.nombre}`);
  console.log(`  2. borrar las ${colmenasRosina.reduce((n, h) => n + h.colonies.length, 0)} colonia(s) de Rosina y sus dependientes`);
  console.log(`  3. «${ESPERADO.colmenaRosinaA}» → «${rosinaA}»  y  «${ESPERADO.colmenaRosinaB}» → «${rosinaB}»`);
  console.log(`  4. «${lasNubes!.name}» → «${NOMBRE_LAS_NUBES}», dueño ${ESPERADO.orgNectarNomada.nombre}`);
  console.log(`  5. crear ${IDENTIFICADORES.length} colmenas (${IDENTIFICADORES.join(", ")}) con colonia activa y evento de trasiego`);
  console.log(`     instaladas el ${IMPLEMENTADO_EN.toISOString()} (6:00 de Panamá)\n`);

  if (!aplicar) {
    console.log("Ensayo terminado. Añade --apply para escribir.");
    return;
  }

  const origenParita = await prisma.variableCatalogValue.findFirst({
    where: { value: "Parita, Chitré" },
    select: { id: true, value: true },
  });
  if (!origenParita) {
    console.log("ABORTA: no se encontró el valor de catálogo «Parita, Chitré».");
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1 y 4 — nombre y dueño de los dos apiarios.
    for (const [loc, nombre] of [
      [rosina!, NOMBRE_ROSINA],
      [lasNubes!, NOMBRE_LAS_NUBES],
    ] as const) {
      const despues = await tx.location.update({
        where: { id: loc.id },
        data: { name: nombre, organizationId: ESPERADO.orgNectarNomada.id },
      });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "location.update", entityType: "location", entityId: loc.id, before: loc, after: despues, reason: RAZON, sourceInterface: "script" },
        tx,
      );
    }

    // 2 — las colonias equivocadas de Rosina, con sus dependientes.
    for (const h of colmenasRosina) {
      for (const c of h.colonies) {
        await tx.colonyEvent.deleteMany({ where: { colonyId: c.id } });
        await tx.inspection.deleteMany({ where: { colonyId: c.id } });
        await recordAuditEvent(
          { actorUserAccountId: null, operation: "colony.delete", entityType: "colony", entityId: c.id, before: c, reason: RAZON + " La colmena está vacía en la realidad: la colonia era un dato equivocado, no historia.", sourceInterface: "script" },
          tx,
        );
        await tx.colony.delete({ where: { id: c.id } });
      }
    }

    // 3 — los nombres reales de las dos colmenas de Rosina. Las cajas EXISTEN —«2 colmenas
    // vacías, con sus patas y tapa»—: lo que estaba mal era cómo se llamaban.
    for (const [actual, nuevo] of [
      [ESPERADO.colmenaRosinaA, rosinaA!],
      [ESPERADO.colmenaRosinaB, rosinaB!],
    ] as const) {
      const vieja = colmenasRosina.find((h) => h.identifier === actual);
      if (!vieja) continue;
      const despues = await tx.hive.update({ where: { id: vieja.id }, data: { identifier: nuevo } });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "hive.update", entityType: "hive", entityId: vieja.id, before: vieja, after: despues, reason: RAZON + " La caja existe; lo que estaba mal era su identificador.", sourceInterface: "script" },
        tx,
      );
    }

    // 5 — las cinco colmenas de Las Nubes, con su colonia y su trasiego.
    for (const identifier of IDENTIFICADORES) {
      const hive = await tx.hive.create({
        data: { identifier, locationId: ESPERADO.apiarioLasNubes.id, installedAt: IMPLEMENTADO_EN, status: "active" },
      });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "hive.create", entityType: "hive", entityId: hive.id, after: hive, reason: RAZON, sourceInterface: "script" },
        tx,
      );

      const colony = await tx.colony.create({
        data: {
          hiveId: hive.id,
          status: "active",
          startedAt: IMPLEMENTADO_EN,
          originType: "purchased",
          originSourceValueId: origenParita.id,
          originNote: NOTA_DE_ORIGEN,
          // El dueño lo vivió: hizo el trasiego. No es un informe de tercero.
          provenanceClass: "direct_observation",
        },
      });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "colony.create", entityType: "colony", entityId: colony.id, after: colony, reason: RAZON, sourceInterface: "script" },
        tx,
      );

      const evento = await tx.colonyEvent.create({
        data: {
          colonyId: colony.id,
          eventType: "other",
          occurredAt: IMPLEMENTADO_EN,
          operatorPersonId: ESPERADO.personaApicultor.id,
          note: NOTA_DE_TRASIEGO,
          provenanceClass: "direct_observation",
        },
      });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "colony_event.create", entityType: "colony_event", entityId: evento.id, after: evento, reason: RAZON, sourceInterface: "script" },
        tx,
      );
    }
  });

  // ── Y la comprobación después, que es la que vale ──────────────────────────
  const finalRosina = await prisma.hive.findMany({
    where: { locationId: ESPERADO.apiarioRosina.id },
    include: { colonies: true },
    orderBy: { identifier: "asc" },
  });
  const finalNubes = await prisma.hive.findMany({
    where: { locationId: ESPERADO.apiarioLasNubes.id },
    include: { colonies: true },
    orderBy: { identifier: "asc" },
  });
  console.log("\nDespués:");
  console.log(`  ${NOMBRE_ROSINA}: ${finalRosina.length} colmena(s), ${finalRosina.reduce((n, h) => n + h.colonies.length, 0)} colonia(s)`);
  for (const h of finalRosina) console.log(`    ${h.identifier}`);
  console.log(`  ${NOMBRE_LAS_NUBES}: ${finalNubes.length} colmena(s), ${finalNubes.reduce((n, h) => n + h.colonies.filter((c) => c.status === "active").length, 0)} colonia(s) activa(s)`);
  for (const h of finalNubes) console.log(`    ${h.identifier} · instalada ${h.installedAt?.toISOString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
