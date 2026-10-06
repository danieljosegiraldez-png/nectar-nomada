/**
 * Kiva Estate: su geografía real, y el `site` que se llama como la organización.
 *
 * **Encargo de Daniel, 2026-10-06.** «Kiva Estate es la organización que tiene Finca 1,
 * Finca 2, y son fincas; dentro de cada finca pueden tener más de una parcela o lote.»
 * Y: «Todas ubicadas en Toabre, Penonomé, Coclé, pero cada una aislada en su área.»
 *
 * ## Lo que hay hoy, medido contra producción el 2026-10-06
 *
 * A la organización «Kiva Estate» le cuelgan **dos** ubicaciones, y **ninguna tiene padre**:
 *
 * | nombre | tipo | padre |
 * |---|---|---|
 * | `Kiva Estate` | `site` | (ninguno) |
 * | `Apiario NN-04-TOABRE-KIVAEST` | `apiary_site` | (ninguno) |
 *
 * El `site` se llama igual que la organización, que es justo lo que
 * `nectar-nomada-farms` avisa de no hacer: leer el nombre de una ubicación para deducir su
 * dueño es el error que ya costó un renombrado entero. Daniel decidió ese día que ese `site`
 * **es la Finca 1** y que se renombre.
 *
 * Y `Coclé`, `Penonomé` y `Toabre` **no existen** en la base. Medido con control: hay 1 país,
 * 2 provincias y 4 localidades, así que la consulta sí mira donde debe.
 *
 * ## Lo que hace
 *
 * 1. Crea la cadena `Coclé` → `Penonomé` → `Toabre`, bajo el país `Panamá` que ya existe.
 * 2. Renombra el `site` «Kiva Estate» a **«Finca 1»** y lo cuelga de `Toabre`.
 *
 * Las dos mitades van juntas a propósito: renombrar sin colgar deja la finca flotando, y
 * colgar sin renombrar deja dos cosas llamadas «Kiva Estate» bajo una localidad.
 *
 * ## `locality` y no `district`, otra vez
 *
 * Penonomé es un distrito y Toabre un corregimiento, y el enum tiene `district`. Pero
 * **el repositorio no usa ese tipo en ninguna fila** —medido: cero— y `Boquete`, que también
 * es un distrito, está guardado como `locality`, con `Alto Lino` anidado debajo. Se sigue el
 * precedente que existe, igual que `scripts/procedencias-y-sitios.ts` lo razonó el 2026-09-14,
 * y se anota aquí para que la próxima sesión sepa que fue una elección y no un descuido.
 *
 * Eso además cierra algo que aquel guion dejó abierto: se negó a crear Toabré **porque nadie
 * había dicho en qué provincia está**, y una jerarquía inventada es peor que ninguna. Daniel
 * lo dijo el 2026-10-06.
 *
 * ## La trampa que este guion esquiva, y por qué se nombra
 *
 * **Hay DOS ubicaciones llamadas `Panamá`**: el país y la provincia. Buscar el padre por
 * nombre sin exigir el tipo devuelve una de las dos **al azar** y cuelga Coclé de la provincia
 * de Panamá, que es geografía inventada y no falla en rojo. Cada búsqueda de este guion exige
 * `{ name, locationType }`, nunca sólo el nombre — la misma regla que
 * `scripts/procedencias-y-sitios.ts` escribió en su comentario.
 *
 * ## Lo que NO hace, y es deliberado
 *
 * - **No toca `Apiario NN-04-TOABRE-KIVAEST`**, que sigue sin padre. Su nombre dice TOABRE y
 *   probablemente debería colgar de la misma localidad, pero Daniel no lo pidió y re-colgar
 *   un apiario cambia el alcance de cualquier asignación sobre él por ADR-144. Se señala.
 * - **No crea «Finca 2»**: eso lo hace Daniel por pantalla, en `/fincas/nueva`, que es el
 *   camino que comprueba permiso y nombre libre (ADR-189).
 * - **No crea el beneficio de Kiva.** Hoy un beneficio sólo puede colgar de un `site`
 *   —`lib/traceability/beneficios.ts` lo impone— y Daniel decidió el 2026-10-06 que ese límite
 *   debe cambiar, porque una organización puede tener beneficio y no tener finca. Es otra
 *   decisión y otro PR.
 * - **No toca ningún `slug`**, igual que `rename-finca-rosina.ts`: las URL públicas sobreviven
 *   al renombrado. El `slug` de este `site` es nulo de todas formas.
 *
 * Simula por defecto. Escribe sólo con `--apply`.
 *
 * Uso:
 *   NN_ACTOR_EMAIL=... npm run data:kiva-geografia
 *   NN_ACTOR_EMAIL=... npm run data:kiva-geografia -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const ORG = "Kiva Estate";
const SITE_VIEJO = "Kiva Estate";
const SITE_NUEVO = "Finca 1";

const RAZON =
  "Encargo de Daniel 2026-10-06: Kiva Estate es la organización; sus fincas son Finca 1 y " +
  "Finca 2, ubicadas en Toabre, Penonomé, Coclé.";
const FUENTE = "scripts/kiva-geografia-y-finca-1.ts";

/**
 * De arriba abajo. `tipoPadre` es obligatorio y no un adorno: sin él, «Panamá» el país y
 * «Panamá» la provincia son indistinguibles.
 */
type FilaGeografica = {
  nombre: string;
  tipo: "province" | "locality";
  padre: string;
  /** Obligatorio: sin él, «Panamá» el país y «Panamá» la provincia son la misma búsqueda. */
  tipoPadre: "country" | "province" | "locality";
};

const GEOGRAFIA: ReadonlyArray<FilaGeografica> = [
  { nombre: "Coclé", tipo: "province", padre: "Panamá", tipoPadre: "country" },
  { nombre: "Penonomé", tipo: "locality", padre: "Coclé", tipoPadre: "province" },
  { nombre: "Toabre", tipo: "locality", padre: "Penonomé", tipoPadre: "locality" },
];

const DESTINO = "Toabre";
const TIPO_DESTINO = "locality" as const;

class PreconditionError extends Error {}

const linea = (s: string) => console.log(`  ${s}`);

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "\nMODO: aplicar\n" : "\nMODO: simulación (usá --apply para escribir)\n");

  const actorEmail = process.env.NN_ACTOR_EMAIL;
  if (!actorEmail) throw new PreconditionError("Falta NN_ACTOR_EMAIL: escribir un dato exige un actor real.");
  const actor = await prisma.userAccount.findFirst({
    where: { person: { email: actorEmail } },
    select: { id: true, person: { select: { displayName: true } } },
  });
  if (!actor) throw new PreconditionError(`No hay UserAccount para ${actorEmail}.`);
  linea(`Actor: ${actor.person.displayName} (${actorEmail})`);

  // --- la organización -------------------------------------------------------
  const orgs = await prisma.organization.findMany({ where: { name: ORG }, select: { id: true, name: true } });
  if (orgs.length === 0) throw new PreconditionError(`No existe ninguna organización llamada "${ORG}".`);
  if (orgs.length > 1) throw new PreconditionError(`Hay ${orgs.length} organizaciones llamadas "${ORG}". Parar y mirar cuál es.`);
  const org = orgs[0]!;

  // --- el sitio a renombrar --------------------------------------------------
  // Por nombre Y tipo Y organización: el nombre solo también casaría con la organización si
  // algún día alguien crea otra ubicación homónima en otra parte.
  const sitios = await prisma.location.findMany({
    where: { name: SITE_VIEJO, locationType: "site", organizationId: org.id },
    select: { id: true, name: true, parentLocationId: true, slug: true },
  });
  if (sitios.length === 0) {
    const yaRenombrado = await prisma.location.findFirst({
      where: { name: SITE_NUEVO, locationType: "site", organizationId: org.id },
      select: { id: true, parentLocationId: true },
    });
    if (yaRenombrado) {
      linea(`El sitio ya se llama «${SITE_NUEVO}» (${yaRenombrado.id}). Nada que renombrar.`);
    } else {
      throw new PreconditionError(
        `No existe ningún \`site\` llamado "${SITE_VIEJO}" bajo la organización "${ORG}", ` +
          `y tampoco uno llamado "${SITE_NUEVO}". Parar y mirar qué hay.`,
      );
    }
  }
  if (sitios.length > 1) {
    throw new PreconditionError(`Hay ${sitios.length} sitios llamados "${SITE_VIEJO}" bajo "${ORG}". Parar y mirar.`);
  }
  const sitio = sitios[0] ?? null;

  // El nombre nuevo tiene que estar libre EN TODA la tabla, no sólo bajo esta organización:
  // dos fincas con el mismo nombre vuelven ambiguo cualquier `--luis "Finca 1"` y cualquier
  // guion que busque por nombre, que son la mayoría de los de `scripts/`.
  if (sitio) {
    const ocupado = await prisma.location.findFirst({
      where: { name: SITE_NUEVO, NOT: { id: sitio.id } },
      select: { id: true, name: true, locationType: true },
    });
    if (ocupado) {
      throw new PreconditionError(
        `Ya existe otra ubicación llamada "${SITE_NUEVO}" (${ocupado.locationType}, ${ocupado.id}).\n` +
          "  No se renombra encima: dos ubicaciones homónimas rompen todo guion que busque por nombre.",
      );
    }
  }

  // --- la geografía ----------------------------------------------------------
  console.log("");
  linea("— La cadena geográfica —");
  const faltan: FilaGeografica[] = [];
  for (const g of GEOGRAFIA) {
    const existe = await prisma.location.findFirst({
      where: { name: g.nombre, locationType: g.tipo },
      select: { id: true },
    });
    if (existe) {
      linea(`«${g.nombre}» (${g.tipo}) ya existe — ${existe.id}`);
      continue;
    }
    // El padre se comprueba ahora aunque todavía no exista en esta corrida: si es uno de los
    // que este mismo guion va a crear, se dará por bueno y se resolverá dentro de la
    // transacción, en orden.
    const vaACrearlo = GEOGRAFIA.some((o) => o.nombre === g.padre && o.tipo === g.tipoPadre);
    if (!vaACrearlo) {
      const padre = await prisma.location.findFirst({
        where: { name: g.padre, locationType: g.tipoPadre },
        select: { id: true },
      });
      if (!padre) {
        throw new PreconditionError(
          `No existe el padre «${g.padre}» (${g.tipoPadre}) que «${g.nombre}» necesita, y este guion no lo crea.`,
        );
      }
    }
    linea(`«${g.nombre}» (${g.tipo}) NO existe — se crearía bajo «${g.padre}» (${g.tipoPadre})`);
    faltan.push({ ...g });
  }

  // --- el renombrado ---------------------------------------------------------
  console.log("");
  linea("— El sitio —");
  if (!sitio) {
    linea("nada que hacer con el sitio");
  } else {
    const padreActual = sitio.parentLocationId
      ? await prisma.location.findUnique({
          where: { id: sitio.parentLocationId },
          select: { name: true, locationType: true },
        })
      : null;
    linea(`«${sitio.name}» (${sitio.id})`);
    linea(`padre hoy: ${padreActual ? `«${padreActual.name}» (${padreActual.locationType})` : "(ninguno)"}`);
    if (padreActual && !(padreActual.name === DESTINO && padreActual.locationType === TIPO_DESTINO)) {
      throw new PreconditionError(
        `Ese sitio ya cuelga de «${padreActual.name}» (${padreActual.locationType}), que no es «${DESTINO}».\n` +
          "  Alguien lo colocó ahí a propósito. No se mueve sin mirar: parar y preguntar.",
      );
    }
    linea(`se renombraría a «${SITE_NUEVO}» y colgaría de «${DESTINO}» (${TIPO_DESTINO})`);
    if (sitio.slug) linea(`AVISO: tiene slug «${sitio.slug}», que NO se toca — la URL pública sobrevive`);
  }

  if (!apply) {
    console.log(`\n  ENSAYO: no se escribió nada. ${faltan.length} fila(s) de geografía y ` +
      `${sitio ? 1 : 0} renombrado. Añadí --apply para hacerlo.\n`);
    return;
  }

  // --- escribir --------------------------------------------------------------
  const resultado = await prisma.$transaction(async (tx) => {
    const creadas: string[] = [];
    for (const g of faltan) {
      const padre = await tx.location.findFirst({
        where: { name: g.padre, locationType: g.tipoPadre },
        select: { id: true },
      });
      if (!padre) throw new Error(`dentro de la transacción no se encontró el padre «${g.padre}» (${g.tipoPadre})`);
      const fila = await tx.location.create({
        data: {
          name: g.nombre,
          locationType: g.tipo,
          parentLocationId: padre.id,
          status: "approved",
          // `internal` y no `public`: estas tres no tienen página pública ni slug, igual que
          // las que creó `procedencias-y-sitios.ts`.
          classification: "internal",
          createdBy: actor.id,
        },
        select: { id: true, name: true, locationType: true, parentLocationId: true },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: actor.id,
          operation: "location.create",
          entityType: "location",
          entityId: fila.id,
          after: fila,
          reason: RAZON,
          sourceInterface: FUENTE,
        },
        tx,
      );
      creadas.push(`${fila.name} (${fila.locationType}, ${fila.id})`);
    }

    let renombrado: { id: string; name: string; parentLocationId: string | null } | null = null;
    if (sitio) {
      const destino = await tx.location.findFirst({
        where: { name: DESTINO, locationType: TIPO_DESTINO },
        select: { id: true },
      });
      if (!destino) throw new Error(`dentro de la transacción no existe «${DESTINO}» (${TIPO_DESTINO})`);
      const antes = await tx.location.findUniqueOrThrow({
        where: { id: sitio.id },
        select: { id: true, name: true, parentLocationId: true },
      });
      const despues = await tx.location.update({
        where: { id: sitio.id },
        data: { name: SITE_NUEVO, parentLocationId: destino.id },
        select: { id: true, name: true, parentLocationId: true },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: actor.id,
          operation: "location.update",
          entityType: "location",
          entityId: despues.id,
          before: antes,
          after: despues,
          reason: RAZON,
          sourceInterface: FUENTE,
        },
        tx,
      );
      renombrado = despues;
    }

    return { creadas, renombrado };
  });

  console.log("");
  for (const c of resultado.creadas) linea(`creada: ${c}`);
  if (resultado.renombrado) {
    linea(`renombrado: «${SITE_VIEJO}» -> «${resultado.renombrado.name}», padre ${resultado.renombrado.parentLocationId}`);
  }

  // Relectura después de escribir: lo de arriba es lo que la transacción devolvió, esto es lo
  // que la base dice ahora. Un guion que sólo imprime lo que creyó escribir no verifica nada.
  const comprobacion = await prisma.location.findFirst({
    where: { name: SITE_NUEVO, locationType: "site" },
    select: { id: true, name: true, parentLocation: { select: { name: true, locationType: true } } },
  });
  console.log("");
  if (!comprobacion) {
    linea("OJO: al releer, no existe ningún `site` llamado «" + SITE_NUEVO + "».");
    process.exitCode = 1;
  } else {
    const p = comprobacion.parentLocation;
    linea(`releído: «${comprobacion.name}» cuelga de ${p ? `«${p.name}» (${p.locationType})` : "(nada)"}`);
    if (!p || p.name !== DESTINO) {
      linea(`OJO: se esperaba que colgara de «${DESTINO}».`);
      process.exitCode = 1;
    }
  }
  console.log("");
}

main()
  .catch((error) => {
    if (error instanceof PreconditionError) {
      console.error(`\n  PRECONDICIÓN FALLIDA: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  })
  .finally(() => prisma.$disconnect());
