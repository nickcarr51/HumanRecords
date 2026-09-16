import { Heading, Tag, Text } from '@/components';
import { Screen } from './screen.styles';
import * as S from './page.styles';

export default function Home() {
  return (
    <Screen>
      <S.Centered>
        <S.Logo src="/human_records_main_logo.png" alt="Human Records" />
        <Tag $tone="accent">ACCESS BY INVITATION</Tag>
        <Heading as="h1" $level={1}>
          HUMAN SERVICES
        </Heading>
        <Text $variant="muted">By Human Records</Text>
      </S.Centered>
    </Screen>
  );
}
