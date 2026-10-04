/**
 * Cada motivo de «devolver a secado» tiene su rótulo en los dos idiomas (Parte 1, tarea 8, ronda de arreglo 1,
 * 2026-10-02).
 *
 * **Por qué existe.** `DevolverASecadoForm` arma el rótulo de cada opción con una clave de PLANTILLA —
 * ``t(`motivoDevolucion_${m.label}` as "motivoDevolucion_otro")``— y el `as` anula el único guardia que tienen
 * esas claves, el tipo: un motivo nuevo en el catálogo `motivo_devolucion_a_secado` sin su rótulo compilaría y
 * enseñaría a quien devuelve el lote el nombre crudo de la clave. Tampoco lo ve `claves-de-traduccion-existen`:
 * sólo mira claves literales y SALTA los archivos que llaman más de una vez a `useTranslations`, y
 * `ProcesoDelLote.tsx` lo hace seis veces. El informe de la tarea 8 decía que ese guardia cubría estas claves, y no
 * era cierto; esta prueba es la que las cubre.
 *
 * **Hermética.** Lee el catálogo de `lib/research/catalogs.ts` (no importa nada), el fuente del formulario y los dos
 * JSON; no toca `lib/db`, así que corre en el carril sin base de `scripts/ci.sh`. El nombre del catálogo, el prefijo
 * de la clave y el espacio de nombres se LEEN del código que los usa, no se copian aquí: si el formulario cambia de
 * prefijo, esta prueba sigue al formulario en vez de quedarse mirando claves que nadie pide.
 *
 * **Lo que NO prueba**: que `label` sea el `value` del catálogo (lo afirma la prueba de `opcionesParaProceso` en
 * `tests/traceability/lotProcess.test.ts`) ni que la página llegue a ofrecer el formulario.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VARIABLE_CATALOGS } from "../../lib/research/catalogs";

const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;

const FORMULARIO = readFileSync("app/components/traceability/ProcesoDelLote.tsx", "utf8");
const SERVICIO = readFileSync("lib/traceability/lotProcess.ts", "utf8");

/** El cuerpo de `DevolverASecadoForm`: del `export function` hasta el siguiente export, o el final del archivo. */
function cuerpoDelFormulario(): string {
  const inicio = FORMULARIO.indexOf("export function DevolverASecadoForm");
  if (inicio < 0) return "";
  const siguiente = FORMULARIO.indexOf("\nexport ", inicio + 1);
  return FORMULARIO.slice(inicio, siguiente < 0 ? undefined : siguiente);
}

const cuerpo = cuerpoDelFormulario();
const claveDelCatalogo = SERVICIO.match(/export const CATALOGO_MOTIVO_DEVOLUCION\s*=\s*"([^"]+)"/)?.[1];
const plantillas = [...cuerpo.matchAll(/\bt\(\s*`([A-Za-z0-9_]+)\$\{[^}]+\}`/g)].map((m) => m[1]!);
const espacios = [...cuerpo.matchAll(/useTranslations\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]!);
const valores = (VARIABLE_CATALOGS.find((c) => c.key === claveDelCatalogo)?.values ?? []).map((v) => v.value);

describe("los motivos de devolución a secado se pueden rotular en los dos idiomas", () => {
  it("control: se encontró el catálogo, el formulario, su prefijo y su espacio de nombres", () => {
    // Sin esto, cualquier cambio que rompa una de las lecturas deja el bucle de abajo sin recorrer nada y la prueba sale
    // verde diciendo lo contrario de lo que comprueba.
    expect(claveDelCatalogo, "no se encontró CATALOGO_MOTIVO_DEVOLUCION en lotProcess.ts").toBeDefined();
    expect(cuerpo.length, "no se encontró DevolverASecadoForm en ProcesoDelLote.tsx").toBeGreaterThan(0);
    expect(plantillas, "el formulario debe armar el rótulo del motivo con UNA clave de plantilla").toHaveLength(1);
    expect(espacios, "el formulario debe pedir sus textos a UN espacio de nombres").toHaveLength(1);
    // «otro» es el motivo que el servicio trata aparte (exige nota): si falta, no se leyó el catálogo que es.
    expect(valores, `el catálogo ${claveDelCatalogo} salió vacío o sin «otro»`).toContain("otro");
    expect(valores.length).toBeGreaterThanOrEqual(3);
  });

  it.each(valores)("el motivo «%s» tiene su rótulo, no vacío, en es.json y en en.json", (valor) => {
    const espacio = espacios[0]!;
    const clave = `${plantillas[0]}${valor}`;
    for (const [idioma, mensajes] of [["es", es], ["en", en]] as const) {
      expect(mensajes[espacio]?.[clave], `${idioma}.json no tiene ${espacio}.${clave}: el formulario enseñaría el nombre crudo de la clave`).toBeTruthy();
    }
  });
});
