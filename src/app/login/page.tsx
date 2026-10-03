import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { InviteWelcome, LoginForm } from "@/components/Login";
import { getInviteGreeting } from "@/lib/auth/invite";
import { Screen } from "../screen.styles";

// Invite tokens travel in this page's URL; never leak it via Referer.
export const metadata: Metadata = { referrer: "no-referrer" };

type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value || undefined;
}

// /login?email=&invite=&next=&error=
// - valid unused invite → welcome screen with an Enter button
// - anything else → normal sign-in form, email pre-filled; a used or
//   unknown invite is ignored silently.
// Signed-in visitors never get here (middleware sends them to /feed).
export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const email = param(params, "email");
  const invite = param(params, "invite");
  const next = param(params, "next");
  const greeting = invite ? await getInviteGreeting(invite) : null;

  return (
    <Screen>
      <Container $max="420px">
        {greeting && invite ? (
          <InviteWelcome token={invite} name={greeting.name} email={email} next={next} />
        ) : (
          <LoginForm initialEmail={email} next={next} linkFailed={param(params, "error") === "auth"} />
        )}
      </Container>
    </Screen>
  );
}
