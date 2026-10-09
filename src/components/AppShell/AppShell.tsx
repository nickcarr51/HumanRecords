'use client';

import Link from 'next/link';
import styled from 'styled-components';
import { signOut } from '@/lib/auth/actions';
import { Nav, NavLinks } from '@/components/Nav';
import { PlayerProvider, PlayerBar } from '@/components/Player';

const Wrapper = styled.div`
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bg};
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
  color: ${({ theme }) => theme.colors.muted};
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.colors.accent};
  }
`;

const NavLink = styled(Link)`
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
  border: 0;
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.colors.accent};
  }
`;

export function AppShell({
  children,
  isLabelMember = false,
}: {
  children: React.ReactNode;
  isLabelMember?: boolean;
}) {
  return (
    <PlayerProvider>
      <Wrapper>
        <Nav>
          <Brand href="/feed">
            <BrandName>Human Services</BrandName>
            <BrandBy>by Human Records</BrandBy>
          </Brand>
          <NavLinks>
            {isLabelMember ? <NavLink href="/admin">Admin</NavLink> : null}
            <form action={signOut}>
              <SignOutButton type="submit">Sign out</SignOutButton>
            </form>
          </NavLinks>
        </Nav>
        <Main>{children}</Main>
        <PlayerBar />
      </Wrapper>
    </PlayerProvider>
  );
}
