import { CampoNumerico } from "../../../components/CampoNumerico";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { crearModeloFormAction } from "../../../actions/modelos";
import { BotonDeEnvio } from "../../../components/BotonDeEnvio";
import { FilasDeEspecificacion } from "../../../components/equipos/FilasDeEspecificacion";
import { getCurrentUser } from "../../../../lib/auth/session";
import { puedeCrearCompartido } from "../../../../lib/equipos/modelos";
import { sitiosParaRegistrar } from "../../../../lib/equipos/equipos";

export const dynamic = "force-dynamic";

const MATERIALES = ["acero_inoxidable", "plastico_alimentario", "madera", "vidrio_o_ceramica", "otro"] as const;

/**
 * Dar de alta un modelo (spec de catálogos §3.1-3.2).
 *
 * **El dueño es «compartido» o un SITIO**, nunca una organización a secas: la
 * organización la deriva el servicio del sitio elegido, el mismo precedente que
 * `app/equipos/nuevo/page.tsx` ya sienta para el equipo concreto. «Compartido»
 * sólo se ofrece si `puedeCrearCompartido` lo permite — no es una opción más del
 * desplegable, es un permiso de plataforma.
 */
export default async function ModeloNuevoPage({
  searchParams,
}: {
  searchParams: Promise<{ volverA?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, sitios, compartido, sp] = await Promise.all([
    getTranslations("Equipos"),
    sitiosParaRegistrar(user.userAccountId),
    puedeCrearCompartido(user.userAccountId),
    searchParams,
  ]);

  if (!compartido && sitios.length === 0) {
    return (
      <div>
        <p>
          <Link href="/equipos/modelos">← {t("verCatalogo")}</Link>
        </p>
        <h1>{t("modeloNuevo")}</h1>
        <p className="nn-muted">{t("modeloNuevoSinPermiso")}</p>
      </div>
    );
  }

  const volverA = sp.volverA?.startsWith("/equipos/nuevo") ? sp.volverA : null;

  return (
    <div>
      <p>
        <Link href="/equipos/modelos">← {t("verCatalogo")}</Link>
      </p>
      <h1>{t("modeloNuevo")}</h1>

      <form action={crearModeloFormAction}>
        {volverA ? <input type="hidden" name="volverA" value={volverA} /> : null}

        <label>
          {t("campoDueno")}
          <select name="dueno" required defaultValue={compartido ? "compartido" : sitios[0]?.id}>
            {compartido ? <option value="compartido">{t("duenoCompartido")}</option> : null}
            {sitios.map((s) => (
              <option key={s.id} value={s.id}>
                {t("duenoDe", { organizacion: s.organizationName ?? "", sitio: s.name })}
              </option>
            ))}
          </select>
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
          {t("campoFabricante")}
          <input type="text" name="manufacturer" required maxLength={120} />
        </label>

        <label>
          {t("campoModelo")}
          <input type="text" name="modelName" required maxLength={120} />
        </label>

        <label>
          {t("campoMantenimientoRecomendado")}
          <CampoNumerico name="recommendedMaintenanceDays" min={1} step={1} />
        </label>
        <p className="nn-muted">{t("campoMantenimientoAyuda")}</p>

        <label>
          {t("campoProcedencia")}
          <select name="provenanceClass" defaultValue="manufacturer_specification">
            <option value="manufacturer_specification">{t("procedencia_manufacturer_specification")}</option>
            <option value="original_record">{t("procedencia_original_record")}</option>
          </select>
        </label>

        <label>
          {t("referencia")}
          <input type="text" name="sourceReference" maxLength={200} />
        </label>

        <label>
          {t("notas")}
          <textarea name="notes" rows={2} />
        </label>

        <details>
          <summary>{t("capacidadYMaterial")}</summary>
          <label>
            {t("campoCapacidad")}
            <CampoNumerico name="capacityValue" min={0} step="any" />
          </label>
          <label>
            {t("campoUnidadCapacidad")}
            <input type="text" name="capacityUnit" maxLength={12} />
          </label>
          <label>
            {t("campoMaterial")}
            <select name="contactMaterial" defaultValue="">
              <option value="" />
              {MATERIALES.map((m) => (
                <option key={m} value={m}>
                  {t(`material_${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("campoMaterialNota")}
            <textarea name="contactMaterialNote" rows={2} />
          </label>
        </details>

        <details>
          <summary>{t("especificaciones")}</summary>
          <FilasDeEspecificacion />
        </details>

        <BotonDeEnvio>{t("botonCrearModelo")}</BotonDeEnvio>
      </form>
    </div>
  );
}
