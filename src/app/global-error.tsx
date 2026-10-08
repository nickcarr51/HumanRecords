'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'monospace', padding: '2rem' }}>
        <h1>Something went wrong.</h1>
        <p>Please reload the page.</p>
      </body>
    </html>
  );
}
