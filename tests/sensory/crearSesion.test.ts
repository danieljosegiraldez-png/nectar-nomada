/**
 * Crear una sesión de cata — la puerta que no existía.
 *
 * **Medido el 2026-09-06:** `sensorySession.create` aparecía sólo en
 * `prisma/seed.ts` y en pruebas, nunca en `lib/` ni en `app/`. Se podía juzgar
 * una sesión y nadie podía crearla, así que producción tiene cero valoraciones
 * con el módulo sensorial entero por dentro.
 *
 * Una sesión no es una fila: es sesión → vuelo → muestras ciegas → mapeo. Las
 * pruebas de abajo comprueban las cuatro, porque una sesión a medias es peor que
 * ninguna — un juez la abre y no puede catar, o un puntaje queda sin poder
 * atribuirse a ningún café.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  buscarMuestrasParaCata,
  crearSesionDeCata,
  LIMITE_BUSQUEDA_MUESTRAS,
  listarMuestrasParaCata,
  SesionDeCataError,
} from "../../lib/sensory/sessions";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `cata-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string;
let gestor: string, sinPermiso: string;
let versionOk: string, versionSinAtributos: string, versionArchivada: string;
let m1: string, m2: string;

async function cuenta(label: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" },
  });
  return (await prisma.userAccount.create({
    data: { personId: p.id, authProvider: "credentials", status: "active" },
  })).id;
}

async function protocolo(nombre: string, atributos: number, estado: "active" | "archived") {
  const p = await prisma.sensoryProtocol.create({
    data: { domain: "coffee", name: `TEST ${nombre} ${RUN}`, status: estado, standardLicenseStatus: "adapted_original" },
  });
  const v = await prisma.sensoryProtocolVersion.create({
    data: { protocolId: p.id, version: 1, scoreMin: 0, scoreMax: 10, status: "active" },
  });
  for (let i = 0; i < atributos; i++) {
    await prisma.sensoryAttribute.create({
      data: { protocolVersionId: v.id, name: `Attr${i}`, displayOrder: i, scaleMin: 0, scaleMax: 10, section: "descriptive" },
    });
  }
  return v.id;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" },
  })).id;
  plotId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
  })).id;

  gestor = await cuenta("Gestor");
  sinPermiso = await cuenta("SinPermiso");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  await prisma.assignment.create({ data: { userAccountId: sinPermiso, roleProfileId: farm.id, scopeId } });

  // `sensory:manage_session` se pide a nivel PLATAFORMA, así que hace falta una
  // asignación de plataforma que lo conceda. Platform Admin la tiene.
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform" } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: admin.id, scopeId: plataforma.id } });

  versionOk = await protocolo("protocolo bueno", 3, "active");
  versionSinAtributos = await protocolo("protocolo vacío", 0, "active");
  versionArchivada = await protocolo("protocolo retirado", 3, "archived");

  const muestra = async (codigo: string) =>
    (await prisma.sample.create({
      data: {
        sampleCode: `${codigo}-${RUN}`,
        sampleType: "green",
        organizationId: orgId,
        locationId: plotId,
        status: "approved",
        classification: "internal",
        createdBy: gestor,
      },
    })).id;
  m1 = await muestra("M1");
  m2 = await muestra("M2");
});

afterAll(async () => {
  const ids = [gestor, sinPermiso];
  const sesiones = await prisma.sensorySession.findMany({ where: assertDefinedWhere({ createdBy: { in: ids } }), select: { id: true } });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: { in: sesiones.map((s) => s.id) } }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ createdBy: { in: ids } }) });
  for (const v of [versionOk, versionSinAtributos, versionArchivada]) {
    const ver = await prisma.sensoryProtocolVersion.findUnique({ where: { id: v } });
    if (!ver) continue;
    await prisma.sensoryAttribute.deleteMany({ where: assertDefinedWhere({ protocolVersionId: v }) });
    await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: v }) });
    await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: ver.protocolId }) });
  }
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
});

describe("crear una sesión de cata", () => {
  it("crea sesión, vuelo, muestras ciegas Y su mapeo — las cuatro cosas", async () => {
    const s = await crearSesionDeCata(gestor, {
      name: `Cata ${RUN}`,
      protocolVersionId: versionOk,
      muestras: [m1, m2],
    });

    const completa = await prisma.sensorySession.findUniqueOrThrow({
      where: { id: s.id },
      include: { flights: { include: { blindSamples: { include: { blindMapping: true } } } } },
    });
    expect(completa.flights).toHaveLength(1);
    const ciegas = completa.flights[0]!.blindSamples;
    expect(ciegas).toHaveLength(2);
    expect(ciegas.map((c) => c.blindCode).sort()).toEqual(["A", "B"]);
    expect(
      ciegas.map((c) => c.blindMapping?.sampleId).filter(Boolean).sort(),
      "una muestra ciega sin mapeo es un puntaje que después no se atribuye a nada",
    ).toEqual([m1, m2].sort());
  });

  /**
   * El guardia. Sin esto, cualquiera con acceso a un lote podría montar una cata
   * — y `sensory:manage_session` existiría sin proteger nada.
   */
  it("sin `sensory:manage_session` no se puede crear", async () => {
    await expect(
      crearSesionDeCata(sinPermiso, { name: "No", protocolVersionId: versionOk, muestras: [m1] }),
    ).rejects.toBeInstanceOf(SesionDeCataError);
  });

  it("rechaza un protocolo sin atributos: el juez no tendría nada que puntuar", async () => {
    await expect(
      crearSesionDeCata(gestor, { name: "Vacío", protocolVersionId: versionSinAtributos, muestras: [m1] }),
    ).rejects.toThrow(/no_attributes/);
  });

  it("rechaza un protocolo retirado", async () => {
    await expect(
      crearSesionDeCata(gestor, { name: "Retirado", protocolVersionId: versionArchivada, muestras: [m1] }),
    ).rejects.toThrow(/archived/);
  });

  it("rechaza una sesión sin muestras y una con la misma dos veces", async () => {
    await expect(
      crearSesionDeCata(gestor, { name: "Sin", protocolVersionId: versionOk, muestras: [] }),
    ).rejects.toThrow(/samples_required/);
    await expect(
      crearSesionDeCata(gestor, { name: "Dup", protocolVersionId: versionOk, muestras: [m1, m1] }),
    ).rejects.toThrow(/duplicate/);
  });

  /**
   * Control positivo del guardia de muestras: el gestor SÍ alcanza las suyas.
   * Sin esto, «rechaza una muestra ajena» pasaría también si el servicio
   * rechazara todas.
   */
  it("lista las muestras que alcanza, y son las suyas", async () => {
    // Buscando por el RUN y no leyendo la lista: la lista corta en 200 y el admin
    // la ve entera, así que lo propio saldría el día que otros dejen 200 delante.
    const suyas = (await buscarMuestrasParaCata(gestor, RUN)).muestras.map((m) => m.id);
    expect(suyas, "control positivo: alcanza las dos que creó").toEqual(expect.arrayContaining([m1, m2]));
  });

  /**
   * **No se puede probar por la interfaz pública, y se dice en vez de fingirlo.**
   * El servicio SÍ comprueba que cada muestra esté entre las que el llamador
   * alcanza. Pero para crear una sesión hace falta `sensory:manage_session`, que
   * hoy sólo tienen `Platform Admin` —que alcanza todo, así que ninguna muestra
   * le es ajena— y `Sensory Head Judge`, que no tiene NI `lot:view` NI
   * `sample:manage`, así que no alcanza ninguna y no puede crear nada.
   *
   * Es decir: **hoy sólo un Platform Admin puede montar una cata**, y contra él
   * esta comprobación no puede fallar. Escribir una prueba con un usuario
   * fabricado a mano que tuviera manage_session sin acceso a muestras probaría
   * una combinación que el catálogo de perfiles no produce — un verde sobre un
   * mundo que no existe.
   *
   * Queda como decisión del dueño (2026-09-06): o `Sensory Head Judge` recibe
   * acceso de lectura a muestras, o montar la cata es trabajo de quien tiene
   * `sample:manage` y entonces el permiso que la gobierna debería ser otro.
   */
});

/**
 * **De qué café es cada muestra.** Daniel, probando la pantalla el 2026-09-11:
 * «says 111 - green coffee» y «i think there is a mistake trying to select which
 * coffee». La lista devolvía código y tipo, y con eso nadie sabe cuál de sus
 * cafés va a catar. `Sample.sourceLotId` lo sabía; la consulta no lo leía.
 *
 * La limpieza va en el `afterAll` de ESTE describe y borra en orden hijo→padre.
 * Escribirla debajo de las aserciones es lo que dejó 15 filas TEST en la base
 * compartida el 2026-09-08: una aserción que falla se salta ese borrado.
 */
describe("listarMuestrasParaCata — el batch de origen", () => {
  let loteId: string, muestraConLote: string;

  beforeAll(async () => {
    const lote = await prisma.lot.create({
      data: {
        lotCode: `PE-TEST-${RUN}`,
        lotType: "cherry",
        organizationId: orgId,
        locationId: plotId,
        status: "approved",
        classification: "internal",
        createdBy: gestor,
      },
    });
    loteId = lote.id;
    const m = await prisma.sample.create({
      data: {
        sampleCode: `CON-LOTE-${RUN}`,
        sampleType: "green",
        organizationId: orgId,
        locationId: plotId,
        sourceLotId: lote.id,
        status: "approved",
        classification: "internal",
        createdBy: gestor,
      },
    });
    muestraConLote = m.id;
  });

  afterAll(async () => {
    await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: muestraConLote }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: loteId }) });
  });

  it("trae el código del batch y la finca de la muestra que sí viene de un lote", async () => {
    const todas = (await buscarMuestrasParaCata(gestor, RUN)).muestras;
    const mia = todas.find((m) => m.id === muestraConLote);
    expect(mia, "control positivo: la muestra está en la lista").toBeDefined();
    expect(mia!.lotCode).toBe(`PE-TEST-${RUN}`);
    expect(mia!.organizationName).toBeTruthy();
  });

  /**
   * El control que hace que el de arriba signifique algo: si `lotCode` saliera
   * siempre relleno, la primera aserción pasaría sin demostrar que lee el lote.
   * `m1` se crea sin `sourceLotId` —como una muestra externa— y tiene que salir
   * en null, no en cadena vacía: «no viene de un batch» es un hecho, no un hueco.
   */
  it("deja el batch en null cuando la muestra no viene de ninguno", async () => {
    const todas = (await buscarMuestrasParaCata(gestor, RUN)).muestras;
    const sinLote = todas.find((m) => m.id === m1);
    expect(sinLote, "control positivo: la muestra sin lote también se lista").toBeDefined();
    expect(sinLote!.lotCode).toBeNull();
    expect(sinLote!.organizationName).toBeNull();
    expect(sinLote!.processGrade).toBeNull();
  });
});

/**
 * **La comprobación de la cata no puede depender de la lista que se enseña.**
 * Hasta el 2026-09-18 `crearSesionDeCata` aceptaba sólo muestras que salieran en
 * `listarMuestrasParaCata`, que corta en 200. Pasadas las 200, una muestra
 * propia se rechazaba con `sample_not_accessible`. Aquí se crean 201 muestras que
 * ordenan ANTES que la de la prueba, así que la lista no la enseña — y la cata
 * tiene que aceptarla igual.
 */
describe("crear una cata con una muestra que la lista no enseña", () => {
  let tapon: string[] = [];
  let lejana: string;

  beforeAll(async () => {
    await prisma.sample.createMany({
      data: Array.from({ length: 201 }, (_, i) => ({
        sampleCode: `0000-TAPON-${RUN}-${String(i).padStart(3, "0")}`,
        sampleType: "green",
        organizationId: orgId,
        locationId: plotId,
        status: "approved" as const,
        classification: "internal" as const,
        createdBy: gestor,
      })),
    });
    tapon = (
      await prisma.sample.findMany({
        where: { sampleCode: { startsWith: `0000-TAPON-${RUN}` } },
        select: { id: true },
      })
    ).map((m) => m.id);
    lejana = (
      await prisma.sample.create({
        data: {
          sampleCode: `ZZZZ-LEJANA-${RUN}`,
          sampleType: "green",
          organizationId: orgId,
          locationId: plotId,
          status: "approved",
          classification: "internal",
          createdBy: gestor,
        },
      })
    ).id;
  });

  afterAll(async () => {
    const sesiones = await prisma.sensoryBlindMapping.findMany({
      where: assertDefinedWhere({ sampleId: lejana }),
      select: { blindSample: { select: { flight: { select: { sessionId: true } } } } },
    });
    await prisma.sensorySession.deleteMany({
      where: assertDefinedWhere({ id: { in: sesiones.map((m) => m.blindSample.flight.sessionId) } }),
    });
    await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: { in: [...tapon, lejana] } }) });
  });

  it("control: la lista inicial NO la enseña", async () => {
    expect(tapon, "fila patrón: se crearon las 201").toHaveLength(201);
    const ids = (await listarMuestrasParaCata(gestor)).map((m) => m.id);
    expect(ids).not.toContain(lejana);
  });

  it("y aun así la cata la acepta", async () => {
    const s = await crearSesionDeCata(gestor, { name: `Lejana ${RUN}`, protocolVersionId: versionOk, muestras: [lejana] });
    expect(s.id).toBeTruthy();
  });

  it("y la búsqueda la encuentra por su código", async () => {
    const { muestras } = await buscarMuestrasParaCata(gestor, `LEJANA-${RUN}`);
    expect(muestras.map((m) => m.id)).toEqual([lejana]);
  });

  it("una búsqueda con más resultados que el límite lo dice", async () => {
    const r = await buscarMuestrasParaCata(gestor, `TAPON-${RUN}`);
    expect(r.muestras).toHaveLength(LIMITE_BUSQUEDA_MUESTRAS);
    expect(r.hayMas).toBe(true);
  });
});

/**
 * La búsqueda que usa la pantalla para elegir muestras de sitios distintos.
 * Encuentra por código de muestra, código de batch y nombre de finca — y nunca
 * devuelve una muestra que la cuenta no puede ver.
 */
describe("buscarMuestrasParaCata", () => {
  let loteId: string, conLote: string, otroPlot: string, ajena: string;
  let juez: string;

  beforeAll(async () => {
    loteId = (
      await prisma.lot.create({
        data: {
          lotCode: `BUSCA-LOTE-${RUN}`,
          lotType: "cherry",
          organizationId: orgId,
          locationId: plotId,
          status: "approved",
          classification: "internal",
          createdBy: gestor,
        },
      })
    ).id;
    conLote = (
      await prisma.sample.create({
        data: {
          sampleCode: `BUSCA-M-${RUN}`,
          sampleType: "green",
          organizationId: orgId,
          locationId: plotId,
          sourceLotId: loteId,
          status: "approved",
          classification: "internal",
          createdBy: gestor,
        },
      })
    ).id;
    // Otra parcela, que el juez NO alcanza.
    otroPlot = (
      await prisma.location.create({
        data: { locationType: "plot", name: `TEST plot ajeno ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
      })
    ).id;
    ajena = (
      await prisma.sample.create({
        data: {
          sampleCode: `BUSCA-AJENA-${RUN}`,
          sampleType: "green",
          organizationId: orgId,
          locationId: otroPlot,
          status: "approved",
          classification: "internal",
          createdBy: gestor,
        },
      })
    ).id;

    // Un juez: puede montar catas (Head Judge, en plataforma) y sólo ve las
    // muestras de SU parcela (Farm Operator sobre `plotId`).
    juez = await cuenta("Juez");
    const juezJefe = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Sensory Head Judge" } });
    const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const plataforma = (await prisma.scope.findFirst({ where: { scopeType: "platform" } }))!;
    await prisma.assignment.create({ data: { userAccountId: juez, roleProfileId: juezJefe.id, scopeId: plataforma.id } });
    // El ámbito de la parcela ya lo creó el fixture de arriba (`scopeId`): es único por sitio.
    await prisma.assignment.create({ data: { userAccountId: juez, roleProfileId: farm.id, scopeId } });
  });

  afterAll(async () => {
    await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: { in: [conLote, ajena] } }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: loteId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: otroPlot }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: juez }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: juez }) });
  });

  it("encuentra por código de batch", async () => {
    const { muestras } = await buscarMuestrasParaCata(gestor, `busca-lote-${RUN}`);
    expect(muestras.map((m) => m.id)).toEqual([conLote]);
  });

  it("encuentra por nombre de finca, sin distinguir mayúsculas", async () => {
    const ids = (await buscarMuestrasParaCata(gestor, `test ${RUN}`.toUpperCase())).muestras.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([m1, m2, conLote, ajena]));
  });

  it("control: el admin sí ve la muestra de la otra parcela", async () => {
    const ids = (await buscarMuestrasParaCata(gestor, `BUSCA-`)).muestras.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([conLote, ajena]));
  });

  it("nunca devuelve una muestra que la cuenta no ve", async () => {
    const ids = (await buscarMuestrasParaCata(juez, `BUSCA-`)).muestras.map((m) => m.id);
    expect(ids, "control positivo: ve la de su parcela").toContain(conLote);
    expect(ids).not.toContain(ajena);
  });

  it("y la cata rechaza esa muestra aunque llegue en el formulario", async () => {
    await expect(
      crearSesionDeCata(juez, { name: `Ajena ${RUN}`, protocolVersionId: versionOk, muestras: [ajena] }),
    ).rejects.toThrow(/sample_not_accessible/);
  });

  it("sin permiso para montar catas, no busca", async () => {
    await expect(buscarMuestrasParaCata(sinPermiso, RUN)).rejects.toBeInstanceOf(SesionDeCataError);
  });
});
