import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ToastProvider } from '@/components/Toast';

const getTrackDownloadUrl = vi.fn();
const navigateTo = vi.fn();
vi.mock('@/lib/storage/actions', () => ({
  getTrackDownloadUrl: (...a: unknown[]) => getTrackDownloadUrl(...a),
}));
vi.mock('./navigate', () => ({ navigateTo: (...a: unknown[]) => navigateTo(...a) }));

import { DownloadButton } from './DownloadButton';
import { DownloadsProvider } from './DownloadsProvider';

const IDLE = 'Download Night Drive';
const DONE = 'Downloaded — download Night Drive again';
const TOAST = 'Couldn\'t download "Night Drive" — try again.';

function setup(initialIds: string[] = []) {
  renderWithTheme(
    <ToastProvider>
      <DownloadsProvider initialIds={initialIds}>
        <DownloadButton trackId="t1" title="Night Drive" />
      </DownloadsProvider>
    </ToastProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('DownloadButton', () => {
  it('shows a decorative vector and the download label when not downloaded', () => {
    setup();
    expect(screen.getByRole('button', { name: IDLE }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows a decorative vector and the re-download label when already downloaded', () => {
    setup(['t1']);
    expect(screen.getByRole('button', { name: DONE }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('on success navigates to the signed URL and flips to downloaded', async () => {
    getTrackDownloadUrl.mockResolvedValue({ url: 'https://r2.example/x', error: null });
    setup();
    fireEvent.click(screen.getByRole('button', { name: IDLE }));
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('https://r2.example/x'));
    expect(getTrackDownloadUrl).toHaveBeenCalledWith('t1');
    expect(await screen.findByRole('button', { name: DONE })).toBeInTheDocument();
  });

  it('re-downloading from the downloaded state still calls the action', async () => {
    getTrackDownloadUrl.mockResolvedValue({ url: 'https://r2.example/x', error: null });
    setup(['t1']);
    fireEvent.click(screen.getByRole('button', { name: DONE }));
    await waitFor(() => expect(navigateTo).toHaveBeenCalledTimes(1));
  });

  it('ignores clicks while signing and shows busy state', async () => {
    let resolve!: (v: { url: string; error: null }) => void;
    getTrackDownloadUrl.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();
    const btn = screen.getByRole('button', { name: IDLE });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(getTrackDownloadUrl).toHaveBeenCalledTimes(1);
    resolve({ url: 'https://r2.example/x', error: null });
    await waitFor(() => expect(navigateTo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'false'));
  });

  it('shows a toast on an { error } result and stays not-downloaded', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getTrackDownloadUrl.mockResolvedValue({ url: null, error: 'Track not found.' });
    setup();
    fireEvent.click(screen.getByRole('button', { name: IDLE }));
    expect(await screen.findByText(TOAST)).toBeInTheDocument();
    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: IDLE })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows a toast when the action throws (e.g. offline)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getTrackDownloadUrl.mockRejectedValue(new Error('Failed to fetch'));
    setup(['t1']);
    fireEvent.click(screen.getByRole('button', { name: DONE }));
    expect(await screen.findByText(TOAST)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DONE })).toBeInTheDocument();
    spy.mockRestore();
  });
});
