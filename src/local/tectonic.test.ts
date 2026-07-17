import { existsSync } from 'node:fs';
import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveTectonicBinary } from './tectonic.js';

const TMP_BINARY = '/tmp/platex-tectonic';

describe('resolveTectonicBinary', () => {
  const originalPath = process.env.PATH;

  afterEach(async () => {
    process.env.PATH = originalPath;
    await rm(TMP_BINARY, { force: true });
  });

  it('prefers a system tectonic binary found on PATH', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'platex-fakebin-'));
    const fakeTectonicPath = join(binDir, 'tectonic');
    await writeFile(fakeTectonicPath, '#!/usr/bin/env node\nconsole.log("fake");\n', 'utf-8');
    await chmod(fakeTectonicPath, 0o755);

    try {
      process.env.PATH = `${binDir}:${originalPath}`;
      const resolved = await resolveTectonicBinary();
      expect(resolved).toBe('tectonic');
    } finally {
      await rm(binDir, { recursive: true, force: true });
    }
  });

  it('falls back to the bundled binary, copying it to /tmp and marking it executable', async () => {
    // Ensure no system tectonic shadows the bundled one for this test.
    process.env.PATH = '/usr/bin:/bin';
    await rm(TMP_BINARY, { force: true });

    const resolved = await resolveTectonicBinary();

    expect(resolved).toBe(TMP_BINARY);
    expect(existsSync(TMP_BINARY)).toBe(true);
    const stats = await stat(TMP_BINARY);
    expect(stats.mode & 0o111).not.toBe(0);
  });

  it('reuses the already-prepared /tmp binary on a warm call without erroring', async () => {
    process.env.PATH = '/usr/bin:/bin';
    await rm(TMP_BINARY, { force: true });

    const first = await resolveTectonicBinary();
    const second = await resolveTectonicBinary();

    expect(first).toBe(TMP_BINARY);
    expect(second).toBe(TMP_BINARY);
  });
});
