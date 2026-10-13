import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "use-intl/core";
import { expect, it, vi } from "vitest";
import type { SyncSummary } from "../../lib/sync/offlineQueue";

/**
 * Lo que la pantalla de campo dice tras sincronizar cuando el servidor deja de
 * responder A MITAD de la cola.
 *
 * **Por qué existe.** Desde que la cola sale en tandas
 * (`tests/sync/colaMasLargaQueElLote.test.ts`), un 503 en la segunda deja la
 * primera enviada. El resumen lo sabía (`applied: 200`), pero la pantalla
 * escondía el «enviadas» en cuanto había servidor caído —hasta entonces eso
 * implicaba que no había salido nada— y decía sólo «No se pudo enviar». Daniel
 * decidió el 2026-10-11 enseñar también las enviadas, y lo mismo con la sesión
 * caducada a mitad de la cola.
 *
 * El traductor es el ICU real (`use-intl`) sobre `messages/es.json`: el texto
 * afirmado es el que lee el operador, plurales incluidos, no una clave.
 */

const mensajes = JSON.parse(readFileSync("messages/es.json", "utf8"));
vi.mock("next-intl", () => ({
  useTranslations: (espacio: string) => createTranslator({ locale: "es", messages: mensajes, namespace: espacio }),
}));
const { ResumenDeSincronizacion } = await import("../../app/components/traceability/FieldSyncControls");

const NADA: SyncSummary = {
  applied: 0,
  duplicate: 0,
  rejected: 0,
  retenidas: 0,
  stillPending: 0,
  serverUnavailable: false,
  sessionExpired: false,
};
const pintar = (ultimo: Partial<SyncSummary>) =>
  renderToStaticMarkup(createElement(ResumenDeSincronizacion, { ultimo: { ...NADA, ...ultimo } }));

it("control: una sincronización completa dice cuántas se enviaron", () => {
  expect(pintar({ applied: 200 })).toContain("200 anotaciones enviadas");
});

it("si el servidor deja de responder con 200 ya enviadas, dice las enviadas Y que el resto no salió", () => {
  const html = pintar({ applied: 200, stillPending: 1, serverUnavailable: true });
  expect({
    enviadas: html.includes("200 anotaciones enviadas"),
    noRespondio: html.includes("el servidor no respondió"),
  }).toEqual({ enviadas: true, noRespondio: true });
});

it("si el servidor no responde y no salió nada, no dice «Nada nuevo que enviar»", () => {
  const html = pintar({ stillPending: 201, serverUnavailable: true });
  expect({
    nadaNuevo: html.includes("Nada nuevo que enviar"),
    noRespondio: html.includes("el servidor no respondió"),
  }).toEqual({ nadaNuevo: false, noRespondio: true });
});

// Lo mismo con la sesión caducada a mitad de la cola (decisión de Daniel del
// mismo día): un 401 en la segunda tanda también deja la primera enviada.
it("si la sesión caduca con 200 ya enviadas, dice las enviadas Y que la sesión caducó", () => {
  const html = pintar({ applied: 200, stillPending: 1, sessionExpired: true });
  expect({
    enviadas: html.includes("200 anotaciones enviadas"),
    caduco: html.includes("tu sesión caducó"),
  }).toEqual({ enviadas: true, caduco: true });
});

it("si la sesión caducó y no salió nada, no dice «Nada nuevo que enviar»", () => {
  const html = pintar({ stillPending: 201, sessionExpired: true });
  expect({
    nadaNuevo: html.includes("Nada nuevo que enviar"),
    caduco: html.includes("tu sesión caducó"),
  }).toEqual({ nadaNuevo: false, caduco: true });
});
