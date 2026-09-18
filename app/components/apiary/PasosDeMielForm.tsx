"use client";

/**
 * Los dos pasos de un lote de miel después de extraerlo (ADR-161): procesarlo y envasarlo.
 *
 * **Casillas para los actos**, porque un proceso cuela Y decanta: un desplegable de uno
 * obligaría a dos registros para un solo paso. Importa el vocabulario de `vocabularioDeMiel`
 * —puro— y NO de `mielDelLote`, que trae `prisma` y lo arrastraría al navegador.
 *
 * **Los kilos que entran son obligatorios**: tomar parte del lote es lo normal (se cuelan 20 kg
 * de un tanque de 30), y no se deducen. La merma es opcional; si falta y no cuadra, el balance
 * del lote lo dice.
 */
import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { dividirMielAction, envasarMielAction, procesarMielAction } from "../../actions/apiary";
import { ACTOS_DE_PROCESO_DE_MIEL } from "../../../lib/apiary/vocabularioDeMiel";

type Estado = { error?: string; ok?: boolean; nuevoLoteId?: string; nuevoLoteCodigo?: string };
const inicial: Estado = {};

function Resultado({ estado }: { estado: Estado }) {
  const t = useTranslations("Apiary");
  if (estado.error) {
    return (
      <p className="nn-error" role="alert">
        {estado.error}
      </p>
    );
  }
  if (estado.ok && estado.nuevoLoteId) {
    return (
      <p className="nn-muted" role="status">
        {t("mielNuevoLote")}{" "}
        <Link href={`/lots/${estado.nuevoLoteId}`} className="nn-code">
          {estado.nuevoLoteCodigo}
        </Link>
      </p>
    );
  }
  return null;
}

function Comunes({ prefijo }: { prefijo: string }) {
  const t = useTranslations("Apiary");
  return (
    <>
      <div className="nn-field">
        <label htmlFor={`${prefijo}-dia`}>{t("mielDia")}</label>
        {/* Obligatorio y sin valor por defecto: un «hoy» afirmaría una fecha que nadie dio. */}
        <input id={`${prefijo}-dia`} name="occurredAt" type="date" required />
      </div>
      <div className="nn-field">
        <label htmlFor={`${prefijo}-entra`}>{t("mielKilosEntran")}</label>
        <input id={`${prefijo}-entra`} name="inputKg" type="number" min={0} step="0.001" inputMode="decimal" required />
      </div>
    </>
  );
}

export function ProcesarMielForm({ lotId }: { lotId: string }) {
  const [estado, accion, pending] = useActionState(procesarMielAction, inicial);
  const t = useTranslations("Apiary");
  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 460 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <Comunes prefijo="proceso" />
      <fieldset className="nn-field">
        <legend>{t("mielActos")}</legend>
        {ACTOS_DE_PROCESO_DE_MIEL.map((a) => (
          <label key={a} style={{ display: "block", padding: "0.35rem 0" }}>
            <input type="checkbox" name="acts" value={a} /> {t(`mielActo_${a}`)}
          </label>
        ))}
      </fieldset>
      <div className="nn-field">
        <label htmlFor="proceso-otro">{t("mielOtroCual")}</label>
        <input id="proceso-otro" name="otherNote" type="text" />
      </div>
      <div className="nn-field">
        <label htmlFor="proceso-sale">{t("mielKilosSalen")}</label>
        <input id="proceso-sale" name="outputKg" type="number" min={0} step="0.001" inputMode="decimal" required />
      </div>
      <div className="nn-field">
        <label htmlFor="proceso-merma">{t("mielMerma")}</label>
        <input id="proceso-merma" name="lossKg" type="number" min={0} step="0.001" inputMode="decimal" />
      </div>
      <Resultado estado={estado} />
      <button type="submit" disabled={pending}>
        {t("mielProcesarGuardar")}
      </button>
    </form>
  );
}

export function EnvasarMielForm({ lotId }: { lotId: string }) {
  const [estado, accion, pending] = useActionState(envasarMielAction, inicial);
  const t = useTranslations("Apiary");
  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 460 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <Comunes prefijo="envasado" />
      <div className="nn-field">
        <label htmlFor="envasado-cuantos">{t("mielEnvases")}</label>
        <input id="envasado-cuantos" name="packageCount" type="number" min={1} step={1} inputMode="numeric" required />
      </div>
      <div className="nn-field">
        <label htmlFor="envasado-neto">{t("mielMasaNeta")}</label>
        <input id="envasado-neto" name="packageNetMassG" type="number" min={0} step="0.01" inputMode="decimal" required />
      </div>
      <p className="nn-muted">{t("mielEnvasadoAyuda")}</p>
      <div className="nn-field">
        <label htmlFor="envasado-merma">{t("mielMermaEnvasado")}</label>
        <input id="envasado-merma" name="lossKg" type="number" min={0} step="0.001" inputMode="decimal" />
      </div>
      <Resultado estado={estado} />
      <button type="submit" disabled={pending}>
        {t("mielEnvasarGuardar")}
      </button>
    </form>
  );
}

/** Cuántas casillas de parte se ofrecen. Las vacías no cuentan; para más, se divide dos veces. */
const PARTES_OFRECIDAS = 6;

export function DividirMielForm({ lotId }: { lotId: string }) {
  const [estado, accion, pending] = useActionState(dividirMielAction, inicial);
  const t = useTranslations("Apiary");
  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 460 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="dividir-dia">{t("mielDia")}</label>
        <input id="dividir-dia" name="occurredAt" type="date" required />
      </div>
      <p className="nn-muted">{t("mielDividirAyuda")}</p>
      {Array.from({ length: PARTES_OFRECIDAS }, (_, i) => (
        <div className="nn-field" key={i}>
          <label htmlFor={`dividir-parte-${i}`}>{t("mielParte", { n: i + 1 })}</label>
          <input id={`dividir-parte-${i}`} name="parteKg" type="number" min={0} step="0.001" inputMode="decimal" required={i < 2} />
        </div>
      ))}
      <div className="nn-field">
        <label htmlFor="dividir-merma">{t("mielMermaDividir")}</label>
        <input id="dividir-merma" name="lossKg" type="number" min={0} step="0.001" inputMode="decimal" />
      </div>
      <Resultado estado={estado} />
      <button type="submit" disabled={pending}>
        {t("mielDividirGuardar")}
      </button>
    </form>
  );
}
