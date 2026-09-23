import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
import { COOKIE_BENEFICIO, beneficioDeLaPagina } from "../../../lib/traceability/beneficioElegido";
import { disponibleDeRecepciones, mermasDeRecepciones, pendientesDeBeneficio, recepcionesDeBeneficio } from "../../../lib/traceability/recepcionesDeCereza";
import { recepcionesArmables } from "../../../lib/traceability/lotesDeBeneficio";
import { pedidosDeBeneficio } from "../../../lib/traceability/pedidosDeCereza";
import { proveedoresDeCereza } from "../../../lib/traceability/proveedoresDeCereza";
import { mostrarInstante } from "../../../lib/time/mostrarInstante";
import { BeneficioElegido } from "../../components/beneficio/BeneficioElegido";
import { NavegacionBeneficio } from "../../components/beneficio/NavegacionBeneficio";
import { ArmarLoteForm } from "../../components/beneficio/ArmarLoteForm";
import { AnularMermaForm, MermaForm } from "../../components/beneficio/MermaForm";
import {
  AnularRecepcionForm,
  FotoDeRecepcionForm,
  NuevoProveedorForm,
  RecibirCerezaForm,
  type PedidoElegible,
} from "../../components/beneficio/RecibirCerezaForm";

export const dynamic = "force-dynamic";

/**
 * La recepción de cereza del beneficio elegido (spec 2026-09-19 recepción §4): lo que viene de las
 * fincas y está pendiente, recibir o rechazar cada entrega, recibir cereza de fuera, y lo recibido en
 * las últimas 24 horas con su doble peso. Ver exige `lot:view` sobre el beneficio (lo comprueba
 * cada lector); recibir, `lot:manage` y la regla de dos personas, que vuelve a exigir el servicio.
 */
export default async function RecepcionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const granted = await permissionKeysAnywhere(user.userAccountId);
  if (!granted.has("lot:view") && !granted.has("lot:manage")) notFound();
  const t = await getTranslations("Recepcion");

  const { beneficios, elegido } = await beneficioDeLaPagina(user.userAccountId, (await cookies()).get(COOKIE_BENEFICIO)?.value);
  if (!elegido) {
    return (
      <div className="nn-mill-page">
        <header className="nn-mill-header"><div><h1>{t("titulo")}</h1><p>{t("intro")}</p></div></header>
        <NavegacionBeneficio userAccountId={user.userAccountId} actual="/beneficio/recepcion" />
        {beneficios.length ? (
          <BeneficioElegido beneficios={beneficios} elegido={null} volver="/beneficio/recepcion" />
        ) : (
          <p className="nn-muted">{t("sinBeneficios")}</p>
        )}
      </div>
    );
  }

  const gestiona = granted.has("lot:manage");
  const [pendientes, recibidas, pedidos, proveedores, armables] = await Promise.all([
    pendientesDeBeneficio(user.userAccountId, elegido.id),
    recepcionesDeBeneficio(user.userAccountId, elegido.id, 24),
    pedidosDeBeneficio(user.userAccountId, elegido.id),
    gestiona ? proveedoresDeCereza(user.userAccountId) : Promise.resolve([]),
    recepcionesArmables(user.userAccountId, elegido.id),
  ]);
  // El disponible de las recepciones que se están mostrando, para la merma. `armables` ya trae el
  // suyo, pero deja fuera las que llegaron a cero, y ahí sigue habiendo mermas que anular.
  const disponible = await disponibleDeRecepciones(recibidas.map((r) => r.id));
  const mermas = gestiona ? await mermasDeRecepciones(recibidas.map((r) => r.id)) : [];
  const abiertos: PedidoElegible[] = pedidos
    .filter((p) => p.estado === "abierto")
    .map((p) => ({
      id: p.id,
      fuente: p.fincaSiteId ? `F:${p.fincaSiteId}` : `P:${p.proveedorId}`,
      etiqueta: t("pedidoEtiqueta", { fecha: p.fecha.toISOString().slice(0, 10), kg: Number(p.kgPedidos), recibido: p.recibidoKg }),
    }));

  const kg = (x: number) => x.toFixed(1);
  const origen = (e: (typeof pendientes)[number]) =>
    e.plotBlock ? t("bloque", { nombre: e.plotBlock.name }) : e.specimen ? t("planta", { nombre: e.specimen.commonName }) : (e.location?.name ?? "");

  return (
    <div className="nn-mill-page">
      <header className="nn-mill-header"><div><h1>{t("titulo")}</h1><p>{t("intro")}</p></div></header>
      <NavegacionBeneficio userAccountId={user.userAccountId} actual="/beneficio/recepcion" />
      <BeneficioElegido beneficios={beneficios} elegido={elegido} volver="/beneficio/recepcion" />

      <section className="nn-mill-section">
        <h2>{t("pendientesTitulo")}</h2>
        {pendientes.length === 0 ? (
          <p className="nn-muted">{t("sinPendientes")}</p>
        ) : (
          <ul className="nn-mill-records">
            {pendientes.map((e) => (
              <li key={e.id} className="nn-mill-record">
                <div className="nn-mill-record-heading"><strong>{e.recolector.displayName}</strong><span>{t("kgFinca", { kg: kg(Number(e.pesoFincaKg)) })}</span></div>
                <p>{e.jornada.fincaSite.name}, {origen(e)} · {mostrarInstante(e.enviadaAt, null)}</p>
                {gestiona ? (
                  <details className="nn-inline-disclosure"><summary>{t("procesarEntrega")}</summary><RecibirCerezaForm beneficioId={elegido.id} entregaId={e.id} fuenteDeLaEntrega={`F:${e.jornada.fincaSite.id}`} pedidos={abiertos} /></details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {gestiona ? (
        <details className="nn-disclosure nn-mill-task">
          <summary><span>{t("deFueraTitulo")}</span><small>{t("deFueraAyuda")}</small></summary>
          <div className="nn-disclosure-body">
          {proveedores.length ? (
            <RecibirCerezaForm beneficioId={elegido.id} proveedores={proveedores} pedidos={abiertos} />
          ) : (
            <p className="nn-muted">{t("sinProveedores")}</p>
          )}
          {granted.has("cherry_supplier:create") ? (
            <>
              <details className="nn-inline-disclosure"><summary>{t("nuevoProveedorTitulo")}</summary><NuevoProveedorForm /></details>
            </>
          ) : null}
          </div>
        </details>
      ) : null}

      {gestiona ? (
        <details className="nn-disclosure nn-mill-task">
          <summary><span>{t("armarTitulo")}</span><small>{t("armarAyuda")}</small></summary>
          <div className="nn-disclosure-body">
          {armables.length === 0 ? (
            <p className="nn-muted">{t("sinArmables")}</p>
          ) : (
            <ArmarLoteForm
              beneficioId={elegido.id}
              recepciones={armables.map((a) => ({
                id: a.recepcion.id,
                etiqueta: t("armableEtiqueta", { origen: a.origen, neto: kg(Number(a.recepcion.netoKg)) }),
                disponibleKg: a.disponibleKg,
                pedidoId: a.pedidoId,
              }))}
            />
          )}
          </div>
        </details>
      ) : null}

      <section className="nn-mill-section">
        <h2>{t("recibidasTitulo")}</h2>
        {recibidas.length === 0 ? (
          <p className="nn-muted">{t("sinRecibidas")}</p>
        ) : (
          <ul className="nn-mill-records">
            {recibidas.map((r) => (
              <li key={r.id} className="nn-mill-record">
                <div className="nn-mill-record-heading"><strong>{r.entrega ? r.entrega.recolector.displayName : (r.proveedor?.name ?? "")}</strong><span>{t("neto", { kg: kg(Number(r.netoKg)) })}</span></div>
                <p>{r.comparacion
                  ? t(`comparacion_${r.comparacion}`, { dif: kg(Number(r.diferenciaKg)), pct: ((Number(r.diferenciaKg) / Number(r.referenciaKg)) * 100).toFixed(1) })
                  : t("sinComparacion")}</p>
                <span className="nn-muted">
                  {t(`estado_${r.estado}`)}
                  {r.motivoRechazo ? `: ${r.motivoRechazo}` : ""}
                  {" · "}
                  {t("recibidaPor", { nombre: r.recibidaPorNombre ?? "?" })}
                  {" · "}
                  {mostrarInstante(r.recibidaAt, null)}
                  {r.veredictoBrix ? ` · ${t("brixVeredicto", { bx: Number(r.brix), veredicto: t(`veredicto_${r.veredictoBrix}`) })}` : ""}
                  {r.nota ? ` · ${r.nota}` : ""}
                  {" · "}
                  {t("fotos", { n: r._count.assets })}
                </span>
                {gestiona && r.estado !== "anulada" ? (
                  <details className="nn-inline-disclosure"><summary>{t("accionesRecepcion")}</summary>
                    <FotoDeRecepcionForm recepcionId={r.id} />
                    <AnularRecepcionForm recepcionId={r.id} />
                    {r.estado === "recibida" ? (
                      <>
                        <p className="nn-muted">{t("disponible", { kg: kg(disponible.get(r.id) ?? 0) })}</p>
                        <MermaForm recepcionId={r.id} disponibleKg={disponible.get(r.id) ?? 0} />
                        {mermas
                          .filter((m) => m.recepcionId === r.id)
                          .map((m) => (
                            <div key={m.id}>
                              <span className="nn-muted">{t("mermaLinea", { kg: kg(Number(m.kg)), motivo: m.motivo })}</span>
                              <AnularMermaForm mermaId={m.id} />
                            </div>
                          ))}
                      </>
                    ) : null}
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
