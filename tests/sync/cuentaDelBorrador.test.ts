import { describe, expect, it } from "vitest";
import { cuentaParaElNavegador, huellaDeCuenta } from "../../lib/auth/huellaDeCuenta";
import { mutacionDe } from "../../lib/apiary/offlineQueue";
import { parsearMutaciones } from "../../lib/sync/parsearMutaciones";
import { construirMutacionDesdeBorrador } from "../../lib/sync/offlineQueue";
import {
  RAZON_BORRADOR_AJENO,
  RAZON_CUENTA_INVALIDA,
  cuentaDelBorradorDe,
  cuentaTrasRespuesta,
  desenlaceDeUnBorrador,
  descartablesPorEstaCuenta,
  duenoDelBorrador,
  esRetencion,
  payloadConCuenta,
  repartirPorCuenta,
} from "../../lib/sync/cuentaDelBorrador";

/**
 * ADR-199 — las decisiones de «de quién es un borrador», sin IndexedDB ni base.
 *
 * Este repositorio no tiene `fake-indexeddb` ni entorno DOM: por eso las colas delegan aquí todo lo
 * que se puede equivocar en silencio, igual que `clasificarRespuesta` o `classifyDraftAge`.
 */

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
// Calculadas aparte, no con la función bajo prueba: `printf '%s' <id> | shasum -a 256 | cut -c1-16`.
const HUELLA_A = "11e594f481958c10";
const HUELLA_B = "e79acd97ac880866";

/**
 * Los dos motivos con que el servidor contesta son CONTRATO ENTRE BUILDS: el JavaScript viejo que siga en la
 * caché de un teléfono los recibe tal cual, y el nuevo los reconoce por su texto. Cambiar uno de los dos
 * lados sin el otro no rompe ningún tipo: un motivo que ya no casa deja de verse como retención y el
 * borrador pasaría a error. Por eso se fijan los literales y no sólo la igualdad consigo mismos.
 */
describe("los motivos del protocolo", () => {
  it("son los literales que ven los dos builds", () => {
    expect(RAZON_BORRADOR_AJENO).toBe("borrador_de_otra_cuenta");
    expect(RAZON_CUENTA_INVALIDA).toBe("cuenta_del_borrador_invalida");
  });
});

describe("huellaDeCuenta", () => {
  it("son los 16 primeros hexadecimales del SHA-256 del id", () => {
    expect(huellaDeCuenta(A)).toBe(HUELLA_A);
    expect(huellaDeCuenta(B)).toBe(HUELLA_B);
  });

  it("el navegador recibe la huella, o null sin sesión, y la hora del servidor", () => {
    expect(cuentaParaElNavegador(A, () => 7)).toEqual({ cuenta: HUELLA_A, generadaEn: 7 });
    expect(cuentaParaElNavegador(null, () => 42)).toEqual({ cuenta: null, generadaEn: 42 });
  });
});

describe("duenoDelBorrador — visto desde el servidor", () => {
  const envia = { huellaDeQuienEnvia: HUELLA_B, quienEnvia: B };

  it("con la cuenta de quien envía es propio, aunque el aparato sea de otro", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: HUELLA_B, creadorDelAparato: A })).toBe("propio");
  });

  it("con la cuenta de otra persona es ajeno, aunque el aparato sea de quien envía", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: HUELLA_A, creadorDelAparato: B })).toBe("ajeno");
  });

  it("sin cuenta, en un aparato registrado por quien envía, es propio", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: null, creadorDelAparato: B })).toBe("propio");
  });

  it("sin cuenta, en un aparato registrado por otra cuenta, es ajeno", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: undefined, creadorDelAparato: A })).toBe("ajeno");
  });

  it("sin cuenta, en un aparato sin creador, es ajeno para todos", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: null, creadorDelAparato: null })).toBe("ajeno");
  });
});

describe("cuentaDelBorradorDe — lo que llega en el JSON", () => {
  it("ausente y null son «sin cuenta»", () => {
    expect(cuentaDelBorradorDe(undefined)).toEqual({ ok: true, cuenta: null });
    expect(cuentaDelBorradorDe(null)).toEqual({ ok: true, cuenta: null });
  });

  it("una cadena no vacía es la cuenta", () => {
    expect(cuentaDelBorradorDe(HUELLA_A)).toEqual({ ok: true, cuenta: HUELLA_A });
  });

  it("una cadena vacía, un número o un objeto no se pueden comparar con nada", () => {
    expect(cuentaDelBorradorDe("")).toEqual({ ok: false });
    expect(cuentaDelBorradorDe(5)).toEqual({ ok: false });
    expect(cuentaDelBorradorDe({})).toEqual({ ok: false });
  });
});

describe("repartirPorCuenta — qué puede enviar este navegador", () => {
  const borradores = [
    { id: "de-a", cuenta: HUELLA_A },
    { id: "de-b", cuenta: HUELLA_B },
    { id: "legado" },
    { id: "nulo", cuenta: null },
  ];

  it("con cuenta actual: salen los suyos y los sin cuenta; los de otra se quedan", () => {
    const r = repartirPorCuenta(borradores, HUELLA_B);
    expect(r.enviables.map((b) => b.id)).toEqual(["de-b", "legado", "nulo"]);
    expect(r.ajenos.map((b) => b.id)).toEqual(["de-a"]);
  });

  it("sin cuenta actual: todo lo que tiene dueño es ajeno", () => {
    const r = repartirPorCuenta(borradores, null);
    expect(r.enviables.map((b) => b.id)).toEqual(["legado", "nulo"]);
    expect(r.ajenos.map((b) => b.id)).toEqual(["de-a", "de-b"]);
  });

  it("control: cada borrador cae en una sola de las dos listas", () => {
    const r = repartirPorCuenta(borradores, HUELLA_A);
    expect(r.enviables.length + r.ajenos.length).toBe(borradores.length);
  });
});

describe("cuentaTrasRespuesta y esRetencion", () => {
  const retenido = { status: "rejected", reason: RAZON_BORRADOR_AJENO, cuentaDelBorrador: HUELLA_A };

  it("un borrador con cuenta no cambia, diga lo que diga el servidor", () => {
    expect(cuentaTrasRespuesta(HUELLA_B, retenido)).toBe(HUELLA_B);
  });

  it("sin cuenta y retenido: pasa a la cuenta que nombró el servidor", () => {
    expect(cuentaTrasRespuesta(null, retenido)).toBe(HUELLA_A);
  });

  it("sin cuenta, retenido y sin dueño conocido: sigue sin cuenta", () => {
    expect(cuentaTrasRespuesta(undefined, { status: "rejected", reason: RAZON_BORRADOR_AJENO })).toBeNull();
  });

  it("sin cuenta y rechazado por otro motivo: sigue SIN cuenta, sólo el servidor nombra dueños", () => {
    expect(cuentaTrasRespuesta(null, { status: "rejected", reason: "sample_code_required" })).toBeNull();
  });

  it("sin cuenta y aplicado: tampoco se le apunta la de quien envía", () => {
    expect(cuentaTrasRespuesta(null, { status: "applied" })).toBeNull();
  });

  it("esRetencion sólo reconoce su motivo", () => {
    expect(esRetencion(retenido)).toBe(true);
    expect(esRetencion({ status: "rejected", reason: "sample_code_required" })).toBe(false);
    expect(esRetencion({ status: "applied" })).toBe(false);
  });
});

describe("desenlaceDeUnBorrador — qué hace la cola con cada respuesta", () => {
  const borrador = { id: "x", status: "pending" as const, cuenta: null as string | null };

  it("applied y duplicate: enviado", () => {
    expect(desenlaceDeUnBorrador(borrador, { status: "applied" })).toEqual({ tipo: "enviado" });
    expect(desenlaceDeUnBorrador(borrador, { status: "duplicate" })).toEqual({ tipo: "enviado" });
  });

  it("retenido: sigue pendiente y NO pasa a error, apuntado al dueño que nombró el servidor", () => {
    const d = desenlaceDeUnBorrador(borrador, {
      status: "rejected",
      reason: RAZON_BORRADOR_AJENO,
      cuentaDelBorrador: HUELLA_A,
    });
    expect(d).toEqual({ tipo: "retenido", borrador: { id: "x", status: "pending", cuenta: HUELLA_A } });
  });

  it("rechazado por otro motivo: error, con su motivo, y SIN cuenta: sólo el servidor nombra dueños", () => {
    const d = desenlaceDeUnBorrador(borrador, { status: "rejected", reason: "sample_code_required" });
    expect(d).toEqual({
      tipo: "rechazado",
      borrador: { id: "x", status: "error", cuenta: null, errorMessage: "sample_code_required" },
    });
  });

  it("rechazado y con cuenta: conserva la suya", () => {
    const d = desenlaceDeUnBorrador(
      { ...borrador, cuenta: HUELLA_A },
      { status: "rejected", reason: "sample_code_required" },
    );
    expect(d).toEqual({
      tipo: "rechazado",
      borrador: { id: "x", status: "error", cuenta: HUELLA_A, errorMessage: "sample_code_required" },
    });
  });

  it("un estado que no conoce no se da por enviado: se marca error y se ve", () => {
    expect(desenlaceDeUnBorrador(borrador, { status: "otro" }).tipo).toBe("rechazado");
  });
});

describe("descartablesPorEstaCuenta — el botón de descartar rechazados", () => {
  const borradores = [
    { id: "mio-error", status: "error", cuenta: HUELLA_B },
    { id: "mio-pendiente", status: "pending", cuenta: HUELLA_B },
    { id: "ajeno-error", status: "error", cuenta: HUELLA_A },
    { id: "legado-error", status: "error" },
  ];

  it("sólo los de esta cuenta y en error: ni los ajenos ni los que aún no tienen dueño", () => {
    expect(descartablesPorEstaCuenta(borradores, HUELLA_B).map((b) => b.id)).toEqual(["mio-error"]);
  });

  it("sin cuenta actual no se descarta nada", () => {
    expect(descartablesPorEstaCuenta(borradores, null)).toEqual([]);
  });
});

/**
 * ADR-199 — la cuenta viaja también DENTRO del payload que se guarda.
 *
 * Los constructores de antes del cambio reconstruyen la mutación sólo desde el payload
 * (`{ ...payload, kind, clientDraftId, occurredAt }` en apiario, `{ ...d.payload, clientDraftId }` en
 * campo). Una pestaña con ese JavaScript en caché enviaría el borrador SIN cuenta, y el servidor aplicaría
 * la regla del aparato: si quien envía registró el aparato, el borrador de otra cuenta entraría a su
 * nombre. El constructor viejo se simula aquí tal cual: `{ ...guardado, clientDraftId }`.
 */
describe("payloadConCuenta — la cuenta dentro del payload", () => {
  const original = { locationId: "loc1", sampleCode: "S-01", sampledAt: "2026-09-16T12:00:00.000Z" };

  it("mete la cuenta, deja el resto como estaba y no toca el original", () => {
    const guardado = payloadConCuenta(original, HUELLA_A);
    expect(guardado).toEqual({ ...original, cuentaDelBorrador: HUELLA_A });
    expect(original).not.toHaveProperty("cuentaDelBorrador");
  });

  it("sin cuenta mete null, que es «sin cuenta» para el servidor", () => {
    expect(payloadConCuenta(original, null).cuentaDelBorrador).toBeNull();
  });

  it("si el payload ya traía otra cuenta, manda la que se guarda", () => {
    expect(payloadConCuenta({ ...original, cuentaDelBorrador: HUELLA_B }, HUELLA_A).cuentaDelBorrador).toBe(HUELLA_A);
  });

  it("un constructor VIEJO, que sólo copia el payload, la conserva y el servidor la lee", () => {
    const guardado = payloadConCuenta({ ...original, kind: "soil_sample" }, HUELLA_A);
    const mutacionVieja = { ...guardado, clientDraftId: "x" };
    expect(mutacionVieja.cuentaDelBorrador).toBe(HUELLA_A);

    const r = parsearMutaciones([mutacionVieja]);
    expect(r.ok && r.mutations).toHaveLength(1);
    expect(r.ok && r.mutations[0]).toMatchObject({ cuentaDelBorrador: HUELLA_A });
  });

  it("control: el mismo constructor viejo sobre un payload SIN la cuenta la pierde", () => {
    // Si este caso diera la cuenta, el de arriba no probaría nada: el constructor viejo la traería de otro lado.
    const mutacionVieja = { ...original, kind: "soil_sample", clientDraftId: "x" };
    expect(mutacionVieja).not.toHaveProperty("cuentaDelBorrador");
    const r = parsearMutaciones([mutacionVieja]);
    expect(r.ok && r.mutations[0]).toMatchObject({ cuentaDelBorrador: null });
  });

  it("los constructores nuevos toman la del BORRADOR aunque el payload traiga otra", () => {
    const deCampo = construirMutacionDesdeBorrador({
      id: "d1",
      payload: payloadConCuenta({ ...original, kind: "soil_sample" }, HUELLA_A),
      createdAt: 0,
      status: "pending",
      cuenta: HUELLA_B,
    });
    expect(deCampo.cuentaDelBorrador).toBe(HUELLA_B);

    const deApiario = mutacionDe({
      id: "d2",
      kind: "inspection",
      payload: payloadConCuenta({ colonyId: "c1" }, HUELLA_A),
      createdAt: 0,
      status: "pending",
      cuenta: HUELLA_B,
    });
    expect(deApiario.cuentaDelBorrador).toBe(HUELLA_B);
  });
});
