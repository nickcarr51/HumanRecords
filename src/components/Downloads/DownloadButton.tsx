'use client';

import { useRef, useState } from 'react';
import { getTrackDownloadUrl } from '@/lib/storage/actions';
import { PlayButton } from '@/components/Feed/feed.styles';
import { Spinner } from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import { useDownloads } from './DownloadsProvider';
import { navigateTo } from './navigate';

export function DownloadButton({ trackId, title }: { trackId: string; title: string }) {
  const { isDownloaded, markDownloaded } = useDownloads();
  const { notify } = useToast();
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
      notify(`Couldn't download "${title}" — try again.`, 'error');
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
      {signing ? <Spinner $size="1rem" aria-hidden /> : downloaded ? '✓' : '↓'}
    </PlayButton>
  );
}
