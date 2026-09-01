"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signUpAction, type FormActionState } from "../actions/auth";

const initialState: FormActionState = {};

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  const t = useTranslations("Auth");

  return (
    <div className="nn-card">
      <h1>{t("signUpTitle")}</h1>
      <form className="nn-form" action={formAction}>
        <div className="nn-field">
          <label htmlFor="givenName">{t("firstNameLabel")}</label>
          <input id="givenName" name="givenName" type="text" autoComplete="given-name" required />
        </div>
        <div className="nn-field">
          <label htmlFor="familyName">{t("lastNameLabel")}</label>
          <input id="familyName" name="familyName" type="text" autoComplete="family-name" required />
        </div>
        <div className="nn-field">
          <label htmlFor="email">{t("emailLabel")}</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="nn-field">
          <label htmlFor="password">{t("passwordLabel")}</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
        <button type="submit" className="nn-button" disabled={pending}>
          {pending ? t("signUpButtonPending") : t("signUpButton")}
        </button>
      </form>
      <p className="nn-muted" style={{ marginTop: "1rem" }}>
        {t("alreadyHaveAccount")} <Link href="/login">{t("signInLink")}</Link>
      </p>
    </div>
  );
}
