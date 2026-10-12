'use client';

import styled from 'styled-components';

// Fills the AppShell Main region: header stays put, the list scrolls.
export const Page = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.lg};
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    /* No bottom padding: the list scrolls right up to the PlayerBar's top
       border instead of stopping above a blank strip. */
    padding: ${({ theme }) => theme.space.md} ${({ theme }) => theme.space.md} 0;
  }
`;

export const Header = styled.div`
  flex-shrink: 0;
  margin-bottom: ${({ theme }) => theme.space.md};
`;

export const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* Rubber-banding stays inside the list instead of chaining to the shell,
     which reads as a stutter on iOS. */
  overscroll-behavior-y: contain;
`;

export const Foot = styled.div`
  flex-shrink: 0;
`;
