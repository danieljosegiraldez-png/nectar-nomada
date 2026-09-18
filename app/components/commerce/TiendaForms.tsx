"use client";

/**
 * Los tres formularios de la tienda (ADR-163): asignar envases desde un lote, confirmar la
 * recepción, y crear una variante. Sin `prisma`: todo llega por props desde la página.
 */
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { asignarATiendaAction, confirmarRecepcionAction, crearVarianteAction } from "../../actions/tienda";

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
        <input id="asignar-envases" name="unitsAssigned" type="number" min={1} max={libres} step={1} inputMode="numeric" required />
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
        <input id={id("rec-cuantos")} name="unitsReceived" type="number" min={0} max={asignados} step={1} inputMode="numeric" required />
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
        <input id={id("var-precio")} name="priceAmount" type="number" min={0} step="0.01" inputMode="decimal" required />
      </div>
      <Resultado estado={estado} ok={t("varianteCreada")} />
      <button type="submit" disabled={pending}>
        {t("varianteGuardar")}
      </button>
    </form>
  );
}
