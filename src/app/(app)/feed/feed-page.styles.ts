'use client';

import styled from 'styled-components';
import { centeredColumn } from '@/components/field/centeredColumn';

// 672px content column (the old 720px box minus its 24px gutters).
const column = centeredColumn('672px');

// Fills the AppShell Main region: header stays put, the list scrolls.
// Full width so the list's scrollbar sits at the screen edge; each child
// centers its own content with \`column\`.
export const Page = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: ${({ theme }) => theme.space.lg} 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    /* No bottom padding: the list scrolls right up to the PlayerBar's top
       border instead of stopping above a blank strip. */
    padding: ${({ theme }) => theme.space.md} 0 0;
  }
`;

export const Header = styled.div`
  ${column}
  flex-shrink: 0;
  margin-bottom: ${({ theme }) => theme.space.md};
`;

export const Scroll = styled.div`
  ${column}
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* Rubber-banding stays inside the list instead of chaining to the shell,
     which reads as a stutter on iOS. */
  overscroll-behavior-y: contain;
`;

export const Foot = styled.div`
  ${column}
  flex-shrink: 0;
`;
