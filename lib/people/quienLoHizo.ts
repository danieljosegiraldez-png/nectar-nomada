/**
 * Quién puede figurar en «quién lo hizo» de un registro — y el guardia que lo exige al guardar.
 *
 * **Por qué existe (2026-09-21, decisión P-G de Daniel).** `getObserverCandidates` ofrecía a
 * **todas las personas activas de la plataforma**, de cualquier finca u organización, y la fila
 * entera —correo y teléfono incluidos— llegaba al navegador como prop de un componente de
 * cliente. Y unos 50 sitios de `lib/` guardaban el `operatorPersonId` que mandara el formulario
 * sin mirar de quién era. Daniel: «no se debe acceder data de otras fincas o organizaciones por
 * otras sin permisos».
 *
 * **La regla.** Un registro se ancla en una o varias organizaciones: la de su lugar —subiendo por
 * padres hasta el primero que tenga `organizationId`, igual que `getManageableContext`— o, sin
 * lugar, la de su proyecto. Puede figurar una persona activa que sea:
 *
 * - **de esa finca:** miembro activo de la organización, o con una cuenta que tenga una
 *   asignación activa y vigente sobre un proyecto de esa organización o sobre un lugar que cuelgue
 *   de ella;
 * - **del equipo Néctar Nómada:** miembro activo de una organización `nectar_nomada_partner`, o
 *   con una asignación activa de ámbito `platform`;
 * - **quien registra:** la persona de la propia cuenta, que ya pasó el guardia de la escritura.
 *
 * Quien deja la finca —membresía o asignación terminada— deja de poder figurar; sus registros
 * viejos guardan el id y siguen enseñando su nombre. Nada se borra.
 *
 * **Sólo sale `{ id, displayName }`.** Nunca correo ni teléfono: lo que devuelve esto acaba
 * serializado en el navegador.
 *
 * Spec: `docs/superpowers/specs/2026-09-21-quien-lo-hizo-acotado-design.md`.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { sortByName } from "../naturalOrder";

/**
 * Lo que ya tiene en mano quien escribe: el mismo par que pasa a su guardia de acceso. Un equipo
 * trae además su organización dueña, que es la respuesta directa.
 */
export interface Ancla {
  organizationId?: string | null;
  projectId?: string | null;
  locationId?: string | null;
}

export type GrupoDePersona = "yo" | "finca" | "equipo";

export interface PersonaElegible {
  id: string;
  displayName: string;
  grupo: GrupoDePersona;
}

/** La persona elegida no pertenece a la finca del registro ni al equipo Néctar Nómada. */
export class PersonaNoPermitidaError extends Error {}

type Db = Prisma.TransactionClient | typeof prisma;

/** Las organizaciones en que se anclan los registros: la del lugar, o si no hay lugar la del proyecto. */
async function organizacionesDe(db: Db, anclas: readonly Ancla[]): Promise<Set<string>> {
  const orgs = new Set<string>();
  for (const ancla of anclas) {
    if (ancla.organizationId) {
      orgs.add(ancla.organizationId);
    } else if (ancla.locationId) {
      const vistos = new Set<string>();
      let id: string | null = ancla.locationId;
      while (id && !vistos.has(id)) {
        vistos.add(id);
        const lugar: { organizationId: string | null; parentLocationId: string | null } | null = await db.location.findUnique({
          where: { id },
          select: { organizationId: true, parentLocationId: true },
        });
        if (!lugar) break;
        if (lugar.organizationId) {
          orgs.add(lugar.organizationId);
          break;
        }
        id = lugar.parentLocationId;
      }
    } else if (ancla.projectId) {
      const proyecto = await db.project.findUnique({ where: { id: ancla.projectId }, select: { organizationId: true } });
      if (proyecto?.organizationId) orgs.add(proyecto.organizationId);
    }
  }
  return orgs;
}

/** Los lugares cuya organización efectiva está en `orgs` — la misma subida por padres que `getManageableContext`. */
async function lugaresDe(db: Db, orgs: ReadonlySet<string>): Promise<string[]> {
  if (!orgs.size) return [];
  const todos = await db.location.findMany({ select: { id: true, parentLocationId: true, organizationId: true } });
  const porId = new Map(todos.map((l) => [l.id, l]));
  const efectiva = new Map<string, string | null>();
  const orgDe = (id: string): string | null => {
    if (efectiva.has(id)) return efectiva.get(id)!;
    const vistos = new Set<string>();
    let actual = porId.get(id);
    let resultado: string | null = null;
    while (actual && !vistos.has(actual.id)) {
      if (actual.organizationId) {
        resultado = actual.organizationId;
        break;
      }
      vistos.add(actual.id);
      actual = actual.parentLocationId ? porId.get(actual.parentLocationId) : undefined;
    }
    efectiva.set(id, resultado);
    return resultado;
  };
  return todos.filter((l) => {
    const org = orgDe(l.id);
    return org != null && orgs.has(org);
  }).map((l) => l.id);
}

/**
 * Las personas que pueden figurar en un registro anclado en `anclas`, agrupadas y ordenadas:
 * la propia primero, después las de la finca y al final el equipo Néctar Nómada, cada bloque por
 * nombre (ADR-078, ADR-080).
 */
export async function personasPermitidas(
  userAccountId: string,
  anclas: readonly Ancla[],
  db: Db = prisma,
): Promise<{ people: PersonaElegible[]; selfPersonId: string | null }> {
  const ahora = new Date();
  const vigente = { status: "active" as const, validFrom: { lte: ahora }, OR: [{ validTo: null }, { validTo: { gt: ahora } }] };

  const orgs = await organizacionesDe(db, anclas);
  const lugares = await lugaresDe(db, orgs);
  const proyectos = orgs.size
    ? (await db.project.findMany({ where: { organizationId: { in: [...orgs] } }, select: { id: true } })).map((p) => p.id)
    : [];
  const [cuenta, miembros, asignadosFinca, equipoMiembros, equipoAsignados] = await Promise.all([
    db.userAccount.findUnique({ where: { id: userAccountId }, select: { personId: true } }),
    orgs.size
      ? db.organizationMembership.findMany({ where: { status: "active", organizationId: { in: [...orgs] } }, select: { personId: true } })
      : Promise.resolve([]),
    orgs.size
      ? db.assignment.findMany({
          where: {
            ...vigente,
            scope: {
              OR: [
                { scopeType: "project", scopeRefId: { in: proyectos } },
                { scopeType: "location", scopeRefId: { in: lugares } },
              ],
            },
          },
          select: { userAccount: { select: { personId: true } } },
        })
      : Promise.resolve([]),
    db.organizationMembership.findMany({
      where: { status: "active", organization: { organizationType: "nectar_nomada_partner" } },
      select: { personId: true },
    }),
    db.assignment.findMany({ where: { ...vigente, scope: { scopeType: "platform" } }, select: { userAccount: { select: { personId: true } } } }),
  ]);

  const selfPersonId = cuenta?.personId ?? null;
  // `userAccount` es una relación REQUERIDA y aun así puede venir `null`: Prisma resuelve el
  // `select` anidado con DOS consultas y las cose en memoria, así que una cuenta borrada entre
  // la primera y la segunda deja la fila huérfana. Pasó dos veces en el carril el 2026-10-03.
  // Guardia: `tests/people/quienLoHizoCuentaBorrada.test.ts`.
  const deLaFinca = new Set([...miembros.map((m) => m.personId), ...asignadosFinca.flatMap((a) => (a.userAccount ? [a.userAccount.personId] : []))]);
  const delEquipo = new Set([...equipoMiembros.map((m) => m.personId), ...equipoAsignados.flatMap((a) => (a.userAccount ? [a.userAccount.personId] : []))]);

  const ids = new Set([...deLaFinca, ...delEquipo, ...(selfPersonId ? [selfPersonId] : [])]);
  const filas = await db.person.findMany({
    where: { id: { in: [...ids] }, status: "active" },
    select: { id: true, displayName: true },
  });

  const grupoDe = (id: string): GrupoDePersona => (id === selfPersonId ? "yo" : deLaFinca.has(id) ? "finca" : "equipo");
  const conGrupo = filas.map((p) => ({ id: p.id, displayName: p.displayName, grupo: grupoDe(p.id) }));
  const yo = conGrupo.filter((p) => p.grupo === "yo");
  const finca = sortByName(conGrupo.filter((p) => p.grupo === "finca"), (p) => p.displayName);
  const equipo = sortByName(conGrupo.filter((p) => p.grupo === "equipo"), (p) => p.displayName);
  return { people: [...yo, ...finca, ...equipo], selfPersonId };
}

/**
 * El guardia de la escritura: lanza `PersonaNoPermitidaError` si `personId` no puede figurar en un
 * registro anclado en `anclas`. Un id nulo o ausente no se comprueba —«nadie en particular» es una
 * respuesta válida en todos los formularios—.
 *
 * Se llama con el mismo par `{ projectId, locationId }` que la escritura ya pasa a su guardia de
 * acceso, y dentro de su transacción si la tiene (`db`).
 *
 * `actual` es la persona que el registro YA tiene, en una edición o una corrección: dejarla como
 * estaba no se comprueba. Sin eso, corregir la hora de una intervención de alguien que ya dejó la
 * finca obligaría a borrar quién la hizo — y el historial dice quién estuvo, no quién sigue.
 */
export async function exigirPersonaPermitida(
  userAccountId: string,
  personId: string | null | undefined,
  anclas: readonly Ancla[],
  opciones: { db?: Db; actual?: string | null } = {},
): Promise<void> {
  if (!personId) return;
  if (opciones.actual && personId === opciones.actual) return;
  const db = opciones.db ?? prisma;
  const { people } = await personasPermitidas(userAccountId, anclas, db);
  if (!people.some((p) => p.id === personId)) {
    throw new PersonaNoPermitidaError("Esa persona no pertenece a esta finca ni al equipo Néctar Nómada.");
  }
}
