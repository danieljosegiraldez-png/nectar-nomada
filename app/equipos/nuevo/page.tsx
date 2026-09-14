import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { registrarEquipoFormAction } from "../../actions/equipos";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { getCurrentUser } from "../../../lib/auth/session";
import { sitiosParaRegistrar } from "../../../lib/equipos/equipos";

export const dynamic = "force-dynamic";

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
export default async function EquipoNuevoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, sitios] = await Promise.all([getTranslations("Equipos"), sitiosParaRegistrar(user.userAccountId)]);
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

  return (
    <div>
      <p>
        <Link href="/equipos">← {t("volver")}</Link>
      </p>
      <h1>{t("nuevoTitulo")}</h1>
      <p className="nn-muted">{t("nuevoIntro")}</p>

      <form action={registrarEquipoFormAction}>
        <label>
          {t("campoNombre")}
          <input type="text" name="name" required maxLength={120} />
        </label>

        <label>
          {t("campoTipo")}
          <select name="kind" defaultValue="instrument">
            {["instrument", "vessel", "tool", "machine"].map((k) => (
              <option key={k} value={k}>
                {t(`tipo_${k}`)}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("campoSitio")}
          <select name="locationId" required>
            {sitios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("campoAviso")}
          <input type="number" name="checkAdvisoryHours" min={1} step={1} />
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

        <BotonDeEnvio>{t("botonRegistrar")}</BotonDeEnvio>
      </form>
    </div>
  );
}
