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
import { crearUsuarioConAcceso, crearUsuarioSinAcceso } from "../helpers/traceability";

const RUN = `cv-${Date.now()}`;

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
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  return cuenta.id;
}

async function loteVerde(code: string, kg: number) {
  const lot = await createLot(userAccountId, {
    lotCode: `${RUN}-${code}`, lotType: "green", organizationId, projectId, locationId,
  });
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
  await recordQuantityEvent(userAccountId, {
    lotId: lot.id, eventType: "received", quantity: kg, unit: "kg",
    occurredAt: new Date(), provenanceClass: "measured_fact",
  });
  return lot;
}

beforeAll(async () => {
  const usuario = await crearUsuarioConAcceso();
  userAccountId = usuario.userAccountId;

  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;
  const project = await prisma.project.create({
    data: { name: `TEST Proyecto (${RUN})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;
  const location = await prisma.location.create({
    data: { locationType: "site", name: `TEST Beneficio (${RUN})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  brocaId = await catalogValue("broca", "rechazo_categoria");
  flotadoresId = await catalogValue("flotadores", "rechazo_categoria");
});

afterAll(async () => {
  await prisma.$disconnect();
});

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

    const ajeno = await crearUsuarioSinAcceso();
    const r = await compararClasificacionVerde(ajeno.userAccountId);
    expect(r.sinAmbito).toBe(false);
    expect(r.filas.find((f) => f.lotCode === `${RUN}-ajena`)).toBeUndefined();

    // Y el control: la misma clasificación SÍ la ve quien tiene acceso. Sin esta mitad, un
    // `undefined` por un fallo de escritura se leería como un recorte que funciona.
    const mio = await compararClasificacionVerde(userAccountId);
    expect(mio.filas.find((f) => f.lotCode === `${RUN}-ajena`)).toBeDefined();
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
