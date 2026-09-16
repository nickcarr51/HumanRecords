'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import styled, { keyframes } from 'styled-components';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Region = styled.div`
  position: fixed;
  bottom: ${({ theme }) => theme.space.lg};
  right: ${({ theme }) => theme.space.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};
  z-index: ${({ theme }) => theme.zIndex.toast};
`;

const Item = styled.div<{ $tone: ToastTone }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.raised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 3px solid
    ${({ theme, $tone }) =>
      ({
        success: theme.colors.success,
        error: theme.colors.error,
        info: theme.colors.info,
      })[$tone]};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.space.md};
  min-width: 220px;
  animation: ${slideIn} ${({ theme }) => theme.motion.base}
    ${({ theme }) => theme.motion.ease};
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <Region role="region" aria-label="Notifications">
        {items.map((t) => (
          <Item key={t.id} $tone={t.tone} role="status">
            {t.message}
          </Item>
        ))}
      </Region>
    </ToastContext.Provider>
  );
}
