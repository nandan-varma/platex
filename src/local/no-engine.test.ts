import { describe, expect, it, vi } from 'vitest';

// Isolated: force both engine-detection paths to fail so runLocalPipeline hits
// its "no engine and no bundled Tectonic" branch. Mocked in its own file so the
// stubs don't leak into the real-compilation suites.
vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return { ...actual, isEngineAvailable: async () => false };
});
vi.mock('./tectonic.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tectonic.js')>();
  return { ...actual, resolveTectonicBinary: async () => null };
});

describe('runLocalPipeline - no usable engine', () => {
  it('throws a helpful error when neither a system engine nor bundled Tectonic is available', async () => {
    const { runLocalPipeline } = await import('./index.js');

    await expect(runLocalPipeline('clean document', { engine: 'pdflatex' })).rejects.toThrow(
      /Engine 'pdflatex' is not installed.*Tectonic/s,
    );
  });
});
