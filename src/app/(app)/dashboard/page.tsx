import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Card, Container, Heading, Mono, Stack, Text } from "@/components";
import { Center } from "./dashboard.styles";

export default async function DashboardPage() {
  // Defense in depth: middleware already gates this route, but never render
  // the page for an unauthenticated request even if that ever regresses.
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const email = typeof user.email === "string" ? user.email : "unknown";

  return (
    <Center>
      <Container $max="420px">
        <Card>
          <Stack $gap="xs">
            <Heading $level={2}>You&apos;re in.</Heading>
            <Text $variant="muted">
              Signed in as <Mono>{email}</Mono>.
            </Text>
          </Stack>
        </Card>
      </Container>
    </Center>
  );
}
