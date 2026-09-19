import { CampoNumerico } from "../../../components/CampoNumerico";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  declararEspecificacionFormAction,
  editarModeloFormAction,
  retirarEspecificacionFormAction,
  retirarModeloFormAction,
} from "../../../actions/modelos";
import { BotonDeEnvio } from "../../../components/BotonDeEnvio";
import { DocumentoUploadForm } from "../../../components/equipos/DocumentoUploadForm";
import { getCurrentUser } from "../../../../lib/auth/session";
import { documentosDeModelo } from "../../../../lib/equipos/documentos";
import { ModeloError, modeloParaFicha, puedeEditarModelo } from "../../../../lib/equipos/modelos";

export const dynamic = "force-dynamic";

const MATERIALES = ["acero_inoxidable", "plastico_alimentario", "madera", "vidrio_o_ceramica", "otro"] as const;

/**
 * La ficha de un modelo (spec de catálogos §3.1-3.2): sus especificaciones
 * vigentes, sus documentos y los equipos concretos que lo usan.
 *
 * Fuera de lo visible da 404, igual que `app/equipos/[id]/page.tsx`: la
 * ausencia de permiso nunca se distingue de la ausencia del registro.
 */
export default async function ModeloPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  let modelo;
  try {
    modelo = await modeloParaFicha(user.userAccountId, id);
  } catch (error) {
    if (error instanceof ModeloError) notFound();
    throw error;
  }

  const [t, sp, puedeEditar, documentos] = await Promise.all([
    getTranslations("Equipos"),
    searchParams,
    puedeEditarModelo(user.userAccountId, id),
    documentosDeModelo(user.userAccountId, id),
  ]);

  const tieneCapacidad = modelo.capacityValue !== null || modelo.contactMaterial !== null;

  return (
    <div>
      <p>
        <Link href="/equipos/modelos">← {t("verCatalogo")}</Link>
      </p>
      <span className="nn-badge">{t(`tipo_${modelo.kind}`)}</span>
      <h1>
        {modelo.manufacturer} {modelo.modelName}
      </h1>
      {modelo.retiredAt ? <p className="nn-muted">{t("modeloRetirado")}</p> : null}

      {sp.ok === "creado" ? (
        <p className="nn-ok" role="status">
          {t("okCreado")}
        </p>
      ) : null}
      {sp.ok === "editado" ? (
        <p className="nn-ok" role="status">
          {t("okEditado")}
        </p>
      ) : null}
      {sp.ok === "retirado" ? (
        <p className="nn-ok" role="status">
          {t("okRetirado")}
        </p>
      ) : null}

      <p>
        <strong>{t("campoDueno")}:</strong> {modelo.organization ? modelo.organization.name : t("duenoCompartido")}
      </p>
      <p>
        <strong>{t("campoMantenimientoRecomendado")}:</strong>{" "}
        {modelo.recommendedMaintenanceDays
          ? t("mantenimientoCada", { dias: modelo.recommendedMaintenanceDays })
          : t("mantenimientoSinDato")}
      </p>

      {tieneCapacidad ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("capacidadYMaterial")}</h2>
          {modelo.capacityValue !== null ? (
            <p>
              {t("campoCapacidad")}: {String(modelo.capacityValue)} {modelo.capacityUnit}
            </p>
          ) : null}
          {modelo.contactMaterial ? (
            <p>
              {t("campoMaterial")}: {t(`material_${modelo.contactMaterial}`)}
              {modelo.contactMaterialNote ? ` — ${modelo.contactMaterialNote}` : null}
            </p>
          ) : null}
        </section>
      ) : null}

      <section style={{ marginTop: "1.5rem" }}>
        <h2>{t("especificaciones")}</h2>
        {modelo.specs.length === 0 ? (
          <p className="nn-muted">{t("modelosVacio")}</p>
        ) : (
          <table className="nn-table">
            <thead>
              <tr>
                <th>{t("specMagnitud")}</th>
                <th>{t("specUnidad")}</th>
                <th>{t("specMin")}</th>
                <th>{t("specMax")}</th>
                <th>{t("specResolucion")}</th>
                <th>{t("specPrecision")}</th>
                {puedeEditar ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {modelo.specs.map((s) => (
                <tr key={s.id}>
                  <td>{s.quantity}</td>
                  <td>{s.unit}</td>
                  <td>{s.rangeMin !== null ? String(s.rangeMin) : ""}</td>
                  <td>{s.rangeMax !== null ? String(s.rangeMax) : ""}</td>
                  <td>{s.resolution !== null ? String(s.resolution) : ""}</td>
                  <td>{s.accuracyAbs !== null ? String(s.accuracyAbs) : ""}</td>
                  {puedeEditar ? (
                    <td>
                      <form action={retirarEspecificacionFormAction}>
                        <input type="hidden" name="modelId" value={modelo.id} />
                        <input type="hidden" name="specId" value={s.id} />
                        <BotonDeEnvio className="nn-button-quiet">{t("specRetirar")}</BotonDeEnvio>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {puedeEditar && modelo.kind === "instrument" ? (
          <form action={declararEspecificacionFormAction} style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="modelId" value={modelo.id} />
            <label>
              {t("specMagnitud")}
              <input type="text" name="quantity" required maxLength={40} />
            </label>
            <label>
              {t("specUnidad")}
              <input type="text" name="unit" required maxLength={12} />
            </label>
            <label>
              {t("specMin")}
              <CampoNumerico step="any" name="rangeMin" />
            </label>
            <label>
              {t("specMax")}
              <CampoNumerico step="any" name="rangeMax" />
            </label>
            <label>
              {t("specResolucion")}
              <CampoNumerico step="any" name="resolution" />
            </label>
            <label>
              {t("specPrecision")}
              <CampoNumerico step="any" name="accuracyAbs" />
            </label>
            <BotonDeEnvio>{t("specAnadir")}</BotonDeEnvio>
          </form>
        ) : null}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>{t("documentos")}</h2>
        {documentos.length === 0 ? (
          <p className="nn-muted">{t("modelosVacio")}</p>
        ) : (
          <ul>
            {documentos.map((d) => (
              <li key={d.id}>
                <a href={d.url} target="_blank" rel="noreferrer">
                  {d.originalFilename ?? d.id}
                </a>
              </li>
            ))}
          </ul>
        )}
        {puedeEditar ? <DocumentoUploadForm destino={{ tipo: "modelo", modelId: modelo.id }} /> : null}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>{t("modeloEquipos")}</h2>
        {modelo.equipment.length === 0 ? (
          <p className="nn-muted">{t("modelosVacio")}</p>
        ) : (
          <ul>
            {modelo.equipment.map((e) => (
              <li key={e.id}>
                <Link href={`/equipos/${e.id}`}>{e.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {puedeEditar ? (
        <details style={{ marginTop: "1.5rem" }}>
          <summary>{t("botonEditarModelo")}</summary>
          <form action={editarModeloFormAction}>
            <input type="hidden" name="modelId" value={modelo.id} />
            <label>
              {t("campoFabricante")}
              <input type="text" name="manufacturer" required maxLength={120} defaultValue={modelo.manufacturer} />
            </label>
            <label>
              {t("campoModelo")}
              <input type="text" name="modelName" required maxLength={120} defaultValue={modelo.modelName} />
            </label>
            <label>
              {t("campoMantenimientoRecomendado")}
              <CampoNumerico
                name="recommendedMaintenanceDays"
                min={1}
                step={1}
                defaultValue={modelo.recommendedMaintenanceDays ?? undefined}
              />
            </label>
            <p className="nn-muted">{t("campoMantenimientoAyuda")}</p>
            <label>
              {t("campoProcedencia")}
              <select name="provenanceClass" defaultValue={modelo.provenanceClass}>
                <option value="manufacturer_specification">{t("procedencia_manufacturer_specification")}</option>
                <option value="original_record">{t("procedencia_original_record")}</option>
              </select>
            </label>
            <label>
              {t("referencia")}
              <input type="text" name="sourceReference" maxLength={200} defaultValue={modelo.sourceReference ?? ""} />
            </label>
            <label>
              {t("notas")}
              <textarea name="notes" rows={2} defaultValue={modelo.notes ?? ""} />
            </label>

            {modelo.kind === "vessel" || modelo.kind === "machine" ? (
              <details>
                <summary>{t("capacidadYMaterial")}</summary>
                <label>
                  {t("campoCapacidad")}
                  <CampoNumerico
                    name="capacityValue"
                    min={0}
                    step="any"
                    defaultValue={modelo.capacityValue !== null ? String(modelo.capacityValue) : undefined}
                  />
                </label>
                <label>
                  {t("campoUnidadCapacidad")}
                  <input type="text" name="capacityUnit" maxLength={12} defaultValue={modelo.capacityUnit ?? ""} />
                </label>
                <label>
                  {t("campoMaterial")}
                  <select name="contactMaterial" defaultValue={modelo.contactMaterial ?? ""}>
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
                  <textarea name="contactMaterialNote" rows={2} defaultValue={modelo.contactMaterialNote ?? ""} />
                </label>
              </details>
            ) : null}

            <BotonDeEnvio>{t("botonEditarModelo")}</BotonDeEnvio>
          </form>

          {!modelo.retiredAt ? (
            <form action={retirarModeloFormAction} style={{ marginTop: "0.75rem" }}>
              <input type="hidden" name="modelId" value={modelo.id} />
              <BotonDeEnvio className="nn-button-quiet">{t("botonRetirarModelo")}</BotonDeEnvio>
            </form>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
