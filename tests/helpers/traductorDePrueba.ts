/**
 * Un traductor de prueba con los textos REALES de `messages/es.json` y formato ICU real (`intl-messageformat`) — Parte 2a, tarea 14.
 *
 * Una clave que no está **revienta** la prueba en vez de devolver `Traceability.clave`, que es lo que pinta `next-intl` cuando falta un
 * texto y que ningún `expect` sobre «contiene tal frase» distingue de una pantalla rota. Lo usan, por `vi.mock`, las pruebas de las
 * pantallas y los componentes del editor de recetas: `getTranslations` (servidor) y `useTranslations` (cliente) devuelven esta misma función.
 * Con él, una variable del panel «proceso de café» sin su `variable_<x>` también revienta la prueba (hasta esta tarea, 28 de las 34 no tenían texto).
 */
import { IntlMessageFormat } from "intl-messageformat";
import es from "../../messages/es.json";

const MENSAJES = es as unknown as Record<string, Record<string, string>>;

export function traductorDePrueba(espacio: string) {
  const t = (clave: string, valores?: Record<string, unknown>): string => {
    const mensaje = MENSAJES[espacio]?.[clave];
    if (mensaje === undefined) throw new Error(`falta la clave «${espacio}.${clave}» en messages/es.json`);
    return String(new IntlMessageFormat(mensaje, "es").format(valores as never));
  };
  return t;
}
