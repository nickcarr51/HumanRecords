'use client';

import styled from 'styled-components';
import type { ReleaseKind } from '@/lib/admin/types';

const Group = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  overflow: hidden;
  align-self: flex-start;
`;

const Choice = styled.label<{ $checked: boolean; $disabled?: boolean }>`
  position: relative;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.lg};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ theme, $checked }) => ($checked ? theme.colors.accent : 'transparent')};
  color: ${({ theme, $checked }) => ($checked ? theme.colors.bg : theme.colors.muted)};
  transition:
    background ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease},
    color ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease};
  & + & {
    border-left: 1px solid ${({ theme }) => theme.colors.border};
  }
  &:hover {
    color: ${({ theme, $checked, $disabled }) =>
      $checked ? theme.colors.bg : $disabled ? theme.colors.muted : theme.colors.text};
  }
  &:focus-within {
    outline: 2px solid ${({ theme }) => theme.colors.accent};
    outline-offset: -2px;
  }
  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const OPTIONS: Array<{ value: ReleaseKind; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'album', label: 'Album' },
];

export function KindToggle({
  value,
  onChange,
  disabled,
}: {
  value: ReleaseKind;
  onChange: (kind: ReleaseKind) => void;
  disabled?: boolean;
}) {
  return (
    <Group role="radiogroup" aria-label="Release type">
      {OPTIONS.map((o) => (
        <Choice key={o.value} $checked={value === o.value} $disabled={disabled}>
          <input
            type="radio"
            name="release-kind"
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </Choice>
      ))}
    </Group>
  );
}
