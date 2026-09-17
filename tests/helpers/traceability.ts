/**
 * Helpers de trazabilidad compartidos entre pruebas.
 *
 * `crearUsuarioConAcceso` da una cuenta con una asignación de ámbito
 * `platform` y el perfil «Platform Admin» — cubre cualquier permiso,
 * incluido `location:manage_attributes`, así que sirve para cualquier
 * prueba de servicio que sólo necesite pasar la compuerta de RBAC sin
 * probar la propia compuerta. `crearParcela` da una `Location` de tipo
 * `plot` bajo una `Organization` de tipo `farm`, ambas `internal` (el valor
 * por defecto del esquema), que es la clasificación que
 * `requireLocationAttributeAccess` exige clarificar.
 *
 * Cada llamada devuelve el registro completo (no sólo el id que el
 * llamador vaya a usar) para que la prueba pueda encolar los ids en su
 * propia limpieza — la limpieza vive en el archivo de la prueba, en un
 * `afterEach`/`afterAll`, nunca aquí, porque un helper que borra por su
 * cuenta no sabe si otra prueba del mismo archivo todavía necesita la fila.
 */
import { prisma } from "../../lib/db";

let contador = 0;

function marca(etiqueta: string): string {
  contador += 1;
  return `${etiqueta}-${Date.now()}-${contador}`;
}

export async function crearUsuarioConAcceso() {
  const run = marca("acceso");
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Acceso", displayName: `TEST Acceso (${run})`, locale: "es" },
  });
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  const admin = await prisma.roleProfile.findFirstOrThrow({ where: { name: "Platform Admin" } });
  const scope = await prisma.scope.create({ data: { scopeType: "platform" } });
  await prisma.assignment.create({
    data: { userAccountId: cuenta.id, roleProfileId: admin.id, scopeId: scope.id },
  });
  return { userAccountId: cuenta.id, personId: persona.id, scopeId: scope.id };
}

export async function crearParcela() {
  const run = marca("parcela");
  const organizacion = await prisma.organization.create({
    data: { name: `TEST Finca (${run})`, organizationType: "farm", status: "approved" },
  });
  return prisma.location.create({
    data: { name: `TEST Parcela (${run})`, locationType: "plot", organizationId: organizacion.id, status: "approved" },
  });
}
