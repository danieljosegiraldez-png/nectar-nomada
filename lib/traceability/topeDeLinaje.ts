/**
 * R1 (Parte 1, 2026-10-01): 64 generaciones en las dos direcciones. Un multiproceso real tiene unas diez. Una cadena de 64
 * ancestros se resuelve; la generación 65 lanza (`nivel > TOPE` al empezar cada vuelta, en `procesoDelLinaje.ts`).
 *
 * Movido aquí en la ronda de arreglo 1 de la tarea 12 (2026-10-03). **Módulo propio, sin imports, a propósito:** el tope también lo
 * escriben a mano dos textos —`Traceability.error_proceso_lineage_too_deep` y `Traceability.processLineageTooDeep`— y la prueba
 * hermética de esos textos (`tests/traceability/mensajesDeProceso.test.ts`) tiene que poder leer el número. Desde
 * `procesoDelLinaje.ts` no podía: ese módulo importa `../audit`, que importa `./db`, y una prueba que lo importe deja de correr
 * en el carril sin base de `scripts/ci.sh`. `procesoDelLinaje.ts` lo importa y lo reexporta con el mismo nombre.
 */
export const TOPE_DE_LINAJE = 64;
