/**
 * S2 §8 verification points 4–5 — what each role is offered.
 *
 * Pure, like the comparability tests: `buildNavigation` is a function of a
 * permission set, so the interesting cases are cheap to assert exhaustively
 * and need no database.
 *
 * These assert what is *offered*, never what is *allowed*. Authorization is
 * tested where it is enforced — in the RBAC and service tests — because
 * SECURITY.md §2 is explicit that the frontend is not the boundary. A test
 * that treated a hidden link as a security guarantee would be asserting the
 * opposite of the architecture.
 */

import { describe, it, expect } from "vitest";
import {
  buildNavigation,
  buildSensoryTools,
  landingDestination,
  DEFAULT_LANDING,
  NAV_PERMISSIONS,
} from "../lib/navigation";

const hrefs = (granted: string[]) => buildNavigation(new Set(granted)).map((e) => e.href);
const toolHrefs = (granted: string[]) => buildSensoryTools(new Set(granted)).map((e) => e.href);

// Approximate real profiles from lib/rbac/catalog.ts.
const FARM_OPERATOR = ["lot:view", "lot:manage", "sample:manage", "location:manage_attributes", "apiary:manage"];
const JUDGE = ["sensory:submit_assessment"];
const HEAD_JUDGE = ["sensory:submit_assessment", "sensory:manage_session", "competition:manage"];
const PLATFORM_ADMIN = [
  "lot:view", "lot:manage", "apiary:manage", "research:view",
  "sensory:manage_session", "sensory:submit_assessment", "competition:manage",
  "ai:review_suggestion", "partner:submit_data", "location:manage_attributes",
];

/**
 * El visor más privilegiado **de verdad**: todo lo que abre una entrada,
 * derivado de `NAV`.
 *
 * `PLATFORM_ADMIN` de arriba se queda porque sigue siendo un perfil plausible
 * y varias pruebas lo usan como tal. Lo que NO puede volver a hacer es
 * suplantar al «más privilegiado»: le faltan dos claves, y esa era justo la
 * grieta.
 */
const TODO_PERMISO = [...NAV_PERMISSIONS];

describe("buildNavigation", () => {
  it("§8.4 — a farm operator is not offered competition or calibration tools", () => {
    expect(toolHrefs(FARM_OPERATOR)).toEqual([]);
    // The consolidated Sensory entry is not offered either: holding no sensory
    // permission at all, there is nothing inside it for them.
    expect(hrefs(FARM_OPERATOR)).not.toContain("/sensory");
  });

  it("§8.4 — a farm operator is offered the field work they actually do", () => {
    const nav = hrefs(FARM_OPERATOR);
    expect(nav).toContain("/lots");
    expect(nav).toContain("/plots");
    expect(nav).toContain("/apiaries");
  });

  it("§8.5 — a judge sees sensory and not the farm workbench", () => {
    const nav = hrefs(JUDGE);
    expect(nav).toContain("/sensory");
    expect(nav).not.toContain("/lots");
    expect(nav).not.toContain("/apiaries");
    expect(nav).not.toContain("/research");
  });

  it("a plain judge gets the section but neither tool inside it", () => {
    // Submitting assessments is not managing sessions or competitions.
    expect(toolHrefs(JUDGE)).toEqual([]);
    // 2026-09-06: se añade "/sensory/new". Hasta entonces NADIE podía crear una
    // sesión de cata —`sensorySession.create` sólo existía en la semilla—, así
    // que el head judge tenía herramientas para dirigir una cata y ninguna para
    // empezarla.
    // 2026-09-08: se añade "/sensory/external-report". El servicio para
    // registrar el informe de un Q-grader existía desde el PR #219 y sólo se
    // podía usar por terminal, con un JSON escrito a mano.
    expect(toolHrefs(HEAD_JUDGE)).toEqual([
      "/competitions",
      "/calibration",
      "/sensory/new",
      "/sensory/external-report",
    ]);
    // El control de que la puerta nueva SÍ está cerrada para quien no monta
    // catas: un juez a secas no la ve, y es la primera aserción de este test.
  });

  it("AI Suggestions is hidden from everyone without ai:review_suggestion", () => {
    // The failure this rule exists for: /ai was previously offered to every
    // signed-in user and answered "no access" to almost all of them.
    expect(hrefs(FARM_OPERATOR)).not.toContain("/ai");
    expect(hrefs(JUDGE)).not.toContain("/ai");
    expect(hrefs(PLATFORM_ADMIN)).toContain("/ai");
  });

  it("My Néctar is always offered — it is the viewer's own account, not a grant", () => {
    expect(hrefs([])).toEqual(["/my-nectar"]);
  });

  it("consolidates three former entries into one", () => {
    const nav = hrefs(TODO_PERMISO);
    // Competitions and Calibration are no longer top-level anywhere.
    expect(nav).not.toContain("/competitions");
    expect(nav).not.toContain("/calibration");
  });

  /**
   * **Cuántas entradas ve el visor más privilegiado — y por qué es un número
   * fijado y no un techo.**
   *
   * Esta prueba decía `<= 8` con el comentario «ni el más privilegiado pasa de
   * la barra de diez que esto sustituyó». Era **falso y verde a la vez**: el
   * fixture que usaba era una lista de diez permisos escrita a mano a la que le
   * faltaban `platform:manage_permissions` y los de contenido, o sea las dos
   * claves que abren las dos entradas de mas. Con el visor privilegiado de
   * verdad son **10**, no ≤8.
   *
   * **No se sube el techo: se fija el numero.** Poner `<= 10` habria borrado el
   * objetivo; fijarlo hace que crecer sea deliberado y deja el hueco a la vista.
   * El objetivo de 8 sigue vivo y **sin cumplir**, anotado en `SESSION_STATE.md`
   * §3 con lo que cuesta: en un telefono de 375 px son **234 px de cabecera en
   * tres filas, el 29 % de la pantalla** antes de ver nada. Acortar el menu o
   * mover el objetivo es decision del dueño, no de este archivo.
   *
   * Y el numero sale de `NAV_PERMISSIONS`, derivado de `NAV`: una entrada nueva
   * trae su permiso sola, asi que esto **no puede** volver a medir un visor que
   * no es el mas privilegiado.
   */
  it("el visor más privilegiado ve 10 entradas — dos por encima de las 8 que caben en un teléfono", () => {
    expect(hrefs(TODO_PERMISO)).toHaveLength(10);
  });

  /**
   * El control positivo del anterior: sin esto, un `NAV_PERMISSIONS` que
   * devolviera la lista vacia daria 1 entrada y el `toHaveLength(10)` fallaria
   * por la razon correcta — pero un `buildNavigation` que devolviera siempre
   * diez pasaria igual. Esto comprueba que el numero DEPENDE de los permisos.
   */
  it("y ese 10 depende de los permisos: sin ninguno se ve 1", () => {
    expect(hrefs([])).toHaveLength(1);
    expect(NAV_PERMISSIONS.length, "18 claves abren el menú; el fixture viejo traía 10").toBe(18);
  });

  it("offers no destination whose permissions the viewer lacks", () => {
    // The general form of §4's rule, asserted over every entry rather than
    // spot-checked: nothing appears for an empty permission set except the
    // viewer's own account.
    expect(hrefs([])).not.toContain("/partner");
    expect(hrefs([])).not.toContain("/sensory");
    expect(hrefs(["partner:upload_media"])).toContain("/partner");
  });
});

describe("landingDestination — ADR-082", () => {
  const landing = (granted: string[]) => landingDestination(new Set(granted));

  const PARTNER = ["partner:submit_task", "partner:submit_data", "partner:upload_media"];
  const RESEARCHER = ["research:view", "research:create_measurement"];
  const APIARY_RECORDER = ["apiary:view", "colony_event:manage"];

  it("puts an operator in front of the work, not in front of their own permissions", () => {
    // The defect this replaces: every sign-in path sent everyone to
    // /my-nectar, whose first two sections are the viewer's Assignments and
    // resolved permission keys.
    expect(landing(FARM_OPERATOR)).toBe("/lots");
  });

  it("sends each role somewhere it can actually work", () => {
    expect(landing(PARTNER)).toBe("/partner");
    expect(landing(RESEARCHER)).toBe("/research");
    expect(landing(JUDGE)).toBe("/sensory");
    expect(landing(HEAD_JUDGE)).toBe("/sensory");
    expect(landing(APIARY_RECORDER)).toBe("/apiaries");
  });

  it("does not simply take the first matching nav entry", () => {
    // The distinction that makes this its own list rather than a reuse of NAV:
    // /partner precedes /lots in the menu, so a viewer holding both would land
    // in the partner workspace if landing order were menu order. A Platform
    // Admin holds every key here and belongs on operations.
    expect(buildNavigation(new Set(PLATFORM_ADMIN)).map((e) => e.href).indexOf("/partner"))
      .toBeLessThan(buildNavigation(new Set(PLATFORM_ADMIN)).map((e) => e.href).indexOf("/lots"));
    expect(landing(PLATFORM_ADMIN)).toBe("/lots");
  });

  it("never lands anyone on administration", () => {
    // NAV places /admin/users last because it is administration rather than a
    // place work happens. Arriving there would contradict that outright.
    expect(landing(PLATFORM_ADMIN)).not.toBe("/admin/users");
    expect(landing(["platform:manage_permissions", "platform:manage_users"])).toBe(DEFAULT_LANDING);
  });

  it("falls back to the account page for a viewer with no operational grant", () => {
    // A registered customer: orders and bookings live there and nowhere else.
    expect(landing([])).toBe(DEFAULT_LANDING);
    expect(landing(["classification:clear_internal"])).toBe(DEFAULT_LANDING);
  });

  it("only ever returns a destination the same viewer is offered in the nav", () => {
    // The invariant that keeps the two lists from drifting: landing somewhere
    // absent from your own menu is how a page becomes unreachable again after
    // the first navigation.
    for (const granted of [FARM_OPERATOR, PARTNER, RESEARCHER, JUDGE, HEAD_JUDGE, APIARY_RECORDER, PLATFORM_ADMIN, []]) {
      const nav = buildNavigation(new Set(granted)).map((e) => e.href);
      expect(nav).toContain(landing(granted));
    }
  });
});
