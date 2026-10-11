import { getTrackStreamUrl } from '@/lib/storage/actions';

/** Same-origin, authenticated streaming keeps Web Audio independent of R2 CORS. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 404 });
  const signed = await getTrackStreamUrl(id);
  if (!signed.url) return new Response(null, { status: signed.error === 'Not authenticated.' ? 401 : 404 });
  try {
    const headers = new Headers();
    const range = request.headers.get('range');
    if (range) headers.set('range', range);
    const upstream = await fetch(signed.url, { headers, signal: request.signal, cache: 'no-store' });
    if (!upstream.ok && upstream.status !== 416) {
      await upstream.body?.cancel();
      return new Response(null, { status: 502 });
    }
    const responseHeaders = new Headers({ 'Cache-Control': 'private, no-store' });
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response(null, { status: request.signal.aborted ? 499 : 502 });
  }
}
