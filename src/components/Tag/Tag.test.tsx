import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Tag } from './Tag';
import { Card } from '@/components/Card/Card';

describe('Tag + Card', () => {
  it('renders a toned tag and a card', () => {
    renderWithTheme(
      <Card $interactive>
        <Tag $tone="success">LIVE</Tag>
      </Card>,
    );
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
