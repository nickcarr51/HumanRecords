import { describe, expect, it, vi, afterEach } from 'vitest';
import StyleGuideLayout from './layout';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('style-guide layout gate', () => {
  it('calls notFound in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => StyleGuideLayout({ children: null })).toThrow('NEXT_NOT_FOUND');
  });

  it('renders children outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => StyleGuideLayout({ children: null })).not.toThrow();
  });
});
