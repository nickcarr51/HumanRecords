'use client';

import Link from 'next/link';
import styled from 'styled-components';
import { signOut } from '@/lib/auth/actions';
import { Nav, NavBrand, NavLinks } from '@/components/Nav';

const Wrapper = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.bg};
`;

const Main = styled.main`
  flex: 1;
  /* Bottom space reserved for the universal player added in Worktree B. */
  padding-bottom: ${({ theme }) => theme.space.xl};
`;

const NavItem = styled(Link)`
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.colors.accent};
  }
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

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Wrapper>
      <Nav>
        <NavBrand as={Link} href="/artists">
          Human Records
        </NavBrand>
        <NavLinks>
          <NavItem href="/artists">Artists</NavItem>
          <form action={signOut}>
            <SignOutButton type="submit">Sign out</SignOutButton>
          </form>
        </NavLinks>
      </Nav>
      <Main>{children}</Main>
    </Wrapper>
  );
}
