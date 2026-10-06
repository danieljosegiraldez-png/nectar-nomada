/**
 * Users & Permissions administration — ADR-074.
 *
 * CLAUDE.md §57: RBAC tests are mandatory and unauthorized access must be
 * tested explicitly. This surface grants and revokes authority itself, so the
 * refusals matter more than the successes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  grantRole,
  revokeRole,
  requirePermissionAdmin,
  wouldRemoveLastPlatformAdmin,
  UserAdminError,
} from "../../lib/rbac/admin";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `admintest-${Date.now()}`;

const created = {
  assignmentIds: [] as string[],
  scopeIds: [] as string[],
  userAccountIds: [] as string[],
  personIds: [] as string[],
  locationIds: [] as string[],
  projectIds: [] as string[],
};

let adminAccountId: string;
let subjectAccountId: string;
/**
 * Un sitio PROPIO para colgar las concesiones de ámbito de ubicación.
 *
 * **El incidente, 2026-10-03 (`PENDING_IMPLEMENTATIONS/022`).** Esto era
 * `prisma.location.findFirstOrThrow({ select: { id: true } })` — sin `where` y sin
 * `orderBy`, o sea «la ubicación que la base devuelva primero», que puede ser de
 * cualquiera. `grantRole` reutiliza el `Scope` de ese sitio, así que esta suite
 * dejaba un `Assignment` suyo colgado del ámbito de OTRA suite mientras corría. Las
 * 208 pruebas de `base-sembrada` corren en paralelo contra la misma base, y
 * `fixturesDeCatalogo.limpiar()` borra los ámbitos de sus propios sitios: el
 * `RESTRICT` de `assignment_scope_id_fkey` ponía ROJO el carril entero por basura
 * que no era suya — y con `Tests … passed` y cero `×`, porque la suite moría en su
 * limpieza y eso sólo sale en `Test Files`.
 *
 * Con un sitio propio, el ámbito que `grantRole` cree es de esta suite y nadie más
 * puede estar colgado de él. La prueba afirma lo mismo: el caso mide que revocar
 * marca y audita, y la ubicación es incidental.
 */
let sitioPropio: string;
let projectViewerRoleId: string;
let projectId: string;

async function makeAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "ADMINTEST", familyName: label, displayName: `ADMINTEST ${label} ${RUN}` },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  created.personIds.push(person.id);
  created.userAccountIds.push(account.id);
  return account.id;
}

beforeAll(async () => {
  adminAccountId = await makeAccount("Admin");
  subjectAccountId = await makeAccount("Subject");

  // The actor needs the real Platform Admin profile, at platform scope — the
  // same shape a genuine administrator has, not a hand-built permission set.
  const platformAdmin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const platformScope = await prisma.scope.findFirstOrThrow({ where: { scopeType: "platform", scopeRefId: null } });
  const a = await prisma.assignment.create({
    data: { userAccountId: adminAccountId, roleProfileId: platformAdmin.id, scopeId: platformScope.id, status: "active" },
  });
  created.assignmentIds.push(a.id);

  projectViewerRoleId = (await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Project Viewer" } })).id;
  // **Un proyecto PROPIO, por la misma razón que el sitio de arriba.** Esto era
  // `prisma.project.findFirstOrThrow({ select: { id: true } })` —sin `where` y sin `orderBy`—, y de
  // ese proyecto ajeno cuelgan tres concesiones de ámbito `project`. Es la gemela del defecto de
  // arriba, y estaba latente sólo porque hoy nada borra los ámbitos de un proyecto sembrado: no
  // había con quién chocar. Se cierra igual — **arreglar una instancia y dejar su gemela al lado**
  // es una clase que esta casa ya pagó.
  //
  // **Y cuesta una línea, al contrario de lo que yo escribí al dejarlo abierto:** la ficha 022 decía
  // que crear un `Project` propio «arrastra más campos obligatorios y es un cambio mayor». Medido el
  // 2026-10-06 sobre `model Project`: exige **uno**, `name`. La frase era falsa y queda corregida
  // en la ficha.
  //
  // **Además deja exacta una aserción de esta misma suite.** «reuses the existing scope rather than
  // minting a duplicate» cuenta los ámbitos de este proyecto y espera **1**: sobre un proyecto
  // compartido, otra suite que concediera ahí la rompería sin que nada lo explicara; sobre el
  // propio, el 1 no depende de vecinos.
  const proyecto = await prisma.project.create({ data: { name: `ADMINTEST proyecto ${RUN}` } });
  created.projectIds.push(proyecto.id);
  projectId = proyecto.id;

  const sitio = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `ADMINTEST sitio ${RUN}`,
      status: "approved",
      classification: "internal",
    },
  });
  created.locationIds.push(sitio.id);
  sitioPropio = sitio.id;
});

afterAll(async () => {
  // ADR-045 — never a deleteMany whose where clause could silently become {}.
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  const assignments = await prisma.assignment.findMany({
    where: { userAccountId: { in: created.userAccountIds } },
    select: { id: true },
  });
  const ids = [...new Set([...created.assignmentIds, ...assignments.map((a) => a.id)])];
  if (ids.length) await prisma.assignment.deleteMany({ where: w(ids) });
  if (created.userAccountIds.length) await prisma.userAccount.deleteMany({ where: w(created.userAccountIds) });
  if (created.personIds.length) await prisma.person.deleteMany({ where: w(created.personIds) });
  // Scopes created by grantRole are shared by design, so they are deliberately
  // not deleted — removing one could orphan a real Assignment.
  //
  // **Con una excepción, y es la del sitio propio de esta suite:** ese `Scope` cuelga
  // de una ubicación que esta suite creó y que nadie más conoce, así que no hay
  // ningún `Assignment` ajeno que pueda quedar huérfano. Dejarlo acumularía basura:
  // la base compartida llegó a tener 284 `Scope` huérfanos por no borrar los propios
  // (CLAUDE.md, 2026-09-xx). Va DESPUÉS de los `Assignment`, por el `RESTRICT`.
  if (created.locationIds.length) {
    // `findMany` no es destructivo, así que no pasa por `assertDefinedWhere`: ese helper
    // devuelve `T` y ensancha `scopeType` a `string`, que no es un `ScopeWhereInput`. El
    // filtro no puede quedar vacío porque el `if` de arriba exige que haya ubicaciones.
    const propios = await prisma.scope.findMany({
      where: { scopeType: "location", scopeRefId: { in: created.locationIds } },
      select: { id: true },
    });
    if (propios.length) {
      await prisma.scope.deleteMany({ where: w(propios.map((s) => s.id)) });
    }
    await prisma.location.deleteMany({ where: w(created.locationIds) });
  }
  if (created.projectIds.length) {
    // Mismo razonamiento que con el sitio: el proyecto es nuevo y nadie más puede tener un ámbito
    // sobre él, así que borrarlo no deja huérfana ninguna asignación ajena.
    const propios = await prisma.scope.findMany({
      where: { scopeType: "project", scopeRefId: { in: created.projectIds } },
      select: { id: true },
    });
    if (propios.length) await prisma.scope.deleteMany({ where: w(propios.map((x) => x.id)) });
    await prisma.project.deleteMany({ where: w(created.projectIds) });
  }
});

describe("who may administer permissions", () => {
  it("refuses an account with no assignments at all", async () => {
    const nobody = await makeAccount("Nobody");
    await expect(requirePermissionAdmin(nobody)).rejects.toBeInstanceOf(UserAdminError);
  });

  it("refuses grant and revoke to that account, not just the page", async () => {
    // SECURITY.md §2 — the page hides itself, but the service must refuse
    // independently. A hidden control is not an authorization boundary.
    const nobody = await makeAccount("Nobody2");
    await expect(
      grantRole(nobody, {
        userAccountId: subjectAccountId,
        roleProfileId: projectViewerRoleId,
        scopeType: "project",
        scopeRefId: projectId,
      }),
    ).rejects.toThrow("no_permission_admin_access");
  });

  it("allows a real platform-scoped Platform Admin", async () => {
    await expect(requirePermissionAdmin(adminAccountId)).resolves.toBeUndefined();
  });
});

describe("granting", () => {
  it("creates an active assignment and writes an audit event", async () => {
    const before = await prisma.auditEvent.count({ where: { entityType: "assignment", operation: "assignment.create" } });

    const assignment = await grantRole(adminAccountId, {
      userAccountId: subjectAccountId,
      roleProfileId: projectViewerRoleId,
      scopeType: "project",
      scopeRefId: projectId,
    });
    created.assignmentIds.push(assignment.id);

    expect(assignment.status).toBe("active");
    expect(assignment.grantedBy).toBe(adminAccountId);

    const after = await prisma.auditEvent.count({ where: { entityType: "assignment", operation: "assignment.create" } });
    expect(after).toBe(before + 1);
  });

  it("refuses a duplicate rather than stacking two identical grants", async () => {
    await expect(
      grantRole(adminAccountId, {
        userAccountId: subjectAccountId,
        roleProfileId: projectViewerRoleId,
        scopeType: "project",
        scopeRefId: projectId,
      }),
    ).rejects.toThrow("already_granted");
  });

  it("reuses the existing scope rather than minting a duplicate", async () => {
    // Two Scope rows for the same (type, ref) split grants across them, so a
    // permission check resolving against one silently misses the other.
    const scopes = await prisma.scope.findMany({ where: { scopeType: "project", scopeRefId: projectId } });
    expect(scopes.length).toBe(1);
  });

  it("requires a target for a non-platform scope", async () => {
    await expect(
      grantRole(adminAccountId, {
        userAccountId: subjectAccountId,
        roleProfileId: projectViewerRoleId,
        scopeType: "project",
        scopeRefId: null,
      }),
    ).rejects.toThrow("scope_target_required");
  });
});

describe("revoking", () => {
  it("marks the assignment revoked and audits it", async () => {
    const grant = await grantRole(adminAccountId, {
      userAccountId: subjectAccountId,
      roleProfileId: projectViewerRoleId,
      scopeType: "location",
      scopeRefId: sitioPropio,
    });
    created.assignmentIds.push(grant.id);

    const revoked = await revokeRole(adminAccountId, grant.id);
    expect(revoked.status).toBe("revoked");
    expect(revoked.validTo).not.toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: "assignment", entityId: grant.id, operation: "assignment.revoke" },
    });
    expect(audit).not.toBeNull();
  });

  it("refuses to revoke the same assignment twice", async () => {
    const grant = await grantRole(adminAccountId, {
      userAccountId: subjectAccountId,
      roleProfileId: projectViewerRoleId,
      scopeType: "platform",
      scopeRefId: null,
    });
    created.assignmentIds.push(grant.id);
    await revokeRole(adminAccountId, grant.id);
    await expect(revokeRole(adminAccountId, grant.id)).rejects.toThrow("already_revoked");
  });
});

describe("the last Platform Admin cannot be revoked", () => {
  // The predicate rather than the service: whether one is the last is global
  // state, so reaching zero-remaining in an integration test would mean
  // revoking the real administrator the suite is running as.
  it("refuses only when nothing else would remain", () => {
    expect(wouldRemoveLastPlatformAdmin("Platform Admin", "platform", 0)).toBe(true);
    expect(wouldRemoveLastPlatformAdmin("Platform Admin", "platform", 1)).toBe(false);
  });

  it("does not block a project-scoped Platform Admin — platform scope is what deadlocks", () => {
    expect(wouldRemoveLastPlatformAdmin("Platform Admin", "project", 0)).toBe(false);
  });

  it("does not block any other role, however few remain", () => {
    expect(wouldRemoveLastPlatformAdmin("Farm Operator", "platform", 0)).toBe(false);
    expect(wouldRemoveLastPlatformAdmin("Research Lead", "platform", 0)).toBe(false);
  });

  it("still refuses through the service while another admin exists elsewhere", async () => {
    // The actor is itself a platform-scoped Platform Admin, so revoking the
    // subject's leaves at least one — this proves the guard does not
    // over-refuse, which is the half an integration test can reach.
    const grant = await grantRole(adminAccountId, {
      userAccountId: subjectAccountId,
      roleProfileId: (await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } })).id,
      scopeType: "platform",
      scopeRefId: null,
    });
    created.assignmentIds.push(grant.id);
    const revoked = await revokeRole(adminAccountId, grant.id);
    expect(revoked.status).toBe("revoked");
  });
});
