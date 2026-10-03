"use client";

import { useActionState, useState } from "react";
import { redeemInviteForm } from "@/lib/auth/actions";
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
// server action) consumes the token — never the page load. The server action
// is passed straight to useActionState so the form works before hydration.
export function InviteWelcome({ token, name, email, next }: InviteWelcomeProps) {
  const [state, formAction, pending] = useActionState(redeemInviteForm, null);
  const [notYou, setNotYou] = useState(false);

  if (notYou) return <LoginForm next={next} />;
  if (state?.error) {
    return <LoginForm initialEmail={email} next={next} initialError={state.error} />;
  }

  return (
    <Card>
      <Stack $gap="lg">
        <Stack $gap="xs">
          <Heading $level={2}>{name ? `Welcome, ${name}` : "Welcome"}</Heading>
          <Text $variant="muted">Tap Enter to sign in to Human Services.</Text>
        </Stack>
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
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
          onClick={() => setNotYou(true)}
          disabled={pending}
        >
          Not you? Sign in with email
        </Button>
      </Stack>
    </Card>
  );
}
