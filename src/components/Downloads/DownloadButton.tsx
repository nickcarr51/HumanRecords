'use client';

import { useRef, useState } from 'react';
import { getTrackDownloadUrl } from '@/lib/storage/actions';
import { PlayButton } from '@/components/Feed/feed.styles';
import { Spinner } from '@/components/Spinner';
import { useOptionalToast } from '@/components/Toast';
import { useDownloads } from './DownloadsProvider';
import { navigateTo } from './navigate';
import { SweepIcon } from '@/components/Player/SweepIcon';

export function DownloadButton({ trackId, title }: { trackId: string; title: string }) {
  const { isDownloaded, markDownloaded } = useDownloads();
  const toast = useOptionalToast(); // null outside a provider: rows render anywhere
  const [signing, setSigning] = useState(false);
  const inFlight = useRef(false); // state updates are async; the ref blocks double taps
  const downloaded = isDownloaded(trackId);

  async function onClick() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSigning(true);
    try {
      const { url, error } = await getTrackDownloadUrl(trackId);
      if (error || !url) throw new Error(error ?? 'No download URL');
      markDownloaded(trackId);
      navigateTo(url);
    } catch (err) {
      console.error('Download failed', err);
      toast?.notify(`Couldn't download "${title}" — try again.`, 'error');
    } finally {
      inFlight.current = false;
      setSigning(false);
    }
  }

  return (
    <PlayButton
      type="button"
      aria-label={downloaded ? `Downloaded — download ${title} again` : `Download ${title}`}
      aria-busy={signing}
      onClick={onClick}
    >
      {signing ? <Spinner $size="1rem" aria-hidden /> : (
        <SweepIcon fill="currentColor">
          {downloaded ? (
            <path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter" />
          ) : (
            <path d="M4 7h16l-8 14Z" />
          )}
        </SweepIcon>
      )}
    </PlayButton>
  );
}
