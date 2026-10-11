'use client';

import Link from 'next/link';
import styled from 'styled-components';
import { signOut } from '@/lib/auth/actions';
import { Nav, NavLinks } from '@/components/Nav';
import { PlayerProvider, PlayerBar } from '@/components/Player';
import { ToastProvider } from '@/components/Toast';
import { textSweepStyles } from '@/components/field/hoverStyles';
import { useThemeMode } from '@/lib/theme/ThemeModeProvider';
import { PlayButton } from '@/components/Feed/feed.styles';
import { SweepIcon } from '@/components/Player/SweepIcon';

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

const SignOutButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  ${textSweepStyles}
`;

const NavLink = styled(Link)`
  text-decoration: none;
  border: 0;
  ${textSweepStyles}
`;

export function AppShell({
  children,
  isLabelMember = false,
}: {
  children: React.ReactNode;
  isLabelMember?: boolean;
}) {
  const { dark, toggle } = useThemeMode();
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
              {isLabelMember ? <NavLink href="/admin">Admin</NavLink> : null}
              <form action={signOut}>
                <SignOutButton type="submit">Sign out</SignOutButton>
              </form>
            </NavLinks>
          </Nav>
          <Main>{children}</Main>
          <PlayerBar />
        </ToastProvider>
      </Wrapper>
    </PlayerProvider>
  );
}
