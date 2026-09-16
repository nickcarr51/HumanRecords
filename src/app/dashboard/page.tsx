import { signOut } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import {
  Button,
  Card,
  Container,
  Heading,
  Mono,
  Stack,
  Text,
} from "@/components";
import { Screen } from "../screen.styles";

export default async function DashboardPage() {
  const user = await getSessionUser();
  const email = typeof user?.email === "string" ? user.email : "unknown";

  return (
    <Screen>
      <Container $max="420px">
        <Card>
          <Stack $gap="lg">
            <Stack $gap="xs">
              <Heading $level={2}>You&apos;re in.</Heading>
              <Text $variant="muted">
                Signed in as <Mono>{email}</Mono>.
              </Text>
            </Stack>
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </Stack>
        </Card>
      </Container>
    </Screen>
  );
}
