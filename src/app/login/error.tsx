"use client";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import { Heading } from "@/components/Heading";
import { Link } from "@/components/Link";
import { Stack } from "@/components/Stack";
import { Text } from "@/components/Text";
import { Screen } from "../screen.styles";

// Catches a thrown/rejected server action (network drop, 500) on /login so
// the invite Enter screen never dead-ends.
export default function LoginError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Screen>
      <Container $max="420px">
        <Card>
          <Stack $gap="lg">
            <Stack $gap="xs">
              <Heading $level={2}>Something went wrong</Heading>
              <Text $variant="muted">Couldn&apos;t sign you in — try again, or use your email below.</Text>
            </Stack>
            <Button type="button" size="lg" onClick={reset}>
              Try again
            </Button>
            <Link href="/login">Sign in with email</Link>
          </Stack>
        </Card>
      </Container>
    </Screen>
  );
}
