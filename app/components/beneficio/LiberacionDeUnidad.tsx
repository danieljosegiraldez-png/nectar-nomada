import { getTranslations } from "next-intl/server";
import type { Liberacion } from "../../../lib/beneficio/liberacionDeUnidad";
import { mostrarInstante } from "../../../lib/time/mostrarInstante";

/**
 * Cuándo se libera la próxima unidad, en palabras. Componente aparte (y no dentro de la página)
 * para poder probar la regla sin autenticarse ni tocar la base.
 *
 * **Tres casos y ninguno se parece a otro** (ver `liberacionDeUnidad.ts`):
 * - `null`: ninguna unidad declarada está ocupada por una corrida abierta;
 * - `sin_duracion_declarada`: hay una unidad en uso y la receta no dice cuándo termina — **nunca
 *   una hora**: una hora puesta aquí se leería como un dato;
 * - `a_las`: la hora se muestra en la zona del sitio (`mostrarInstante`, no el huso del servidor).
 *   Si ya pasó, se dice «debía liberarse… y sigue ocupada»: moverla a «ahora» sería inventar.
 */
export async function LiberacionDeUnidad({
  liberacion,
  ahora,
}: {
  liberacion: Liberacion | null;
  ahora: Date;
}) {
  const t = await getTranslations("SeccionBeneficio");
  const texto =
    liberacion === null
      ? t("liberacionNinguna")
      : liberacion.tipo === "sin_duracion_declarada"
        ? t("liberacionSinDuracion")
        : liberacion.cuando.getTime() < ahora.getTime()
          ? t("liberacionVencida", { cuando: mostrarInstante(liberacion.cuando, null) })
          : t("liberacionALas", { cuando: mostrarInstante(liberacion.cuando, null) });
  return (
    <p className="nn-cap-liberacion">
      <strong>{t("liberacionTitulo")}</strong> {texto}
    </p>
  );
}
