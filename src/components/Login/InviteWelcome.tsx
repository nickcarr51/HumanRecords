"use client";

import { useState } from "react";
import { redeemInvite } from "@/lib/auth/actions";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Heading } from "@/components/Heading";
import { Stack } from "@/components/Stack";
import { Text } from "@/components/Text";
import { LoginForm } from "./LoginForm";

export interface InviteWelcomeProps {
  token: string;
  name: string | null;
  email?: string;
  next?: string;
}

// Shown for a valid, unused invite. Only the Enter press (a POST via the
// server action) consumes the token — never the page load.
export function InviteWelcome({ token, name, email, next }: InviteWelcomeProps) {
  const [view, setView] = useState<
    { kind: "welcome" } | { kind: "form"; email?: string; error: string | null }
  >({ kind: "welcome" });
  const [pending, setPending] = useState(false);

  if (view.kind === "form") {
    return <LoginForm initialEmail={view.email} next={next} initialError={view.error} />;
  }

  async function enter(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    const res = await redeemInvite(token);
    // Success redirects server-side; only failures return here.
    if (res?.error) {
      setPending(false);
      setView({ kind: "form", email, error: res.error });
    }
  }

  return (
    <Card>
      <Stack $gap="lg">
        <Stack $gap="xs">
          <Heading $level={2}>{name ? `Welcome, ${name}` : "Welcome"}</Heading>
          <Text $variant="muted">Tap Enter to sign in to Human Services.</Text>
        </Stack>
        <form onSubmit={enter}>
          <Stack $gap="md">
            <Button type="submit" size="lg" loading={pending}>
              Enter
            </Button>
          </Stack>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setView({ kind: "form", error: null })}
          disabled={pending}
        >
          Not you? Sign in with email
        </Button>
      </Stack>
    </Card>
  );
}
