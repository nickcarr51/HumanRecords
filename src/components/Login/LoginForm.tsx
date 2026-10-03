"use client";

import { useState } from "react";
import { requestOtp, submitOtp } from "@/lib/auth/actions";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { FormField } from "@/components/FormField";
import { Heading } from "@/components/Heading";
import { Input } from "@/components/Input";
import { Mono } from "@/components/Mono";
import { Row } from "@/components/Row";
import { Stack } from "@/components/Stack";
import { Text } from "@/components/Text";

const LINK_FAILED = "That link didn’t work — request a new code below.";

export interface LoginFormProps {
  initialEmail?: string;
  next?: string;
  linkFailed?: boolean;
  initialError?: string | null;
}

// Email → 8-character code. Never sends a code on its own: a pre-filled
// email (from ?email=) still needs a human to press "Send code", so link
// scanners can't trigger code emails.
export function LoginForm({ initialEmail, next, linkFailed, initialError }: LoginFormProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(
    initialError ?? (linkFailed ? LINK_FAILED : null),
  );
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
    const res = await submitOtp(email, code, next);
    setPending(false);
    // success redirects server-side; only failures return here
    if (res?.error) setError(res.error);
  }

  async function resend() {
    setPending(true);
    setError(null);
    const res = await requestOtp(email);
    setPending(false);
    if (res.error) setError(res.error);
  }

  function changeEmail() {
    setStep("email");
    setCode("");
    setError(null);
  }

  return (
    <Card>
      <Stack $gap="lg">
        <Stack $gap="xs">
          <Heading $level={2}>Sign in</Heading>
          <Text $variant="muted">
            {step === "email" ? (
              "Enter your email and we’ll send a one-time code."
            ) : (
              <>
                Enter the code sent to <Mono>{email}</Mono>.
              </>
            )}
          </Text>
        </Stack>

        {error ? (
          <Alert $tone="error" role="alert">
            {error}
          </Alert>
        ) : null}

        {step === "email" ? (
          <form onSubmit={sendCode} noValidate>
            <Stack $gap="lg">
              <FormField label="Email" htmlFor="email">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FormField>
              <Button type="submit" size="lg" loading={pending}>
                Send code
              </Button>
            </Stack>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <Stack $gap="lg">
              <FormField
                label="Code"
                htmlFor="code"
                hint="8-character code from your email"
              >
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </FormField>
              <Button type="submit" size="lg" loading={pending}>
                Verify
              </Button>
              <Row $justify="space-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resend}
                  disabled={pending}
                >
                  Resend code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={changeEmail}
                  disabled={pending}
                >
                  Use a different email
                </Button>
              </Row>
            </Stack>
          </form>
        )}
      </Stack>
    </Card>
  );
}
