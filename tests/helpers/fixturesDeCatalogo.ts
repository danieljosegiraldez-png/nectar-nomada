import { prisma } from "../../lib/db";

/**
 * Dos organizaciones con un sitio cada una, y cuatro cuentas:
 * - `admin`: Platform Admin en plataforma — SÓLO para lo compartido;
 * - `jefeA`: Farm Manager del sitio A (tiene equipment:manage);
 * - `operarioA`: Farm Operator del sitio A (view + report_condition, sin manage);
 * - `ajeno`: sin ninguna asignación;
 * - `jefeA2`: Farm Manager de `sitioA2`, un SEGUNDO sitio de la organización A —
 *   para probar que «de mi organización» no es «puedo verlo»;
 * - `operarioB`: Farm Operator del sitio B — alguien que sólo ve lo que está en B.
 *
 * **Las pruebas de «propio» usan `jefeA`, nunca `admin`**: un admin ve la base
 * compartida entera (trampa escrita en CLAUDE.md, 2026-09-17), y una prueba de
 * «propio» hecha con admin pasaría aunque la regla estuviera rota.
 *
 * `limpiar()` borra lo que el arranque creó, en orden de FKs, y va en `afterAll`
 * DESPUÉS de que cada prueba borre lo suyo.
 */
export interface Fixtures {
  run: string;
  orgA: string;
  orgB: string;
  sitioA: string;
  sitioB: string;
  sitioA2: string;
  admin: string;
  jefeA: string;
  operarioA: string;
  ajeno: string;
  jefeA2: string;
  operarioB: string;
  personaJefeA: string;
  cuentas: string[];
  limpiar(): Promise<void>;
}

export async function montarFixtures(prefijo: string): Promise<Fixtures> {
  const run = `${prefijo}-${Date.now()}`;
  const personas: string[] = [];
  const scopes: string[] = [];

  const org = (n: string) =>
    prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${n} ${run}`, status: "approved", classification: "internal" } });
  const orgA = (await org("A")).id;
  const orgB = (await org("B")).id;
  const sitio = (o: string, n: string) =>
    prisma.location.create({ data: { locationType: "plot", name: `TEST ${n} ${run}`, organizationId: o, status: "approved", classification: "internal" } });
  const sitioA = (await sitio(orgA, "sitio A")).id;
  const sitioB = (await sitio(orgB, "sitio B")).id;
  const sitioA2 = (await sitio(orgA, "sitio A2")).id;

  async function cuenta(label: string) {
    const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${run})`, locale: "es" } });
    personas.push(p.id);
    const u = await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } });
    return { userId: u.id, personId: p.id };
  }
  async function asignar(userAccountId: string, perfil: string, scopeType: "platform" | "location", scopeRefId: string | null) {
    // `@@unique([scopeType, scopeRefId])` en Scope: dos cuentas en el MISMO
    // sitio (jefeA y operarioA, ambos en sitioA) chocarían si cada una creara
    // su propio Scope. Postgres no aplica la unicidad entre NULLs, así que
    // "platform" (scopeRefId null) sí puede crear uno propio sin colisión;
    // "location" reutiliza el que ya exista para ese sitio — que sólo puede
    // ser uno creado por ESTE fixture, porque el sitio es nuevo.
    const s =
      scopeType === "location"
        ? ((await prisma.scope.findFirst({ where: { scopeType, scopeRefId } })) ??
          (await prisma.scope.create({ data: { scopeType, scopeRefId } })))
        : await prisma.scope.create({ data: { scopeType, scopeRefId } });
    if (!scopes.includes(s.id)) scopes.push(s.id);
    const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: rp.id, scopeId: s.id } });
  }

  const admin = (await cuenta("Admin")).userId;
  const jefe = await cuenta("JefeA");
  const operarioA = (await cuenta("OperarioA")).userId;
  const ajeno = (await cuenta("Ajeno")).userId;
  const jefeA2 = (await cuenta("JefeA2")).userId;
  const operarioB = (await cuenta("OperarioB")).userId;
  await asignar(admin, "Platform Admin", "platform", null);
  await asignar(jefe.userId, "Farm Manager", "location", sitioA);
  await asignar(operarioA, "Farm Operator", "location", sitioA);
  await asignar(jefeA2, "Farm Manager", "location", sitioA2);
  await asignar(operarioB, "Farm Operator", "location", sitioB);
  const cuentas = [admin, jefe.userId, operarioA, ajeno, jefeA2, operarioB];

  return {
    run, orgA, orgB, sitioA, sitioB, sitioA2, admin, jefeA: jefe.userId, operarioA, ajeno, jefeA2, operarioB, personaJefeA: jefe.personId, cuentas,
    async limpiar() {
      // Cadena en orden de FKs, pero SIN abandonar el resto si un paso
      // revienta (p. ej. RESTRICT por una fila que un test dejó colgada):
      // cada paso se intenta, los errores se acumulan, y al final se
      // relanza el primero — para no enmascarar el fallo, pero sin que un
      // solo paso se lleve por delante los que faltan.
      const pasos: Array<() => Promise<unknown>> = [
        () => prisma.auditEvent.deleteMany({ where: { actorUserAccountId: { in: cuentas } } }),
        () => prisma.assignment.deleteMany({ where: { userAccountId: { in: cuentas } } }),
        () => prisma.scope.deleteMany({ where: { id: { in: scopes } } }),
        () => prisma.userAccount.deleteMany({ where: { id: { in: cuentas } } }),
        () => prisma.person.deleteMany({ where: { id: { in: personas } } }),
        () => prisma.location.deleteMany({ where: { id: { in: [sitioA, sitioB, sitioA2] } } }),
        () => prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } }),
      ];
      const errores: unknown[] = [];
      for (const paso of pasos) {
        try {
          await paso();
        } catch (e) {
          errores.push(e);
        }
      }
      if (errores.length) throw errores[0];
    },
  };
}
