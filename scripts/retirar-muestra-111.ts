/**
 * Retira, con rastro, la muestra 111 (lote PE-80, extraída el 2026-08-28) —
 * la única muestra de producción antes de este trabajo. Se creó cuando
 * `SampleForm.tsx` no pedía `materialState` ni `stageAtExtraction`
 * (docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md
 * §6), así que no se puede verificar contra la regla de proceso terminado:
 * ni a favor ni en contra. Decisión de Daniel, 2026-09-18: «retire it».
 *
 * Usage:
 *   npm run data:retirar-muestra-111 -- --dry-run    (por defecto; solo imprime)
 *   npm run data:retirar-muestra-111 -- --aplicar
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { retirarMuestra } from "../lib/traceability/samples";

// «111» es el CÓDIGO de la muestra, no su id (un uuid). La primera versión de
// este guion buscaba `id: "111"` y en el ensayo reventó con «invalid input
// syntax for type uuid». Un código sólo es único por organización, así que se
// identifica por código Y lote de origen, y se exige exactamente una.
const SAMPLE_CODE = "111";
const LOT_CODE = "PE-80";
const MOTIVO =
  "Retirada por decisión de Daniel (2026-09-18): extraída antes de que el " +
  "guardia de muestra verde y sus campos (materialState, stageAtExtraction) " +
  "existieran en la pantalla de creación; no se puede verificar contra la " +
  "regla de proceso terminado. Ver " +
  "docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md §6.";

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const candidatas = await prisma.sample.findMany({
    where: { sampleCode: SAMPLE_CODE, sourceLot: { lotCode: LOT_CODE } },
  });
  if (candidatas.length !== 1) {
    // Cero o varias es un mundo distinto del que se decidió: no se adivina.
    console.error(`Se esperaba exactamente 1 muestra ${SAMPLE_CODE} del lote ${LOT_CODE}; hay ${candidatas.length}. No se toca nada.`);
    process.exitCode = 2;
    return;
  }
  const muestra = candidatas[0];
  if (muestra.retiredAt) {
    console.log(`La muestra ${SAMPLE_CODE} ya está retirada desde ${muestra.retiredAt.toISOString()} — nada que hacer.`);
    return;
  }

  console.log(
    `Muestra ${SAMPLE_CODE} (id ${muestra.id}): sampleType=${muestra.sampleType} ` +
      `sourceLotId=${muestra.sourceLotId ?? "(ninguno)"} materialState=${muestra.materialState ?? "(sin declarar)"}`,
  );

  if (!aplicar) {
    console.log("\nEnsayo. Re-ejecutar con --aplicar para retirarla de verdad.");
    return;
  }

  // El actor de un guion de datos no es una persona con sesión: se necesita
  // una UserAccount real, tanto por la FK de AuditEvent.actorUserAccountId
  // como por requireSampleAccess. Se usa el Platform Admin, el mismo perfil
  // que ya crea scripts/grant-platform-admin.sh.
  const admin = await prisma.userAccount.findFirstOrThrow({
    where: { assignments: { some: { roleProfile: { name: "Platform Admin" } } } },
  });

  const retirada = await retirarMuestra(admin.id, muestra.id, new Date(), MOTIVO);
  console.log(`Retirada. retiredAt = ${retirada.retiredAt?.toISOString()}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
