'use client';

import styled from 'styled-components';
import { fieldStyles } from '@/components/field/fieldStyles';

export const Textarea = styled.textarea<{ $invalid?: boolean }>`
  ${fieldStyles}
  resize: vertical;
  min-height: 6rem;
`;
