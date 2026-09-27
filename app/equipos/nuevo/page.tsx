import { CampoNumerico } from "../../components/CampoNumerico";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { registrarEquipoFormAction } from "../../actions/equipos";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { SelectorDeModelo, type ModeloOpcion, type ModelosPorSitioYTipo } from "../../components/equipos/SelectorDeModelo";
import { getCurrentUser } from "../../../lib/auth/session";
import { proveedoresPosibles, sitiosParaRegistrar } from "../../../lib/equipos/equipos";
import { puedeCrearProveedorDeEquipos } from "../../../lib/equipos/proveedores";
import { listarModelos } from "../../../lib/equipos/modelos";

export const dynamic = "force-dynamic";

const TIPOS = ["instrument", "vessel", "tool", "machine"] as const;

function paraOpcion(m: { id: string; manufacturer: string; modelName: string; recommendedMaintenanceDays: number | null }): ModeloOpcion {
  return { id: m.id, manufacturer: m.manufacturer, modelName: m.modelName, recommendedMaintenanceDays: m.recommendedMaintenanceDays };
}

/**
 * Registrar un equipo.
 *
 * **La organización NO se pide: sale del sitio elegido.** Un campo menos, y uno
 * que además se podía contestar mal — un fermentador en Finca Rosina pertenece a
 * Finca Rosina, y dejar elegir las dos cosas invita a una combinación imposible
 * que después nadie sabe leer.
 *
 * **Y el sitio es obligatorio, a propósito.** Un equipo sin ubicar sólo lo puede
 * tocar quien manda en toda la plataforma, porque su ámbito de permisos no cae en
 * ninguna hoja. Pedirlo aquí evita registrar algo que el jefe del beneficio no
 * podría volver a abrir.
 */
export default async function EquipoNuevoPage({
  searchParams,
}: {
  searchParams: Promise<{ modelo?: string; proveedor?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, sitios, proveedores, { compartidos, propios }, puedeCrearProveedor, sp] = await Promise.all([
    getTranslations("Equipos"),
    sitiosParaRegistrar(user.userAccountId),
    proveedoresPosibles(user.userAccountId),
    listarModelos(user.userAccountId),
    // Dar de alta un proveedor es de ámbito de plataforma (ADR-188, decisión del 2026-09-27), así
    // que casi nadie de los que registran equipo puede: el enlace sólo se ofrece a quien sí.
    puedeCrearProveedorDeEquipos(user.userAccountId),
    searchParams,
  ]);
  // Sin un solo sitio donde pueda registrar, la página no ofrece un formulario
  // que iba a fallar al guardar: dice por qué y devuelve a la lista.
  if (sitios.length === 0) {
    return (
      <div>
        <p>
          <Link href="/equipos">← {t("volver")}</Link>
        </p>
        <h1>{t("nuevoTitulo")}</h1>
        <p className="nn-muted">{t("nuevoSinSitios")}</p>
      </div>
    );
  }

  // Una sola llamada a `listarModelos` y un filtro en memoria por sitio y tipo
  // (spec de catálogos §3.3), en vez de N×4 consultas con `modelosParaElegir` —
  // una por cada combinación de sitio y tipo que el desplegable pudiera pedir.
  const modelosPorSitio: ModelosPorSitioYTipo = {};
  for (const sitio of sitios) {
    const porTipo: ModelosPorSitioYTipo[string] = {};
    for (const kind of TIPOS) {
      porTipo[kind] = {
        compartidos: compartidos.filter((m) => m.kind === kind && !m.retiredAt).map(paraOpcion),
        propios: propios
          .filter((m) => m.kind === kind && !m.retiredAt && m.organizationId === sitio.organizationId)
          .map(paraOpcion),
      };
    }
    modelosPorSitio[sitio.id] = porTipo;
  }

  // Vuelta desde «crea el modelo» (`/equipos/modelos/nuevo?volverA=...`): sólo se
  // acepta la forma de un id de la base, nunca texto libre en la pantalla.
  const modeloPreseleccionado = sp.modelo && /^[0-9a-f-]+$/i.test(sp.modelo) ? sp.modelo : undefined;
  // Vuelta desde «crea el proveedor» (`/equipos/proveedores/nuevo?volverA=...`): mismo trato que el
  // modelo. Se comprueba además que esté entre los que esta persona puede elegir, para no dejar
  // seleccionado en el desplegable un id que el servidor rechazaría al guardar.
  const proveedorPreseleccionado =
    sp.proveedor && /^[0-9a-f-]+$/i.test(sp.proveedor) && proveedores.some((x) => x.id === sp.proveedor)
      ? sp.proveedor
      : "";
  // El código viene de la URL: sólo se acepta la forma que las acciones de
  // app/actions/equipos.ts producen, nunca texto libre en la pantalla.
  const codigoError = sp.error && /^[a-z_]+$/.test(sp.error) ? sp.error : null;

  return (
    <div>
      <p>
        <Link href="/equipos">← {t("volver")}</Link>
      </p>
      <h1>{t("nuevoTitulo")}</h1>
      <p className="nn-muted">{t("nuevoIntro")}</p>

      {codigoError ? (
        <p className="nn-error" role="alert">
          {codigoError === "codigo_interno_duplicado"
            ? t("errorCodigoInternoDuplicado")
            : codigoError === "modelo_no_elegible" ||
                codigoError === "modelo_de_otro_tipo" ||
                codigoError === "modelo_retirado" ||
                codigoError === "modelo_no_encontrado"
              ? t("errorModeloNoElegible")
              : codigoError === "forbidden" || codigoError === "sitio_no_gestionable"
                ? t("errorSinPermiso")
                : t("errorModeloGenerico", { codigo: codigoError })}
        </p>
      ) : null}

      <form action={registrarEquipoFormAction}>
        <label>
          {t("campoNombre")}
          <input type="text" name="name" required maxLength={120} />
        </label>

        <label>
          {t("campoTipo")}
          <select name="kind" defaultValue="instrument">
            {TIPOS.map((k) => (
              <option key={k} value={k}>
                {t(`tipo_${k}`)}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("campoSitio")}
          <select name="locationId" required defaultValue={sitios[0]!.id}>
            {sitios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("campoAviso")}
          <CampoNumerico name="checkAdvisoryHours" min={1} step={1} />
        </label>
        <p className="nn-muted">{t("campoAvisoAyuda")}</p>

        <label>
          {t("campoProcedencia")}
          <select name="provenanceClass" defaultValue="original_record">
            <option value="original_record">{t("procedencia_original_record")}</option>
            <option value="manufacturer_specification">{t("procedencia_manufacturer_specification")}</option>
          </select>
        </label>

        <label>
          {t("campoNota")}
          <textarea name="acquisitionNote" rows={2} />
        </label>

        <details>
          <summary>{t("masDatos")}</summary>
          <SelectorDeModelo
            modelos={modelosPorSitio}
            etiquetas={{
              campo: t("campoModeloDeEquipo"),
              ninguno: t("modeloNinguno"),
              compartidos: t("modelosCompartidos"),
              propios: t("modelosPropios"),
              crear: t("modeloCrear"),
            }}
            kindInicial="instrument"
            locationIdInicial={sitios[0]!.id}
            modeloInicial={modeloPreseleccionado}
          />
          <label>
            {t("campoSerie")}
            <input type="text" name="serialNumber" maxLength={120} />
          </label>
          <label>
            {t("campoCodigoInterno")}
            <input type="text" name="internalCode" maxLength={60} />
          </label>
          <label>
            {t("campoProveedor")}
            <select name="supplierOrganizationId" defaultValue={proveedorPreseleccionado}>
              <option value="">{t("sinProveedor")}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {puedeCrearProveedor ? (
            <p className="nn-muted">
              <Link href="/equipos/proveedores/nuevo?volverA=/equipos/nuevo">{t("proveedorCrear")}</Link>
            </p>
          ) : null}
          <label>
            {t("campoGarantia")}
            <input type="date" name="warrantyUntil" />
          </label>
        </details>

        <BotonDeEnvio>{t("botonRegistrar")}</BotonDeEnvio>
      </form>
    </div>
  );
}
