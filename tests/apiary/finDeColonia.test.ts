/**
 * Cuándo se perdió una colonia.
 *
 * **El hueco que esto cierra, medido el 2026-09-08:** `ColonyStatus` tenía
 * `dead` y `absconded` desde A1 y **ningún servicio los escribía jamás**. Lo que
 * estas pruebas afirman, y ninguna lectura del código puede afirmar, es que el
 * estado cambia de verdad, que queda con fecha, y —lo que más importa— que
 * **los conteos que sólo podían subir ahora bajan**.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  ApiaryAccessError,
  ColonyEndError,
  ESTADOS_DE_FIN,
  createColony,
  createHive,
  registrarFinDeColonia,
} from "../../lib/apiary/hives";
import { vitalesDeSitios } from "../../lib/apiary/vitalesDelSitio";
import { CATALOGO_DE_CAUSA_DE_PERDIDA } from "../../lib/apiary/causaDePerdida";
import { inmediatosDe } from "../../lib/apiary/bitacora";
import { leerEnmiendas } from "../../lib/traceability/enmiendas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `fin-col-${Date.now()}`;
const AHORA = new Date("2026-09-09T12:00:00Z");

describe("el fin de una colonia", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let sinAccesoUserAccountId: string;
  let personId: string;
  let sinAccesoPersonId: string;
  const colonyIds: string[] = [];
  /** Los ids del catálogo de causas, por su texto. Se leen una vez en `beforeAll`. */
  const causaPorValor = new Map<string, string>();
  const idDe = (valor: string) => {
    const id = causaPorValor.get(valor);
    // Un `undefined` aquí llegaría a Prisma como una consulta sin filtro. Se
    // rompe con nombre en vez de dejar que la prueba mida otra cosa.
    if (!id) throw new Error(`falta la causa «${valor}» en el catálogo sembrado`);
    return id;
  };

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    return { personId: person.id, userAccountId: cuenta.id };
  }

  async function nuevaColonia(indice: number) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `F${indice}-${RUN_ID.slice(-4)}` });
    const colony = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    colonyIds.push(colony.id);
    return colony;
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const yo = await crearCuenta("FinColonia");
    personId = yo.personId;
    userAccountId = yo.userAccountId;
    const otro = await crearCuenta("SinAcceso");
    sinAccesoPersonId = otro.personId;
    sinAccesoUserAccountId = otro.userAccountId;

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    for (const v of await prisma.variableCatalogValue.findMany({
      where: { catalog: { key: CATALOGO_DE_CAUSA_DE_PERDIDA } },
      select: { id: true, value: true },
    })) {
      causaPorValor.set(v.value, v.id);
    }
    // Control positivo: la semilla corrió. Sin esto, un catálogo vacío haría
    // que las pruebas de causas fallaran por la razón equivocada.
    if (causaPorValor.size === 0) throw new Error("el catálogo de causas está vacío: falta `npm run db:seed`");

    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });
  });

  afterAll(async () => {
    const cuentas = [userAccountId, sinAccesoUserAccountId];
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonyIds } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    // Assignment.scopeId es RESTRICT: el Scope sólo se puede borrar después.
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: [personId, sinAccesoPersonId] } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("una colonia nace activa y sin fecha de fin — el control positivo", async () => {
    const c = await nuevaColonia(0);
    expect(c.status).toBe("active");
    expect(c.endedAt).toBeNull();
  });

  it("registrar la pérdida cambia el estado Y deja la fecha", async () => {
    const c = await nuevaColonia(1);
    const despues = await registrarFinDeColonia(userAccountId, {
      colonyId: c.id,
      status: "dead",
      endedAt: new Date("2026-08-20T10:00:00Z"),
      reason: "sin reina desde julio",
    });
    expect(despues.status).toBe("dead");
    // La fecha es la declarada, NO la de registro: una pérdida se anota días
    // después y confundirlas haría mentir a la serie del año.
    expect(despues.endedAt?.toISOString()).toBe("2026-08-20T10:00:00.000Z");
  });

  it("EL CONTEO YA PUEDE BAJAR — que es lo que este cambio arregla", async () => {
    // Antes del 2026-09-08 `coloniasActivas` sólo podía subir, porque ningún
    // servicio escribía `dead`. Esta es la aserción que lo demuestra.
    const a = await nuevaColonia(2);
    const b = await nuevaColonia(3);
    const antes = (await vitalesDeSitios([locationId], AHORA)).get(locationId)!.coloniasActivas;

    await registrarFinDeColonia(userAccountId, { colonyId: a.id, status: "dead", endedAt: AHORA });
    const despues = (await vitalesDeSitios([locationId], AHORA)).get(locationId)!.coloniasActivas;

    expect(despues).toBe(antes - 1);
    // Control: la otra sigue activa, o sea que bajó por la que se perdió y no
    // porque el lector dejara de contar.
    const viva = await prisma.colony.findUniqueOrThrow({ where: { id: b.id } });
    expect(viva.status).toBe("active");
  });

  it("deja su AuditEvent con el antes, el después y el motivo", async () => {
    const c = await nuevaColonia(4);
    await registrarFinDeColonia(userAccountId, {
      colonyId: c.id,
      status: "absconded",
      endedAt: new Date("2026-07-01T08:00:00Z"),
      reason: "la caja apareció vacía",
    });
    const evento = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "colony", entityId: c.id, operation: "colony.end" },
    });
    expect(evento.reason).toBe("la caja apareció vacía");
    expect((evento.before as { status?: string }).status).toBe("active");
    expect((evento.after as { status?: string }).status).toBe("absconded");
  });

  it("la bitácora ya puede espejarlo — lo que A9.12 decía que no podía", async () => {
    const c = await nuevaColonia(5);
    await registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "dead", endedAt: AHORA });
    const enmiendas = await leerEnmiendas([{ entityType: "colony", entityId: c.id }]);
    const mensajes = inmediatosDe(enmiendas, () => `/apiaries/${locationId}`);
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]!.clase).toBe("inmediato");
    expect(mensajes[0]!.texto).toContain("perdió");
  });

  it("una colonia que ya terminó no se termina dos veces", async () => {
    const c = await nuevaColonia(6);
    await registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "dead", endedAt: AHORA });
    await expect(
      registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "absconded", endedAt: AHORA }),
    ).rejects.toThrow(ColonyEndError);
  });

  it("terminar antes de empezar se rechaza: es un reloj, no un registro", async () => {
    const c = await nuevaColonia(7);
    await expect(
      registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "dead", endedAt: new Date("2025-01-01") }),
    ).rejects.toThrow(ColonyEndError);
    // Control positivo: la MISMA colonia sí acepta una fecha posterior. Sin
    // esto, «rechazó» no probaría que mira la fecha y no otra cosa.
    const ok = await registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "dead", endedAt: AHORA });
    expect(ok.status).toBe("dead");
  });

  it("una pérdida admite VARIAS causas a la vez, cada una con cómo se supo", async () => {
    // Lo que el dueño pidió, literalmente: «hay múltiples razones y/o causales
    // y situaciones». Una caja vacía puede ser varroa y hambre.
    const c = await nuevaColonia(9);
    await registrarFinDeColonia(userAccountId, {
      colonyId: c.id,
      status: "dead",
      endedAt: AHORA,
      causas: [
        { causeValueId: idDe("Varroa"), provenanceClass: "direct_observation" },
        { causeValueId: idDe("Hambre"), provenanceClass: "hypothesis" },
      ],
    });
    const filas = await prisma.colonyLossCause.findMany({
      where: { colonyId: c.id },
      include: { cause: { select: { value: true } } },
      orderBy: { provenanceClass: "asc" },
    });
    expect(filas).toHaveLength(2);
    // Y las clases NO se mezclan: se vio la varroa, se sospecha el hambre.
    const porValor = new Map(filas.map((f) => [f.cause.value, f.provenanceClass]));
    expect(porValor.get("Varroa")).toBe("direct_observation");
    expect(porValor.get("Hambre")).toBe("hypothesis");
  });

  it("una causa que no es de este catálogo se rechaza — la FK sola no lo impide", async () => {
    // La FK apunta a `variable_catalog_value` ENTERA. Sin la comprobación del
    // servicio, colgar una levadura de una colonia muerta sería legal.
    const levadura = await prisma.variableCatalogValue.findFirstOrThrow({
      where: { catalog: { key: "levadura_cultivo" } },
      select: { id: true },
    });
    const c = await nuevaColonia(10);
    await expect(
      registrarFinDeColonia(userAccountId, {
        colonyId: c.id,
        status: "dead",
        endedAt: AHORA,
        causas: [{ causeValueId: levadura.id, provenanceClass: "hypothesis" }],
      }),
    ).rejects.toThrow(ColonyEndError);
    // CONTROL POSITIVO: la misma colonia, la misma llamada, con un id que SÍ es
    // del catálogo de causas. Sin esto, «rechazó» no probaría que mira el
    // catálogo en vez de rechazar cualquier causa.
    const ok = await registrarFinDeColonia(userAccountId, {
      colonyId: c.id,
      status: "dead",
      endedAt: AHORA,
      causas: [{ causeValueId: idDe("Saqueo"), provenanceClass: "hypothesis" }],
    });
    expect(ok.status).toBe("dead");
  });

  it("la misma causa dos veces se rechaza POR REPETIDA, no por desconocida", async () => {
    // **Se afirma el mensaje, no sólo la clase**, y el flip-test es por qué.
    // Quitando la comprobación de repetidas, la llamada sigue fallando —el
    // `in` de Prisma deduplica, así que `validas.length` no cuadra y salta
    // `causa_desconocida`, que también es un `ColonyEndError`—. Con
    // `toThrow(ColonyEndError)` la prueba pasaba con el guardia quitado: era
    // un adorno. Los dos errores dicen cosas distintas a quien rellena el
    // formulario —«la elegiste dos veces» contra «esa causa no existe»— y esa
    // diferencia es lo que esta prueba defiende.
    const c = await nuevaColonia(11);
    await expect(
      registrarFinDeColonia(userAccountId, {
        colonyId: c.id,
        status: "dead",
        endedAt: AHORA,
        causas: [
          { causeValueId: idDe("Varroa"), provenanceClass: "hypothesis" },
          { causeValueId: idDe("Varroa"), provenanceClass: "direct_observation" },
        ],
      }),
    ).rejects.toThrow("causa_repetida");
    // Y no dejó la colonia a medio terminar.
    const sinTocar = await prisma.colony.findUniqueOrThrow({ where: { id: c.id } });
    expect(sinTocar.status).toBe("active");
  });

  it("una clase de procedencia fuera de las tres se rechaza", async () => {
    // `measured_fact` es válido en el enum y no significa nada aquí: convertiría
    // una conjetura sobre una caja vacía en una medición.
    const c = await nuevaColonia(12);
    await expect(
      registrarFinDeColonia(userAccountId, {
        colonyId: c.id,
        status: "dead",
        endedAt: AHORA,
        causas: [{ causeValueId: idDe("Varroa"), provenanceClass: "measured_fact" as never }],
      }),
    ).rejects.toThrow(ColonyEndError);
  });

  it("«desconocido» va sola: acompañada se rechaza, sola se acepta", async () => {
    const a = await nuevaColonia(13);
    await expect(
      registrarFinDeColonia(userAccountId, {
        colonyId: a.id,
        status: "dead",
        endedAt: AHORA,
        causas: [
          { causeValueId: idDe("desconocido"), provenanceClass: "conclusion" },
          { causeValueId: idDe("Varroa"), provenanceClass: "hypothesis" },
        ],
      }),
    ).rejects.toThrow(ColonyEndError);
    // Control positivo: sola sí entra. Sin esto, la prueba pasaría igual si el
    // servicio rechazara «desconocido» siempre.
    const ok = await registrarFinDeColonia(userAccountId, {
      colonyId: a.id,
      status: "dead",
      endedAt: AHORA,
      causas: [{ causeValueId: idDe("desconocido"), provenanceClass: "conclusion" }],
    });
    expect(ok.status).toBe("dead");
    expect(await prisma.colonyLossCause.count({ where: { colonyId: a.id } })).toBe(1);
  });

  it("una colonia COMBINADA también termina, y también baja el conteo", async () => {
    // El estándar internacional cuenta como pérdida el problema de reina
    // irresoluble: la colonia está viva, no es recuperable y se combina. Sin el
    // estado `combined` se quedaba `active` para siempre inflando el conteo.
    const c = await nuevaColonia(14);
    const antes = (await vitalesDeSitios([locationId], AHORA)).get(locationId)!.coloniasActivas;
    const despues = await registrarFinDeColonia(userAccountId, {
      colonyId: c.id,
      status: "combined",
      endedAt: AHORA,
      causas: [{ causeValueId: idDe("Problema de reina irresoluble"), provenanceClass: "direct_observation" }],
    });
    expect(despues.status).toBe("combined");
    const ahora = (await vitalesDeSitios([locationId], AHORA)).get(locationId)!.coloniasActivas;
    expect(ahora).toBe(antes - 1);
  });

  it("las causas entran en el AuditEvent, no sólo en su tabla", async () => {
    // Si quedaran fuera del `after`, el rastro diría que la colonia murió y no
    // por qué — que es la mitad que este cambio añade.
    const c = await nuevaColonia(15);
    await registrarFinDeColonia(userAccountId, {
      colonyId: c.id,
      status: "dead",
      endedAt: AHORA,
      causas: [{ causeValueId: idDe("Loque"), provenanceClass: "conclusion" }],
    });
    const evento = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "colony", entityId: c.id, operation: "colony.end" },
    });
    const after = evento.after as { lossCauses?: { cause?: { value?: string } }[] };
    expect(after.lossCauses).toHaveLength(1);
    expect(after.lossCauses?.[0]?.cause?.value).toBe("Loque");
  });

  it("un estado que no es un fin se rechaza — la colonia viva con fecha de muerte", async () => {
    // El agujero, medido el 2026-09-10: la acción metía la cadena del
    // formulario con `as never` y el servicio escribía `input.status` sin
    // mirarlo. Un envío con `status=active` pasaba el `where` —que exige
    // `status: "active"`— y dejaba la fila con `active` Y `ended_at` puesto.
    const c = await nuevaColonia(16);
    await expect(
      registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "active" as never, endedAt: AHORA }),
    ).rejects.toThrow(/estado_de_fin_invalido/);
    // Y sigue intacta: ni estado cambiado ni fecha puesta.
    const sinTocar = await prisma.colony.findUniqueOrThrow({ where: { id: c.id } });
    expect(sinTocar.status).toBe("active");
    expect(sinTocar.endedAt).toBeNull();
  });

  it("los tres estados de fin declarados son exactamente los del enum menos `active`", () => {
    // Si mañana entra un cuarto valor en ColonyStatus, esta lista se queda corta
    // y el formulario dejaría de ofrecerlo sin que nada avise.
    expect([...ESTADOS_DE_FIN].sort()).toEqual(["absconded", "combined", "dead"]);
  });

  it("quien no tiene acceso al sitio no puede dar por perdida una colonia", async () => {
    const c = await nuevaColonia(8);
    await expect(
      registrarFinDeColonia(sinAccesoUserAccountId, { colonyId: c.id, status: "dead", endedAt: AHORA }),
    ).rejects.toThrow(ApiaryAccessError);
    // Y sigue viva: el rechazo no dejó a medias una escritura.
    const sinTocar = await prisma.colony.findUniqueOrThrow({ where: { id: c.id } });
    expect(sinTocar.status).toBe("active");
    expect(sinTocar.endedAt).toBeNull();
  });
});
