/**
 * Helpers de trazabilidad compartidos entre pruebas.
 *
 * `crearUsuarioConAcceso` da una cuenta con una asignación de ámbito
 * `platform` y el perfil «Platform Admin» — cubre cualquier permiso,
 * incluido `location:manage_attributes`, así que sirve para cualquier
 * prueba de servicio que sólo necesite pasar la compuerta de RBAC sin
 * probar la propia compuerta.
 *
 * `crearFinca` da una `Location` de tipo `site` (la finca) bajo una
 * `Organization` de tipo `farm`, ambas `internal` (el valor por defecto del
 * esquema). `crearParcela` da una `Location` de tipo `plot`, colgada de una
 * finca vía `parentLocationId` — la misma jerarquía que usan los datos
 * reales (ver `tests/traceability/lots.test.ts`, "a plot Location inherits
 * its parent site's organizationId through parentLocationId"). Sin
 * argumento crea su propia finca nueva; con una finca ya creada (de
 * `crearFinca()` o de otra `crearParcela()`), cuelga de ELLA — así dos
 * parcelas pueden compartir finca, que es lo que exige probar la
 * numeración correlativa de trampas por finca (Tarea 3).
 *
 * La parcela devuelve `organizationId` puesto (heredado de la finca), no
 * `null` como en el dato real de producción — a propósito, para no romper
 * `tests/traceability/plotBlocks.test.ts`, que ya lo usa para su propia
 * limpieza.
 *
 * `crearUsuarioSinAcceso` es el caso de rechazo: un Farm Operator con
 * ámbito de ubicación, pero escoplado a SU PROPIA parcela, distinta de la
 * que la prueba va a usar — el mismo patrón que `assignFarmOperator` +
 * `otroPlotId` en `tests/traceability/entradaEnProduccion.test.ts`, para que
 * un `locationId` cableado mal (u otro descuido de autorización) tenga algo
 * real que rechazar, en vez de que la comprobación pase por no haber
 * ninguna asignación en absoluto.
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

export async function crearFinca() {
  const run = marca("finca");
  const organizacion = await prisma.organization.create({
    data: { name: `TEST Finca (${run})`, organizationType: "farm", status: "approved" },
  });
  return prisma.location.create({
    data: { name: `TEST Finca (${run})`, locationType: "site", organizationId: organizacion.id, status: "approved" },
  });
}

export async function crearParcela(finca?: Awaited<ReturnType<typeof crearFinca>>) {
  const run = marca("parcela");
  const base = finca ?? (await crearFinca());
  return prisma.location.create({
    data: {
      name: `TEST Parcela (${run})`,
      locationType: "plot",
      parentLocationId: base.id,
      organizationId: base.organizationId,
      status: "approved",
    },
  });
}

export async function crearUsuarioSinAcceso() {
  const run = marca("sin-acceso");
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "SinAcceso", displayName: `TEST SinAcceso (${run})`, locale: "es" },
  });
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  const organizacion = await prisma.organization.create({
    data: { name: `TEST Finca Ajena (${run})`, organizationType: "farm", status: "approved" },
  });
  const parcelaAjena = await prisma.location.create({
    data: { name: `TEST Parcela Ajena (${run})`, locationType: "plot", organizationId: organizacion.id, status: "approved" },
  });
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: parcelaAjena.id } });
  await prisma.assignment.create({
    data: { userAccountId: cuenta.id, roleProfileId: perfil.id, scopeId: scope.id },
  });
  return {
    userAccountId: cuenta.id,
    personId: persona.id,
    scopeId: scope.id,
    locationId: parcelaAjena.id,
    organizationId: organizacion.id,
  };
}
