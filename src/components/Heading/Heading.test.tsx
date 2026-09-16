import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Heading } from './Heading';
import { Text } from '@/components/Text/Text';
import { Mono } from '@/components/Mono/Mono';

describe('typography', () => {
  it('renders a heading with a semantic tag override', () => {
    renderWithTheme(<Heading as="h1" $level={1}>Title</Heading>);
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
  });

  it('renders body text and mono text', () => {
    renderWithTheme(
      <>
        <Text $variant="muted">muted</Text>
        <Mono>CODE_01</Mono>
      </>,
    );
    expect(screen.getByText('muted')).toBeInTheDocument();
    expect(screen.getByText('CODE_01')).toBeInTheDocument();
  });
});
