'use client';

import styled from 'styled-components';

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
  overflow-y: auto;
`;

export const Back = styled.a`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
  &:hover {
    color: ${({ theme }) => theme.colors.accent};
  }
`;

export const Head = styled.header`
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: ${({ theme }) => theme.space.lg};
  align-items: center;
  margin: ${({ theme }) => theme.space.lg} 0 ${({ theme }) => theme.space.xl};
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    grid-template-columns: 1fr;
  }
`;

export const Art = styled.img`
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: ${({ theme }) => theme.radii.md};
`;

export const ArtPlaceholder = styled.div`
  width: 96px;
  height: 96px;
  background: ${({ theme }) => theme.colors.raised};
  border-radius: ${({ theme }) => theme.radii.md};
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.space.xs};
`;

export const Artists = styled.p`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;
