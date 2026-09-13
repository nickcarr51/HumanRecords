'use client';

import styled, { keyframes } from 'styled-components';

const blink = keyframes`
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
`;

export const Main = styled.main`
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  background: #0a0a0a;
  color: #f5f0e6;
  text-align: center;
  padding: 1.5rem;
`;

export const Logo = styled.img`
  width: clamp(64px, 12vw, 96px);
  height: auto;
  margin-bottom: 0.5rem;
`;

export const StatusTag = styled.p`
  font-family: 'Courier New', ui-monospace, monospace;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  color: #ffd000;
  border: 1px solid #ffd000;
  padding: 0.25rem 0.75rem;
  text-transform: uppercase;

  &::after {
    content: '_';
    animation: ${blink} 1s step-end infinite;
  }
`;

export const Wordmark = styled.h1`
  font-family: 'Courier New', ui-monospace, monospace;
  font-size: clamp(2.5rem, 8vw, 5rem);
  font-weight: 700;
  letter-spacing: 0.02em;
  margin: 0;
`;

export const Subline = styled.p`
  font-family: 'Courier New', ui-monospace, monospace;
  font-size: 0.9rem;
  letter-spacing: 0.1em;
  color: #a3a3a3;
  margin: 0;
  text-transform: uppercase;
`;
