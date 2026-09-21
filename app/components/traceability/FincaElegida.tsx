import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { elegirFincaAction } from "../../actions/fincas";
import { BotonDeEnvio } from "../BotonDeEnvio";
import type { Finca } from "../../../lib/traceability/fincas";
import { urlDelLogotipo } from "../../../lib/traceability/fincaLogo";

/**
 * La finca de la página, arriba. Daniel, 2026-09-21: con varias fincas, un botón por cada una —un
 * toque cambia de finca sin salir de la pantalla—; con una sola, su nombre y nada más. Cada botón
 * es un formulario a `elegirFincaAction`, la misma cookie que usa `/fincas`.
 *
 * `fincas` es opcional para las páginas que todavía no la pasan: sin lista queda el enlace a
 * `/fincas` de antes.
 */
export async function FincaElegida({
  elegida,
  hayVarias,
  volver,
  fincas,
  puedeCambiarLogotipo = false,
}: {
  elegida: Finca | null;
  hayVarias: boolean;
  volver: string;
  fincas?: readonly Finca[];
  puedeCambiarLogotipo?: boolean;
}) {
  const t = await getTranslations("Fincas");
  const logos = new Map(
    await Promise.all((fincas ?? (elegida ? [elegida] : [])).map(async (f) => [f.siteId, await urlDelLogotipo(f.logoAssetId)] as const)),
  );
  const logo = (f: Finca) => {
    const url = logos.get(f.siteId);
    // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL, not a static/optimizable Next asset
    return url ? <img src={url} alt="" width={28} height={28} loading="lazy" className="nn-finca-logo" /> : null;
  };
  const cambiarLogotipo =
    elegida && puedeCambiarLogotipo ? (
      <Link href={`/fincas/${elegida.siteId}/logotipo`}>{t("logotipoCambiar")}</Link>
    ) : null;

  if (hayVarias && fincas && fincas.length > 1) {
    return (
      <nav aria-label={t("elegirFinca")} className="nn-fincas">
        {fincas.map((f) => (
          <form key={f.siteId} action={elegirFincaAction}>
            <input type="hidden" name="finca" value={f.siteId} />
            <input type="hidden" name="volver" value={volver} />
            <BotonDeEnvio
              className={f.siteId === elegida?.siteId ? "nn-finca-boton nn-finca-boton--elegida" : "nn-finca-boton"}
              aria-current={f.siteId === elegida?.siteId ? "true" : undefined}
            >
              {logo(f)}
              {f.nombre}
            </BotonDeEnvio>
          </form>
        ))}
        {cambiarLogotipo}
      </nav>
    );
  }

  const cambiar = `/fincas?volver=${encodeURIComponent(volver)}`;
  return (
    <p className="nn-detail-meta">
      {elegida ? logo(elegida) : null}
      {elegida ? t("elegida", { nombre: elegida.nombre }) : t("todasElegidas")}
      {hayVarias ? (
        <>
          {" · "}
          <Link href={cambiar}>{t("cambiar")}</Link>
        </>
      ) : null}
      {cambiarLogotipo ? <>{" · "}{cambiarLogotipo}</> : null}
    </p>
  );
}
