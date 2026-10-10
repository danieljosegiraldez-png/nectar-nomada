"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { logoutAction } from "../actions/auth";
import { cerrarSesionEnEsteDispositivo, type EstadoDeCierre } from "../../lib/offline/paginasGuardadas";
import { BotonDeEnvio } from "./BotonDeEnvio";

/**
 * El botón de cerrar sesión: borra en este teléfono las páginas guardadas para
 * abrirlas sin red, y después cierra la sesión en el servidor. Ver
 * `lib/offline/paginasGuardadas.ts`.
 *
 * Sin red, lo primero ocurre y lo segundo no —la cookie es `HttpOnly`, sólo el
 * servidor puede quitarla—, y en vez de la pantalla de error de Next se dice
 * eso con todas sus letras: quien pulsó el botón cree haber salido, y la
 * sesión sigue abierta en el teléfono hasta que vuelva la señal.
 */
export function CerrarSesion() {
  const t = useTranslations("Nav");
  const [estado, accion] = useActionState<EstadoDeCierre>(() => cerrarSesionEnEsteDispositivo(logoutAction), {});

  return (
    <form action={accion}>
      <BotonDeEnvio className="nn-link-button">{t("signOut")}</BotonDeEnvio>
      {estado.sinRed ? (
        <p className="nn-error" role="alert">
          {t("signOutOffline")}
        </p>
      ) : null}
    </form>
  );
}
