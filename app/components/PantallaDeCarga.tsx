import { getTranslations } from "next-intl/server";

/**
 * Lo que se ve mientras una pantalla trae sus datos — R1 del plan farm-to-green (ADR-197). Antes la
 * página se quedaba en blanco hasta tener todo. `role="status"` para que un lector de pantalla lo
 * anuncie sin interrumpir.
 */
export async function PantallaDeCarga() {
  const t = await getTranslations("Estados");
  return (
    <p className="nn-muted" role="status" aria-live="polite">
      {t("cargando")}
    </p>
  );
}
