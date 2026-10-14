import { css } from 'styled-components';

/**
 * Full-width element whose content sits in a centered column `contentMax`
 * wide. Use it on scroll containers instead of `max-width` + `margin: auto`:
 * the scroll container then spans the whole screen, so its scrollbar sits at
 * the screen edge instead of over the column's right-hand controls.
 * Gutter: lg on wide screens, md on phones.
 */
export const centeredColumn = (contentMax: string) => css`
  width: 100%;
  box-sizing: border-box;
  padding-inline: max(
    ${({ theme }) => theme.space.lg},
    calc((100% - ${contentMax}) / 2)
  );
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding-inline: ${({ theme }) => theme.space.md};
  }
`;
