import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_CUENTA_DEL_NAVEGADOR,
  apuntarCuentaDelNavegador,
  cuentaActualDelNavegador,
  cuentaVigente,
  leerCuentaApuntada,
} from "../../lib/offline/cuentaDelNavegador";

/**
 * ADR-199 — quién entró por última vez en este navegador, según el servidor.
 *
 * La hora de generación de la página es lo que impide que una página vieja de A —servida desde la
 * caché del service worker si borrarla falló— apunte A cuando quien usa el teléfono es B. B tuvo que
 * entrar con señal, así que su página es siempre posterior.
 */

let almacen: Map<string, string>;

beforeEach(() => {
  almacen = new Map();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => void almacen.set(k, v),
      removeItem: (k: string) => void almacen.delete(k),
    },
  });
});

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("cuentaVigente", () => {
  it("gana la página generada más tarde", () => {
    expect(cuentaVigente({ cuenta: "a", generadaEn: 100 }, { cuenta: "b", generadaEn: 200 })).toEqual({ cuenta: "b", generadaEn: 200 });
  });

  it("una página más vieja no pisa a la guardada", () => {
    expect(cuentaVigente({ cuenta: "b", generadaEn: 200 }, { cuenta: "a", generadaEn: 100 })).toEqual({ cuenta: "b", generadaEn: 200 });
  });

  it("un null más reciente sí la pisa: se cerró sesión", () => {
    expect(cuentaVigente({ cuenta: "b", generadaEn: 200 }, { cuenta: null, generadaEn: 300 })).toEqual({ cuenta: null, generadaEn: 300 });
  });

  it("sin nada guardado vale la nueva", () => {
    expect(cuentaVigente(null, { cuenta: "a", generadaEn: 1 })).toEqual({ cuenta: "a", generadaEn: 1 });
  });
});

describe("leerCuentaApuntada", () => {
  it("lo que no es JSON, o no tiene la forma, se lee como nada", () => {
    for (const raw of [null, "", "x", "{}", '{"cuenta":1,"generadaEn":1}', '{"cuenta":"a","generadaEn":"1"}', '{"cuenta":"","generadaEn":1}']) {
      expect(leerCuentaApuntada(raw)).toBeNull();
    }
  });

  it("control: la forma buena se lee, con cuenta y sin ella", () => {
    expect(leerCuentaApuntada('{"cuenta":"a","generadaEn":5}')).toEqual({ cuenta: "a", generadaEn: 5 });
    expect(leerCuentaApuntada('{"cuenta":null,"generadaEn":5}')).toEqual({ cuenta: null, generadaEn: 5 });
  });
});

describe("apuntarCuentaDelNavegador y cuentaActualDelNavegador", () => {
  it("B entra después de A: la cuenta actual es B", () => {
    apuntarCuentaDelNavegador({ cuenta: "huella-a", generadaEn: 100 });
    apuntarCuentaDelNavegador({ cuenta: "huella-b", generadaEn: 200 });
    expect(cuentaActualDelNavegador()).toBe("huella-b");
  });

  it("una página de A que llega después, pero generada antes, no la cambia", () => {
    apuntarCuentaDelNavegador({ cuenta: "huella-b", generadaEn: 200 });
    apuntarCuentaDelNavegador({ cuenta: "huella-a", generadaEn: 100 });
    expect(cuentaActualDelNavegador()).toBe("huella-b");
    expect(JSON.parse(almacen.get(CLAVE_CUENTA_DEL_NAVEGADOR) ?? "null")).toEqual({ cuenta: "huella-b", generadaEn: 200 });
  });

  it("sin nada apuntado no hay cuenta", () => {
    expect(cuentaActualDelNavegador()).toBeNull();
  });

  it("sin almacenamiento local no lanza, y no hay cuenta", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => apuntarCuentaDelNavegador({ cuenta: "huella-a", generadaEn: 1 })).not.toThrow();
    expect(cuentaActualDelNavegador()).toBeNull();
  });
});
