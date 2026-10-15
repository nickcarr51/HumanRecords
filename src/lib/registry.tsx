'use client';

import React, { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';
import { ThemeModeProvider } from '@/lib/theme/ThemeModeProvider';

export default function StyledComponentsRegistry({
  children,
  initialDark = true,
}: {
  children: React.ReactNode;
  /** Night-mode cookie as read by the server; see ThemeModeProvider. */
  initialDark?: boolean;
}) {
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const styles = styledComponentsStyleSheet.getStyleElement();
    styledComponentsStyleSheet.instance.clearTag();
    return <>{styles}</>;
  });

  if (typeof window !== 'undefined') {
    return <ThemeModeProvider initialDark={initialDark}>{children}</ThemeModeProvider>;
  }

  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      <ThemeModeProvider initialDark={initialDark}>{children}</ThemeModeProvider>
    </StyleSheetManager>
  );
}
