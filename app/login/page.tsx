import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import LoginForm from "./LoginForm";
import { signInWithGoogleAction } from "../actions/auth";
import { BotonDeEnvio } from "../components/BotonDeEnvio";
import { direccionFijadaEnOtroSitio } from "../../lib/auth/direccionFijada";

/**
 * A server component so it can see whether Google is configured — ADR-076.
 *
 * The credentials form stays a client component (it uses `useActionState` for
 * inline errors); only the decision about which sign-in methods exist lives
 * here, because `process.env` is not readable from the client.
 *
 * Until this page existed there was no way for anyone to *start* the Google
 * flow: the provider registered server-side, and nothing rendered a button.
 * Configuration alone is not a feature.
 */
export default async function LoginPage() {
  const t = await getTranslations("Auth");

  // Mirrors the condition lib/auth/config.ts uses to register the provider at
  // all. Showing a button that leads to "provider not found" would be worse
  // than showing none.
  const googleConfigurado = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  // 2026-09-11: con la dirección clavada en otro dominio, Google autentica bien
  // y devuelve al usuario a un sitio que no es éste — un 404 que parece culpa
  // de Google. Se dice antes de salir, que es donde se entiende.
  // `x-forwarded-host` primero: en Vercel es el anfitrión público, y `host` el
  // interno.
  const cabeceras = await headers();
  const fijadaEnOtroSitio = direccionFijadaEnOtroSitio(
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL,
    cabeceras.get("x-forwarded-host") ?? cabeceras.get("host"),
  );
  const googleEnabled = googleConfigurado && !fijadaEnOtroSitio;

  return (
    <div className="nn-card">
      <h1>{t("signInTitle")}</h1>

      <LoginForm />

      {googleEnabled ? (
        <>
          <p
            className="nn-muted"
            style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1.25rem 0" }}
          >
            <span style={{ flex: 1, height: 1, background: "var(--nn-border)" }} aria-hidden="true" />
            {t("orDivider")}
            <span style={{ flex: 1, height: 1, background: "var(--nn-border)" }} aria-hidden="true" />
          </p>

          <form action={signInWithGoogleAction}>
            <BotonDeEnvio className="nn-button-quiet" style={{ width: "100%" }}>
              {t("continueWithGoogle")}
            </BotonDeEnvio>
          </form>
        </>
      ) : null}

      {googleConfigurado && fijadaEnOtroSitio ? (
        <p className="nn-muted" style={{ marginTop: "1.25rem" }}>
          {t("googleFijadoEnOtraDireccion", { anfitrion: fijadaEnOtroSitio })}
        </p>
      ) : null}
    </div>
  );
}
