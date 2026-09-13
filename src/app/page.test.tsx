import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home page', () => {
  it('renders the wordmark, label attribution, and invite status', () => {
    render(<Home />);

    expect(screen.getByText('HUMAN SERVICES')).toBeInTheDocument();
    expect(screen.getByText('By Human Records')).toBeInTheDocument();
    expect(screen.getByText(/ACCESS BY INVITATION/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Human Records' })).toBeInTheDocument();
  });
});
