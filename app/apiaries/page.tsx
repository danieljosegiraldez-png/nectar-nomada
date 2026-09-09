import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getApiaryList } from "../../lib/apiary/hives";
import { pesoDeAlerta, vitalesDeSitios, type VitalesDeSitio } from "../../lib/apiary/vitalesDelSitio";
import { MapaDeSitios } from "../components/apiary/MapaDeSitios";

export const dynamic = "force-dynamic";

/**
 * A9.8 — la pantalla de sitios deja de ser una lista de nombres.
 *
 * El mapa **ya entra aquí**, y la frase que este comentario tenía —«es
 * dependencia nueva de pago con token»— dejó de ser cierta el 2026-09-08: el
 * dueño enmendó ADR-009 a **Leaflet con teselas de OpenStreetMap**, sin token y
 * sin cuenta. Lo que bloqueaba el mapa no era el proveedor: era que **cero de
 * las 24 ubicaciones tenían coordenadas** y la pantalla del sitio sólo enseñaba
 * el formulario para declararlas si ya había una propuesta de alguna visita —
 * una condición que, sin visitas con GPS, nadie podía cumplir. Se arregló en el
 * mismo cambio, porque un mapa sin forma de darle algo que pintar es un adorno.
 *
 * La lista sigue ordenada por urgencia y no por nombre, que es lo que el Anexo
 * C §1 pedía del mapa y se pudo dar antes que él.
 *
 * Regla del Anexo que gobierna cada cifra: **ninguna vacía**. Un vital sin fila
 * detrás dice «sin registro», que no es cero y no es un guion: es un tercer
 * estado, y la pantalla ya distinguía «no hay» de «no puedes ver».
 */
function Vital({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="nn-vital">
      <span className="nn-vital-etiqueta">{etiqueta}</span>
      <span className={valor === null ? "nn-vital-sin-registro" : "nn-vital-valor"}>{valor ?? "—"}</span>
    </div>
  );
}

export default async function ApiariesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Apiary");
  const { items: apiaries, truncated, limit, sinAmbito } = await getApiaryList(user.userAccountId);

  // `getApiaryList` ya autorizó; esto sólo lee hechos de ids ya concedidos.
  const vitales = await vitalesDeSitios(apiaries.map((a) => a.id));

  const ordenados = [...apiaries].sort((a, b) => {
    const d = pesoDeAlerta(vitales.get(a.id)) - pesoDeAlerta(vitales.get(b.id));
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  const fecha = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

  // Sólo se pinta lo declarado. `Location.latitude/longitude` es lo que una
  // persona confirmó en `/apiaries/[id]`; la propuesta que sale de las visitas
  // NO llega aquí a propósito — pintarla haría pasar por hecho una mediana de
  // lecturas de GPS, que es justo lo que `CLAUDE.md` §3 prohíbe.
  const enElMapa = ordenados
    .filter((a) => a.latitude !== null && a.longitude !== null)
    .map((a) => ({
      id: a.id,
      name: a.name,
      latitude: a.latitude!,
      longitude: a.longitude!,
      coloniasActivas: vitales.get(a.id)?.coloniasActivas ?? 0,
    }));
  const sinCoordenadas = apiaries.length - enElMapa.length;

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("apiariesTitle")}</h1>
      <p className="nn-muted">{t("apiariesIntro")}</p>

      {/* ADR-087 — a cut-off list says so. */}
      {truncated ? <p className="nn-muted">{t("listTruncated", { limit })}</p> : null}

      {/* El mapa, y debajo lo que el mapa NO está enseñando. Decir cuántos
          sitios faltan es la mitad que cuenta: un mapa con tres pines y
          veintiún sitios invisibles se lee como si la finca tuviera tres. */}
      {apiaries.length > 0 ? (
        <section className="nn-section">
          <h2>{t("mapaHeading")}</h2>
          {enElMapa.length > 0 ? <MapaDeSitios sitios={enElMapa} /> : null}
          {sinCoordenadas > 0 ? (
            <p className="nn-muted">{t("mapaSinCoordenadas", { count: sinCoordenadas })}</p>
          ) : null}
        </section>
      ) : null}

      {/* Segunda lente: «no hay» y «no puedes ver» no son el mismo hecho. Esta
          pantalla afirmaba lo primero a quien le pasaba lo segundo. Se nombra
          la causa y a quién pedirle el acceso, igual que en `/lots`. */}
      {apiaries.length === 0 ? (
        sinAmbito ? (
          <>
            <p className="nn-muted">{t("sinAmbitoHeading")}</p>
            <p className="nn-muted">{t("sinAmbitoBody")}</p>
          </>
        ) : (
          <p className="nn-muted">{t("noApiaries")}</p>
        )
      ) : (
        <div className="nn-grid">
          {ordenados.map((apiary) => {
            const v: VitalesDeSitio | undefined = vitales.get(apiary.id);
            const alerta = v?.alertas[0];
            return (
              <Link
                key={apiary.id}
                href={`/apiaries/${apiary.id}`}
                className={`nn-card-link nn-sitio${alerta ? ` nn-sitio-${alerta.nivel}` : ""}`}
              >
                <h3>{apiary.name}</h3>

                {/* Todas las alertas, no sólo la que pinta el borde: un sitio con
                    tres problemas y uno con uno se ven distintos. */}
                {v && v.alertas.length > 0 ? (
                  <ul className="nn-alertas">
                    {v.alertas.map((a) => (
                      <li key={a.motivo} className={`nn-alerta nn-alerta-${a.nivel}`}>
                        {t(`alerta_${a.motivo}`)}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="nn-vitales">
                  <Vital
                    etiqueta={t("vitalUltimaVisita")}
                    valor={v?.diasDesdeUltimaVisita == null ? null : t("haceDias", { count: v.diasDesdeUltimaVisita })}
                  />
                  <Vital etiqueta={t("vitalProximaVisita")} valor={fecha(v?.proximaVisita ?? null)} />
                  <Vital
                    etiqueta={t("vitalColonias")}
                    valor={v ? t("coloniasDeCajas", { colonias: v.coloniasActivas, cajas: v.cajas }) : null}
                  />
                  <Vital etiqueta={t("vitalAlimentoHasta")} valor={fecha(v?.alimentoHasta ?? null)} />
                </div>

                <p className="nn-muted">{t("hiveCount", { count: apiary.hives.length })}</p>
              </Link>
            );
          })}
        </div>
      )}

      {/* Se dice en la pantalla, no sólo en el código: dos de los ocho vitales
          del Anexo C todavía no tienen fila detrás, y callarlo haría creer que
          la lista está completa. */}
      <p className="nn-muted nn-vitales-nota">{t("vitalesPendientes")}</p>
    </div>
  );
}
