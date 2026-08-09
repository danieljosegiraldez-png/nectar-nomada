"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type FormActionState } from "../actions/auth";

const initialState: FormActionState = {};

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <div className="nn-card">
      <h1>Create your account</h1>
      <form className="nn-form" action={formAction}>
        <div className="nn-field">
          <label htmlFor="givenName">First name</label>
          <input id="givenName" name="givenName" type="text" autoComplete="given-name" required />
        </div>
        <div className="nn-field">
          <label htmlFor="familyName">Last name</label>
          <input id="familyName" name="familyName" type="text" autoComplete="family-name" required />
        </div>
        <div className="nn-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="nn-field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        {state.error ? <p className="nn-error">{state.error}</p> : null}
        <button type="submit" className="nn-button" disabled={pending}>
          {pending ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="nn-muted" style={{ marginTop: "1rem" }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
