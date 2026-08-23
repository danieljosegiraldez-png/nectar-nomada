"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { loginAction, type FormActionState } from "../actions/auth";

const initialState: FormActionState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const t = useTranslations("Auth");

  return (
    <>
      <form className="nn-form" action={formAction}>
        <div className="nn-field">
          <label htmlFor="email">{t("emailLabel")}</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="nn-field">
          <label htmlFor="password">{t("passwordLabel")}</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state.error ? <p className="nn-error">{state.error}</p> : null}
        <button type="submit" className="nn-button" disabled={pending}>
          {pending ? t("signInButtonPending") : t("signInButton")}
        </button>
      </form>
      <p className="nn-muted" style={{ marginTop: "1rem" }}>
        {t("noAccountYet")} <Link href="/signup">{t("signUpLink")}</Link>
      </p>
    </>
  );
}
