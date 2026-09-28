/**
 * ¿De qué fase habla cada objetivo de receta que ya existe?
 *
 * **Para qué existe (2026-09-27).** El diseño de la cola de secado añade `phase` a `ProcessTarget`
 * —fermentación o secado— para que el ritmo del secado pueda vivir en la receta. La tentación es
 * rellenar `fermentation` en todo lo existente «porque es la única fase que tenía receta». Eso es un
 * supuesto, no un hecho: una `ProcessRecipeVersion` puede estar referenciada por fermentaciones,
 * **tuestes**, perfiles de tueste y procesos de lote, así que un objetivo cuya receta sólo se usó en
 * un tueste no es de fermentación.
 *
 * Esto lo cuenta antes de escribir la migración, y la migración decide con la misma condición que
 * este guion imprime: no hay que creerle a nadie.
 *
 * **Sólo lee.** Ni `update`, ni `create`, ni `delete`.
 *
 * Uso:
 *   npm run data:medir-fases
 */
import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const versiones = await prisma.processRecipeVersion.findMany({
    select: {
      id: true,
      version: true,
      recipe: { select: { name: true } },
      _count: {
        select: {
          targets: true,
          fermentationRuns: true,
          roastSessions: true,
          lotRoastProfiles: true,
          lotProcesses: true,
        },
      },
    },
    orderBy: [{ recipe: { name: "asc" } }, { version: "asc" }],
  });

  const conObjetivos = versiones.filter((v) => v._count.targets > 0);
  const objetivos = conObjetivos.reduce((n, v) => n + v._count.targets, 0);

  console.log(`\nversiones de receta: ${versiones.length} · con objetivos: ${conObjetivos.length} · objetivos en total: ${objetivos}\n`);

  const tocadaPorTueste = (v: (typeof versiones)[number]) =>
    v._count.roastSessions > 0 || v._count.lotRoastProfiles > 0;

  let soloFermentacion = 0;
  let conTueste = 0;
  let sinUso = 0;

  for (const v of conObjetivos) {
    const c = v._count;
    const usos = [
      c.fermentationRuns ? `${c.fermentationRuns} fermentación` : null,
      c.lotProcesses ? `${c.lotProcesses} proceso` : null,
      c.roastSessions ? `${c.roastSessions} TUESTE` : null,
      c.lotRoastProfiles ? `${c.lotRoastProfiles} perfil de tueste` : null,
    ].filter(Boolean);
    const veredicto = tocadaPorTueste(v)
      ? "NO se rellena: la toca un tueste"
      : c.fermentationRuns + c.lotProcesses > 0
        ? "se rellena fermentation"
        : "NO se rellena: nadie la usa";
    if (tocadaPorTueste(v)) conTueste += 1;
    else if (c.fermentationRuns + c.lotProcesses > 0) soloFermentacion += 1;
    else sinUso += 1;
    console.log(`  «${v.recipe.name}» v${v.version} · ${c.targets} objetivo(s) · usos: ${usos.length ? usos.join(", ") : "ninguno"}`);
    console.log(`      → ${veredicto}`);
  }

  console.log(`\nresumen de versiones con objetivos:`);
  console.log(`  sólo fermentación o proceso → se rellenan: ${soloFermentacion}`);
  console.log(`  tocadas por un tueste → se quedan sin fase: ${conTueste}`);
  console.log(`  sin ningún uso → se quedan sin fase: ${sinUso}`);
  console.log(
    `\nLa migración usa esta misma condición: pone \`fermentation\` sólo donde NINGÚN tueste ni perfil\n` +
      `de tueste referencia la versión. Lo demás queda nulo, que significa «no dice de qué fase habla».\n`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
