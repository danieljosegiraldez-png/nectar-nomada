import type { getTranslations } from "next-intl/server";

type T = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Aviso de `?ok=`/`?error=` tras una acción de `RutinasDeLugar`
 * (spec 2026-09-19 §5/§6). Mismo filtro y mismo mapa de códigos que
 * `app/equipos/[id]/page.tsx` — se extrae aparte para que `/instalaciones/[id]`
 * y `/beneficio` sólo AÑADAN una línea, sin tocar su manejo de errores
 * existente (que cubre además códigos que no son de rutinas).
 *
 * `t` es el de la traducción `Equipos`, que es donde viven estas claves.
 */
const OK: Record<string, string> = {
  rutina_creada: "okRutinaCreada",
  rutina_registrada: "okRutinaRegistrada",
  rutina_anulada: "okRutinaAnulada",
  datos: "okDatos",
};

const ERROR: Record<string, string> = {
  forbidden: "errorSinPermiso",
  lugar_sin_rutinas: "errorLugarSinRutinas",
  rutina_duplicada: "errorRutinaDuplicada",
  fecha_futura: "errorFechaFutura",
  motivo_obligatorio: "errorMotivoObligatorio",
  insumo_ajeno: "errorInsumoAjeno",
  unidad_distinta: "errorUnidadDistinta",
  cantidad_invalida: "errorCantidadInvalida",
  unidad_obligatoria: "errorUnidadObligatoria",
};

export function AvisoDeRutina({ ok, error, t }: { ok?: string; error?: string; t: T }) {
  const codigo = error && /^[a-z_]+$/.test(error) ? error : null;
  const okKey = ok ? OK[ok] : undefined;
  return (
    <>
      {okKey ? (
        <p className="nn-ok" role="status">
          {t(okKey)}
        </p>
      ) : null}
      {codigo ? (
        <p className="nn-error" role="alert">
          {ERROR[codigo] ? t(ERROR[codigo]) : t("errorModeloGenerico", { codigo })}
        </p>
      ) : null}
    </>
  );
}
