import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/storage/actions', () => ({ getTrackStreamUrl: vi.fn() }));
import { getTrackStreamUrl } from '@/lib/storage/actions';
import { GET } from './route';

const id = '11111111-1111-4111-8111-111111111111';
const params = Promise.resolve({ id });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('authenticated audio stream', () => {
  it('rejects unauthenticated playback before fetching media', async () => {
    vi.mocked(getTrackStreamUrl).mockResolvedValue({ url: null, error: 'Not authenticated.' });
    const fetchMedia = vi.fn();
    vi.stubGlobal('fetch', fetchMedia);
    expect((await GET(new Request('http://localhost/stream'), { params })).status).toBe(401);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it('preserves byte ranges and streamed audio for seeking', async () => {
    vi.mocked(getTrackStreamUrl).mockResolvedValue({ url: 'https://media.example/signed', error: null });
    const fetchMedia = vi.fn().mockResolvedValue(new Response('mp3', {
      status: 206,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-2/100', 'Accept-Ranges': 'bytes' },
    }));
    vi.stubGlobal('fetch', fetchMedia);
    const response = await GET(new Request('http://localhost/stream', { headers: { Range: 'bytes=0-2' } }), { params });
    expect(fetchMedia.mock.calls[0][1].headers.get('range')).toBe('bytes=0-2');
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-2/100');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('mp3');
  });
});
