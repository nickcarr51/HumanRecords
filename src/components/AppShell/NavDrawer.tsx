'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { signOut } from '@/lib/auth/actions';
import { withAlpha } from '@/lib/theme/color';
import { textSweepStyles } from '@/components/field/hoverStyles';
import { PlayButton } from '@/components/Feed/feed.styles';
import { SweepIcon } from '@/components/Player/SweepIcon';
import { EmailText } from './EmailText';

export interface Account {
  name: string | null;
  email: string | null;
}

// Matches theme.motion.slow; the drawer stays mounted this long after close
// so the slide-out can play.
const EXIT_MS = 240;

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;
const fadeOut = keyframes`from { opacity: 1; } to { opacity: 0; }`;
const slideIn = keyframes`from { transform: translateX(100%); } to { transform: translateX(0); }`;
const slideOut = keyframes`from { transform: translateX(0); } to { transform: translateX(100%); }`;

const Overlay = styled.div<{ $closing: boolean }>`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.zIndex.modal};
  background: ${({ theme }) => withAlpha(theme.effects.shadow, 0.45)};
  animation: ${({ $closing }) => ($closing ? fadeOut : fadeIn)} ${EXIT_MS}ms
    ${({ theme }) => theme.motion.ease} both;
  /* While sliding out, taps go straight through to the page. */
  pointer-events: ${({ $closing }) => ($closing ? 'none' : 'auto')};
  /* Phones only: the desktop nav shows everything inline. */
  @media (min-width: calc(${({ theme }) => theme.breakpoints.sm} + 1px)) {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Panel = styled.div<{ $closing: boolean }>`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(80vw, 320px);
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.lg};
  padding: ${({ theme }) => theme.space.md};
  padding-bottom: max(${({ theme }) => theme.space.md}, env(safe-area-inset-bottom));
  background: ${({ theme }) => theme.colors.bg};
  border-left: 1px solid ${({ theme }) => theme.colors.border};
  overflow-y: auto;
  overscroll-behavior: contain;
  animation: ${({ $closing }) => ($closing ? slideOut : slideIn)} ${EXIT_MS}ms
    ${({ theme }) => theme.motion.ease} both;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Top = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const AccountBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};
  padding-bottom: ${({ theme }) => theme.space.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  overflow-wrap: break-word;
`;

const AccountName = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`;

const AccountEmail = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const Items = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space.lg};
  > form {
    margin: 0;
  }
`;

const itemStyles = css`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.md};
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

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

export function NavDrawer({
  open,
  onClose,
  account,
  isLabelMember,
}: {
  open: boolean;
  onClose: () => void;
  account: Account;
  isLabelMember: boolean;
}) {
  // Stay mounted through the slide-out, then unmount (nothing hidden is left
  // in the DOM or the tab order).
  const [rendered, setRendered] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    // No slide-out to wait for under reduced motion: unmount right away.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setRendered(false);
      return;
    }
    const t = setTimeout(() => setRendered(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Close after navigating (e.g. tapping Admin).
  useEffect(() => {
    if (pathname !== lastPath.current) {
      lastPath.current = pathname;
      if (open) onClose();
    }
  }, [pathname, open, onClose]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Keep Tab inside the drawer while it's open.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open && !rendered) return null;
  const closing = !open;

  return (
    <Overlay $closing={closing} onClick={onClose}>
      <Panel
        ref={panelRef}
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        $closing={closing}
        onClick={(e) => e.stopPropagation()}
      >
        <Top>
          <PlayButton ref={closeRef} type="button" aria-label="Close menu" onClick={onClose}>
            <SweepIcon fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square">
              <path d="M6 6l12 12M18 6L6 18" />
            </SweepIcon>
          </PlayButton>
        </Top>
        {account.name || account.email ? (
          <AccountBlock>
            {account.name ? <AccountName>{account.name}</AccountName> : null}
            {account.email ? (
              <AccountEmail>
                <EmailText email={account.email} />
              </AccountEmail>
            ) : null}
          </AccountBlock>
        ) : null}
        <Items>
          {isLabelMember ? (
            <ItemLink href="/admin" onClick={onClose}>
              Admin
            </ItemLink>
          ) : null}
          <form action={signOut}>
            <ItemButton type="submit">Sign out</ItemButton>
          </form>
        </Items>
      </Panel>
    </Overlay>
  );
}
