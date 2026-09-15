/**
 * Las procedencias y los sitios que el dueño declaró el 2026-09-14, y las cinco colmenas
 * que faltaban en Las Nubes.
 *
 * ## Lo que construye, y de dónde sale cada cosa
 *
 * **Geografía.** El dueño dio tres direcciones completas: «San Francisco, Veraguas» y
 * «Parita, Herrera» como procedencias, y «Los Palacios, Los Asientos, Pedasí, Los Santos»
 * como sitio de 15 colmenas. Se crean esas provincias y localidades, encadenadas como
 * direcciones panameñas.
 *
 * **NO se crean Toabré, Río Gatú ni Lagartero**, aunque el dueño tenga apiarios ahí: **no
 * dijo en qué provincia están**, y una jerarquía inventada es peor que ninguna — después
 * nadie sabe si el dato salió de él o de una suposición.
 *
 * **`locality` y no `district`.** San Francisco, Parita y Pedasí son distritos, y el enum
 * tiene `district`. Pero **el repositorio no usa ese tipo en ninguna fila** —medido: cero— y
 * `Boquete`, que también es un distrito, está guardado como `locality`. Se sigue el
 * precedente que existe (`CLAUDE.md` §61: preferir consistencia con lo ya establecido) y se
 * anota aquí para que la próxima sesión sepa que fue una elección y no un descuido.
 *
 * **Marcelino Guevara** entra como `Person`: es el apicultor que crió el pie de casi todos
 * los apiarios. Chayanne López ya existía.
 *
 * **«San Francisco, Veraguas»** NO lo crea este guion: lo declara `lib/research/catalogs.ts`
 * y lo siembra `db:seed`. Es lo que el propio catálogo manda y lo que hace que producción lo
 * reciba en el próximo despliegue. La primera versión lo insertaba a mano y
 * `origenDeColonia.test.ts` lo cazó.
 *
 * ## Dos cosas que el catálogo ya dice y que CHOCAN con lo declarado
 *
 * Se señalan y **no se corrigen**, porque dos veces el dato estaba bien y la duda estaba mal:
 *
 * 1. **`Santa Fe, Veraguas` está definido como «El pie original de Toabré».** El dueño dice
 *    que el origen de Toabré es Marcelino, de **San Francisco**. Los dos son distritos de
 *    Veraguas, así que uno de los dos está mal — y decidirlo cambia la procedencia de 15
 *    colmenas.
 * 2. **`Parita, Chitré` está definido como «Los tres núcleos instalados en septiembre»**, o
 *    sea que se creó para las 3 que Chayanne llevó a **Toabré**. Las de Cerro Azul usan ese
 *    mismo valor porque el lugar es el mismo, pero su definición ya no las describe. (Y su
 *    nombre sigue pareciendo equivocado: Parita es distrito de **Herrera**, no de Chitré.)
 *
 * ## Las cinco colmenas de Las Nubes
 *
 * El dueño confirmó **10 en total** y que las otras cinco **llegaron el 2 de septiembre**.
 *
 * **No dio hora**, así que se ancla a **medianoche de Panamá** (`05:00Z`) y no a medianoche
 * UTC. La diferencia importa: `2026-09-02T00:00:00Z` se lee como **el 1 de septiembre a las
 * 19:00** en Panamá, o sea el día equivocado. Es el artefacto que `NN-0041` ya arrastra de
 * antes —su instalación se lee como el 23 de agosto a las 19:00— y no se repite a propósito.
 *
 * **No se les crea evento de trasiego.** El del 4 de septiembre está descrito por el dueño
 * («se hizo un trasiego de las colonias a cada cámara de cría»); de estas cinco no dijo nada.
 * Crearlo sería afirmar una acción que nadie declaró. Quedan con su alta y su origen.
 *
 * ## Uso
 *
 *   npm run data:procedencias-y-sitios              (ensayo)
 *   npm run data:procedencias-y-sitios -- --apply
 *
 * Es **idempotente**: lo que ya existe se salta y se dice.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";
import { crearColocacionInicial } from "../lib/apiary/hives";

const RAZON =
  "Dueño, 2026-09-14: procedencias de los apiarios (Marcelino Guevara, San Francisco de " +
  "Veraguas) y geografía de las direcciones que declaró. Las cinco colmenas que faltaban en " +
  "Apiario Las Nubes llegaron el 2 de septiembre.";

/** Padre por nombre exacto; `null` = cuelga del país. Orden de creación. */
const GEOGRAFIA: ReadonlyArray<{ nombre: string; tipo: "province" | "locality"; padre: string }> = [
  { nombre: "Veraguas", tipo: "province", padre: "Panamá" },
  { nombre: "Herrera", tipo: "province", padre: "Panamá" },
  { nombre: "Los Santos", tipo: "province", padre: "Panamá" },
  { nombre: "San Francisco", tipo: "locality", padre: "Veraguas" },
  { nombre: "Parita", tipo: "locality", padre: "Herrera" },
  { nombre: "Pedasí", tipo: "locality", padre: "Los Santos" },
  { nombre: "Los Asientos", tipo: "locality", padre: "Pedasí" },
  { nombre: "Los Palacios", tipo: "locality", padre: "Los Asientos" },
];

const APIARIO_LAS_NUBES = "Apiario Las Nubes";
const NUEVAS = ["NN-0048", "NN-0049", "NN-0050", "NN-0051", "NN-0052"] as const;

/** 2 de septiembre de 2026 a medianoche **de Panamá** (UTC−5). Ver la cabecera. */
const LLEGARON_EN = new Date("2026-09-02T05:00:00.000Z");

const NOTA_DE_ORIGEN =
  "Núcleo joven criado, trasladado y vendido por Chayanne López (Parita, Herrera). Llegó el " +
  "2 de septiembre de 2026; la hora no se declaró. Declarado por el dueño el 2026-09-14.";

async function main() {
  const aplicar = process.argv.includes("--apply");
  console.log(aplicar ? "APLICANDO\n" : "ENSAYO — no se escribe nada\n");

  // ── Fila patrón, antes de cualquier veredicto ──────────────────────────────
  const panama = await prisma.location.findFirst({ where: { name: "Panamá", locationType: "country" } });
  const lasNubes = await prisma.location.findFirst({ where: { name: APIARIO_LAS_NUBES, locationType: "apiary_site" } });
  const catalogo = await prisma.variableCatalog.findFirst({ where: { key: "origen_de_colonia" } });

  const problemas: string[] = [];
  if (!panama) problemas.push("no existe el país «Panamá»");
  if (!lasNubes) problemas.push(`no existe el apiario «${APIARIO_LAS_NUBES}» — ¿se aplicó data:apiario-las-nubes?`);
  if (!catalogo) problemas.push("no existe el catálogo «origen_de_colonia»");
  if (problemas.length > 0) {
    console.log("ABORTA:");
    for (const p of problemas) console.log(`  · ${p}`);
    process.exitCode = 1;
    return;
  }

  const yaEn = await prisma.hive.count({ where: { locationId: lasNubes!.id } });
  console.log(`«${APIARIO_LAS_NUBES}» tiene ${yaEn} colmena(s); el dueño declaró 10 en total.\n`);

  const plan: string[] = [];
  for (const g of GEOGRAFIA) {
    const existe = await prisma.location.findFirst({ where: { name: g.nombre, locationType: g.tipo } });
    plan.push(existe ? `  = ${g.tipo} «${g.nombre}» ya existe` : `  + ${g.tipo} «${g.nombre}» bajo «${g.padre}»`);
  }
  const marcelino = await prisma.person.findFirst({ where: { displayName: "Marcelino Guevara" } });
  plan.push(marcelino ? "  = persona «Marcelino Guevara» ya existe" : "  + persona «Marcelino Guevara»");
  // El valor de origen **NO lo crea este guion**: lo declara `lib/research/catalogs.ts` y lo
  // siembra `db:seed`, que es lo que el propio catálogo manda —«el día que entre un cuarto
  // origen es una línea aquí y un `db:seed`»— y lo que hace que producción lo reciba en el
  // próximo despliegue sin tocar Neon a mano. La primera versión de este guion lo insertaba
  // directamente, y `origenDeColonia.test.ts` lo cazó: la base tenía un valor que la semilla
  // no declaraba.
  const sanFran = await prisma.variableCatalogValue.findFirst({
    where: { catalogId: catalogo!.id, value: "San Francisco, Veraguas" },
  });
  plan.push(
    sanFran
      ? "  = origen «San Francisco, Veraguas» ya sembrado"
      : "  ! origen «San Francisco, Veraguas» NO está: corre `npm run db:seed` — lo declara la semilla, no este guion",
  );
  for (const id of NUEVAS) {
    const existe = await prisma.hive.findFirst({ where: { locationId: lasNubes!.id, identifier: id } });
    plan.push(existe ? `  = colmena ${id} ya existe` : `  + colmena ${id} con colonia activa, llegada ${LLEGARON_EN.toISOString()}`);
  }
  console.log("Plan:");
  for (const l of plan) console.log(l);
  console.log();

  if (!aplicar) {
    console.log("Ensayo terminado. Añade --apply para escribir.");
    return;
  }

  const paritaValor = await prisma.variableCatalogValue.findFirst({
    where: { catalogId: catalogo!.id, value: "Parita, Chitré" },
  });
  if (!paritaValor) {
    console.log("ABORTA: no se encontró el valor de origen «Parita, Chitré».");
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Geografía. El padre se busca por nombre y tipo EXACTOS, nunca por `contains`: con
    // `contains`, «Panamá» el país y «Panamá» la provincia serían el mismo.
    for (const g of GEOGRAFIA) {
      if (await tx.location.findFirst({ where: { name: g.nombre, locationType: g.tipo } })) continue;
      const padre =
        (await tx.location.findFirst({ where: { name: g.padre, locationType: "province" } })) ??
        (await tx.location.findFirst({ where: { name: g.padre, locationType: "locality" } })) ??
        (await tx.location.findFirst({ where: { name: g.padre, locationType: "country" } }));
      if (!padre) throw new Error(`no se encontró el padre «${g.padre}» de «${g.nombre}»`);
      const fila = await tx.location.create({
        data: {
          name: g.nombre,
          locationType: g.tipo,
          parentLocationId: padre.id,
          status: "approved",
          // `internal` y no `public`: no hay página pública de estos sitios. Las dos
          // localidades que sí son `public` —Boquete y Cerro Azul— tienen slug y contenido.
          classification: "internal",
        },
      });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "location.create", entityType: "location", entityId: fila.id, after: fila, reason: RAZON, sourceInterface: "script" },
        tx,
      );
    }

    if (!marcelino) {
      const p = await tx.person.create({
        data: { givenName: "Marcelino", familyName: "Guevara", displayName: "Marcelino Guevara", locale: "es" },
      });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "person.create", entityType: "person", entityId: p.id, after: p, reason: RAZON + " Apicultor que crió el pie de casi todos los apiarios.", sourceInterface: "script" },
        tx,
      );
    }

    for (const identifier of NUEVAS) {
      if (await tx.hive.findFirst({ where: { locationId: lasNubes!.id, identifier } })) continue;
      const hive = await tx.hive.create({
        data: { identifier, locationId: lasNubes!.id, installedAt: LLEGARON_EN, status: "active" },
      });
      // La colocación inicial, por la misma razón que en `apiario-las-nubes.ts`: sin ella la
      // colmena no consta en ningún sitio para `apiarioDeColmenaEn`.
      await crearColocacionInicial(tx, { hiveId: hive.id, locationId: hive.locationId, startedAt: LLEGARON_EN });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "hive.create", entityType: "hive", entityId: hive.id, after: hive, reason: RAZON, sourceInterface: "script" },
        tx,
      );
      const colony = await tx.colony.create({
        data: {
          hiveId: hive.id,
          status: "active",
          startedAt: LLEGARON_EN,
          originType: "purchased",
          originSourceValueId: paritaValor.id,
          originNote: NOTA_DE_ORIGEN,
          // El dueño lo declara de segunda mano para estas cinco: no dijo que estuviera
          // presente el 2 de septiembre como sí dijo del 4. `original_record` y no
          // `direct_observation`.
          provenanceClass: "original_record",
        },
      });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "colony.create", entityType: "colony", entityId: colony.id, after: colony, reason: RAZON, sourceInterface: "script" },
        tx,
      );
    }
  });

  const finales = await prisma.hive.findMany({
    where: { locationId: lasNubes!.id },
    include: { colonies: true },
    orderBy: { identifier: "asc" },
  });
  console.log(`\nDespués — «${APIARIO_LAS_NUBES}»: ${finales.length} colmena(s)`);
  for (const h of finales) {
    console.log(`  ${h.identifier} · ${h.installedAt?.toISOString()} · ${h.colonies.filter((c) => c.status === "active").length} colonia(s) activa(s)`);
  }
  const geo = await prisma.location.findMany({
    where: { name: { in: GEOGRAFIA.map((g) => g.nombre) } },
    select: { name: true, locationType: true },
    orderBy: [{ locationType: "asc" }, { name: "asc" }],
  });
  console.log(`\nGeografía creada o ya existente: ${geo.map((g) => `${g.name} (${g.locationType})`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
