import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { MAX_TIMEOUT_MS, MIN_TIMEOUT_MS, resolveLimits, utf8ByteLength } from '../../defaults.js';
import { runLocalPipeline } from '../../local/index.js';
import { isFilenameValid } from '../../local/utils.js';
import type { CompileLimits, CompileResponse } from '../../types.js';

export interface CompileRouteConfig {
  /** Max simultaneous compiles this route instance runs. Falls back to `PLATEX_MAX_CONCURRENT` env var, then `4`. */
  maxConcurrentCompiles?: number;
  /** Input-size ceilings enforced for every request through this route instance. */
  limits?: CompileLimits;
}

function buildSchema(limits: Required<CompileLimits>) {
  // Per-file cap derived from the aggregate budget (base64 is ~4/3 the
  // decoded size) so a single file can use the whole files budget — one
  // fewer independently-tunable knob than a separate hardcoded per-file cap.
  const perFileBase64Cap = Math.ceil((limits.maxTotalFilesBytes * 4) / 3);

  return z
    .object({
      // .max() counts UTF-16 code units, not bytes — a multibyte source can
      // pass Zod but exceed the byte limit.  The .refine() below enforces the
      // real byte cap so the error surfaces as a clean 400 instead of a 500
      // from runLocalPipeline's own check.
      source: z
        .string()
        .min(1)
        .max(limits.maxSourceBytes * 4)
        .refine((src) => utf8ByteLength(src) <= limits.maxSourceBytes, {
          message: `source exceeds ${limits.maxSourceBytes} byte limit`,
        }),
      engine: z.enum(['pdflatex', 'xelatex', 'lualatex', 'tectonic']).default('pdflatex'),
      passes: z
        .union([z.literal('auto'), z.literal(1), z.literal(2), z.literal(3)])
        .default('auto'),
      bibliography: z.enum(['bibtex', 'biber', 'none']).default('bibtex'),
      files: z.record(z.string(), z.string().max(perFileBase64Cap)).default({}),
      timeout: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(30_000),
    })
    .refine((body) => Object.keys(body.files).length <= limits.maxFilesCount, {
      message: `too many files (max ${limits.maxFilesCount})`,
      path: ['files'],
    })
    .refine(
      (body) => {
        // Approximate decoded size from base64 length without allocating buffers.
        const totalBytes = Object.values(body.files).reduce(
          (sum, b64) => sum + Math.floor((b64.length * 3) / 4),
          0,
        );
        return totalBytes <= limits.maxTotalFilesBytes;
      },
      { message: `total files size exceeds ${limits.maxTotalFilesBytes} bytes`, path: ['files'] },
    );
}

/**
 * Build the `/compile` route as a standalone Hono sub-app. A factory (not a
 * shared singleton) so each instance gets its own concurrency counter and
 * configurable limits — handy for mounting platex into an existing Hono app,
 * or creating multiple independent instances (e.g. in tests) without them
 * sharing state.
 */
export function createCompileRoute(config: CompileRouteConfig = {}): Hono {
  const limits = resolveLimits(config.limits);
  const schema = buildSchema(limits);
  // Bounds how many compiles run concurrently on this instance, protecting
  // the underlying container's CPU/memory (e.g. the 2 CPU / 2GB
  // docker-compose default) from being oversubscribed by simultaneous
  // requests. Read the env var per-instance-creation (not module load) so
  // it's still tunable without a restart if you construct the app lazily.
  const maxConcurrent =
    config.maxConcurrentCompiles ?? Number(process.env.PLATEX_MAX_CONCURRENT ?? 4);
  let activeCompiles = 0;

  const compileRoute = new Hono();

  compileRoute.post('/', zValidator('json', schema), async (c) => {
    const body = c.req.valid('json');

    // Validate filenames: no path traversal, no absolute paths
    for (const filename of Object.keys(body.files)) {
      if (!isFilenameValid(filename)) {
        return c.json({ error: `Invalid filename: ${filename}` }, 400);
      }
    }

    if (activeCompiles >= maxConcurrent) {
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
        limits,
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
      /* v8 ignore next 3 -- finally's exceptional-entry branch is unreachable: catch handles every error and only returns */
    } finally {
      activeCompiles--;
    }
  });

  return compileRoute;
}
