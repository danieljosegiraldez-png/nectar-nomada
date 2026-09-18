/**
 * `POST /v1/ingest/notehub` — lo que mandan los nodos de sensores de las colmenas, a través de la
 * ruta de Blues Notehub. Artefactos de colmena, Tarea 7.
 *
 * Toda la lógica —verificarSecretoDeRuta, tamaño, sobre, códigos— vive en
 * `lib/sensores/rutaDeIngesta.ts`, donde se prueba. Aquí sólo se le pasa el secreto del entorno.
 * **Sin `NOTEHUB_ROUTE_SECRET` configurado, la ruta responde 401 a todo.**
 */
import { atenderIngesta } from "../../../../../lib/sensores/rutaDeIngesta";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return atenderIngesta(request, process.env.NOTEHUB_ROUTE_SECRET);
}
