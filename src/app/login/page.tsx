"use client";

import { useState } from "react";
import { requestOtp, submitOtp } from "@/lib/auth/actions";

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await requestOtp(email);
    setPending(false);
    if (res.error) setError(res.error);
    else setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await submitOtp(email, code);
    setPending(false);
    // success redirects server-side; only failures return here
    if (res?.error) setError(res.error);
  }

  return (
    <main>
      <h1>Sign in</h1>
      {step === "email" ? (
        <form onSubmit={sendCode}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={pending}>
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p>Enter the code sent to {email}.</p>
          <label htmlFor="code">Code</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <button type="submit" disabled={pending}>
            Verify
          </button>
        </form>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
