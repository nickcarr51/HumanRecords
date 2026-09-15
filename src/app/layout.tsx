import type { Metadata } from 'next';
import StyledComponentsRegistry from '@/lib/registry';
import { plexMono, spaceGrotesk } from '@/lib/theme/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Human Services',
  description: 'Human Records — invite-only music repository',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plexMono.variable} ${spaceGrotesk.variable}`}>
      <body>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
      </body>
    </html>
  );
}
