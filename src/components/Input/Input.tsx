'use client';

import styled from 'styled-components';
import { fieldStyles } from '@/components/field/fieldStyles';

export const Input = styled.input<{ $invalid?: boolean }>`
  ${fieldStyles}
  &::-webkit-search-cancel-button {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    cursor: pointer;
    background: ${({ theme }) => theme.colors.text};
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m4 4 8 8M12 4l-8 8' fill='none' stroke='black' stroke-width='1.5'/%3E%3C/svg%3E") center / contain no-repeat;
  }
`;
