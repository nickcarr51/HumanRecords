'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '../Input';

export function SearchInput({
  initialQuery,
  label = 'Search artists',
}: {
  initialQuery: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cancel a pending debounced navigation if the input unmounts.
  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(value: string) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 250);
  }

  return (
    <Input
      type="search"
      role="searchbox"
      aria-label={label}
      placeholder={label}
      defaultValue={initialQuery}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
