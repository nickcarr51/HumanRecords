'use client';

import styled from 'styled-components';

export const Divider = styled.hr`
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  margin-block: ${({ theme }) => theme.space.lg};
  width: 100%;
`;
