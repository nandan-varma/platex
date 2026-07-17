import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { MAX_FILES_COUNT, MAX_TOTAL_FILES_BYTES } from '../../defaults.js';
import { runLocalPipeline } from '../../local/index.js';
import { isFilenameValid } from '../../local/utils.js';
import type { CompileResponse } from '../../types.js';

const schema = z
  .object({
    source: z.string().min(1).max(5_000_000),
    engine: z.enum(['pdflatex', 'xelatex', 'lualatex']).default('pdflatex'),
    passes: z.union([z.literal('auto'), z.literal(1), z.literal(2), z.literal(3)]).default('auto'),
    bibliography: z.enum(['bibtex', 'biber', 'none']).default('bibtex'),
    files: z.record(z.string(), z.string().max(20_000_000)).default({}),
    timeout: z.number().int().min(1_000).max(120_000).default(30_000),
  })
  .refine((body) => Object.keys(body.files).length <= MAX_FILES_COUNT, {
    message: `too many files (max ${MAX_FILES_COUNT})`,
    path: ['files'],
  })
  .refine(
    (body) => {
      // Approximate decoded size from base64 length without allocating buffers.
      const totalBytes = Object.values(body.files).reduce(
        (sum, b64) => sum + Math.floor((b64.length * 3) / 4),
        0,
      );
      return totalBytes <= MAX_TOTAL_FILES_BYTES;
    },
    { message: `total files size exceeds ${MAX_TOTAL_FILES_BYTES} bytes`, path: ['files'] },
  );

export const compileRoute = new Hono();

// Bounds how many compiles run concurrently on this instance, protecting the
// underlying container's CPU/memory (e.g. the 2 CPU / 2GB docker-compose
// default) from being oversubscribed by simultaneous requests. Read per
// request (not cached at module load) so it can be tuned without a restart
// and so tests can exercise it via env var.
function maxConcurrentCompiles(): number {
  return Number(process.env.PLATEX_MAX_CONCURRENT ?? 4);
}
let activeCompiles = 0;

compileRoute.post('/', zValidator('json', schema), async (c) => {
  const body = c.req.valid('json');

  // Validate filenames: no path traversal, no absolute paths
  for (const filename of Object.keys(body.files)) {
    if (!isFilenameValid(filename)) {
      return c.json({ error: `Invalid filename: ${filename}` }, 400);
    }
  }

  if (activeCompiles >= maxConcurrentCompiles()) {
    return c.json({ error: 'Server busy, try again later' }, 503);
  }

  // Decode base64 files to Buffers
  const files: Record<string, Buffer> = {};
  for (const [name, b64] of Object.entries(body.files)) {
    files[name] = Buffer.from(b64, 'base64');
  }

  activeCompiles++;
  try {
    const result = await runLocalPipeline(body.source, {
      engine: body.engine,
      passes: body.passes,
      bibliography: body.bibliography,
      files,
      timeout: body.timeout,
      // Cancel in-flight compilation if the client disconnects, instead of
      // burning CPU on a response nobody will read.
      signal: c.req.raw.signal,
    });

    const responseBody: CompileResponse = {
      pdf: result.pdf?.toString('base64') ?? null,
      errors: result.errors,
      warnings: result.warnings,
      logs: result.logs,
    };

    return c.json(responseBody);
  } catch (err) {
    console.error('[platex] compile failed:', err);
    const name = err instanceof Error ? err.constructor.name : 'Error';
    return c.json({ error: `Compilation failed: ${name}` }, 500);
  } finally {
    activeCompiles--;
  }
});
