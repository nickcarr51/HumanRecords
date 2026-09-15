import { css } from 'styled-components';

export const fieldStyles = css<{ $invalid?: boolean }>`
  width: 100%;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid
    ${({ theme, $invalid }) => ($invalid ? theme.colors.error : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 0.55rem 0.75rem;
  transition: border-color ${({ theme }) => theme.motion.base}
    ${({ theme }) => theme.motion.ease};

  &::placeholder {
    color: ${({ theme }) => theme.colors.faint};
  }
  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.accent};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
