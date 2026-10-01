"use client";

import { CampoNumerico, soltarFocoConLaRueda } from "../CampoNumerico";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { BotonDeEnvio } from "../BotonDeEnvio";
import type { OpcionesDeRecepcion } from "../../../lib/inventario/recepcion";
// **Del módulo puro, no del de servidor.** Aquí había una copia a mano de las cuatro listas, y su
// propio comentario lo decía. Derivó en cuanto el producto ganó campos: ver `camposDeProducto.ts`.
import {
  CAMPOS_DECIMALES,
  CAMPOS_DE_OPCIONES,
  CAMPOS_LARGOS,
  CAMPOS_NUMERICOS,
  VALORES_DE_OPCIONES,
  camposDe,
  type CampoDelProducto,
  type ClaseDeProducto,
} from "../../../lib/inventario/camposDeProducto";
import { PLAGAS } from "../../../lib/traceability/plagas";


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
  clase,
}: {
  action: (formData: FormData) => Promise<void>;
  sitios: OpcionesDeRecepcion["sitios"];
  productos: OpcionesDeRecepcion["productos"];
  clase: ClaseDeProducto;
}) {
  const t = useTranslations("Inventario");
  const tObjetivo = useTranslations("Traceability");
  const [locationId, setLocationId] = useState(sitios[0]?.id ?? "");
  const sitio = sitios.find((s) => s.id === locationId) ?? null;
  const deLaFinca = productos.filter((p) => p.organizationId === sitio?.organizationId);
  const [materialId, setMaterialId] = useState("");
  const producto = deLaFinca.find((p) => p.id === materialId) ?? null;
  const nuevo = materialId === "__nuevo__";
  const [unit, setUnit] = useState("");

  const aPedir: readonly CampoDelProducto[] = nuevo ? camposDe(clase) : producto && sitio?.puedeDefinirProducto ? producto.faltan : [];
  /**
   * Las plagas se ofrecen con la misma regla de hueco que los demás campos: para un producto nuevo,
   * y para uno existente que todavía no declara ninguna. Una lista vacía es «nadie lo declaró» —el
   * servicio no la sobrescribe cuando ya hay algo, así que ofrecerla ahí sólo confundiría.
   */
  const ofrecerPlagas =
    clase === "fitosanitario" && (nuevo || (producto !== null && sitio?.puedeDefinirProducto === true && producto.plagas.length === 0));

  return (
    <form action={action} className="nn-form">
      <input type="hidden" name="clase" value={clase} />
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

      {aPedir.length > 0 || ofrecerPlagas ? (
        <fieldset>
          <legend>{nuevo ? t("productoCamposNuevo") : t("productoCamposFaltan")}</legend>
          {aPedir.map((c) => (
            <label key={c}>
              {t(`p_${c}`)}
              {CAMPOS_LARGOS.has(c) ? (
                <textarea name={`p_${c}`} rows={2} />
              ) : CAMPOS_DE_OPCIONES.has(c) ? (
                <select name={`p_${c}`} defaultValue="">
                  {/* Vacío es «no lo declaró», y es el valor por defecto a propósito: un desplegable
                      que llega preseleccionado convierte el silencio en una respuesta. */}
                  <option value="">—</option>
                  {(VALORES_DE_OPCIONES[c] ?? []).map((o) => (
                    // Dos familias de rótulo: el uso del producto («preventivo»/«control») y las
                    // respuestas sí/no. Se eligen por el campo, no por el valor, para que dos campos
                    // con un valor homónimo no se roben la traducción.
                    <option key={o} value={o}>{c === "plantProtectionUse" ? t(`uso_${o}`) : t(`opcion_${o}`)}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={CAMPOS_NUMERICOS.has(c) ? "number" : "text"}
                  onWheel={soltarFocoConLaRueda}
                  name={`p_${c}`}
                  {...(CAMPOS_DECIMALES.has(c)
                    ? // Una dosis lleva decimales —«1,5 L/ha»—: con `step={1}` el navegador rechaza
                      // la mitad de las dosis reales antes de que el servidor las vea.
                      { min: 0, step: "any", inputMode: "decimal" as const }
                    : CAMPOS_NUMERICOS.has(c)
                      ? { min: 0, step: 1, inputMode: "numeric" as const }
                      : {})}
                />
              )}
            </label>
          ))}
          {ofrecerPlagas ? (
            <fieldset>
              <legend>{t("p_plantProtectionTargets")}</legend>
              <p className="nn-muted">{t("p_plantProtectionTargetsAyuda")}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 1rem" }}>
                {PLAGAS.map((plaga) => (
                  <label key={plaga} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <input type="checkbox" name="p_plantProtectionTargets" value={plaga} />
                    {tObjetivo(`manejoTarget_${plaga}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
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
