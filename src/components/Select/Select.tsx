'use client';

import styled from 'styled-components';
import { fieldStyles } from '@/components/field/fieldStyles';

export const Select = styled.select<{ $invalid?: boolean }>`
  ${fieldStyles}
  appearance: none;
  cursor: pointer;
`;
