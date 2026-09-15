import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Nav, NavBrand, NavLinks } from './Nav';
import { Footer } from '@/components/Footer/Footer';

describe('Nav + Footer', () => {
  it('renders brand, links, and footer', () => {
    renderWithTheme(
      <>
        <Nav>
          <NavBrand>HUMAN</NavBrand>
          <NavLinks><a href="/">Home</a></NavLinks>
        </Nav>
        <Footer>© Human Records</Footer>
      </>,
    );
    expect(screen.getByText('HUMAN')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText(/Human Records/)).toBeInTheDocument();
  });
});
