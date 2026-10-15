'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import styled, { css } from 'styled-components';
import { signOut } from '@/lib/auth/actions';
import { withAlpha } from '@/lib/theme/color';
import { textHoverState, textSweepStyles } from '@/components/field/hoverStyles';
import type { Account } from './NavDrawer';
import { EmailText } from './EmailText';

const Wrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

// The sweep runs on the name only (it makes its text color transparent, which
// would hide a currentColor chevron); hovering anywhere on the button runs it.
const Label = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  ${textSweepStyles}
`;

const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  max-width: 28ch;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
  color: ${({ theme }) => theme.colors.text};
  &:hover ${Label}, &:focus-visible ${Label} {
    ${textHoverState}
  }
  svg {
    flex-shrink: 0;
    transition: transform ${({ theme }) => theme.motion.base} ${({ theme }) => theme.motion.ease};
  }
  &:hover svg, &:focus-visible svg, &[aria-expanded='true'] svg {
    color: ${({ theme }) => theme.colors.accent};
  }
  &[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }
  &:focus-visible {
    outline: none;
  }
  @media (prefers-reduced-motion: reduce) {
    svg { transition: none; }
  }
  @media (forced-colors: active) {
    &:focus-visible { outline: 1px solid Highlight; }
  }
`;

const Panel = styled.div`
  position: absolute;
  top: calc(100% + ${({ theme }) => theme.space.sm});
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  /* Size to the content (an absolute box would otherwise shrink to the narrow
     trigger and pin to min-width), within limits. */
  width: max-content;
  min-width: 220px;
  max-width: min(400px, calc(100vw - ${({ theme }) => theme.space.lg} * 2));
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.md};
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 6px 18px ${({ theme }) => withAlpha(theme.effects.shadow, theme.mode === 'light' ? 0.1 : 0.3)};
`;

const Email = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  padding-bottom: ${({ theme }) => theme.space.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  overflow-wrap: break-word;
`;

const Items = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space.sm};
  > form {
    margin: 0;
  }
`;

const itemStyles = css`
  font: inherit;
  text-decoration: none;
  border: 0;
  padding: 0;
  background: none;
  cursor: pointer;
  ${textSweepStyles}
`;

const ItemLink = styled(Link)`
  ${itemStyles}
`;

const ItemButton = styled.button`
  ${itemStyles}
`;

/**
 * Desktop account control: the user's name (email when no name is set) opens
 * a small panel with the email, Admin for label members, and Sign out.
 * Closes on Escape (focus back to the trigger), outside click, or navigation.
 */
export function AccountMenu({
  account,
  isLabelMember,
}: {
  account: Account;
  isLabelMember: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pathname = usePathname();
  const label = account.name ?? account.email ?? 'Account';

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    // Tabbing out of the panel closes it too.
    const onFocus = (e: FocusEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open, close]);

  return (
    <Wrap ref={wrapRef}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account: ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Label>{label}</Label>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
          <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </Trigger>
      {open ? (
        <Panel id={panelId}>
          {account.email ? (
            <Email>
              <EmailText email={account.email} />
            </Email>
          ) : null}
          <Items>
            {isLabelMember ? (
              <ItemLink href="/admin" onClick={() => close(false)}>
                Admin
              </ItemLink>
            ) : null}
            <form action={signOut}>
              <ItemButton type="submit">Sign out</ItemButton>
            </form>
          </Items>
        </Panel>
      ) : null}
    </Wrap>
  );
}
