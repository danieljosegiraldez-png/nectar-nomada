import { vi } from "vitest";

/**
 * Un IndexedDB en memoria con lo justo que usan las tres colas offline del
 * cliente — `lib/sync/offlineQueue.ts`, `lib/apiary/offlineQueue.ts` y
 * `lib/sync/trapPhotoQueue.ts`—: abrir, crear el almacén, `add`/`put`/`delete`/
 * `getAll`, y los avisos `onupgradeneeded`/`onsuccess`/`oncomplete`.
 *
 * **Por qué existe.** Hasta aquí esas colas sólo se probaban por las funciones
 * puras que se les extraían (`clasificarRespuesta`, `clasificarResultadoDeFoto`,
 * `estadoDeBorrador`), porque el repositorio no tiene `fake-indexeddb` ni entorno
 * DOM. Eso prueba la DECISIÓN y deja sin probar lo que la cola HACE con ella —qué
 * vuelve a recoger en el intento siguiente—, que es donde vivía el defecto de
 * `tests/sync/rechazoTerminalEnLasColas.test.ts`.
 *
 * **No es un IndexedDB.** No hay versiones, índices, cursores ni abortos, y
 * `add` sobre una clave existente no falla. Los avisos se disparan en una tarea
 * posterior porque las colas asignan `onsuccess`/`oncomplete` DESPUÉS de pedir
 * la operación, igual que en el navegador.
 */

type Fila = Record<string, unknown>;
type Almacen = { keyPath: string; filas: Map<string, Fila> };
type Peticion = { result?: unknown; error?: unknown; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void };
type Transaccion = { oncomplete?: () => void; onerror?: () => void; error?: unknown; objectStore: (nombre: string) => unknown };

const despues = (fn: () => void) => setTimeout(fn, 0);
// Copia superficial: lo guardado no comparte objeto con quien lo escribió ni con
// quien lo lee, que es lo que da el clonado del navegador. Superficial a
// propósito — `structuredClone` de un `Blob` no es algo de lo que fiarse aquí, y
// las colas sólo leen campos de primer nivel.
const copia = (f: Fila): Fila => ({ ...f });

export function instalarIndexedDbEnMemoria(): Map<string, Map<string, Almacen>> {
  const bases = new Map<string, Map<string, Almacen>>();

  const indexedDB = {
    open(nombre: string): Peticion {
      const peticion: Peticion = {};
      despues(() => {
        const nueva = !bases.has(nombre);
        if (nueva) bases.set(nombre, new Map());
        const almacenes = bases.get(nombre)!;
        peticion.result = {
          objectStoreNames: { contains: (s: string) => almacenes.has(s) },
          createObjectStore: (s: string, opciones: { keyPath: string }) => {
            almacenes.set(s, { keyPath: opciones.keyPath, filas: new Map() });
          },
          transaction: (s: string): Transaccion => {
            const almacen = almacenes.get(s);
            if (!almacen) throw new Error(`indexedDbEnMemoria: no existe el almacén «${s}» en «${nombre}»`);
            const tx: Transaccion = {
              objectStore: () => ({
                add: (f: Fila) => void almacen.filas.set(String(f[almacen.keyPath]), copia(f)),
                put: (f: Fila) => void almacen.filas.set(String(f[almacen.keyPath]), copia(f)),
                delete: (clave: string) => void almacen.filas.delete(clave),
                getAll: () => {
                  const lectura: Peticion = {};
                  despues(() => {
                    lectura.result = [...almacen.filas.values()].map(copia);
                    lectura.onsuccess?.();
                  });
                  return lectura;
                },
              }),
            };
            despues(() => tx.oncomplete?.());
            return tx;
          },
          close: () => {},
        };
        if (nueva) peticion.onupgradeneeded?.();
        peticion.onsuccess?.();
      });
      return peticion;
    },
  };

  vi.stubGlobal("indexedDB", indexedDB);
  return bases;
}
