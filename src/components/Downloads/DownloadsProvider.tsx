'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type DownloadsContextValue = {
  isDownloaded: (trackId: string) => boolean;
  markDownloaded: (trackId: string) => void;
};

// Outside a provider nothing is downloaded and marking is a no-op, so rows
// render anywhere (tests, future reuse) without wiring.
const FALLBACK: DownloadsContextValue = {
  isDownloaded: () => false,
  markDownloaded: () => {},
};

const DownloadsContext = createContext<DownloadsContextValue>(FALLBACK);

// Server pages seed `initialIds` (getMyDownloadedTrackIds). Local marks are kept
// separately and unioned, so a re-render with new ids (e.g. ?page=2 on the same
// route, which doesn't remount this) is reflected without losing clicks.
export function DownloadsProvider({
  initialIds,
  children,
}: {
  initialIds: string[];
  children: React.ReactNode;
}) {
  const initial = useMemo(() => new Set(initialIds), [initialIds]);
  const [marked, setMarked] = useState<Set<string>>(() => new Set());

  const markDownloaded = useCallback((trackId: string) => {
    setMarked((prev) => (prev.has(trackId) ? prev : new Set(prev).add(trackId)));
  }, []);

  const value = useMemo<DownloadsContextValue>(
    () => ({ isDownloaded: (id) => initial.has(id) || marked.has(id), markDownloaded }),
    [initial, marked, markDownloaded],
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}

export function useDownloads(): DownloadsContextValue {
  return useContext(DownloadsContext);
}
