'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import styled from 'styled-components';
import { Nav, NavLinks } from '@/components/Nav';
import { PlayerProvider, PlayerBar } from '@/components/Player';
import { ToastProvider } from '@/components/Toast';
import { useThemeMode } from '@/lib/theme/ThemeModeProvider';
import { PlayButton } from '@/components/Feed/feed.styles';
import { SweepIcon } from '@/components/Player/SweepIcon';
import { NavDrawer, type Account } from './NavDrawer';
import { AccountMenu } from './AccountMenu';

const Wrapper = styled.div`
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bg};
  /* Keep toasts clear of the PlayerBar docked at the bottom: ≈3.5rem tall on
     wide screens, ≈5.3rem on phones where it wraps to two rows. */
  --toast-offset: 4rem;
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    --toast-offset: 6rem;
  }
`;

// Fills the space between the nav and the universal player (PlayerBar,
// mounted below Main). A flex column with min-height:0 so a full-height
// page can own its own internal scrolling instead of scrolling the whole
// document.
const Main = styled.main`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const Brand = styled(Link)`
  display: inline-flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space.sm};
  text-decoration: none;
  border: 0;
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    flex-direction: column;
    align-items: flex-start;
    gap: ${({ theme }) => theme.space.xs};
  }
`;

const BrandName = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text};
`;

const BrandBy = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`;

// Desktop: the account menu. Phones: the same items live in the drawer
// behind the hamburger.
const DesktopOnly = styled.div`
  display: contents;
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    display: none;
  }
`;

const MobileOnly = styled.div`
  display: none;
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    display: contents;
  }
`;

export function AppShell({
  children,
  isLabelMember = false,
  account = { name: null, email: null },
}: {
  children: React.ReactNode;
  isLabelMember?: boolean;
  account?: Account;
}) {
  const { dark, toggle } = useThemeMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButton.current?.focus();
  }, []);
  return (
    <PlayerProvider>
      <Wrapper>
        <ToastProvider>
          <Nav>
            <Brand href="/feed">
              <BrandName>Human Services</BrandName>
              <BrandBy>by Human Records</BrandBy>
            </Brand>
            <NavLinks>
              <PlayButton type="button" title={dark ? 'Day mode' : 'Night mode'} aria-label={dark ? 'Switch to day mode' : 'Switch to night mode'} aria-pressed={dark} onClick={toggle}>
                <SweepIcon fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter">
                  {dark ? (
                    <>
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
                    </>
                  ) : (
                    <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
                  )}
                </SweepIcon>
              </PlayButton>
              <DesktopOnly>
                <AccountMenu account={account} isLabelMember={isLabelMember} />
              </DesktopOnly>
              <MobileOnly>
                <PlayButton
                  ref={menuButton}
                  type="button"
                  aria-label="Open menu"
                  aria-haspopup="dialog"
                  aria-expanded={menuOpen}
                  aria-controls="nav-drawer"
                  onClick={() => setMenuOpen(true)}
                >
                  <SweepIcon fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </SweepIcon>
                </PlayButton>
              </MobileOnly>
            </NavLinks>
          </Nav>
          <NavDrawer
            open={menuOpen}
            onClose={closeMenu}
            account={account}
            isLabelMember={isLabelMember}
          />
          <Main>{children}</Main>
          <PlayerBar />
        </ToastProvider>
      </Wrapper>
    </PlayerProvider>
  );
}
