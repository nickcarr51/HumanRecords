import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { theme, amberTheme } from '@/lib/theme/theme';

type Options = Omit<RenderOptions, 'wrapper'> & {
  /** Render under the amber (night) theme instead of the default gray one. */
  dark?: boolean;
};

export function renderWithTheme(ui: ReactElement, options: Options = {}) {
  const { dark = false, ...rest } = options;
  const t = dark ? amberTheme : theme;
  return render(ui, {
    wrapper: ({ children }) => <ThemeProvider theme={t}>{children}</ThemeProvider>,
    ...rest,
  });
}
