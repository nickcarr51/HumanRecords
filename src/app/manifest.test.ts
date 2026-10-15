import { describe, expect, it } from 'vitest';
import manifest from './manifest';

describe('manifest', () => {
  it('describes the installable app', () => {
    expect(manifest()).toEqual({
      name: 'Human Services',
      short_name: 'Human',
      start_url: '/',
      display: 'standalone',
      theme_color: '#e8e8e8',
      background_color: '#e8e8e8',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  });
});
