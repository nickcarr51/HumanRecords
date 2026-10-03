'use client';

import React from 'react';
import styled from 'styled-components';
import { buttonStyles, type ButtonSize, type ButtonVariant } from '@/components/Button';

// The native input stays in the DOM (focusable, labelled, form-submittable)
// but is visually hidden; the <label> after it is what people see and click.
// `hidden` would drop it from the tab order, so it's clipped instead.
const HiddenInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
`;

const Trigger = styled.label<{ $variant: ButtonVariant; $size: ButtonSize; $invalid?: boolean }>`
  ${buttonStyles}
  outline: ${({ theme, $invalid }) => ($invalid ? `1px solid ${theme.colors.error}` : 'none')};
  outline-offset: 2px;

  ${HiddenInput}:focus-visible + & {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
  }
  ${HiddenInput}:disabled + & {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
`;

// align-self keeps the button its natural width inside a column flex parent
// such as FormField.
const Wrap = styled.span`
  position: relative;
  display: inline-flex;
  align-self: flex-start;
`;

export interface FileInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'id'> {
  id: string;
  /** Text on the visible button. */
  buttonLabel?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  $invalid?: boolean;
}

export function FileInput({
  id,
  buttonLabel = 'Choose file',
  variant = 'primary',
  size = 'md',
  $invalid,
  ...rest
}: FileInputProps) {
  return (
    <Wrap>
      <HiddenInput id={id} type="file" aria-invalid={$invalid || undefined} {...rest} />
      <Trigger htmlFor={id} $variant={variant} $size={size} $invalid={$invalid}>
        {buttonLabel}
      </Trigger>
    </Wrap>
  );
}
