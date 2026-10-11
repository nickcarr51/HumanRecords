'use client';

import { useState } from 'react';
import type { AdminResult } from '@/lib/admin/types';

// One in-flight admin action with its error. run() resolves true on success.
export function useAdminAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<AdminResult>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return false;
      }
      return true;
    } catch {
      setError('Something went wrong. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}
