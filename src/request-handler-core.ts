import type { CompileOptions, CompileResult, Engine, PassCount, PlatexClient } from './types.js';

export interface HandleCompileRequestOptions extends CompileOptions {
  /**
   * `'pdf'` (default): respond with raw PDF bytes and `Content-Type: application/pdf`
   * on success, or a JSON `{ errors, warnings }` body with status `422` on
   * compile failure.
   * `'json'`: always respond `200` with `{ pdf: string | null, errors, warnings }`
   * (`pdf` base64-encoded), regardless of success — useful when the caller
   * wants to inspect errors/warnings alongside a successful PDF in one shape.
   */
  responseFormat?: 'pdf' | 'json';
}

interface CompileRequestBody {
  source?: unknown;
  engine?: unknown;
  passes?: unknown;
  bibliography?: unknown;
  files?: unknown;
  timeout?: unknown;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Builds a `handleCompileRequest(request, options?)` function bound to a
 * specific compile implementation. Shared by the Node entry (`platex`, full
 * local+remote dispatch) and the edge entry (`platex/client`, remote-only)
 * so the actual Fetch API Request → Response handling — body parsing,
 * validation, status codes — is written exactly once and behaves identically
 * everywhere: Next.js Route Handlers, Astro API endpoints, TanStack Start
 * server routes, SvelteKit endpoints, Remix resource routes, Bun/Deno/Hono
 * servers, Cloudflare Workers — anything that hands you a standard `Request`.
 */
export function makeRequestHandler(
  compileImpl: (source: string, options: CompileOptions) => Promise<CompileResult>,
) {
  return async function handleCompileRequest(
    request: Request,
    options: HandleCompileRequestOptions = {},
  ): Promise<Response> {
    let body: CompileRequestBody;
    try {
      body = (await request.json()) as CompileRequestBody;
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    if (typeof body.source !== 'string' || body.source.length === 0) {
      return jsonError('`source` is required and must be a non-empty string', 400);
    }

    let files: Record<string, Buffer> | undefined;
    if (body.files !== undefined) {
      if (typeof body.files !== 'object' || body.files === null || Array.isArray(body.files)) {
        return jsonError('`files` must be an object of filename -> base64 string', 400);
      }
      files = {};
      for (const [name, value] of Object.entries(body.files as Record<string, unknown>)) {
        if (typeof value !== 'string') {
          return jsonError(`\`files.${name}\` must be a base64-encoded string`, 400);
        }
        files[name] = Buffer.from(value, 'base64');
      }
    }

    const { responseFormat = 'pdf', ...compileOptions } = options;

    // Built via assignment rather than nested conditional-spreads so each
    // field is checked against its own (non-`| undefined`) CompileOptions
    // type individually, instead of tripping exactOptionalPropertyTypes on
    // the merged object literal's inferred shape.
    const mergedOptions: CompileOptions = { ...compileOptions };
    if (body.engine !== undefined) mergedOptions.engine = body.engine as Engine;
    if (body.passes !== undefined) mergedOptions.passes = body.passes as PassCount;
    if (body.bibliography !== undefined) {
      mergedOptions.bibliography = body.bibliography as NonNullable<CompileOptions['bibliography']>;
    }
    if (files !== undefined) mergedOptions.files = files;
    if (body.timeout !== undefined) mergedOptions.timeout = body.timeout as number;

    let result: CompileResult;
    try {
      result = await compileImpl(body.source, mergedOptions);
    } catch (err) {
      if (err instanceof TypeError) {
        return jsonError(err.message, 400);
      }
      if (
        err instanceof Error &&
        /^platex: (failed to reach service|service returned)/.test(err.message)
      ) {
        console.error('[platex] handleCompileRequest: upstream service error:', err);
        return jsonError('The compile service is unreachable or returned an error', 502);
      }
      console.error('[platex] handleCompileRequest failed:', err);
      return jsonError('Compilation failed', 500);
    }

    if (responseFormat === 'json') {
      return jsonResponse(
        {
          pdf: result.pdf ? result.pdf.toString('base64') : null,
          errors: result.errors,
          warnings: result.warnings,
        },
        200,
      );
    }

    if (!result.pdf) {
      return jsonResponse({ errors: result.errors, warnings: result.warnings }, 422);
    }

    return new Response(result.pdf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
  };
}

/**
 * Bind `handleCompileRequest` to a specific {@link PlatexClient} — handy when
 * you already created one with `createPlatexClient()` and want its defaults
 * (serviceUrl, engine, timeout, ...) applied without repeating them in every
 * route file.
 *
 * ```ts
 * const client = createPlatexClient({ serviceUrl: process.env.PLATEX_SERVICE_URL })
 * export const handleCompileRequest = createRequestHandler(client)
 * ```
 */
export function createRequestHandler(client: Pick<PlatexClient, 'compile'>) {
  return makeRequestHandler(client.compile);
}
