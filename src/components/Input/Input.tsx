'use client';

import styled from 'styled-components';
import { fieldStyles } from '@/components/field/fieldStyles';

export const Input = styled.input<{ $invalid?: boolean }>`
  ${fieldStyles}
`;
