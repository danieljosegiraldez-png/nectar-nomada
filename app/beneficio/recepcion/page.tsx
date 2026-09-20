import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
import { COOKIE_BENEFICIO, beneficioDeLaPagina } from "../../../lib/traceability/beneficioElegido";
import { pendientesDeBeneficio, recepcionesDeBeneficio } from "../../../lib/traceability/recepcionesDeCereza";
import { pedidosDeBeneficio } from "../../../lib/traceability/pedidosDeCereza";
import { proveedoresDeCereza } from "../../../lib/traceability/proveedoresDeCereza";
import { mostrarInstante } from "../../../lib/time/mostrarInstante";
import { BeneficioElegido } from "../../components/beneficio/BeneficioElegido";
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
      <div>
        <h1>{t("titulo")}</h1>
        {beneficios.length ? (
          <BeneficioElegido beneficios={beneficios} elegido={null} volver="/beneficio/recepcion" />
        ) : (
          <p className="nn-muted">{t("sinBeneficios")}</p>
        )}
      </div>
    );
  }

  const gestiona = granted.has("lot:manage");
  const [pendientes, recibidas, pedidos, proveedores] = await Promise.all([
    pendientesDeBeneficio(user.userAccountId, elegido.id),
    recepcionesDeBeneficio(user.userAccountId, elegido.id, 24),
    pedidosDeBeneficio(user.userAccountId, elegido.id),
    gestiona ? proveedoresDeCereza(user.userAccountId) : Promise.resolve([]),
  ]);
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
    <div>
      <p>
        <Link href="/beneficio">{t("volver")}</Link>
      </p>
      <h1>{t("titulo")}</h1>
      <BeneficioElegido beneficios={beneficios} elegido={elegido} volver="/beneficio/recepcion" />
      <p className="nn-muted">{t("intro")}</p>

      <section className="nn-section">
        <h2>{t("pendientesTitulo")}</h2>
        {pendientes.length === 0 ? (
          <p className="nn-muted">{t("sinPendientes")}</p>
        ) : (
          <ul>
            {pendientes.map((e) => (
              <li key={e.id}>
                <strong>{e.recolector.displayName}</strong>
                {" — "}
                {e.jornada.fincaSite.name}, {origen(e)}
                {" — "}
                {t("kgFinca", { kg: kg(Number(e.pesoFincaKg)) })}
                {" — "}
                {mostrarInstante(e.enviadaAt, null)}
                {gestiona ? (
                  <RecibirCerezaForm beneficioId={elegido.id} entregaId={e.id} fuenteDeLaEntrega={`F:${e.jornada.fincaSite.id}`} pedidos={abiertos} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {gestiona ? (
        <section className="nn-section">
          <h2>{t("deFueraTitulo")}</h2>
          <p className="nn-muted">{t("deFueraAyuda")}</p>
          {proveedores.length ? (
            <RecibirCerezaForm beneficioId={elegido.id} proveedores={proveedores} pedidos={abiertos} />
          ) : (
            <p className="nn-muted">{t("sinProveedores")}</p>
          )}
          {granted.has("cherry_supplier:create") ? (
            <>
              <h3>{t("nuevoProveedorTitulo")}</h3>
              <NuevoProveedorForm />
            </>
          ) : null}
        </section>
      ) : null}

      <section className="nn-section">
        <h2>{t("recibidasTitulo")}</h2>
        {recibidas.length === 0 ? (
          <p className="nn-muted">{t("sinRecibidas")}</p>
        ) : (
          <ul>
            {recibidas.map((r) => (
              <li key={r.id}>
                <strong>{r.entrega ? r.entrega.recolector.displayName : (r.proveedor?.name ?? "")}</strong>
                {" — "}
                {t("neto", { kg: kg(Number(r.netoKg)) })}
                {" — "}
                {r.comparacion
                  ? t(`comparacion_${r.comparacion}`, { dif: kg(Number(r.diferenciaKg)), pct: ((Number(r.diferenciaKg) / Number(r.referenciaKg)) * 100).toFixed(1) })
                  : t("sinComparacion")}
                <br />
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
                  <>
                    <FotoDeRecepcionForm recepcionId={r.id} />
                    <AnularRecepcionForm recepcionId={r.id} />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
