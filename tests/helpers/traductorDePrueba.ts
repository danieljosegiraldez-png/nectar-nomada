/**
 * Un traductor de prueba con los textos REALES de `messages/es.json` (o de `messages/en.json`) y formato ICU real (`intl-messageformat`) — Parte 2a, tarea 14.
 *
 * Una clave que no está **revienta** la prueba en vez de devolver `Traceability.clave`, que es lo que pinta `next-intl` cuando falta un
 * texto y que ningún `expect` sobre «contiene tal frase» distingue de una pantalla rota. Lo usan, por `vi.mock`, las pruebas de las
 * pantallas y los componentes del editor de recetas: `getTranslations` (servidor) y `useTranslations` (cliente) devuelven esta misma función.
 * Con él, una variable del panel «proceso de café» sin su `variable_<x>` también revienta la prueba (hasta esta tarea, 28 de las 34 no tenían texto).
 * El segundo parámetro (`"es"` por omisión) existe para una sola cosa: demostrar que un texto pasa por el traductor y no está escrito a fuego —
 * con los textos en español, un literal en español y su traducción dicen lo mismo, y sólo el inglés los distingue.
 *
 * **Riesgo aceptado (decisión del controlador, ronda de arreglo de T14C, H8).** `intl-messageformat` es una dependencia TRANSITIVA de `next-intl`: la trae
 * `use-intl` (`^11.1.0` en `package-lock.json`, instalada la 11.2.13), y `next-intl` trae `use-intl`. No está en `package.json`, y este archivo la importa en
 * estático. Se acepta a propósito en vez de declararla (tocar `package.json` y el lock arriesga `npm ci`). Si una actualización de `next-intl` dejara de
 * traerla, estas pruebas romperían A LA VISTA —un error de importación al cargar este archivo—, no en silencio: ningún `expect` de las pruebas que lo
 * usan puede pasar sin él.
 */
import { IntlMessageFormat } from "intl-messageformat";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

const MENSAJES = { es, en } as unknown as Record<"es" | "en", Record<string, Record<string, string>>>;

export function traductorDePrueba(espacio: string, idioma: "es" | "en" = "es") {
  const t = (clave: string, valores?: Record<string, unknown>): string => {
    const mensaje = MENSAJES[idioma][espacio]?.[clave];
    if (mensaje === undefined) throw new Error(`falta la clave «${espacio}.${clave}» en messages/${idioma}.json`);
    return String(new IntlMessageFormat(mensaje, idioma).format(valores as never));
  };
  return t;
}
