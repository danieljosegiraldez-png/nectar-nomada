/**
 * Cuentas de prueba con un perfil y un ámbito — Parte 2a, tarea 3 (2026-10-04).
 *
 * **Para qué existe.** Desde V16 escribir una receta es del Coffee Process Manager, y las pruebas de autoría (`pasos`,
 * `versiones`, `autoria`, `recipeAuthoring`, `recipeVersions`, `editarBeneficio`) necesitan la MISMA fila de preguntas: «una
 * cuenta de este perfil, en esta ubicación o en la plataforma». Cada una escribía su copia de `cuenta()`; seis copias son seis
 * sitios donde la limpieza se desvía. Aquí viven juntas la creación y la limpieza.
 *
 * - **Ámbito de plataforma:** el compartido (`ambitoDePlataforma`), que NUNCA se borra desde aquí.
 * - **Ámbito de ubicación:** único por (tipo, referencia). Se reutiliza si ya existe, y sólo se borra el que creó esta fábrica.
 * - **`conceder` y `quitar`:** un `AssignmentPermissionOverride` sobre la asignación de la cuenta (la concesión por persona de
 *   «ajustes de permiso»). Se cae con la asignación (`onDelete: Cascade`).
 *
 * `limpiar()` va en el `afterEach`/`afterAll` de quien la usa, **después** de borrar las recetas y los registros que las cuentas
 * firmaron, y borra en orden de claves ajenas: asignaciones, ámbitos propios, cuentas, personas.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/db";
import { ambitoDePlataforma } from "./ambitoDePlataforma";
import { assertDefinedWhere } from "./assertDefinedWhere";

export type PerfilDeCuenta = "Coffee Process Manager" | "Farm Manager" | "Farm Operator" | "Project Viewer";
/** `"plataforma"`, o el id de la ubicación donde se asigna (el ámbito de una finca alcanza lo que cuelga de ella). */
export type AlcanceDeCuenta = "plataforma" | { locationId: string };

export function fabricaDeCuentas(etiqueta: string) {
  const personIds: string[] = [];
  const cuentaIds: string[] = [];
  const scopeIds: string[] = [];

  async function cuenta(perfil: PerfilDeCuenta, alcance: AlcanceDeCuenta): Promise<string> {
    const personId = randomUUID();
    await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: etiqueta, displayName: personId } });
    personIds.push(personId);
    const userAccountId = randomUUID();
    await prisma.userAccount.create({ data: { id: userAccountId, personId, status: "active", authProvider: "credentials" } });
    cuentaIds.push(userAccountId);
    const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil }, select: { id: true } });
    let scopeId: string;
    if (alcance === "plataforma") {
      scopeId = await ambitoDePlataforma();
    } else {
      const existente = await prisma.scope.findFirst({
        where: { scopeType: "location", scopeRefId: alcance.locationId },
        select: { id: true },
      });
      scopeId =
        existente?.id ??
        (
          await prisma.scope.create({
            data: { id: randomUUID(), scopeType: "location", scopeRefId: alcance.locationId },
            select: { id: true },
          })
        ).id;
      if (!existente) scopeIds.push(scopeId);
    }
    await prisma.assignment.create({ data: { userAccountId, scopeId, roleProfileId: roleProfile.id } });
    return userAccountId;
  }

  async function ajustar(userAccountId: string, resourceType: string, action: string, efecto: "grant" | "deny") {
    const asignacion = await prisma.assignment.findFirstOrThrow({ where: { userAccountId }, select: { id: true } });
    const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType, action }, select: { id: true } });
    await prisma.assignmentPermissionOverride.create({
      data: { assignmentId: asignacion.id, permissionId: permiso.id, effect: efecto, reason: `TEST ${etiqueta}: ${efecto} de ${resourceType}:${action}` },
    });
  }

  async function limpiar() {
    if (cuentaIds.length) await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentaIds } }) });
    if (scopeIds.length) await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
    if (cuentaIds.length) await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentaIds } }) });
    if (personIds.length) await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    for (const lista of [personIds, cuentaIds, scopeIds]) lista.length = 0;
  }

  return {
    cuenta,
    conceder: (userAccountId: string, resourceType: string, action: string) => ajustar(userAccountId, resourceType, action, "grant"),
    quitar: (userAccountId: string, resourceType: string, action: string) => ajustar(userAccountId, resourceType, action, "deny"),
    limpiar,
  };
}
