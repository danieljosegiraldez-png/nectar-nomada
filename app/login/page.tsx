"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type FormActionState } from "../actions/auth";

const initialState: FormActionState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="nn-card">
      <h1>Sign in</h1>
      <form className="nn-form" action={formAction}>
        <div className="nn-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="nn-field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state.error ? <p className="nn-error">{state.error}</p> : null}
        <button type="submit" className="nn-button" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="nn-muted" style={{ marginTop: "1rem" }}>
        No account yet? <Link href="/signup">Sign up</Link>
      </p>
    </div>
  );
}
