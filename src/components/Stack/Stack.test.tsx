import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Stack } from './Stack';
import { Container } from '@/components/Container/Container';
import { Section } from '@/components/Section/Section';
import { Row } from '@/components/Row/Row';
import { Grid } from '@/components/Grid/Grid';
import { Divider } from '@/components/Divider/Divider';

describe('layout primitives', () => {
  it('render and nest without crashing', () => {
    renderWithTheme(
      <Container>
        <Section>
          <Stack $gap="lg">
            <Row $justify="space-between"><span>a</span><span>b</span></Row>
            <Grid $cols={3}><span>c</span></Grid>
            <Divider />
          </Stack>
        </Section>
      </Container>,
    );
    ['a', 'b', 'c'].forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
  });
});
