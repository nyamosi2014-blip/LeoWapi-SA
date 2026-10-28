"use client";

import { useActionState } from "react";
import { sendCode, verifyCode, type SignInState } from "./actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(
    (prev: SignInState, form: FormData) => (prev.step === "code" && form.get("intent") !== "restart" ? verifyCode(prev, form) : sendCode(prev, form)),
    { step: "email" } as SignInState,
  );

  if (state.step === "code") {
    return (
      <form action={action} className="stack">
        <p>
          We sent a 6-digit code to <strong>{state.email}</strong>. It expires in an hour.
        </p>
        <label className="field">
          <span>Code</span>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />
        </label>
        {state.error && <p role="alert" className="error">{state.error}</p>}
        <button type="submit" disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="next" value={state.next} />
        <button type="submit" name="intent" value="restart" className="link" formNoValidate disabled={pending}>
          Send a new code
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="stack">
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required autoFocus />
      </label>
      <input type="hidden" name="next" value={next} />
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Sending…" : "Email me a code"}</button>
      <p className="muted">No password needed. We only use your email to sign you in and to update you on requests you send.</p>
    </form>
  );
}
