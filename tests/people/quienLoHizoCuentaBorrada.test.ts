/**
 * El guardia de la cuenta que desaparece a mitad de la lectura.
 *
 * **El incidente (2026-10-03).** `bash scripts/ci-con-base.sh` falló dos veces en corridas
 * distintas, sin ningún cambio de código, con
 * `TypeError: Cannot read properties of null (reading 'personId')` en
 * `lib/people/quienLoHizo.ts`. El archivo pasa 43/43 cuando se corre solo: pasa solo porque
 * solo no tiene vecinos.
 *
 * **Por qué `userAccount` puede ser `null` aunque el esquema diga que no.**
 * `Assignment.userAccount` es una relación REQUERIDA (`user_account_id` es `String`, y la FK es
 * `ON DELETE RESTRICT`), así que ninguna fila puede existir sin su cuenta. Pero Prisma no resuelve
 * un `select` anidado con un JOIN: `relationJoins` no está en `previewFeatures` —sólo
 * `postgresqlExtensions`—, así que hace DOS consultas y las cose en memoria. Entre la primera
 * (las asignaciones) y la segunda (sus cuentas) la fila puede desaparecer, y entonces la cosida
 * deja `userAccount: null` en una relación cuyo tipo promete que nunca lo es.
 *
 * En el carril eso pasa porque los 199 archivos del grupo `base-sembrada` corren en paralelo
 * —`vitest` por defecto: `pool: "forks"`, `fileParallelism: true`— contra UNA base, y trece de
 * ellos piden `crearUsuarioConAcceso()`, que cuelga su Platform Admin del ámbito `platform`
 * COMPARTIDO. Cada archivo borra su `Assignment` y su `UserAccount` en su limpieza; otro archivo
 * que esté leyendo el ámbito de plataforma en ese instante se come el `null`.
 *
 * En producción la misma ventana existe, aunque estrecha: `app/` y `lib/` no borran ninguna
 * `UserAccount` —medido—, pero `scripts/consolidar-persona-duplicada.ts` sí, al fusionar dos
 * personas.
 *
 * **Lo que NO se arregla acotando la consulta.** Leer todas las asignaciones de ámbito
 * `platform` es el comportamiento especificado, no un descuido: el docblock de `quienLoHizo` y
 * `docs/superpowers/specs/2026-09-21-quien-lo-hizo-acotado-design.md` definen «el equipo Néctar
 * Nómada» como quien tiene «una asignación activa de ámbito `platform`». Un ámbito de plataforma
 * es global por definición; no hay finca por la que acotarlo.
 *
 * **Por qué con dobles y no con base.** La condición es una carrera: reproducirla contra una base
 * de verdad depende de qué otro archivo esté corriendo, y una prueba así pasa por suerte. El
 * guardia llama a la función con la entrada hostil directamente —`personasPermitidas` ya acepta
 * su `db`—, así que no hace falta base y corre en `scripts/ci.sh`, en cada commit.
 */
import { describe, expect, it } from "vitest";
import { personasPermitidas } from "../../lib/people/quienLoHizo";

type Db = Parameters<typeof personasPermitidas>[2];

/**
 * Un `db` de mentira que devuelve una fila huérfana JUNTO A una buena, en la consulta que se le
 * pida. Las dos a la vez importan: un «arreglo» que se rindiera ante el `null` y devolviera lista
 * vacía pasaría la mitad de esta prueba y perdería a quien sí está.
 */
function dbConHuerfana(dondeDuele: "platform" | "finca"): { db: Db; idsPedidos: () => string[] } {
  let pedidos: string[] = [];
  const huerfanaYBuena = [{ userAccount: null }, { userAccount: { personId: "p-equipo" } }];
  const db = {
    location: { findUnique: async () => null, findMany: async () => [] },
    project: { findUnique: async () => null, findMany: async () => [] },
    userAccount: { findUnique: async () => ({ personId: "p-yo" }) },
    organizationMembership: { findMany: async () => [] },
    assignment: {
      findMany: async (args: { where?: { scope?: { scopeType?: string } } }) => {
        const esPlataforma = args?.where?.scope?.scopeType === "platform";
        const toca = dondeDuele === "platform" ? esPlataforma : !esPlataforma;
        return toca ? huerfanaYBuena : [];
      },
    },
    person: {
      findMany: async (args: { where?: { id?: { in?: string[] } } }) => {
        pedidos = args?.where?.id?.in ?? [];
        return pedidos.map((id) => ({ id, displayName: `Nombre de ${id}` }));
      },
    },
  };
  return { db: db as unknown as Db, idsPedidos: () => pedidos };
}

describe("personasPermitidas con una cuenta borrada a mitad de la lectura", () => {
  it("no revienta, y sigue contando a quien SÍ está, cuando la huérfana viene del ámbito de plataforma", async () => {
    const { db, idsPedidos } = dbConHuerfana("platform");

    const { people, selfPersonId } = await personasPermitidas("cuenta-1", [], db);

    expect(selfPersonId).toBe("p-yo");
    expect(people.map((p) => p.id).sort()).toEqual(["p-equipo", "p-yo"]);
    expect(people.find((p) => p.id === "p-equipo")?.grupo).toBe("equipo");
    // Y que no se haya colado un id inventado por la fila huérfana.
    expect(idsPedidos()).not.toContain(undefined);
    expect(idsPedidos()).not.toContain(null);
  });

  it("tampoco cuando la huérfana viene de una asignación de la finca", async () => {
    const { db } = dbConHuerfana("finca");

    // Con `organizationId` puesto, `orgs` no está vacío, que es lo que hace a la rama de la finca
    // consultar de verdad en vez de resolverse en `[]`.
    const { people } = await personasPermitidas("cuenta-1", [{ organizationId: "org-1" }], db);

    expect(people.map((p) => p.id).sort()).toEqual(["p-equipo", "p-yo"]);
    expect(people.find((p) => p.id === "p-equipo")?.grupo).toBe("finca");
  });
});
