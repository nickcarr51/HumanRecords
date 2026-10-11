import { Heading, Link, Tag, Text } from '@/components';
import { Screen } from './screen.styles';
import * as S from './page.styles';
import { SignInGlitch } from '@/components/Login/SignInGlitch';

export default function Home() {
  return (
    <Screen>
      <S.Centered>
        <SignInGlitch><S.Logo src="/human_records_main_logo.png" alt="Human Records" /></SignInGlitch>
        <Tag $tone="accent">ACCESS BY INVITATION</Tag>
        <SignInGlitch><Heading as="h1" $level={1}>
          HUMAN SERVICES
        </Heading></SignInGlitch>
        <Text $variant="muted">Powered by Human Records</Text>
        <Link href="/login">Sign in</Link>
      </S.Centered>
    </Screen>
  );
}
