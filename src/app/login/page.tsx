"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { requestOtp, submitOtp } from "@/lib/auth/actions";
import {
  Alert,
  Button,
  Card,
  Container,
  FormField,
  Heading,
  Input,
  Mono,
  Row,
  Spinner,
  Stack,
  Text,
} from "@/components";
import { Screen } from "../screen.styles";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? undefined;
  const linkFailed = searchParams.get("error") === "auth";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(
    linkFailed ? "That link didn’t work — request a new code below." : null,
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
                hint="6-digit code from your email"
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

export default function LoginPage() {
  return (
    <Screen>
      <Container $max="420px">
        <Suspense fallback={<Spinner />}>
          <LoginForm />
        </Suspense>
      </Container>
    </Screen>
  );
}
