'use client';

import styled from 'styled-components';

// Dropdown + picked-value styles mirror ArtistCombobox (re-skin consolidates).
export const ComboBox = styled.div`
  position: relative;
`;

export const List = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  margin: ${({ theme }) => theme.space.xs} 0 0;
  padding: ${({ theme }) => theme.space.xs} 0;
  list-style: none;
  background: ${({ theme }) => theme.colors.raised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
`;

export const Option = styled.li<{ $active: boolean; $disabled: boolean }>`
  padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $active, $disabled }) =>
    $disabled ? theme.colors.faint : $active ? theme.colors.accent : theme.colors.text};
  background: ${({ theme, $active }) => ($active ? theme.colors.surface : 'transparent')};
`;

export const Picked = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

export const Danger = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};
  padding-top: ${({ theme }) => theme.space.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;
