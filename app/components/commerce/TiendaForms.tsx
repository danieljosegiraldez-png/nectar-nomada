"use client";

/**
 * Los tres formularios de la tienda (ADR-163): asignar envases desde un lote, confirmar la
 * recepción, y crear una variante. Sin `prisma`: todo llega por props desde la página.
 */
import { CampoNumerico } from "../CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { anularAsignacionAction, asignarATiendaAction, confirmarRecepcionAction, crearVarianteAction, despacharPedidoAction } from "../../actions/tienda";

type Estado = { error?: string; ok?: boolean };
const inicial: Estado = {};

function Resultado({ estado, ok }: { estado: Estado; ok: string }) {
  if (estado.error) {
    return (
      <p className="nn-error" role="alert">
        {estado.error}
      </p>
    );
  }
  return estado.ok ? (
    <p className="nn-muted" role="status">
      {ok}
    </p>
  ) : null;
}

export interface VarianteOfrecida {
  id: string;
  sku: string;
  variantName: string | null;
  product: { name: string };
}

export function AsignarATiendaForm({ lotId, variantes, libres }: { lotId: string; variantes: VarianteOfrecida[]; libres: number }) {
  const [estado, accion, pending] = useActionState(asignarATiendaAction, inicial);
  const t = useTranslations("Tienda");
  if (variantes.length === 0) return <p className="nn-muted">{t("sinVariantes")}</p>;
  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 460 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="asignar-dia">{t("dia")}</label>
        <input id="asignar-dia" name="assignedAt" type="date" required />
      </div>
      <div className="nn-field">
        <label htmlFor="asignar-variante">{t("variante")}</label>
        <select id="asignar-variante" name="productVariantId" required defaultValue="">
          <option value="" disabled>
            {t("elegir")}
          </option>
          {variantes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.product.name} — {v.variantName ?? v.sku} ({v.sku})
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="asignar-envases">{t("envasesAAsignar", { libres })}</label>
        <CampoNumerico id="asignar-envases" name="unitsAssigned" min={1} max={libres} step={1} inputMode="numeric" required />
      </div>
      <p className="nn-muted">{t("asignarAyuda")}</p>
      <Resultado estado={estado} ok={t("asignado")} />
      <button type="submit" disabled={pending}>
        {t("asignarGuardar")}
      </button>
    </form>
  );
}

export function ConfirmarRecepcionForm({ allocationId, asignados }: { allocationId: string; asignados: number }) {
  const [estado, accion, pending] = useActionState(confirmarRecepcionAction, inicial);
  const t = useTranslations("Tienda");
  const id = (s: string) => `${s}-${allocationId}`;
  return (
    <form action={accion} className="nn-form" style={{ margin: "0.5rem 0 0" }}>
      <input type="hidden" name="allocationId" value={allocationId} />
      <div className="nn-field">
        <label htmlFor={id("rec-dia")}>{t("diaRecepcion")}</label>
        <input id={id("rec-dia")} name="receivedAt" type="date" required />
      </div>
      <div className="nn-field">
        <label htmlFor={id("rec-cuantos")}>{t("envasesRecibidos")}</label>
        {/* Sin valor por defecto: precargar lo asignado confirmaría lo que nadie contó. */}
        <CampoNumerico id={id("rec-cuantos")} name="unitsReceived" min={0} max={asignados} step={1} inputMode="numeric" required />
      </div>
      <div className="nn-field">
        <label htmlFor={id("rec-nota")}>{t("notaFaltante")}</label>
        <input id={id("rec-nota")} name="receiptNote" type="text" />
      </div>
      <Resultado estado={estado} ok={t("recibido")} />
      <button type="submit" disabled={pending}>
        {t("confirmarGuardar")}
      </button>
    </form>
  );
}

export function NuevaVarianteForm({ productId }: { productId: string }) {
  const [estado, accion, pending] = useActionState(crearVarianteAction, inicial);
  const t = useTranslations("Tienda");
  const id = (s: string) => `${s}-${productId}`;
  return (
    <form action={accion} className="nn-form" style={{ margin: "0.5rem 0 0", maxWidth: 460 }}>
      <input type="hidden" name="productId" value={productId} />
      <div className="nn-field">
        <label htmlFor={id("var-nombre")}>{t("varianteNombre")}</label>
        <input id={id("var-nombre")} name="variantName" type="text" required placeholder={t("varianteNombreEjemplo")} />
      </div>
      <div className="nn-field">
        <label htmlFor={id("var-sku")}>{t("varianteSku")}</label>
        <input id={id("var-sku")} name="sku" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor={id("var-precio")}>{t("variantePrecio")}</label>
        <CampoNumerico id={id("var-precio")} name="priceAmount" min={0} step="0.01" inputMode="decimal" required />
      </div>
      <Resultado estado={estado} ok={t("varianteCreada")} />
      <button type="submit" disabled={pending}>
        {t("varianteGuardar")}
      </button>
    </form>
  );
}

export interface ArticuloPorDespachar {
  id: string;
  quantity: number;
  productVariant: { sku: string; variantName: string | null; product: { name: string } };
  lotes: { lotId: string; lotCode: string; disponibles: number }[];
}

/**
 * Despachar un pedido (ADR-169): por cada artículo, cuántos frascos salen de cada lote. La suma
 * tiene que dar lo pedido; lo comprueba el servicio y lo dice si no cuadra.
 */
export function DespacharPedidoForm({ orderId, articulos }: { orderId: string; articulos: ArticuloPorDespachar[] }) {
  const [estado, accion, pending] = useActionState(despacharPedidoAction, inicial);
  const t = useTranslations("Tienda");
  return (
    <form action={accion} className="nn-form" style={{ margin: "0.5rem 0 0", maxWidth: 520 }}>
      <input type="hidden" name="orderId" value={orderId} />
      <div className="nn-field">
        <label htmlFor={`desp-dia-${orderId}`}>{t("diaDespacho")}</label>
        <input id={`desp-dia-${orderId}`} name="despachadoEn" type="date" required />
      </div>
      {articulos.map((a) => (
        <fieldset key={a.id} className="nn-field">
          <legend>
            {t("articuloFila", { cuantos: a.quantity, producto: a.productVariant.product.name, variante: a.productVariant.variantName ?? a.productVariant.sku })}
          </legend>
          {a.lotes.length === 0 ? (
            <p className="nn-error">{t("sinLotesParaArticulo")}</p>
          ) : (
            a.lotes.map((l) => (
              <label key={l.lotId} style={{ display: "block", padding: "0.25rem 0" }}>
                <span className="nn-code">{l.lotCode}</span> ({t("quedan", { n: l.disponibles })}){" "}
                <CampoNumerico name={`u:${a.id}:${l.lotId}`} min={0} max={l.disponibles} step={1} inputMode="numeric" style={{ width: "5rem" }} />
              </label>
            ))
          )}
        </fieldset>
      ))}
      <Resultado estado={estado} ok={t("despachado")} />
      <button type="submit" disabled={pending}>
        {t("despacharGuardar")}
      </button>
    </form>
  );
}

/**
 * Anular una asignación que no se va a recibir (ADR-170). Plegado detrás de un «Anular» para que
 * no se confunda con recibir: es la salida rara, no la normal.
 */
export function AnularAsignacionForm({ allocationId, lotId }: { allocationId: string; lotId?: string }) {
  const [estado, accion, pending] = useActionState(anularAsignacionAction, inicial);
  const t = useTranslations("Tienda");
  const id = (s: string) => `${s}-${allocationId}`;
  return (
    <details style={{ marginTop: "0.25rem" }}>
      <summary>{t("anular")}</summary>
      <form action={accion} className="nn-form" style={{ margin: "0.25rem 0 0", maxWidth: 460 }}>
        <input type="hidden" name="allocationId" value={allocationId} />
        {lotId ? <input type="hidden" name="lotId" value={lotId} /> : null}
        <div className="nn-field">
          <label htmlFor={id("anu-dia")}>{t("dia")}</label>
          <input id={id("anu-dia")} name="cancelledAt" type="date" required />
        </div>
        <div className="nn-field">
          <label htmlFor={id("anu-motivo")}>{t("anularMotivo")}</label>
          <input id={id("anu-motivo")} name="reason" type="text" required />
        </div>
        <p className="nn-muted">{t("anularAyuda")}</p>
        <Resultado estado={estado} ok={t("anulada")} />
        <button type="submit" disabled={pending}>
          {t("anularGuardar")}
        </button>
      </form>
    </details>
  );
}
