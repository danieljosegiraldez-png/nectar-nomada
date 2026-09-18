"use client";

import { CampoNumerico, soltarFocoConLaRueda } from "../CampoNumerico";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { BotonDeEnvio } from "../BotonDeEnvio";
import type { CampoDelProducto, OpcionesDeRecepcion } from "../../../lib/inventario/recepcion";

/** Los campos del producto, en el orden de la pantalla. Copia de `CAMPOS_DEL_PRODUCTO`: el módulo de servidor no se importa aquí. */
const CAMPOS: readonly CampoDelProducto[] = [
  "manufacturer",
  "activeIngredient",
  "sanitaryRegistration",
  "defaultWithdrawalDays",
  "avisarDiasAntes",
  "storageConditions",
  "safetyNotes",
];
const NUMERICOS = new Set<CampoDelProducto>(["defaultWithdrawalDays", "avisarDiasAntes"]);
const LARGOS = new Set<CampoDelProducto>(["storageConditions", "safetyNotes"]);

/**
 * El formulario de recepción del botiquín — botiquín, Tarea 9.
 *
 * Cliente sólo por una razón: lo que se pide del PRODUCTO depende del producto
 * elegido. Uno nuevo pide todos sus campos; uno existente, sólo los que aún no
 * declara —y sólo a quien puede definir productos—. Sus advertencias se enseñan
 * aquí, junto al frasco.
 */
export function RecibirMedicamentoForm({
  action,
  sitios,
  productos,
}: {
  action: (formData: FormData) => Promise<void>;
  sitios: OpcionesDeRecepcion["sitios"];
  productos: OpcionesDeRecepcion["productos"];
}) {
  const t = useTranslations("Inventario");
  const [locationId, setLocationId] = useState(sitios[0]?.id ?? "");
  const sitio = sitios.find((s) => s.id === locationId) ?? null;
  const deLaFinca = productos.filter((p) => p.organizationId === sitio?.organizationId);
  const [materialId, setMaterialId] = useState("");
  const producto = deLaFinca.find((p) => p.id === materialId) ?? null;
  const nuevo = materialId === "__nuevo__";
  const [unit, setUnit] = useState("");

  const aPedir: readonly CampoDelProducto[] = nuevo ? CAMPOS : producto && sitio?.puedeDefinirProducto ? producto.faltan : [];

  return (
    <form action={action} className="nn-form">
      <label>
        {t("campoSitio")}
        <select name="locationId" value={locationId} onChange={(e) => { setLocationId(e.target.value); setMaterialId(""); }} required>
          {sitios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <label>
        {t("campoProducto")}
        <select
          name="materialId"
          value={materialId}
          onChange={(e) => {
            setMaterialId(e.target.value);
            const p = deLaFinca.find((x) => x.id === e.target.value);
            if (p) setUnit(p.defaultUnit);
          }}
          required
        >
          <option value="" disabled>—</option>
          {deLaFinca.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          {sitio?.puedeDefinirProducto ? <option value="__nuevo__">{t("productoNuevo")}</option> : null}
        </select>
      </label>

      {nuevo ? (
        <label>
          {t("campoNombreProducto")}
          <input type="text" name="nuevoNombre" required maxLength={120} />
        </label>
      ) : null}

      {/* Las advertencias del producto, antes que nada del frasco. */}
      {producto && (producto.campos.storageConditions || producto.campos.safetyNotes) ? (
        <div className="nn-alerta nn-alerta-aviso">
          {producto.campos.storageConditions ? <p><strong>{t("p_storageConditions")}:</strong> {producto.campos.storageConditions}</p> : null}
          {producto.campos.safetyNotes ? <p><strong>{t("p_safetyNotes")}:</strong> {producto.campos.safetyNotes}</p> : null}
        </div>
      ) : null}

      {aPedir.length > 0 ? (
        <fieldset>
          <legend>{nuevo ? t("productoCamposNuevo") : t("productoCamposFaltan")}</legend>
          {aPedir.map((c) => (
            <label key={c}>
              {t(`p_${c}`)}
              {LARGOS.has(c) ? (
                <textarea name={`p_${c}`} rows={2} />
              ) : (
                <input
                  type={NUMERICOS.has(c) ? "number" : "text"}
                  onWheel={soltarFocoConLaRueda}
                  name={`p_${c}`}
                  {...(NUMERICOS.has(c) ? { min: 0, step: 1, inputMode: "numeric" as const } : {})}
                />
              )}
            </label>
          ))}
          <p className="nn-muted">{t("productoCamposAyuda")}</p>
        </fieldset>
      ) : null}

      <fieldset>
        <legend>{t("frascoLeyenda")}</legend>
        <label>
          {t("campoLoteDelFabricante")}
          <input type="text" name="batchLabel" required maxLength={120} />
        </label>
        <label>
          {t("campoVence")}
          <input type="date" name="expiresAt" />
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <label style={{ flex: 1 }}>
            {t("campoCantidad")}
            <CampoNumerico name="quantity" min={0} step="any" inputMode="decimal" />
          </label>
          <label style={{ flex: 1 }}>
            {t("campoUnidad")}
            <input type="text" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} required />
          </label>
        </div>
        <p className="nn-muted">{t("campoCantidadAyuda")}</p>
        <label>
          {t("campoPresentacion")}
          <input type="text" name="presentation" />
        </label>
        <label>
          {t("campoProveedor")}
          <input type="text" name="supplier" />
        </label>
        <label>
          {t("campoDireccionProveedor")}
          <input type="text" name="supplierAddress" />
        </label>
        <label>
          {t("campoFactura")}
          <input type="text" name="invoiceReference" />
        </label>
        <label>
          {t("campoNotas")}
          <textarea name="notes" rows={2} />
        </label>
      </fieldset>

      <BotonDeEnvio>{t("botonRecibir")}</BotonDeEnvio>
    </form>
  );
}
