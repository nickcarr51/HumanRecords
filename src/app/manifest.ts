import type { MetadataRoute } from 'next';
import { palette } from '@/lib/theme/tokens';

// start_url "/" — middleware sends signed-in users on to /feed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Human Services',
    short_name: 'Human',
    start_url: '/',
    display: 'standalone',
    theme_color: palette.bgBase,
    background_color: palette.bgBase,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
