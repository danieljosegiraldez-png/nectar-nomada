import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { fichaDeUnidad } from "../../../../lib/beneficio/fichaDeUnidad";
import { mostrarInstante } from "../../../../lib/time/mostrarInstante";
import { NavegacionBeneficio } from "../../../components/beneficio/NavegacionBeneficio";
import { GraficaDeSecado } from "./Grafica";

export const dynamic = "force-dynamic";

/**
 * La ficha de una unidad de secado (diseño §B.3).
 *
 * **Arriba, una sola respuesta**, no un panel de datos: qué tiene encima, desde cuándo, qué día
 * va de los declarados, su humedad contra el rango y qué le toca. Quien abre esto desde el patio
 * quiere saber si actuar, no estudiar una tabla.
 *
 * Después, las cinco cifras; y debajo, los actos en orden inverso — lo último que se hizo primero,
 * porque es lo que se comprueba al llegar.
 *
 * **La gráfica todavía NO está**, y se dice en vez de dejar un hueco mudo: es la segunda mitad de
 * esta pieza, con sus cinco series sobre un eje de tiempo.
 *
 * **No distingue «no existe» de «no la ves»**: las dos dan 404. Distinguirlas le diría a quien no
 * tiene permiso que la unidad existe y está ocupada, que es justo lo que no debe saber.
 */
export default async function FichaDeUnidadPage({ params }: { params: Promise<{ unidad: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, { unidad: parametro }] = await Promise.all([getTranslations("Secado"), params]);

  const ficha = await fichaDeUnidad(user.userAccountId, parametro);
  if (!ficha) notFound();

  const u = ficha.unidad;
  // Con duración declarada se dice «día 4 de 8»; sin ella, sólo las horas que lleva. Prometer un
  // «de 8» que nadie declaró sería inventarlo, y es la misma regla que gobierna la cola.
  const declarado = u.ritmo.expectedHours;
  const dias = declarado == null
    ? null
    : { dia: Math.max(1, Math.ceil(u.horasEnFase / 24)), de: Math.max(1, Math.ceil(declarado / 24)) };

  return (
    <div className="nn-mill-page">
      <header className="nn-mill-header">
        <div>
          <h1>{u.nombre}</h1>
          <p>{t(`fichaClase_${u.tipo}` as "fichaClase_cama")}{ficha.area ? ` · ${ficha.area.nombre}` : ""}</p>
        </div>
      </header>
      <NavegacionBeneficio userAccountId={user.userAccountId} actual="/beneficio/secado" />

      {/* La sola respuesta. Una frase, no una tabla. */}
      <section className="nn-section">
        <p>
          <Link href={`/lots/${u.lotId}`} className="nn-code">{u.lotCode}</Link>
          {u.proceso ? ` · ${u.proceso}` : ""}
          {" · "}
          {dias === null
            ? t("colaDiaSinDeclarar", { horas: Math.round(u.horasEnFase) })
            : t("colaDiaDe", dias)}
        </p>
        <p>
          <strong>{t(`colaEstado_${u.estado.replace(/ /g, "_")}` as "colaEstado_al_dia")}</strong>
        </p>
      </section>

      <section className="nn-section">
        <h2>{t("fichaCifras")}</h2>
        <dl>
          <div>
            <dt>{t("fichaHumedad")}</dt>
            <dd>{u.humedadPct == null ? t("colaSinHumedad") : `${u.humedadPct} %`}</dd>
          </div>
          <div>
            <dt>{t("fichaRango")}</dt>
            <dd>
              {u.ritmo.humedadMinPct == null || u.ritmo.humedadMaxPct == null
                ? t("fichaSinRango")
                : `${u.ritmo.humedadMinPct}–${u.ritmo.humedadMaxPct} %`}
            </dd>
          </div>
          <div>
            <dt>{t("fichaVolteos")}</dt>
            <dd>
              {u.volteos}
              {u.ultimoVolteo ? ` · ${t("fichaUltimoVolteo", { cuando: mostrarInstante(u.ultimoVolteo, ficha.zona) })}` : ""}
            </dd>
          </div>
          <div>
            <dt>{t("fichaRitmo")}</dt>
            {/* Sin ritmo declarado se dice, nunca se inventa uno: es la misma regla que gobierna
                la cola y la que evita prometer un «día 4 de 8» que nadie declaró. */}
            <dd>
              {u.ritmo.turnEveryHours == null
                ? t("fichaSinRitmo")
                : t("fichaCadaHoras", { horas: u.ritmo.turnEveryHours })}
            </dd>
          </div>
          <div>
            <dt>{t("fichaEntro")}</dt>
            <dd>{mostrarInstante(ficha.entro, ficha.zona)}</dd>
          </div>
        </dl>
      </section>

      <section className="nn-section">
        <h2>{t("fichaGrafica")}</h2>
        <GraficaDeSecado
          datos={ficha.grafica}
          textos={{
            sinDatos: t("fichaGraficaSinDatos"),
            ejeHumedad: t("fichaGraficaEje"),
            notaTemperatura: t("fichaGraficaNotaTemperatura"),
            tituloVolteos: t("fichaGraficaVolteo"),
          }}
        />
        {/* Los pesajes van en cifras y NO en la gráfica: cuatro pesajes no hacen una curva. */}
        {ficha.pesajes.length > 0 ? (
          <p className="nn-muted">
            {t("fichaPesajes")}:{" "}
            {ficha.pesajes.map((w) => `${w.netoKg} kg (${mostrarInstante(w.cuando, ficha.zona)})`).join(" · ")}
          </p>
        ) : null}
      </section>

      <section className="nn-section">
        <h2>{t("fichaActos")}</h2>
        {ficha.actos.length === 0 ? (
          <p className="nn-muted">{t("fichaSinActos")}</p>
        ) : (
          <ul>
            {ficha.actos.map((a, i) => (
              <li key={`${a.clase}-${a.cuando.toISOString()}-${i}`}>
                <strong>{mostrarInstante(a.cuando, ficha.zona)}</strong>
                {" · "}
                {a.clase === "volteo" ? t(`fichaVolteoTipo_${a.que}` as "fichaVolteoTipo_turned") : a.que}
                {a.quien ? ` · ${a.quien}` : ""}
                {a.instrumento ? ` · ${a.instrumento}` : ""}
                {a.nota ? <span className="nn-muted"> — {a.nota}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p>
        <Link href="/beneficio/secado">{t("fichaVolverALaCola")}</Link>
      </p>
    </div>
  );
}
