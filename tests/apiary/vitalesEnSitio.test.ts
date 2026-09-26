/**
 * ADR-157 — los vitales de campo, anotados estando en el sitio.
 *
 * **Lo que protege.** El protocolo marca clima, colonias vivas y cajas presentes como
 * `stage: field` —son cosas que se VEN estando ahí— y las tres se capturaban sólo en el
 * formulario de cierre, que se rellena en casa. El dueño pidió poder hacerlo **de las dos
 * formas**; así que no se restringe, se **registra cuál de las dos pasó**.
 *
 * Sin la marca, una cifra vista con el guante puesto y una reconstruida de memoria dos horas
 * después son la misma fila, las dos estampadas `original_record`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { registrarVitalesEnSitio, VitalesEnSitioInvalido } from "../../lib/apiary/vitalesEnSitio";
import { completarVisita } from "../../lib/traceability/fieldSessions";
import { crearApiario, createHive } from "../../lib/apiary/hives";

const RUN = `a9-vs-${Date.now()}`;

describe("los vitales anotados en sitio", () => {
  let userAccountId: string;
  let apiarioId: string;
  let personId: string;
  let organizationId: string;
  let sesionId: string;

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" },
      })
    ).id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Vs", displayName: `TEST Vs (${RUN})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;

    // El ámbito de plataforma se REUSA, nunca se crea ni se borra: es compartido.
    const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
    const scope =
      (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
      (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: admin.id, scopeId: scope.id } });

    apiarioId = (await crearApiario(userAccountId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
    // Dos colmenas colocadas: la cuenta del sistema con la que se compara lo declarado (ADR-150).
    await createHive(userAccountId, { identifier: `${RUN}-01`, locationId: apiarioId });
    await createHive(userAccountId, { identifier: `${RUN}-02`, locationId: apiarioId });
  });

  afterEach(async () => {
    // En `afterEach`, no al final del cuerpo de cada `it`: una aserción que falla se salta el
    // borrado y deja filas en la base COMPARTIDA (la fuga de `polinizacion.test.ts`).
    if (sesionId) {
      await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: sesionId }) });
      await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: sesionId }) });
      sesionId = "";
    }
  });

  afterAll(async () => {
    /**
     * Borra TODO lo que la corrida pudo dejar, no sólo las visitas.
     *
     * **Medido el 2026-09-26.** Esto borraba únicamente `fieldSession`, así que cada corrida
     * abandonaba en la base COMPARTIDA su organización, su ubicación, su persona, su cuenta, su
     * asignación, sus dos colmenas con sus dos emplazamientos y tres `AuditEvent`: **12 filas, con
     * los 16 tests en verde**. En `nectar_test` se habían acumulado **22 corridas** entre el 18 y
     * el 21 de septiembre — 66 entidades, 44 colmenas y 44 emplazamientos, el 62 % de toda la
     * basura de prueba de esa base. El color no lo dice: hay que contar filas antes y después.
     *
     * **El orden es el de las claves ajenas.** Ninguna de estas relaciones declara `onDelete`, así
     * que son `RESTRICT`: los emplazamientos van antes que las colmenas, y las dos antes que la
     * ubicación que las aloja; la asignación antes que la cuenta, la cuenta antes que la persona,
     * y la ubicación antes que la organización. Un `afterAll` es una cadena — la primera clave
     * ajena que se queje tira todo lo que venga detrás (la fuga de `polinizacion.test.ts`).
     *
     * `auditEvent` va primero porque referencia la cuenta: `crearApiario` y `createHive` escriben
     * los suyos con este usuario como actor, y el `afterEach` de arriba sólo borra los de la visita.
     */
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ locationId: apiarioId }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ locationId: apiarioId }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: apiarioId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarioId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
    // El ámbito de plataforma NO se borra: es compartido y el `beforeAll` lo reusa si ya existe.
    // Medido en la misma corrida — `core.scope` no crece, así que esa mitad ya estaba bien.
  });

  async function visitaAbierta() {
    const s = await prisma.fieldSession.create({
      data: {
        locationId: apiarioId,
        operatorPersonId: personId,
        startedAt: new Date("2026-09-17T09:00:00Z"),
        status: "draft",
        provenanceClass: "original_record",
      },
    });
    sesionId = s.id;
    return s.id;
  }

  it("LO QUE EL DUEÑO PIDIÓ: se anota durante la visita, y queda dicho que fue allí", async () => {
    const id = await visitaAbierta();
    const ahora = new Date("2026-09-17T09:40:00Z");
    const r = await registrarVitalesEnSitio(
      userAccountId,
      { fieldSessionId: id, weatherObserved: "nublado", coloniesAliveCount: 8, hivesPresentCount: 9 },
      ahora,
    );
    expect(r.fieldVitalsOnSiteAt).toEqual(ahora);

    // Se lee de LA FILA, no del valor devuelto.
    const fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect(fila.weatherObserved).toBe("nublado");
    expect(fila.coloniesAliveCount).toBe(8);
    expect(fila.hivesPresentCount).toBe(9);
    expect(fila.fieldVitalsOnSiteAt).toEqual(ahora);
  });

  it("los tres son INDEPENDIENTES: lo que se deja vacío NO se borra", async () => {
    // **El orden importa y la primera versión de esta prueba lo tenía al revés.** Escribía el
    // recuento y DESPUÉS el clima, así que la mutación que borra el clima cuando llega vacío no
    // cambiaba nada: el clima estaba vacío igualmente. «NADIE CAYÓ».
    //
    // Se prueba en las DOS direcciones, cada campo escrito primero y luego omitido, porque cada
    // una sólo puede cazar la mutación de su propio campo.
    const id = await visitaAbierta();

    // 1. el clima primero, y luego una pasada que NO lo menciona
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, weatherObserved: "lluvia" });
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: 9 });
    let fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect(fila.weatherObserved, "el clima de la primera pasada debe sobrevivir").toBe("lluvia");
    expect(fila.hivesPresentCount).toBe(9);

    // 2. y al revés: el recuento ya está, y una pasada que sólo toca el clima no lo borra
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, weatherObserved: "despejado" });
    fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect(fila.hivesPresentCount, "el recuento debe sobrevivir").toBe(9);
    expect(fila.weatherObserved).toBe("despejado");

    // 3. y las colonias, que es el tercero y no lo cubría ninguna de las dos de arriba
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, coloniesAliveCount: 5 });
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: 6 });
    fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect(fila.coloniesAliveCount, "las colonias deben sobrevivir").toBe(5);
  });

  it("y devuelve la comparación de cajas YA RESUELTA: quien cuenta allí es quien puede actuar", async () => {
    const id = await visitaAbierta();
    const enSistema = await prisma.hive.count({ where: assertDefinedWhere({ locationId: apiarioId }) });
    const r = await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: enSistema + 2 });
    expect(r.cajas.estado).toBe("divergen");
    expect(r.cajas.diferencia).toBe(2);
  });

  it("CERO es un recuento válido, y no es «no conté»", async () => {
    const id = await visitaAbierta();
    const r = await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: 0 });
    const fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect(fila.hivesPresentCount).toBe(0);
    expect(fila.fieldVitalsOnSiteAt).not.toBeNull();
    expect(r.cajas.declaradas).toBe(0);
  });

  it("UN ENVÍO VACÍO se rechaza: afirmaría haber anotado en sitio sin anotar nada", async () => {
    const id = await visitaAbierta();
    await expect(registrarVitalesEnSitio(userAccountId, { fieldSessionId: id })).rejects.toThrow(
      /nada_que_registrar/,
    );
    const fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect(fila.fieldVitalsOnSiteAt, "y NO deja la marca puesta").toBeNull();
  });

  it("una visita YA CERRADA se rechaza — es lo único que la marca afirma", async () => {
    const id = await visitaAbierta();
    await prisma.fieldSession.update({ where: { id }, data: { endedAt: new Date(), status: "completed" } });
    await expect(
      registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: 3 }),
    ).rejects.toThrow(VitalesEnSitioInvalido);
  });

  it("LA OTRA MITAD: si el cierre reescribe uno de los tres, la marca SE LIMPIA", async () => {
    // Es lo que impide que la fila afirme algo falso: una cifra corregida desde casa ya no es la
    // que se vio con el guante puesto.
    const id = await visitaAbierta();
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: 9 });
    expect((await prisma.fieldSession.findUniqueOrThrow({ where: { id } })).fieldVitalsOnSiteAt).not.toBeNull();

    await prisma.fieldSession.update({ where: { id }, data: { endedAt: new Date("2026-09-17T12:00:00Z") } });
    await completarVisita(userAccountId, { fieldSessionId: id, hivesPresentCount: 7 });

    const fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect(fila.hivesPresentCount).toBe(7);
    expect(fila.fieldVitalsOnSiteAt, "corregido desde casa: la marca ya no puede afirmar «en sitio»").toBeNull();
  });

  it("CONTROL: un cierre que NO toca los tres deja la marca intacta", async () => {
    // La mitad que hace falsable lo anterior. Sin esto, un `fieldVitalsOnSiteAt: null` puesto
    // siempre cumpliría la prueba de arriba igual.
    const id = await visitaAbierta();
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: 9 });
    const antes = (await prisma.fieldSession.findUniqueOrThrow({ where: { id } })).fieldVitalsOnSiteAt;

    await prisma.fieldSession.update({ where: { id }, data: { endedAt: new Date("2026-09-17T12:00:00Z") } });
    await completarVisita(userAccountId, { fieldSessionId: id, probableCause: "sequía" });

    const fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect(fila.fieldVitalsOnSiteAt).toEqual(antes);
    expect(fila.probableCause).toBe("sequía");
  });

  it("ADR-165 — LA CONDICIÓN DEL SITIO se anota en el sitio, varias a la vez, y estampa la marca", async () => {
    const id = await visitaAbierta();
    await registrarVitalesEnSitio(userAccountId, {
      fieldSessionId: id, siteConditions: ["pasto_alto", "hormigas", "otro"], siteConditionOtherNote: " panal silvestre cerca ",
    });
    const fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    // En el orden del protocolo, no en el que llegaron; y la nota recortada.
    expect([fila.siteConditions, fila.siteConditionOtherNote]).toEqual([["hormigas", "pasto_alto", "otro"], "panal silvestre cerca"]);
    expect(fila.fieldVitalsOnSiteAt).not.toBeNull();
  });

  it("ADR-165 — CERRAR SIN MARCAR NINGUNA no borra lo anotado en el sitio", async () => {
    // Las casillas no pueden decir «lo de antes». Por eso la acción manda `undefined` sin marcas,
    // y el servicio no toca la columna: borrar lo que se vio con el guante puesto por no volver a
    // marcarlo en casa sería perderlo.
    const id = await visitaAbierta();
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, siteConditions: ["encharcamiento"] });
    await prisma.fieldSession.update({ where: { id }, data: { endedAt: new Date("2026-09-17T12:00:00Z") } });
    await completarVisita(userAccountId, { fieldSessionId: id, probableCause: "lluvias" });
    const fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect(fila.siteConditions).toEqual(["encharcamiento"]);
    expect(fila.fieldVitalsOnSiteAt).not.toBeNull();
  });

  it("ADR-165 — CORREGIRLA AL CERRAR la reescribe y LIMPIA la marca, como los otros vitales", async () => {
    const id = await visitaAbierta();
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, siteConditions: ["encharcamiento"] });
    await prisma.fieldSession.update({ where: { id }, data: { endedAt: new Date("2026-09-17T12:00:00Z") } });
    await completarVisita(userAccountId, { fieldSessionId: id, siteConditions: ["sin_novedad"] });
    const fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect([fila.siteConditions, fila.fieldVitalsOnSiteAt]).toEqual([["sin_novedad"], null]);
  });

  it("ADR-165 — lo que se contradice se rechaza, y no se escribe nada", async () => {
    const id = await visitaAbierta();
    await expect(
      registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, siteConditions: ["sin_novedad", "hormigas"] }),
    ).rejects.toThrow(/sin_novedad_va_sola/);
    await expect(registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, siteConditions: ["otro"] })).rejects.toThrow(
      /otro_sin_decir_cual/,
    );
    const fila = await prisma.fieldSession.findUniqueOrThrow({ where: { id } });
    expect([fila.siteConditions, fila.fieldVitalsOnSiteAt]).toEqual([[], null]);
  });

  it("ADR-165 — LAS REGLAS VIVEN EN LA BASE: cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const id = await visitaAbierta();
    async function sonda(conds: string, nota: string | null): Promise<string> {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE traceability.field_session SET site_conditions = ARRAY[${conds}]::traceability."SiteCondition"[],
               site_condition_other_note = ${nota === null ? "NULL" : `'${nota}'`} WHERE id = '${id}'`,
          );
          throw new Error("DESHACER");
        });
      } catch (e) {
        const m = (e as Error).message;
        if (m.includes("DESHACER")) return "entra";
        return m.match(/field_session_[a-z_]+/)?.[0] ?? m.slice(0, 120);
      }
      return "?";
    }
    expect(await sonda("'hormigas','pasto_alto'", null)).toBe("entra");
    expect(await sonda("'otro'", "panal")).toBe("entra");
    expect(await sonda("'sin_novedad','hormigas'", null)).toBe("field_session_sin_novedad_va_sola");
    expect(await sonda("'otro'", null)).toBe("field_session_otra_condicion_dice_cual");
    expect(await sonda("'hormigas'", "huérfana")).toBe("field_session_otra_condicion_dice_cual");
  });

  it("escribe su AuditEvent en la misma transacción, con el ANTES", async () => {
    const id = await visitaAbierta();
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: 9 });
    await registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: 4 });

    const eventos = await prisma.auditEvent.findMany({
      where: assertDefinedWhere({ entityId: id, operation: "field_session.vitals_on_site" }),
      orderBy: { occurredAt: "asc" },
      select: { before: true, after: true },
    });
    expect(eventos).toHaveLength(2);
    expect((eventos[1]?.before as { hivesPresentCount?: number })?.hivesPresentCount).toBe(9);
    expect((eventos[1]?.after as { hivesPresentCount?: number })?.hivesPresentCount).toBe(4);
  });

  it("un recuento que no puede ser un recuento se rechaza", async () => {
    const id = await visitaAbierta();
    await expect(
      registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, hivesPresentCount: -1 }),
    ).rejects.toThrow(/cajas_presentes_invalido/);
    await expect(
      registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, coloniesAliveCount: 2.5 }),
    ).rejects.toThrow(/colonias_vivas_invalido/);
  });

  it("y un clima que no está en el vocabulario también", async () => {
    const id = await visitaAbierta();
    await expect(
      registrarVitalesEnSitio(userAccountId, { fieldSessionId: id, weatherObserved: "neblina" }),
    ).rejects.toThrow(/clima_observado_desconocido/);
  });
});
