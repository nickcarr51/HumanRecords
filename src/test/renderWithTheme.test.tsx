import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import styled from 'styled-components';
import { renderWithTheme } from './renderWithTheme';

const Probe = styled.div`
  color: ${({ theme }) => theme.colors.accent};
`;

describe('renderWithTheme', () => {
  it('provides the theme to styled components', () => {
    renderWithTheme(<Probe>ok</Probe>);
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
