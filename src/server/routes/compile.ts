import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { runLocalPipeline } from '../../local/index.js';
import type { CompileResponse } from '../../types.js';

const SAFE_FILENAME = /^[a-zA-Z0-9._-][a-zA-Z0-9._/-]*$/;

const schema = z.object({
  source: z.string().min(1).max(5_000_000),
  engine: z.enum(['pdflatex', 'xelatex', 'lualatex']).default('pdflatex'),
  passes: z.union([z.literal('auto'), z.literal(1), z.literal(2), z.literal(3)]).default('auto'),
  bibliography: z.enum(['bibtex', 'biber', 'none']).default('bibtex'),
  files: z.record(z.string(), z.string().max(20_000_000)).default({}),
  timeout: z.number().int().min(1_000).max(120_000).default(30_000),
});

export const compileRoute = new Hono();

compileRoute.post('/', zValidator('json', schema), async (c) => {
  const body = c.req.valid('json');

  // Validate filenames: no path traversal, no absolute paths
  for (const filename of Object.keys(body.files)) {
    if (!SAFE_FILENAME.test(filename) || filename.includes('..') || filename.startsWith('/')) {
      return c.json({ error: `Invalid filename: ${filename}` }, 400);
    }
  }

  // Decode base64 files to Buffers
  const files: Record<string, Buffer> = {};
  for (const [name, b64] of Object.entries(body.files)) {
    files[name] = Buffer.from(b64, 'base64');
  }

  try {
    const result = await runLocalPipeline(body.source, {
      engine: body.engine,
      passes: body.passes,
      bibliography: body.bibliography,
      files,
      timeout: body.timeout,
    });

    const responseBody: CompileResponse = {
      pdf: result.pdf?.toString('base64') ?? null,
      errors: result.errors,
      warnings: result.warnings,
      logs: result.logs,
    };

    return c.json(responseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Compilation failed: ${message}` }, 500);
  }
});
