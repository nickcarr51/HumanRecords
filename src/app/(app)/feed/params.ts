import { MAX_PAGE } from '@/lib/supabase/feed';

// ?page= from the URL: anything that isn't a finite number in 1..MAX_PAGE is page 1.
export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= MAX_PAGE ? Math.floor(n) : 1;
}
