import { describe, it, expect, vi, afterEach } from 'vitest';

// Isolated in its own file: forces existsSync to always report false, so we
// can exercise the "no system tectonic and no bundled binary" branch without
// disturbing the real bin/tectonic that other tests rely on.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: () => false };
});

describe('resolveTectonicBinary - no binary available', () => {
  const originalPath = process.env['PATH'];

  afterEach(() => {
    process.env['PATH'] = originalPath;
  });

  it('returns null when neither a system nor bundled tectonic binary exists', async () => {
    process.env['PATH'] = '/usr/bin:/bin';
    const { resolveTectonicBinary } = await import('./tectonic.js');
    const resolved = await resolveTectonicBinary();
    expect(resolved).toBeNull();
  });
});
