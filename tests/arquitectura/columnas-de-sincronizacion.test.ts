import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Las cuatro columnas de captura viajan juntas, o el conjunto no dice nada.
 *
 * **Qué son.** Una fila capturada en campo tiene cuatro hechos distintos, y
 * hasta P2 el esquema sólo podía guardar uno (audit §9, worked example): medido
 * a las 14:00, tecleado en el teléfono a las 14:23, sincronizado a las 09:17
 * del día siguiente, con el reloj del aparato adelantado 4 minutos.
 *
 * - `occurredAt` — cuándo pasó.
 * - `recordedAt` — el reloj *del dispositivo* cuando el operador lo entró.
 * - `syncedAt` — cuándo llegó al servidor desde el dispositivo.
 * - una columna de dispositivo (`deviceId` o `captureDeviceId`) — cuál.
 * - `clockOffsetMs` — cuánto mentía ese reloj en ese momento.
 *
 * **Por qué un guardia y no un comentario.** `recordedAt` es hora de teléfono y
 * los teléfonos baratos derivan. Sin `clockOffsetMs` la deriva es
 * irrecuperable: cada punto de una curva de fermentación sigue siendo
 * plausible y sólo el conjunto está torcido, que es la clase de error que nadie
 * nota. Una tabla que guarde `recordedAt` sin poder decir cuánto se desviaba el
 * reloj ofrece una precisión que no tiene — y eso es peor que no ofrecerla,
 * porque se lee como dato bueno (ADR-080: ausencia nunca convertida en
 * afirmación).
 *
 * **Por qué se ata al esquema y no a una lista escrita a mano.** Hoy son seis
 * tablas. La Fase 4 traerá más, y la que las añada copiará el bloque de la
 * tabla que tenga al lado. Si copia tres de las cuatro columnas, este test lo
 * dice sin que nadie lo actualice; una lista enumerada a mano habría que
 * acordarse de tocarla, que es justo lo que `scripts/ci.sh` demuestra que no
 * pasa (PENDING_IMPLEMENTATIONS/008).
 *
 * **Cómo se comprueba que este guardia sirve** (flip-test, 2026-09-04): borrar
 * `clockOffsetMs` de cualquiera de los seis modelos hace fallar este test
 * nombrando ese modelo. Comprobado sobre `ColonyEvent` antes de commitear.
 *
 * Hermético: sólo lee `prisma/schema.prisma`.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

type Modelo = { nombre: string; campos: string[] };

/** Cada `model X { ... }` del esquema, con los nombres de sus campos. */
const modelos = (): Modelo[] => {
  const esquema = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");
  const salida: Modelo[] = [];
  for (const m of esquema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
    const cuerpo = m[2] ?? "";
    const campos = [...cuerpo.matchAll(/^\s{2}(\w+)\s+\S/gm)]
      .map((c) => c[1])
      .filter((n): n is string => n != null);
    salida.push({ nombre: m[1]!, campos });
  }
  return salida;
};

/** El disparador: una tabla que dice guardar el reloj del dispositivo. */
const capturadasEnDispositivo = () =>
  modelos().filter((m) => m.campos.includes("recordedAt"));

describe("las columnas de captura en dispositivo", () => {
  /**
   * Control positivo. Un `filter` sobre un esquema mal parseado devuelve cero
   * modelos, y cero modelos hacen pasar todo lo de abajo sin mirar nada — el
   * verde vacío de siempre. Si este número cambia porque el esquema cambió,
   * actualizarlo es parte del trabajo; si cambia a 0, el parser está roto.
   */
  it("son las que son — el parser encuentra el conjunto que debe mirar", () => {
    const nombres = capturadasEnDispositivo()
      .map((m) => m.nombre)
      .sort();
    expect(nombres).toEqual([
      "ColonyEvent",
      "FieldEvent",
      "FieldSession",
      "Inspection",
      "Measurement",
      "QuantityEvent",
    ]);
  });

  it("llevan siempre `syncedAt`, una columna de dispositivo y `clockOffsetMs`", () => {
    const incompletas = capturadasEnDispositivo()
      .map((m) => {
        const falta: string[] = [];
        if (!m.campos.includes("syncedAt")) falta.push("syncedAt");
        if (!m.campos.includes("deviceId") && !m.campos.includes("captureDeviceId"))
          falta.push("deviceId | captureDeviceId");
        if (!m.campos.includes("clockOffsetMs")) falta.push("clockOffsetMs");
        return falta.length > 0 ? `${m.nombre}: falta ${falta.join(", ")}` : null;
      })
      .filter((x): x is string => x != null);

    expect(
      incompletas,
      "un modelo con `recordedAt` guarda hora de un dispositivo. Sin `syncedAt`, " +
        "sin saber qué aparato fue y sin `clockOffsetMs` esa hora no se puede " +
        "corregir después, y se lee como precisa cuando no lo es. Ver el " +
        "comentario de `Measurement.clockOffsetMs` en prisma/schema.prisma."
    ).toEqual([]);
  });
});
