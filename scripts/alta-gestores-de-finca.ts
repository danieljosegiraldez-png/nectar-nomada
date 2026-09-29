/**
 * Dar de alta a un gestor de finca y beneficio: la persona si falta, y su perfil sobre cada finca.
 *
 * **Encargo de Daniel, 2026-09-28.** Luis Sotillo gestiona las dos fincas de Kiva Estate, y Chris
 * Huerbsch, Finca Rosina con el beneficio Las Nubes. Los dos con «permisos de dueño y gestor de
 * finca, y de jefe de beneficio húmedo y seco».
 *
 * **Eso es el perfil `Farm Manager` y no hizo falta nada nuevo.** Su descripción dice «Runs a
 * coffee farm and its beneficio», y se creó el 2026-09-16 para Bob Huerbsch, gestor de Finca Rosina
 * y copropietario del beneficio Las Nubes.
 *
 * **Lo que el encargo pedía y NO existe en este modelo**, para que nadie lo busque:
 *
 * - **No hay perfil «Farm Owner».** La propiedad vive en la `Organization` y en
 *   `location.organization_id`, no en los permisos.
 * - **No hay ámbito de organización.** `ScopeType` es `platform | project | location | session`, así
 *   que «admin de Kiva Estate sobre sus dos fincas» son DOS asignaciones de ubicación, una por
 *   finca. ADR-144 alcanza hacia ABAJO —parcelas, microparcelas, instalaciones y camas— no de lado.
 * - **`Farm Manager` excluye a propósito `platform:manage_users` y `platform:manage_permissions`**
 *   —«running a farm is not running the platform»—. Si un gestor tiene que dar de alta a su propia
 *   gente, eso es otra decisión y no entra aquí.
 *
 * **Lo que este guión NO hace, y es deliberado:**
 *
 * - **No crea fincas.** Desde ADR-189 la pantalla lo hace: `/fincas` → «sin terreno» para la
 *   primera de una organización, y `/fincas/nueva?organizacion=<id>` para las siguientes. Una
 *   versión anterior de este guión las creaba con `location.create` y se saltaba `crearFinca` —que
 *   comprueba permiso, nombre libre y escribe el `AuditEvent`—; eso es el importador que rodea lo
 *   que el servicio protege, y por eso se quitó en vez de arreglarse.
 * - **No pone el correo ni crea la cuenta.** Eso es `npm run people:set-email`, que desde ADR-083
 *   crea la `UserAccount` invitada y basta para entrar con Google; no hay contraseña en ningún
 *   paso. Y si el correo ya estuviera puesto, ese guión sale por «nada que hacer» SIN crear la
 *   cuenta, así que ponerlo desde aquí rompería el camino. La persona se crea sin correo.
 *
 * Simula por defecto. Escribe sólo con `--apply`, y es idempotente: se corre, se ponen los correos,
 * se crean las fincas por pantalla, y se vuelve a correr para que conceda lo que faltaba.
 *
 * Uso:
 *   NN_ACTOR_EMAIL=... npx tsx scripts/alta-gestores-de-finca.ts
 *   NN_ACTOR_EMAIL=... npx tsx scripts/alta-gestores-de-finca.ts --apply
 *   NN_ACTOR_EMAIL=... npx tsx scripts/alta-gestores-de-finca.ts --luis "Finca A" --luis "Finca B"
 */
// Debe ir primero: lib/db lee DATABASE_URL al importarse.
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";
import { grantRole } from "../lib/rbac/admin";

const PERFIL = "Farm Manager";
const FUENTE = "script:alta-gestores-de-finca";
const RAZON =
  "Encargo de Daniel 2026-09-28: Luis Sotillo gestiona las dos fincas de Kiva Estate; " +
  "Chris Huerbsch, Finca Rosina con el beneficio Las Nubes. Perfil Farm Manager, que es " +
  "finca y beneficio (húmedo y seco) en uno.";

type Sitio = { readonly name: string; readonly locationType: "site" | "beneficio" };
type Persona = {
  readonly displayName: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly correo: string;
  readonly sitios: readonly Sitio[];
};

/**
 * Los nombres de las fincas de Luis se dan por argumento porque **los pone Daniel al crearlas en
 * `/fincas`**, y desde ADR-189 cada una lleva nombre propio en vez de heredar el de la
 * organización. Los de abajo son los que él dijo; si los escribe distinto, `--luis "…"`.
 */
const FINCAS_DE_LUIS_POR_DEFECTO = ["Kiva Estate Finca 1", "Kiva Estate Finca 2"] as const;

function fincasDeLuis(): string[] {
  const dados: string[] = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i += 1) {
    const siguiente = argv[i + 1];
    if (argv[i] === "--luis" && siguiente) dados.push(siguiente);
  }
  return dados.length > 0 ? dados : [...FINCAS_DE_LUIS_POR_DEFECTO];
}

function gente(): Persona[] {
  return [
    {
      displayName: "Luis Sotillo",
      givenName: "Luis",
      familyName: "Sotillo",
      correo: "lcsotillo35@gmail.com",
      sitios: fincasDeLuis().map((name) => ({ name, locationType: "site" as const })),
    },
    {
      displayName: "Chris Huerbsch",
      givenName: "Chris",
      familyName: "Huerbsch",
      correo: "chuerbsch@gmail.com",
      // **Sólo la finca, y el beneficio NO va aparte.** Medido el 2026-09-28 sobre la copia local
      // restaurada: «Las Nubes» (beneficio) CUELGA de «Finca Rosina», así que por ADR-144 la
      // asignación de la finca ya lo alcanza y una segunda sería una fila que no concede nada. Eso
      // explica el precedente: Bob Huerbsch, copropietario del beneficio, recibió UNA asignación.
      // El guardia de más abajo lo comprueba en vez de suponerlo.
      sitios: [{ name: "Finca Rosina", locationType: "site" as const }],
    },
  ];
}

class PreconditionError extends Error {}

const linea = (s: string) => console.log(`  ${s}`);

/** ¿`posibleAncestroId` está por encima de `id`? Es lo que ADR-144 resuelve. */
async function esAncestro(posibleAncestroId: string, id: string): Promise<boolean> {
  let actual: string | null = id;
  const vistos = new Set<string>();
  while (actual && !vistos.has(actual)) {
    vistos.add(actual);
    const fila: { parentLocationId: string | null } | null = await prisma.location.findUnique({
      where: { id: actual },
      select: { parentLocationId: true },
    });
    actual = fila?.parentLocationId ?? null;
    if (actual === posibleAncestroId) return true;
  }
  return false;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "\nMODO: aplicar\n" : "\nMODO: simulación (usá --apply para escribir)\n");

  const actorEmail = process.env.NN_ACTOR_EMAIL;
  if (!actorEmail) throw new PreconditionError("Falta NN_ACTOR_EMAIL: conceder un rol exige un actor real.");
  const actor = await prisma.userAccount.findFirst({
    where: { person: { email: actorEmail } },
    select: { id: true, person: { select: { displayName: true } } },
  });
  if (!actor) throw new PreconditionError(`No hay UserAccount para ${actorEmail}.`);
  linea(`Actor: ${actor.person.displayName} (${actorEmail})`);

  const perfil = await prisma.roleProfile.findUnique({ where: { name: PERFIL }, select: { id: true } });
  if (!perfil) throw new PreconditionError(`No existe el perfil "${PERFIL}". Sembralo primero:  npm run db:seed`);

  const personas = gente();

  console.log("\n— Las personas —");
  for (const p of personas) {
    const ya = await prisma.person.findFirst({
      where: { displayName: p.displayName },
      select: { id: true, email: true, userAccount: { select: { status: true } } },
    });
    if (ya) {
      linea(`«${p.displayName}» ya existe, correo ${ya.email ?? "sin poner"}, cuenta ${ya.userAccount?.status ?? "ninguna"}`);
      if (ya.email && ya.email !== p.correo) {
        linea(`   OJO: su correo es ${ya.email} y el encargo decía ${p.correo}. No se toca; miralo.`);
      }
      continue;
    }
    if (!apply) {
      linea(`crearía «${p.displayName}» — ${p.givenName} / ${p.familyName}, SIN correo (lo pone people:set-email)`);
      continue;
    }
    const creada = await prisma.$transaction(async (tx) => {
      const fila = await tx.person.create({
        data: { givenName: p.givenName, familyName: p.familyName, displayName: p.displayName },
        select: { id: true, displayName: true, givenName: true, familyName: true, status: true },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: actor.id,
          operation: "person.create",
          entityType: "person",
          entityId: fila.id,
          before: null,
          after: fila,
          reason: RAZON,
          sourceInterface: FUENTE,
        },
        tx,
      );
      return fila;
    });
    linea(`creada «${creada.displayName}» (${creada.id}), estado ${creada.status}`);
  }

  // **El guardia de la única asignación de Chris.** Se le concede SÓLO «Finca Rosina» porque el
  // beneficio cuelga de ella. Si dejara de colgar, esa única asignación concedería de menos en
  // silencio, así que esto aborta antes de escribir en vez de avisar en una línea que nadie lee.
  const rosina = await prisma.location.findFirst({ where: { name: "Finca Rosina", locationType: "site" }, select: { id: true } });
  const lasNubes = await prisma.location.findFirst({ where: { name: "Las Nubes", locationType: "beneficio" }, select: { id: true } });
  if (!rosina) throw new PreconditionError('No existe el sitio "Finca Rosina".');
  if (!lasNubes) throw new PreconditionError('No existe el beneficio "Las Nubes" (nombre canónico, no "Beneficio Las Nubes").');
  if (!(await esAncestro(rosina.id, lasNubes.id))) {
    throw new PreconditionError(
      "«Las Nubes» ya NO cuelga de «Finca Rosina», así que la asignación de la finca no lo alcanza.\n" +
        "  Este guión concede una sola asignación apoyándose en ADR-144. Añadí el beneficio a los\n" +
        "  sitios de Chris antes de seguir, o se queda sin el beneficio y nada lo dirá.",
    );
  }

  // Antes de conceder nada, decir QUÉ sitios se van a mirar y si existen. Sin esto, una corrida
  // sobre una persona que todavía no existe imprime lo mismo con cualquier `--luis`, y entonces la
  // salida no demuestra que el argumento hiciera algo.
  console.log("\n— Los sitios de cada quien —");
  for (const p of personas) {
    for (const s of p.sitios) {
      const sitio = await prisma.location.findFirst({
        where: { name: s.name, locationType: s.locationType },
        select: { id: true, _count: { select: { childLocations: true } } },
      });
      linea(
        sitio
          ? `${p.displayName}: «${s.name}» (${s.locationType}) existe, ${sitio._count.childLocations} hijos directos`
          : `${p.displayName}: «${s.name}» (${s.locationType}) NO existe todavía — creala en /fincas`,
      );
    }
  }

  console.log("\n— Las asignaciones —");
  let faltan = 0;
  for (const p of personas) {
    const persona = await prisma.person.findFirst({
      where: { displayName: p.displayName },
      select: { email: true, userAccount: { select: { id: true } } },
    });
    if (!persona) {
      linea(`${p.displayName}: todavía no existe (simulación), nada que conceder`);
      faltan += 1;
      continue;
    }
    if (!persona.userAccount) {
      linea(`${p.displayName}: sin cuenta. Poné el correo y volvé a correr esto:`);
      linea(`    npm run people:set-email -- "${p.displayName}" ${p.correo}`);
      faltan += 1;
      continue;
    }
    for (const s of p.sitios) {
      const sitio = await prisma.location.findFirst({
        where: { name: s.name, locationType: s.locationType },
        select: { id: true, _count: { select: { childLocations: true } } },
      });
      if (!sitio) {
        linea(`${p.displayName}: FALTA «${s.name}» (${s.locationType}). Creala en /fincas y volvé a correr esto.`);
        faltan += 1;
        continue;
      }
      const yaTiene = await prisma.assignment.findFirst({
        where: { userAccountId: persona.userAccount.id, roleProfileId: perfil.id, scope: { scopeType: "location", scopeRefId: sitio.id } },
        select: { id: true },
      });
      if (yaTiene) {
        linea(`${p.displayName} ya es ${PERFIL} en «${s.name}» (${yaTiene.id}). Nada que hacer.`);
        continue;
      }
      if (!apply) {
        linea(`concedería ${PERFIL} a ${p.displayName} en «${s.name}» — ${sitio._count.childLocations} hijos directos, que ADR-144 alcanza`);
        continue;
      }
      const asignacion = await grantRole(actor.id, {
        userAccountId: persona.userAccount.id,
        roleProfileId: perfil.id,
        scopeType: "location",
        scopeRefId: sitio.id,
      });
      linea(`concedido ${PERFIL} a ${p.displayName} en «${s.name}» (asignación ${asignacion.id})`);
    }
  }

  console.log("");
  if (faltan > 0) {
    linea(
      faltan === 1
        ? "Queda 1 cosa por hacer antes de que esto conceda todo. Volvé a correrlo después."
        : `Quedan ${faltan} cosas por hacer antes de que esto conceda todo. Volvé a correrlo después.`,
    );
    console.log("");
  }
}

main()
  .catch((error) => {
    if (error instanceof PreconditionError) {
      console.error(`\n  ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  })
  .finally(() => prisma.$disconnect());
