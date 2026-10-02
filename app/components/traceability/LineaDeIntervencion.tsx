"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { origenDeLaCarencia } from "../../../lib/traceability/origenDeLaCarencia";
import { soltarFocoConLaRueda } from "../CampoNumerico";

export interface ProductoOption {
  id: string;
  name: string;
  defaultWithdrawalDays: number | null;
  defaultReentryHours: number | null;
  safetyNotes: string | null;
  storageConditions: string | null;
  /** Lo que el producto declara, del alta en inventario (PR #554). Para PROPONER, no para escribir. */
  plantProtectionUse: "preventivo" | "control" | null;
  doseMin: number | null;
  doseMax: number | null;
  doseUnit: string | null;
  plantProtectionTargets: readonly string[];
  /** **Nulo es «nadie lo declaró»**, no «no daña». El aviso sólo salta con `true`. */
  harmfulToPollinators: boolean | null;
  lotes: readonly { id: string; batchLabel: string; expiresAt: Date | null }[];
}

export interface ValoresDeLinea {
  materialId: string;
  consumableLotId: string | null;
  quantity: number | null;
  unit: string | null;
  withdrawalDays: number | null;
  reentryHours: number | null;
}

/**
 * Una línea de producto del formulario de intervención — Tarea 8, spec §5.
 * Partido de `IntervencionForm` porque el formulario entero es grande, no
 * porque haga falta reutilizarlo en otro sitio.
 *
 * **Al elegir un producto** enseña sus `safetyNotes`/`storageConditions` y
 * PRECARGA carencia y reentrada con los valores del producto — visibles y
 * editables, nunca escritos por el servidor (brief, Restricciones globales).
 * El `key={materialId}` de los dos campos numéricos fuerza el remonte: sin
 * él, `defaultValue` no se actualiza sola al cambiar de producto porque React
 * sólo la lee una vez.
 */
export function LineaDeIntervencion({
  indice,
  valores,
  productos,
  target,
  enFloracion,
}: {
  indice: number;
  valores: ValoresDeLinea;
  productos: readonly ProductoOption[];
  /** El objetivo elegido arriba. Llega para poder avisar si el producto no declara cubrirlo. */
  target?: string;
  /**
   * ¿Hay floración anotada que aplique a la fecha y los bloques elegidos arriba? Lo decide
   * `hayFloracion` en el formulario, porque la fecha vive ahí y el operario puede corregirla.
   */
  enFloracion?: boolean;
}) {
  const t = useTranslations("Traceability");
  const [materialId, setMaterialId] = useState(valores.materialId);
  const producto = productos.find((p) => p.id === materialId) ?? null;
  const esElProductoOriginal = materialId === valores.materialId;
  const hoy = new Date();

  // Ronda de arreglos 1 (importante #1): el valor que el campo enseña de
  // verdad —el mismo que se le pasa como `defaultValue` más abajo—, no «el
  // producto tiene un default». Con el material sin cambiar, ese valor es el
  // YA DECLARADO en la línea, que puede diferir del default del producto.
  const valorMostradoDeCarencia = esElProductoOriginal ? (valores.withdrawalDays ?? null) : (producto?.defaultWithdrawalDays ?? null);
  const valorMostradoDeReentrada = esElProductoOriginal ? (valores.reentryHours ?? null) : (producto?.defaultReentryHours ?? null);
  const origenDeCarencia = producto
    ? origenDeLaCarencia(valorMostradoDeCarencia, producto.defaultWithdrawalDays, esElProductoOriginal)
    : null;
  const origenDeReentrada = producto
    ? origenDeLaCarencia(valorMostradoDeReentrada, producto.defaultReentryHours, esElProductoOriginal)
    : null;
  // La UNIDAD se precarga del producto con la misma regla que la carencia: visible, editable, y
  // nunca escrita por el servidor. Es un valor que Daniel dio —«ml/L», «L/ha»—, no una invención.
  const valorMostradoDeUnidad = esElProductoOriginal ? (valores.unit ?? null) : (producto?.doseUnit ?? null);

  /**
   * **La dosis se propone como RANGO y no como número.** La etiqueta da mínimo y máximo; elegir un
   * valor de dentro —la media, el mínimo— sería inventarle una precisión que nadie declaró, que es
   * lo que este repositorio prohíbe. Así que se enseña lo que dice la etiqueta y decide el operario.
   */
  const dosisDeclarada = (() => {
    if (!producto) return null;
    const { doseMin: min, doseMax: max, doseUnit: unidad } = producto;
    if (min == null && max == null) return null;
    const cifra = min != null && max != null ? (min === max ? `${min}` : `${min}–${max}`) : `${min ?? max}`;
    return unidad ? `${cifra} ${unidad}` : cifra;
  })();

  /**
   * **El aviso: este producto no declara cubrir el objetivo elegido.** No bloquea nada —puede ser
   * deliberado, y «otro» no es una plaga concreta—, sólo lo dice.
   *
   * Con la lista VACÍA no avisa: vacío es «nadie lo declaró», no «no cubre ninguna». Avisar ahí
   * convertiría un dato que falta en una afirmación, y además pondría un aviso en todos los
   * productos hasta que alguien rellene el catálogo — que es cómo se enseña a ignorar un aviso.
   */
  const noDeclaraElObjetivo =
    producto != null &&
    target != null &&
    target !== "otro" &&
    producto.plantProtectionTargets.length > 0 &&
    !producto.plantProtectionTargets.includes(target);

  /**
   * **El aviso: este producto daña polinizadores y hay floración.** Hermano del de arriba y con la
   * misma disciplina del nulo — sólo salta con `true`, porque `null` es «nadie lo declaró» y avisar
   * ahí pondría el aviso en todos los productos hasta que alguien rellene el catálogo.
   *
   * **No bloquea**: §32 deja que un umbral PROPONGA, nunca que AFIRME. Quien está delante de la
   * parcela puede tener una razón, y el registro queda tal como lo escriba.
   */
  const dañaEnFloracion = producto?.harmfulToPollinators === true && enFloracion === true;

  const rotuloDeOrigen = (origen: ReturnType<typeof origenDeLaCarencia> | null) => {
    if (origen === "del_producto") return t("manejoOriginFromProduct");
    if (origen === "indicada_al_registrar") return t("manejoOriginDeclaredAtEntry");
    return null;
  };

  return (
    <fieldset className="nn-card" style={{ marginBottom: "0.75rem" }}>
      <legend>{t("manejoLineNumber", { n: indice + 1 })}</legend>

      <div className="nn-field">
        <label htmlFor={`linea-${indice}-material`}>{t("manejoProductLabel")}</label>
        <select
          id={`linea-${indice}-material`}
          name={`lineas[${indice}].materialId`}
          required
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
        >
          <option value="" disabled>
            {t("manejoProductChoose")}
          </option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {producto?.safetyNotes ? (
        <p className="nn-detail-meta">
          <strong>{t("manejoSafetyNotesLabel")}:</strong> {producto.safetyNotes}
        </p>
      ) : null}
      {producto?.storageConditions ? (
        <p className="nn-detail-meta">
          {t("manejoStorageConditionsLabel")}: {producto.storageConditions}
        </p>
      ) : null}
      {dosisDeclarada ? (
        <p className="nn-detail-meta">
          <strong>{t("manejoDoseLabel")}:</strong> {dosisDeclarada}
          {producto?.plantProtectionUse ? ` · ${t(`manejoUse_${producto.plantProtectionUse}`)}` : ""}
        </p>
      ) : null}
      {noDeclaraElObjetivo ? (
        <p className="nn-alerta nn-alerta-aviso">{t("manejoTargetNoDeclarado", { producto: producto!.name })}</p>
      ) : null}
      {dañaEnFloracion ? (
        <p className="nn-alerta nn-alerta-aviso">{t("manejoAvisoFloracion", { producto: producto!.name })}</p>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div className="nn-field" style={{ flex: "1 1 120px" }}>
          <label htmlFor={`linea-${indice}-quantity`}>{t("manejoQuantityLabel")}</label>
          <input
            id={`linea-${indice}-quantity`}
            name={`lineas[${indice}].quantity`}
            type="number"
            step="0.001"
            min={0}
            defaultValue={valores.quantity ?? ""}
            onWheel={soltarFocoConLaRueda}
          />
        </div>
        <div className="nn-field" style={{ flex: "1 1 100px" }}>
          <label htmlFor={`linea-${indice}-unit`}>{t("manejoUnitLabel")}</label>
          {/* `key` fuerza el remonte al cambiar de producto: sin él `defaultValue` no se actualiza,
              por el mismo motivo que los dos campos de carencia de abajo. */}
          <input
            key={materialId}
            id={`linea-${indice}-unit`}
            name={`lineas[${indice}].unit`}
            type="text"
            defaultValue={valorMostradoDeUnidad ?? ""}
          />
          {producto && valorMostradoDeUnidad && !esElProductoOriginal && producto.doseUnit === valorMostradoDeUnidad ? (
            <p className="nn-muted">{t("manejoOriginFromProduct")}</p>
          ) : null}
        </div>
      </div>

      {producto && producto.lotes.length > 0 ? (
        <div className="nn-field">
          <label htmlFor={`linea-${indice}-lote`}>{t("manejoLotLabel")}</label>
          <select id={`linea-${indice}-lote`} name={`lineas[${indice}].consumableLotId`} defaultValue={valores.consumableLotId ?? ""}>
            <option value="">{t("manejoLotNone")}</option>
            {producto.lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.batchLabel}
                {l.expiresAt && l.expiresAt < hoy ? ` — ${t("manejoLotExpired")}` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div className="nn-field" style={{ flex: "1 1 160px" }}>
          <label htmlFor={`linea-${indice}-withdrawal`}>
            {t("manejoWithdrawalLabel")}
            {rotuloDeOrigen(origenDeCarencia) ? <span className="nn-muted"> — {rotuloDeOrigen(origenDeCarencia)}</span> : null}
          </label>
          <input
            key={`withdrawal-${materialId}`}
            id={`linea-${indice}-withdrawal`}
            name={`lineas[${indice}].withdrawalDays`}
            type="number"
            step={1}
            min={0}
            defaultValue={valorMostradoDeCarencia ?? ""}
            placeholder={producto && producto.defaultWithdrawalDays == null ? t("manejoProductDoesNotDeclare") : undefined}
            onWheel={soltarFocoConLaRueda}
          />
        </div>
        <div className="nn-field" style={{ flex: "1 1 160px" }}>
          <label htmlFor={`linea-${indice}-reentry`}>
            {t("manejoReentryLabel")}
            {rotuloDeOrigen(origenDeReentrada) ? <span className="nn-muted"> — {rotuloDeOrigen(origenDeReentrada)}</span> : null}
          </label>
          <input
            key={`reentry-${materialId}`}
            id={`linea-${indice}-reentry`}
            name={`lineas[${indice}].reentryHours`}
            type="number"
            step={1}
            min={0}
            defaultValue={valorMostradoDeReentrada ?? ""}
            placeholder={producto && producto.defaultReentryHours == null ? t("manejoProductDoesNotDeclare") : undefined}
            onWheel={soltarFocoConLaRueda}
          />
        </div>
      </div>
    </fieldset>
  );
}
