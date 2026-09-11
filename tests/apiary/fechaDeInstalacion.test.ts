/**
 * La fecha de instalación de una colmena es un DÍA, no un instante.
 *
 * **El fallo, reportado por el dueño el 2026-09-11 y reproducido:** crear una
 * colmena **con** fecha de instalación reventaba la página con un `digest`;
 * **sin** fecha funcionaba, que es por qué llevaba tiempo pasando
 * desapercibido.
 *
 * La causa no era la que parecía. `createHiveFormAction` parseaba `installedAt`
 * con `parseOptionalLocalDateTime` —el parser de **instantes**—, que exige el
 * desfase de zona del dispositivo y **lanza si falta**. `NewHiveForm` no lo
 * manda, y tiene razón en no mandarlo: el campo es `<input type="date">`.
 *
 * **Y el arreglo obvio era el equivocado.** Añadir `TimezoneOffsetField` habría
 * hecho compilar y habría movido la fecha **un día hacia atrás** al convertir un
 * día en instante — el fallo que `lib/time/mostrarInstante.ts` describe en su
 * cabecera. De los siete campos `type="date"` del proyecto, `installedAt` era
 * **el único** parseado como instante; los otros seis usan un parser de día.
 *
 * Lo que estas pruebas afirman y ninguna lectura puede afirmar: que el día
 * entra, que entra **como el día que se teclea** y no desplazado, y que una
 * fecha imposible se rechaza en vez de convertirse en silencio en otro hecho.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive } from "../../lib/apiary/hives";
import { fechaDeDia, FechaDeDiaInvalida, parseOptionalLocalDateTime } from "../../lib/time/localDateTime";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `fecha-${Date.now()}`;

describe("la fecha de instalación de una colmena", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let scopeId: string;
  const personIds: string[] = [];

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Fecha", displayName: `TEST Fecha (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    userAccountId = cuenta.id;

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  });

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  /**
   * **El caso que reproduce el fallo del dueño**, llamado con la entrada hostil
   * directamente: lo que el formulario manda es el día y **nada** de desfase,
   * porque el campo es `type="date"`.
   */
  it("lo que el formulario manda se parsea sin desfase, que es lo que no hacía", () => {
    expect(fechaDeDia("2026-09-11", "installedAt")?.toISOString()).toBe("2026-09-11T00:00:00.000Z");

    // CONTROL POSITIVO del diagnóstico: el parser de INSTANTES, con esa misma
    // entrada, lanza. Sin esta línea, «ahora funciona» no probaría qué estaba
    // roto — sólo que el código de hoy pasa.
    expect(() => parseOptionalLocalDateTime("2026-09-11", "")).toThrow(/timezone_offset_missing/);
  });

  it("una fecha ausente sigue siendo ausente: `null`, no hoy", () => {
    // Convertir una ausencia en una afirmación es el patrón de ADR-080.
    expect(fechaDeDia("", "installedAt")).toBeNull();
    expect(fechaDeDia(null, "installedAt")).toBeNull();
  });

  it("un día que no existe se rechaza, no se normaliza en silencio", () => {
    // `new Date("2026-02-31T00:00:00Z")` NO falla: da el 3 de marzo.
    expect(() => fechaDeDia("2026-02-31", "installedAt")).toThrow(FechaDeDiaInvalida);
    // Control positivo: el 29 de febrero de un año bisiesto SÍ entra.
    expect(fechaDeDia("2028-02-29", "installedAt")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("la colmena se crea con la fecha, y guarda EL DÍA QUE SE TECLEÓ", async () => {
    // El fallo que el arreglo obvio habría introducido: convertir el día a la
    // zona del dispositivo lo movería un día atrás. Se afirma el día exacto.
    const hive = await createHive(userAccountId, {
      projectId,
      locationId,
      identifier: `H-${RUN_ID.slice(-4)}`,
      installedAt: fechaDeDia("2026-09-11", "installedAt"),
    });
    expect(hive.installedAt?.toISOString().slice(0, 10)).toBe("2026-09-11");
  });

  it("y se crea igual sin fecha — el camino que sí funcionaba", async () => {
    const hive = await createHive(userAccountId, {
      projectId,
      locationId,
      identifier: `H2-${RUN_ID.slice(-4)}`,
      installedAt: fechaDeDia("", "installedAt"),
    });
    expect(hive.installedAt).toBeNull();
  });
});
