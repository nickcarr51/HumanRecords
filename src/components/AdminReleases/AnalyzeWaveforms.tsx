// src/components/AdminReleases/AnalyzeWaveforms.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Heading } from '@/components/Heading';
import { Text } from '@/components/Text';
import { getPeaksJob, getPeaksStatus } from '@/lib/admin/peaks-actions';
import { storePeaks } from '@/lib/peaks/compute';
import { Group, HeaderRow, PlainList, Status } from './releases.styles';

type RowState = 'checking' | 'has' | 'missing' | 'unknown' | 'analyzing' | 'done' | 'failed';

const LABELS: Record<RowState, string> = {
  checking: 'checking…',
  has: '✓ has waveform',
  missing: '— missing',
  unknown: '',
  analyzing: 'analyzing…',
  done: '✓ analyzed',
  failed: 'failed',
};

export type AnalyzeDeps = {
  getPeaksStatus: typeof getPeaksStatus;
  getPeaksJob: typeof getPeaksJob;
  fetchAudio: (url: string) => Promise<Blob>;
  storePeaks: (blob: Blob, url: string) => Promise<boolean>;
};

async function fetchAudio(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Audio fetch failed (${res.status})`);
  return res.blob();
}

const DEFAULT_DEPS: AnalyzeDeps = { getPeaksStatus, getPeaksJob, fetchAudio, storePeaks };

// Decodes each MP3 in this browser (Web Audio is fine on admin pages) and
// stores its loudness file for the player. Re-running overwrites in place.
export function AnalyzeWaveforms({ tracks, deps = DEFAULT_DEPS }: { tracks: { id: string; title: string }[]; deps?: AnalyzeDeps }) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => Object.fromEntries(tracks.map((t) => [t.id, 'checking'])));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = tracks.map((t) => t.id).join(',');

  useEffect(() => {
    let live = true;
    const list = ids ? ids.split(',') : [];
    if (list.length === 0) return;
    // Only touch rows still 'checking' so a late response can't undo a run. A
    // track with no row yet (added after mount) counts as 'checking'.
    const settle = (next: (id: string) => RowState) =>
      setRows((r) => {
        const out = { ...r };
        for (const id of list) if ((r[id] ?? 'checking') === 'checking') out[id] = next(id);
        for (const id of Object.keys(r)) if (r[id] === 'checking') out[id] = next(id);
        return out;
      });
    deps.getPeaksStatus(list)
      .then((res) => {
        if (!live) return;
        if (res.error !== null) {
          setError(res.error);
          settle(() => 'unknown');
          return;
        }
        settle((id) => (res.status[id] ? 'has' : 'missing'));
      })
      .catch(() => {
        if (!live) return;
        setError("Couldn't check waveforms.");
        settle(() => 'unknown');
      });
    return () => {
      live = false;
    };
  }, [ids, deps]);

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mark = (id: string, state: RowState) => setRows((r) => ({ ...r, [id]: state }));

  async function analyzeOne(id: string): Promise<void> {
    mark(id, 'analyzing');
    try {
      const job = await deps.getPeaksJob(id);
      if (job.error !== null) return mark(id, 'failed');
      const audio = await deps.fetchAudio(job.audioUrl);
      mark(id, (await deps.storePeaks(audio, job.peaksUrl)) ? 'done' : 'failed');
    } catch {
      mark(id, 'failed');
    }
  }

  async function analyzeAll() {
    setRunning(true);
    setError(null);
    // One at a time: each decode holds a whole track's samples in memory.
    for (const t of tracks) {
      if (!mounted.current) return;
      await analyzeOne(t.id);
    }
    if (mounted.current) setRunning(false);
  }

  if (tracks.length === 0) return null;
  return (
    <Group aria-label="Waveforms">
      <HeaderRow>
        <Heading $level={3}>Waveforms</Heading>
        <Button type="button" variant="secondary" size="sm" loading={running} disabled={running} onClick={analyzeAll}>
          Analyze all
        </Button>
      </HeaderRow>
      {error && <Alert $tone="error" role="alert">{error}</Alert>}
      <PlainList>
        {tracks.map((t) => (
          <li key={t.id}>
            <Text as="span">{t.title}</Text>{' '}
            <Status $tone={rows[t.id] === 'failed' ? 'error' : 'muted'}>{LABELS[rows[t.id] ?? 'unknown']}</Status>
          </li>
        ))}
      </PlainList>
    </Group>
  );
}
