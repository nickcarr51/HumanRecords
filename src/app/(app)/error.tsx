'use client';

import styled from 'styled-components';
import { Button } from '@/components';

const Wrap = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.xl};
  text-align: center;
`;

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.display};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`;

const Msg = styled.p`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Wrap>
      <Title>Something went wrong.</Title>
      <Msg>We couldn&apos;t load this page. Please try again.</Msg>
      <Button onClick={() => reset()}>Retry</Button>
    </Wrap>
  );
}
