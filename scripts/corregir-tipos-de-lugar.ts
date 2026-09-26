/**
 * Tres lugares que el sistema tiene como «sitio» —el tipo de una finca— y son instalaciones.
 *
 * Daniel, 2026-09-21: «Invernadero solar» le salía en /fincas como otra finca. Causa: el import de
 * Cafelino (`scripts/import-cafelino-pe.ts`) lo creó con `locationType: "site"` antes de que
 * existiera `drying_facility`. Con la misma forma, colgados de Finca Rosina, hay dos más.
 * El PR #461 ya hace que /fincas no los liste; esto corrige la causa, el tipo.
 *
 *   «Invernadero solar»                     (bajo Cafelino)       site → drying_facility
 *   «Cuarto de secado — Beneficio Las Nubes» (bajo Finca Rosina)  site → drying_facility
 *
 * Se empareja por **nombre exacto, nombre exacto del padre y tipo actual `site`**. Nada que no
 * case con las tres cosas se toca, y una fila que ya tenga el tipo nuevo se da por hecha.
 *
 * **La simulación imprime también lo que hay alrededor**, contra la base a la que apunte
 * `DATABASE_URL`: qué cuelga de cada lugar, cuántos lotes lo usan, y qué lugares existen ya con el
 * tipo de destino. Lo último importa: si ya hubiera otro «Beneficio Las Nubes» con tipo
 * `beneficio`, cambiar éste lo duplicaría en las listas de beneficios. En ese caso el script NO
 * aplica ese cambio aunque se le pase `--apply`, y lo dice.
 *
 * No toca: el padre de ningún lugar, sus nombres, ni nada fuera de estas tres filas.
 *
 * **QUITADO el 2026-09-26: «Beneficio Las Nubes» NO se convierte en beneficio.** Medido en producción
 * ese día: ya existe «Las Nubes» de tipo `beneficio`, y son el MISMO —decisión de Daniel—. Convertir
 * el segundo habría creado un duplicado en todas las listas. De unificarlos —mover sus permisos,
 * corregir la jerarquía y archivar el duplicado— se encarga
 * `scripts/unificar-beneficio-las-nubes.ts`.
 *
 * Uso:
 *   npm run data:tipos-de-lugar              (simulación: sólo imprime)
 *   npm run data:tipos-de-lugar -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";
import type { LocationType } from "../generated/prisma/client";

const RAZON =
  "Daniel, 2026-09-21: lugares creados como `site` antes de que existieran los tipos de " +
  "instalación; «Invernadero solar» salía en /fincas como otra finca.";

const CAMBIOS: ReadonlyArray<{ nombre: string; padre: string; a: LocationType }> = [
  { nombre: "Invernadero solar", padre: "Cafelino", a: "drying_facility" },
  { nombre: "Cuarto de secado — Beneficio Las Nubes", padre: "Finca Rosina", a: "drying_facility" },
];

async function main() {
  const aplicar = process.argv.includes("--apply");
  console.log(aplicar ? "APLICANDO\n" : "SIMULACIÓN — no se escribe nada\n");

  let aplicados = 0;
  let hechos = 0;
  let noEncontrados = 0;
  let bloqueados = 0;

  for (const c of CAMBIOS) {
    const fila = await prisma.location.findFirst({
      where: { name: c.nombre, parentLocation: { name: c.padre } },
      select: { id: true, name: true, locationType: true, parentLocationId: true },
    });
    if (!fila) {
      console.log(`  ! NO ENCONTRADO: «${c.nombre}» bajo «${c.padre}»`);
      noEncontrados++;
      continue;
    }
    if (fila.locationType === c.a) {
      console.log(`  · «${c.nombre}» ya es ${c.a}`);
      hechos++;
      continue;
    }
    if (fila.locationType !== "site") {
      console.log(`  ! «${c.nombre}» es ${fila.locationType}, no site: no se toca`);
      bloqueados++;
      continue;
    }

    // Lo que hay alrededor, contra ESTA base: la simulación es para leerlo antes de aplicar.
    const hijos = await prisma.location.groupBy({ by: ["locationType"], where: { parentLocationId: fila.id }, _count: true });
    const lotes = await prisma.lot.count({ where: { locationId: fila.id } });
    const mismoTipoYNombre = await prisma.location.count({ where: { name: c.nombre, locationType: c.a, id: { not: fila.id } } });
    const deEseTipo = await prisma.location.findMany({ where: { locationType: c.a }, select: { name: true }, orderBy: { name: "asc" } });

    console.log(`  → «${c.nombre}» (bajo «${c.padre}»): site → ${c.a}`);
    console.log(`      cuelgan de él: ${hijos.length ? hijos.map((h) => `${h._count} ${h.locationType}`).join(", ") : "nada"}`);
    console.log(`      lotes que lo usan como lugar: ${lotes}`);
    console.log(`      lugares que ya son ${c.a}: ${deEseTipo.length ? deEseTipo.map((d) => d.name).join(" · ") : "ninguno"}`);

    if (mismoTipoYNombre > 0) {
      console.log(`      ✗ YA EXISTE otro «${c.nombre}» con tipo ${c.a}: cambiar éste lo duplicaría. NO se aplica.`);
      bloqueados++;
      continue;
    }
    if (!aplicar) continue;

    await prisma.$transaction(async (tx) => {
      const despues = await tx.location.update({ where: { id: fila.id }, data: { locationType: c.a } });
      await recordAuditEvent(
        {
          // Sin actor, como `rename-finca-rosina.ts`: lo corre una persona desde la terminal, no una
          // cuenta desde la aplicación; el motivo dice de quién es la decisión.
          actorUserAccountId: null,
          operation: "location.retype",
          entityType: "location",
          entityId: fila.id,
          before: fila,
          after: despues,
          reason: RAZON,
          sourceInterface: "script:corregir-tipos-de-lugar",
        },
        tx,
      );
    });
    aplicados++;
  }

  console.log(
    `\n${aplicar ? "aplicados" : "por aplicar"}: ${aplicar ? aplicados : CAMBIOS.length - hechos - noEncontrados - bloqueados}` +
      ` · ya hechos: ${hechos} · no encontrados: ${noEncontrados} · bloqueados: ${bloqueados}`,
  );
  if (!aplicar) console.log("Nada escrito. Para aplicar: npm run data:tipos-de-lugar -- --apply");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
