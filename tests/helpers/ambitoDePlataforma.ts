/**
 * El ámbito de PLATAFORMA, compartido y a prueba de carreras.
 *
 * **Por qué existe, medido el 2026-09-27.** Los fixtures creaban cada uno el suyo, y el comentario
 * de `fixturesDeCatalogo.ts` explicaba por qué se podía: *«Postgres no aplica la unicidad entre
 * NULLs, así que "platform" (scopeRefId null) sí puede crear uno propio sin colisión»*. Era cierto
 * y era el hueco: `UNIQUE (scope_type, scope_ref_id)` no restringe cuando el referente es NULL, y
 * por eso la base de pruebas compartida había acumulado **19** ámbitos de plataforma, 17 sin una
 * sola asignación. La migración `20260927120000_un_solo_ambito_sin_referente` cierra el hueco con
 * un índice parcial, y con él ese `create` propio **deja de ser posible**: 22 archivos de prueba
 * cayeron con `Unique constraint failed on the fields: (scope_type)`.
 *
 * **Por qué `ON CONFLICT DO NOTHING` y no `findFirst ?? create`.** Vitest corre los archivos en
 * PARALELO contra la misma base. Un `findFirst` seguido de un `create` es una carrera: dos archivos
 * pueden no encontrar nada a la vez y los dos intentar crear. Sin el índice eso producía duplicados
 * en silencio —los 17—; con el índice produciría un fallo intermitente, que es peor. El `INSERT`
 * con `ON CONFLICT DO NOTHING` lo resuelve en una sola sentencia, sin ventana entre leer y escribir.
 *
 * **NO lo borres.** Es compartido: quien lo borre en su limpieza se lo quita a los demás archivos
 * que estén corriendo en ese momento. Por eso esto devuelve sólo el id y no lo apunta en ninguna
 * lista de limpieza — y por eso los fixtures que lo usan dejaron de meterlo en la suya.
 */
import { prisma } from "../../lib/db";

export async function ambitoDePlataforma(): Promise<string> {
  await prisma.$executeRaw`
    INSERT INTO "core"."scope" ("scope_type", "scope_ref_id")
    VALUES ('platform', NULL)
    ON CONFLICT DO NOTHING
  `;
  const ambito = await prisma.scope.findFirstOrThrow({
    where: { scopeType: "platform", scopeRefId: null },
  });
  return ambito.id;
}
