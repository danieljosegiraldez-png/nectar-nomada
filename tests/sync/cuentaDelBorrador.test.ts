import { describe, expect, it } from "vitest";
import { cuentaParaElNavegador, huellaDeCuenta } from "../../lib/auth/huellaDeCuenta";
import {
  RAZON_BORRADOR_AJENO,
  cuentaDelBorradorDe,
  cuentaTrasRespuesta,
  desenlaceDeUnBorrador,
  descartablesPorEstaCuenta,
  duenoDelBorrador,
  esRetencion,
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
    expect(cuentaTrasRespuesta(HUELLA_B, retenido, HUELLA_B)).toBe(HUELLA_B);
  });

  it("sin cuenta y retenido: pasa a la cuenta que nombró el servidor", () => {
    expect(cuentaTrasRespuesta(null, retenido, HUELLA_B)).toBe(HUELLA_A);
  });

  it("sin cuenta, retenido y sin dueño conocido: sigue sin cuenta", () => {
    expect(cuentaTrasRespuesta(undefined, { status: "rejected", reason: RAZON_BORRADOR_AJENO }, HUELLA_B)).toBeNull();
  });

  it("sin cuenta y procesado: era de quien envía, por la regla del aparato", () => {
    expect(cuentaTrasRespuesta(null, { status: "rejected", reason: "sample_code_required" }, HUELLA_B)).toBe(HUELLA_B);
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
    expect(desenlaceDeUnBorrador(borrador, { status: "applied" }, HUELLA_B)).toEqual({ tipo: "enviado" });
    expect(desenlaceDeUnBorrador(borrador, { status: "duplicate" }, HUELLA_B)).toEqual({ tipo: "enviado" });
  });

  it("retenido: sigue pendiente y NO pasa a error, apuntado al dueño que nombró el servidor", () => {
    const d = desenlaceDeUnBorrador(
      borrador,
      { status: "rejected", reason: RAZON_BORRADOR_AJENO, cuentaDelBorrador: HUELLA_A },
      HUELLA_B,
    );
    expect(d).toEqual({ tipo: "retenido", borrador: { id: "x", status: "pending", cuenta: HUELLA_A } });
  });

  it("rechazado por otro motivo: error, con su motivo, y apuntado a quien envía", () => {
    const d = desenlaceDeUnBorrador(borrador, { status: "rejected", reason: "sample_code_required" }, HUELLA_B);
    expect(d).toEqual({
      tipo: "rechazado",
      borrador: { id: "x", status: "error", cuenta: HUELLA_B, errorMessage: "sample_code_required" },
    });
  });

  it("un estado que no conoce no se da por enviado: se marca error y se ve", () => {
    expect(desenlaceDeUnBorrador(borrador, { status: "otro" }, HUELLA_B).tipo).toBe("rechazado");
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
