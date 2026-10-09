import type { Metadata } from 'next';
import StyledComponentsRegistry from '@/lib/registry';
import { TYPEKIT_KIT_URL } from '@/lib/theme/fonts';
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="" />
        <link rel="stylesheet" href={TYPEKIT_KIT_URL} />
      </head>
      <body>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
      </body>
    </html>
  );
}
