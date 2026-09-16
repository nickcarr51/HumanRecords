'use client';

import React, { useEffect } from 'react';
import styled, { keyframes } from 'styled-components';

const fade = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const pop = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  padding: ${({ theme }) => theme.space.lg};
  z-index: ${({ theme }) => theme.zIndex.modal};
  animation: ${fade} ${({ theme }) => theme.motion.base}
    ${({ theme }) => theme.motion.ease};
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.space.xl};
  width: 100%;
  max-width: 440px;
  animation: ${pop} ${({ theme }) => theme.motion.base}
    ${({ theme }) => theme.motion.ease};
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  label?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, label, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Overlay onClick={onClose}>
      <Panel
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Panel>
    </Overlay>
  );
}
