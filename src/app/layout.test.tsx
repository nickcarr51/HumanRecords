import { afterEach, describe, expect, it, vi } from 'vitest';

const DESCRIPTION = "Human Records' invite-only music repository.";

async function load(siteUrl: string | undefined) {
  vi.resetModules();
  vi.stubEnv('SITE_URL', siteUrl as string);
  return (await import('./layout')).metadata;
}

afterEach(() => vi.unstubAllEnvs());

describe('root metadata', () => {
  it('sets the title template, description, OG and Twitter card', async () => {
    const m = await load('https://services.humanrecords.co');
    expect(m.title).toEqual({ default: 'Human Services', template: '%s · Human Services' });
    expect(m.description).toBe(DESCRIPTION);
    expect(m.metadataBase?.toString()).toBe('https://services.humanrecords.co/');
    expect(m.openGraph).toMatchObject({
      title: 'Human Services',
      description: DESCRIPTION,
      siteName: 'Human Services',
      type: 'website',
      images: [{ url: '/og.png', width: 1200, height: 630 }],
    });
    expect(m.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Human Services',
      description: DESCRIPTION,
      images: ['/og.png'],
    });
  });

  it('omits metadataBase when SITE_URL is missing or invalid', async () => {
    expect((await load('')).metadataBase).toBeUndefined();
    expect((await load('not a url')).metadataBase).toBeUndefined();
  });
});
