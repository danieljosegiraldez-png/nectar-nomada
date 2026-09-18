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

const SAMPLE_ID = "111";
const MOTIVO =
  "Retirada por decisión de Daniel (2026-09-18): extraída antes de que el " +
  "guardia de muestra verde y sus campos (materialState, stageAtExtraction) " +
  "existieran en la pantalla de creación; no se puede verificar contra la " +
  "regla de proceso terminado. Ver " +
  "docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md §6.";

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const muestra = await prisma.sample.findUnique({ where: { id: SAMPLE_ID } });
  if (!muestra) {
    console.log(`No existe una muestra con id ${SAMPLE_ID} — nada que retirar.`);
    return;
  }
  if (muestra.retiredAt) {
    console.log(`La muestra ${SAMPLE_ID} ya está retirada desde ${muestra.retiredAt.toISOString()} — nada que hacer.`);
    return;
  }

  console.log(
    `Muestra ${SAMPLE_ID}: sampleCode=${muestra.sampleCode} sampleType=${muestra.sampleType} ` +
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

  const retirada = await retirarMuestra(admin.id, SAMPLE_ID, new Date(), MOTIVO);
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
