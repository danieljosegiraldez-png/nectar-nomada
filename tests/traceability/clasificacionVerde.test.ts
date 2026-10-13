/**
 * Las tres lecturas de la clasificación de verde por malla (spec del 2026-09-25).
 *
 * **Por qué la primera prueba existe:** hasta hoy ningún test cruzaba `recordGreenGrading` con
 * ninguna capa de lectura. Que la ficha pintara algo era lectura de código, no un hecho medido.
 *
 * **Aserciones por código de lote, nunca por conteo.** `crearUsuarioConAcceso()` da un Platform
 * Admin de ámbito plataforma, así que la comparación ve TODOS los lotes verdes de la base.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot } from "../../lib/traceability/lots";
import { recordQuantityEvent } from "../../lib/traceability/quantity";
import { recordGreenGrading } from "../../lib/traceability/greenGrading";
import { recordSelection } from "../../lib/traceability/selection";
import {
  clasificacionDeLote,
  compararClasificacionVerde,
  claveDeColumna,
  peorEstado,
} from "../../lib/traceability/clasificacionVerde";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearUsuarioConAcceso, crearUsuarioSinAcceso } from "../helpers/traceability";

const RUN = `cv-${Date.now()}`;

/**
 * Lo que cada `createX`/ayudante DEVOLVIÓ, por clase: la mitad de arriba del control positivo del
 * `afterAll`. Si el descubrimiento por nombre halla MENOS de lo que se creó, está ciego, y entonces
 * «quedan 0» no diría nada. Cuenta sólo lo que de verdad volvió, así que un `beforeAll` que muere a
 * mitad rebaja la cota en vez de hacer fallar la limpieza.
 */
const devueltas = { lotes: 0, personas: 0, organizaciones: 0, lugares: 0, proyectos: 0 };

let userAccountId: string;
let organizationId: string;
let projectId: string;
let locationId: string;
let brocaId: string;
let flotadoresId: string;

async function catalogValue(value: string, catalogKey: string) {
  const row = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value, catalog: { key: catalogKey } },
  });
  return row.id;
}

/**
 * Una cuenta con CERO asignaciones. `crearUsuarioSinAcceso()` del helper compartido no sirve para
 * esto: crea una finca ajena y asigna Farm Operator sobre ella, así que tiene ámbito —lo que no
 * tiene es acceso a los lotes de aquí—. El nombre engaña y por eso se dice aquí.
 */
async function cuentaSinAsignaciones() {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "SinAmbito", displayName: `TEST SinAmbito (${RUN})`, locale: "es" },
  });
  devueltas.personas += 1;
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  return cuenta.id;
}

async function loteVerde(code: string, kg: number) {
  const lot = await createLot(userAccountId, {
    lotCode: `${RUN}-${code}`, lotType: "green", organizationId, projectId, locationId,
  });
  devueltas.lotes += 1;
  await recordQuantityEvent(userAccountId, {
    lotId: lot.id, eventType: "received", quantity: kg, unit: "kg",
    occurredAt: new Date(), provenanceClass: "measured_fact",
  });
  return lot;
}

async function loteCereza(code: string, kg: number) {
  const lot = await createLot(userAccountId, {
    lotCode: `${RUN}-${code}`, lotType: "cherry", organizationId, projectId, locationId,
  });
  devueltas.lotes += 1;
  await recordQuantityEvent(userAccountId, {
    lotId: lot.id, eventType: "received", quantity: kg, unit: "kg",
    occurredAt: new Date(), provenanceClass: "measured_fact",
  });
  return lot;
}

beforeAll(async () => {
  // A los ayudantes compartidos se les pasa `RUN` como etiqueta: así sus filas llevan el RUN en el
  // nombre y la limpieza las encuentra por él aunque el ayudante muera ENTRE sus `create`.
  const usuario = await crearUsuarioConAcceso(RUN);
  userAccountId = usuario.userAccountId;
  devueltas.personas += 1;

  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;
  devueltas.organizaciones += 1;
  const project = await prisma.project.create({
    data: { name: `TEST Proyecto (${RUN})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;
  devueltas.proyectos += 1;
  const location = await prisma.location.create({
    data: { locationType: "site", name: `TEST Beneficio (${RUN})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;
  devueltas.lugares += 1;

  brocaId = await catalogValue("broca", "rechazo_categoria");
  flotadoresId = await catalogValue("flotadores", "rechazo_categoria");
});

/**
 * Hasta el 2026-10-11 este `afterAll` sólo desconectaba, y cada corrida dejaba en la base 29 lotes
 * `cv-<ts>` con sus 39 eventos de cantidad, 10 transformaciones, 19 filas de auditoría y el resto
 * del fixture. Medido con un censo de las 207 tablas antes y después de una corrida.
 *
 * **Todo se DESCUBRE por el RUN, no se hereda de las variables del fixture**: si el `beforeAll`
 * murió a mitad, esas variables siguen `undefined` y una limpieza que dependa de ellas aborta
 * (`assertDefinedWhere`) en vez de limpiar. Eso incluye las filas de los ayudantes compartidos, que
 * llevan el RUN porque se les pasa como etiqueta: la primera versión guardaba sus ids en un arreglo,
 * y olvidar uno dejaba el archivo en verde con una fila de más (medido con un flip el 2026-10-11).
 *
 * **Cada BORRADO se intenta aunque el anterior falle:** un `afterAll` es una cadena, y la primera
 * clave ajena que se queja tira el resto. Los fallos se juntan y se lanzan al final. El descubrimiento
 * sí queda fuera: si él mismo lanza, el error sale tal cual y no se borra nada, que es mejor que
 * borrar a ciegas.
 *
 * **Y termina CONTANDO** lo que quedó del RUN, con consultas que no comparten lista con el borrado
 * (por nombre o por prefijo, no por los ids que el borrado usó: una lista incompleta se contaría
 * incompleta). «0 filas» sólo dice algo si antes se demostró que el descubrimiento sabe ver filas:
 * el control positivo compara lo hallado con lo que cada creación devolvió. Vale para cualquier
 * subconjunto con `-t`, porque las cotas son sólo de lo que ese subconjunto llegó a crear.
 */
afterAll(async () => {
  const fallos: string[] = [];
  const intentar = async (paso: string, accion: () => Promise<unknown>) => {
    try {
      await accion();
    } catch (error) {
      fallos.push(`${paso}: ${error instanceof Error ? error.message.trim().split("\n").pop() : String(error)}`);
    }
  };
  const prefijoDeLote = `${RUN}-`;
  // Entre paréntesis porque así lo escriben TODOS los nombres de este archivo, ayudantes incluidos:
  // `TEST Finca (cv-…)`, `TEST Acceso (cv-…)`, `TEST SinAcceso (cv-…)`.
  const marca = `(${RUN})`;
  const porNombre = { contains: marca };

  try {
    const lotes = await prisma.lot.findMany({ where: { lotCode: { startsWith: prefijoDeLote } }, select: { id: true } });
    const idsDeLotes = lotes.map((l) => l.id);
    const transformaciones = await prisma.lotTransformation.findMany({
      where: {
        OR: [
          { inputs: { some: { lotId: { in: idsDeLotes } } } },
          { outputs: { some: { lotId: { in: idsDeLotes } } } },
        ],
      },
      select: { id: true },
    });
    const idsDeTransformaciones = transformaciones.map((t) => t.id);
    const cantidades = await prisma.quantityEvent.findMany({ where: { lotId: { in: idsDeLotes } }, select: { id: true } });
    const idsDeCantidades = cantidades.map((q) => q.id);
    // `userAccount` en singular: `UserAccount.personId` es `@unique`, la relación es uno a uno.
    const personas = await prisma.person.findMany({
      where: { displayName: porNombre },
      select: { userAccount: { select: { id: true } } },
    });
    const idsDeCuentas = personas.flatMap((p) => (p.userAccount ? [p.userAccount.id] : []));
    const lugares = await prisma.location.findMany({ where: { name: porNombre }, select: { id: true } });
    const idsDeLugares = lugares.map((l) => l.id);
    const organizaciones = await prisma.organization.findMany({ where: { name: porNombre }, select: { id: true } });
    const proyectos = await prisma.project.findMany({ where: { name: porNombre }, select: { id: true } });
    const idsDeAuditoria = [...idsDeLotes, ...idsDeTransformaciones, ...idsDeCantidades];
    // Por entidad Y por actor. Las cuentas de aquí sólo escriben auditoría de este archivo, y contar
    // por actor ve filas de una entidad que la lista de arriba no conoce.
    const auditoriaDeAqui = {
      OR: [{ entityId: { in: idsDeAuditoria } }, { actorUserAccountId: { in: idsDeCuentas } }],
    };

    // CONTROL POSITIVO, antes de borrar nada: el descubrimiento tiene que ver lo que se creó.
    const hallados = {
      lotes: idsDeLotes.length,
      personas: personas.length,
      organizaciones: organizaciones.length,
      lugares: lugares.length,
      proyectos: proyectos.length,
    };
    for (const clase of Object.keys(devueltas) as Array<keyof typeof devueltas>) {
      if (hallados[clase] < devueltas[clase]) {
        fallos.push(`control positivo: se crearon ${devueltas[clase]} ${clase} y el descubrimiento sólo halló ${hallados[clase]}`);
      }
    }

    // En orden de claves ajenas: `lot` es RESTRICT hacia casi todo, y una transformación se lleva
    // por CASCADE sus entradas y salidas.
    const quedan: Record<string, number> = {};
    await intentar("auditoría", () => prisma.auditEvent.deleteMany({ where: assertDefinedWhere(auditoriaDeAqui) }));
    // Se cuenta AHORA y no al final: `audit_event.actor_user_account_id` es SET NULL, así que tras
    // borrar las cuentas el actor ya no se vería y quedaría sólo la mitad por entidad.
    await intentar("recuento de auditoría", async () => {
      quedan.auditoria = await prisma.auditEvent.count({ where: auditoriaDeAqui });
    });
    await intentar("eventos de cantidad", () =>
      prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: idsDeLotes } }) }),
    );
    await intentar("transformaciones", () =>
      prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: idsDeTransformaciones } }) }),
    );
    await intentar("lotes", () => prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: idsDeLotes } }) }));
    await intentar("asignaciones", () =>
      prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: idsDeCuentas } }) }),
    );
    // Después de las asignaciones, que lo referencian, y por el lugar al que apunta: `scope_ref_id`
    // es polimórfico y no tiene clave ajena, así que borrar el lugar NO se lleva su ámbito.
    // `scopeType` es un cinturón: esta orden no puede tocar el ámbito de plataforma compartido.
    await intentar("ámbitos", () =>
      prisma.scope.deleteMany({
        where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: idsDeLugares } }),
      }),
    );
    await intentar("cuentas", () => prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: idsDeCuentas } }) }));
    await intentar("personas", () => prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: porNombre }) }));
    await intentar("lugares", () => prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: idsDeLugares } }) }));
    await intentar("organizaciones", () => prisma.organization.deleteMany({ where: assertDefinedWhere({ name: porNombre }) }));
    await intentar("proyectos", () => prisma.project.deleteMany({ where: assertDefinedWhere({ name: porNombre }) }));

    // Y se cuenta lo que quedó, sin fiarse de que los `deleteMany` anteriores hicieran lo suyo.
    await intentar("recuento", async () => {
      quedan.lotes = await prisma.lot.count({ where: { lotCode: { startsWith: prefijoDeLote } } });
      quedan.cantidades = await prisma.quantityEvent.count({ where: { id: { in: idsDeCantidades } } });
      quedan.transformaciones = await prisma.lotTransformation.count({ where: { id: { in: idsDeTransformaciones } } });
      quedan.asignaciones = await prisma.assignment.count({ where: { userAccount: { person: { displayName: porNombre } } } });
      quedan.ambitos = await prisma.scope.count({ where: { scopeType: "location", scopeRefId: { in: idsDeLugares } } });
      quedan.cuentas = await prisma.userAccount.count({ where: { person: { displayName: porNombre } } });
      quedan.personas = await prisma.person.count({ where: { displayName: porNombre } });
      quedan.lugares = await prisma.location.count({ where: { name: porNombre } });
      quedan.organizaciones = await prisma.organization.count({ where: { name: porNombre } });
      quedan.proyectos = await prisma.project.count({ where: { name: porNombre } });
    });
    const sobrantes = Object.entries(quedan).filter(([, n]) => n > 0);
    if (sobrantes.length > 0) {
      fallos.push(`quedan filas del RUN ${RUN}: ${sobrantes.map(([tabla, n]) => `${tabla}=${n}`).join(", ")}`);
    }
  } finally {
    await prisma.$disconnect();
  }
  if (fallos.length > 0) throw new Error(`La limpieza de ${RUN} no quedó limpia:\n  - ${fallos.join("\n  - ")}`);
}, 30000);

describe("peorEstado", () => {
  it("devuelve el peor y no el primero", () => {
    expect(peorEstado(["measured", "supplier_declared"])).toBe("supplier_declared");
    expect(peorEstado(["unknown", "measured"])).toBe("unknown");
    expect(peorEstado(["measured"])).toBe("measured");
    expect(peorEstado([])).toBeNull();
  });
});

describe("claveDeColumna", () => {
  it("un mismo rango en dos sistemas son dos columnas", () => {
    expect(claveDeColumna("redonda_internacional", 17, 18)).not.toBe(claveDeColumna("plana_oblonga", 17, 18));
  });
  it("los dos extremos nulos son la columna «sin malla»", () => {
    expect(claveDeColumna("redonda_internacional", null, null)).toBe("sin-malla");
  });
});

describe("clasificacionDeLote", () => {
  it("reconoce una clasificación escrita por recordGreenGrading y devuelve sus mallas", async () => {
    const origen = await loteVerde("lee-1", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 100,
      fractions: [
        { lotCode: `${RUN}-lee-1-A`, quantityKg: 60, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
        { lotCode: `${RUN}-lee-1-B`, quantityKg: 40, screenMin: 15, screenMax: 16, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const c = await clasificacionDeLote(userAccountId, origen.id);
    expect(c).not.toBeNull();
    expect(c!.entradaKg).toBe(100);
    // Grande primero.
    expect(c!.mallas.map((m) => m.lotCode)).toEqual([`${RUN}-lee-1-A`, `${RUN}-lee-1-B`]);
    expect(c!.mallas[0]).toMatchObject({ rangoMin: 17, rangoMax: 18, kg: 60, pct: 60, sinRango: false });
    expect(c!.mallas[1]).toMatchObject({ rangoMin: 15, rangoMax: 16, kg: 40, pct: 40 });
    expect(c!.estadoDelDato).toBe("measured");
  }, 30000);

  it("suma en UNA fila dos lotes de defecto de la misma categoría", async () => {
    // El control positivo del agrupador. Con un solo lote por categoría, la prueba pasaría igual
    // sin agrupador ninguno — que es cómo se firma un guardia que no guarda nada.
    const origen = await loteVerde("defectos", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 100,
      fractions: [
        { lotCode: `${RUN}-defectos-A`, quantityKg: 70, screenMin: 16, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      defectLots: [
        { lotCode: `${RUN}-defectos-D1`, quantityKg: 12, rejectionCategoryValueId: brocaId },
        { lotCode: `${RUN}-defectos-D2`, quantityKg: 8, rejectionCategoryValueId: brocaId },
        { lotCode: `${RUN}-defectos-D3`, quantityKg: 10, rejectionCategoryValueId: flotadoresId },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const c = await clasificacionDeLote(userAccountId, origen.id);
    const broca = c!.defectos.find((d) => d.categoriaValueId === brocaId);
    expect(c!.defectos).toHaveLength(2);
    expect(broca!.kg).toBe(20);
    expect(broca!.pct).toBe(20);
    expect(broca!.lotes.map((l) => l.lotCode).sort()).toEqual([`${RUN}-defectos-D1`, `${RUN}-defectos-D2`]);
  }, 30000);

  it("una fracción sin rango no vale cero: va al final y conserva sus kilos", async () => {
    const origen = await loteVerde("sin-rango", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 100,
      fractions: [
        { lotCode: `${RUN}-sin-rango-A`, quantityKg: 30, screenStatus: "unknown" },
        { lotCode: `${RUN}-sin-rango-B`, quantityKg: 70, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const c = await clasificacionDeLote(userAccountId, origen.id);
    expect(c!.mallas.map((m) => m.lotCode)).toEqual([`${RUN}-sin-rango-B`, `${RUN}-sin-rango-A`]);
    const sin = c!.mallas[1]!;
    expect(sin.sinRango).toBe(true);
    expect(sin.kg).toBe(30);
    expect(sin.pct).toBe(30);
  }, 30000);

  it("el estado del dato del lote es el PEOR de sus fracciones, no el de la primera", async () => {
    const origen = await loteVerde("estado", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 100,
      fractions: [
        { lotCode: `${RUN}-estado-A`, quantityKg: 60, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
        { lotCode: `${RUN}-estado-B`, quantityKg: 40, screenMin: 15, screenMax: 16, screenSystem: "redonda_internacional", screenStatus: "supplier_declared" },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const c = await clasificacionDeLote(userAccountId, origen.id);
    expect(c!.mallas[0]!.estado).toBe("measured");
    expect(c!.estadoDelDato).toBe("supplier_declared");
  }, 30000);

  it("una selección de CEREZA no es una clasificación verde — control negativo", async () => {
    const cereza = await loteCereza("cereza", 100);
    await recordSelection(userAccountId, {
      inputLotId: cereza.id,
      inputQuantity: 100,
      unit: "kg",
      accepted: { lotCode: `${RUN}-cereza-ok`, lotType: "cherry", quantity: 90 },
      rejected: [{ lotCode: `${RUN}-cereza-flot`, lotType: "cherry", quantity: 10, rejectionCategoryValueId: flotadoresId }],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    // **Lo que esta prueba guarda, medido con flip-test el 2026-09-25:** cae sólo si se quitan
    // LAS DOS condiciones del discriminador a la vez. Quitando una sola sigue en verde, porque
    // cualquiera de las dos basta para dejar fuera a la cereza. Guarda el resultado, no cada
    // condición — y por eso el comentario de `ES_CLASIFICACION_VERDE` dice que no se quite ninguna.
    // No es verde, así que devuelve null aunque la transformación sea de tipo `selection`.
    expect(await clasificacionDeLote(userAccountId, cereza.id)).toBeNull();

    // Y tampoco aparece como fila en la comparación.
    const r = await compararClasificacionVerde(userAccountId);
    expect(r.filas.find((f) => f.lotCode === `${RUN}-cereza`)).toBeUndefined();
  }, 30000);
});

describe("compararClasificacionVerde", () => {
  it("una cuenta sin NINGUNA asignación recibe sinAmbito, no una lista vacía", async () => {
    // «No puedes ver ninguno» no es «no hay ninguno»: la pantalla tiene que poder decir cuál de
    // las dos cosas pasa (ver el comentario de getLotList en lots.ts:724).
    const r = await compararClasificacionVerde(await cuentaSinAsignaciones());
    expect(r.sinAmbito).toBe(true);
    expect(r.filas).toEqual([]);
  }, 30000);

  it("una cuenta con ámbito en OTRA finca no ve estas clasificaciones, y no es sinAmbito", async () => {
    // El control positivo del recorte, y la otra mitad del caso de arriba: si el `where` no
    // filtrara, esta cuenta vería las filas de aquí y la prueba anterior seguiría en verde igual.
    const origen = await loteVerde("ajena", 50);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 50,
      fractions: [
        { lotCode: `${RUN}-ajena-A`, quantityKg: 50, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const ajeno = await crearUsuarioSinAcceso(RUN);
    devueltas.personas += 1;
    devueltas.organizaciones += 1;
    devueltas.lugares += 1;
    const r = await compararClasificacionVerde(ajeno.userAccountId);
    expect(r.sinAmbito).toBe(false);
    expect(r.filas.find((f) => f.lotCode === `${RUN}-ajena`)).toBeUndefined();

    // Y el control: la misma clasificación SÍ la ve quien tiene acceso. Sin esta mitad, un
    // `undefined` por un fallo de escritura se leería como un recorte que funciona.
    const mio = await compararClasificacionVerde(userAccountId);
    expect(mio.filas.find((f) => f.lotCode === `${RUN}-ajena`)).toBeDefined();
  }, 30000);

  it("un lote clasificado DOS veces da UNA fila, la de la clasificación más reciente", async () => {
    // Hallazgo 3 de Codex, 2026-09-25. Antes se paginaba por transformación, así que este lote
    // salía dos veces —incumpliendo «una fila por lote»— y gastaba dos huecos del tope.
    //
    // **Las dos son PARCIALES, y no por comodidad del test:** una clasificación que consume el
    // lote entero deja el libro a cero y la segunda la rechaza el balance de masa con
    // `input_exceeds_available`. El caso real de dos clasificaciones es clasificar en dos tandas.
    const origen = await loteVerde("dos-veces", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 40,
      fractions: [
        { lotCode: `${RUN}-dos-veces-vieja`, quantityKg: 40, screenMin: 14, screenMax: 14, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      occurredAt: new Date("2026-09-20T10:00:00Z"),
      provenanceClass: "measured_fact",
    });
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 60,
      fractions: [
        { lotCode: `${RUN}-dos-veces-nueva`, quantityKg: 60, screenMin: 19, screenMax: 19, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      occurredAt: new Date("2026-09-24T10:00:00Z"),
      provenanceClass: "measured_fact",
    });

    const r = await compararClasificacionVerde(userAccountId);
    const suyas = r.filas.filter((f) => f.lotCode === `${RUN}-dos-veces`);
    expect(suyas).toHaveLength(1);
    // Y es la nueva, la misma que elige la ficha: dos pantallas que eligen distinto son dos verdades.
    expect(suyas[0]!.repartoPct[claveDeColumna("redonda_internacional", 19, 19)]).toBe(100);
    expect(suyas[0]!.repartoPct[claveDeColumna("redonda_internacional", 14, 14)]).toBeUndefined();

    const ficha = await clasificacionDeLote(userAccountId, origen.id);
    expect(ficha!.mallas[0]!.lotCode).toBe(`${RUN}-dos-veces-nueva`);
  }, 30000);

  it("el % de defectos suma kilos y redondea una vez, no suma porcentajes redondeados", async () => {
    // Hallazgo 6 de Codex, 2026-09-25. Dos categorías de 0,014 kg sobre 100 redondean a 0,01 %
    // cada una: sumar los redondeos da 0,02 %, y el peso total (0,028 kg) dice 0,03 %.
    const origen = await loteVerde("redondeo", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 100,
      fractions: [
        { lotCode: `${RUN}-redondeo-A`, quantityKg: 99.972, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      defectLots: [
        { lotCode: `${RUN}-redondeo-D1`, quantityKg: 0.014, rejectionCategoryValueId: brocaId },
        { lotCode: `${RUN}-redondeo-D2`, quantityKg: 0.014, rejectionCategoryValueId: flotadoresId },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const r = await compararClasificacionVerde(userAccountId);
    const fila = r.filas.find((f) => f.lotCode === `${RUN}-redondeo`);
    expect(fila).toBeDefined();
    // Cada categoría por separado sí redondea a 0,01; el total tiene que salir del peso.
    const c = await clasificacionDeLote(userAccountId, origen.id);
    expect(c!.defectos.map((d) => d.pct).sort()).toEqual([0.01, 0.01]);
    expect(fila!.defectosPct).toBe(0.03);
  }, 30000);

  it("pone una fila por lote clasificado y una columna por rango declarado", async () => {
    const origen = await loteVerde("comp", 200);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 200,
      fractions: [
        { lotCode: `${RUN}-comp-A`, quantityKg: 150, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
        { lotCode: `${RUN}-comp-B`, quantityKg: 50, screenMin: 15, screenMax: 16, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const r = await compararClasificacionVerde(userAccountId);
    // Por código de lote y NUNCA por número de filas: esta cuenta es Platform Admin y ve la base entera.
    const fila = r.filas.find((f) => f.lotCode === `${RUN}-comp`);
    expect(fila).toBeDefined();
    const grande = claveDeColumna("redonda_internacional", 17, 18);
    const pequena = claveDeColumna("redonda_internacional", 15, 16);
    expect(fila!.repartoPct[grande]).toBe(75);
    expect(fila!.repartoPct[pequena]).toBe(25);
    expect(r.columnas.map((c) => c.clave)).toContain(grande);
    // Grande antes que pequeña.
    expect(r.columnas.findIndex((c) => c.clave === grande)).toBeLessThan(
      r.columnas.findIndex((c) => c.clave === pequena),
    );
  }, 30000);
});
