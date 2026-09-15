import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { jornadaAbiertaDe } from "../../lib/traceability/fieldSessions";

/**
 * La jornada abierta, visible en **todas** las pantallas.
 *
 * **Qué cierra.** `48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md` §5, primera frase: *«Una
 * jornada abierta es visible en todas las pantallas hasta que se cierra.»* Medido el
 * 2026-09-14: `app/layout.tsx` no tenía **ni una** referencia a `FieldSession`, y la única
 * pantalla que sabía de la visita abierta era la ficha del apiario. Quien abría una visita y
 * navegaba a otra parte la perdía de vista — que es exactamente cómo se queda una abierta
 * desde el 13 de septiembre sin que nada la persiga.
 *
 * **Por qué en el layout y no en cada página.** Porque «todas las pantallas» incluye las que
 * nadie ha escrito todavía. Ponerlo página a página garantiza que la siguiente se olvide.
 *
 * **Cuesta una consulta por página, y se dice.** `jornadaAbiertaDe` hace un `findFirst` con
 * `select` acotado y `take` implícito de 1. Se llama sólo cuando hay sesión: una visita
 * anónima no puede tener jornada abierta, así que la página pública no paga nada.
 *
 * **Dos estados, no uno.** Una jornada de hoy se recuerda con calma; una de más de un día
 * **se reclama** —el umbral que el dueño fijó en 24 h—. Pintar las dos igual haría que la
 * segunda se leyera como la primera, que es el defecto que este banner viene a arreglar.
 */
export async function JornadaAbiertaBanner({ userAccountId }: { userAccountId: string }) {
  const jornada = await jornadaAbiertaDe(userAccountId);
  if (!jornada) return null;
  const t = await getTranslations("Traceability");

  return (
    <div className={jornada.reclamable ? "nn-jornada nn-jornada-reclamada" : "nn-jornada"} role="status">
      <span>
        {jornada.reclamable
          ? t("jornadaReclamada", { sitio: jornada.sitio, dias: jornada.diasAbierta })
          : t("jornadaAbiertaEn", { sitio: jornada.sitio })}
      </span>{" "}
      <Link href={`/field-sessions/${jornada.fieldSessionId}`}>{t("jornadaIrACerrar")}</Link>
    </div>
  );
}
