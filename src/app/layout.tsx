import type { Metadata } from 'next';
import StyledComponentsRegistry from '@/lib/registry';
import { TYPEKIT_KIT_URL } from '@/lib/theme/fonts';
import { CRTTexture } from '@/components/CRTTexture/CRTTexture';
import './globals.css';

const DESCRIPTION = "Human Records' invite-only music repository.";

// Absolute base for OG/Twitter image URLs (crawlers need absolute URLs).
// Missing/invalid SITE_URL → omit it rather than crash the build.
function metadataBase(): URL | undefined {
  try {
    return process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined;
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  title: { default: 'Human Services', template: '%s · Human Services' },
  description: DESCRIPTION,
  metadataBase: metadataBase(),
  openGraph: {
    title: 'Human Services',
    description: DESCRIPTION,
    siteName: 'Human Services',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Human Services',
    description: DESCRIPTION,
    images: ['/og.png'],
  },
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
        <StyledComponentsRegistry>
          {children}
          <CRTTexture />
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
