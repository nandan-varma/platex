# platex

[![npm version](https://img.shields.io/npm/v/@nandan-varma/platex.svg)](https://www.npmjs.com/package/@nandan-varma/platex)
[![license](https://img.shields.io/npm/l/@nandan-varma/platex.svg)](LICENSE)

Compile LaTeX to PDF in TypeScript, with output as close to Overleaf as possible. Works in any framework that speaks the Fetch API — Next.js, TanStack Start, Astro, SvelteKit, Remix, Bun, Deno, Cloudflare Workers — on Node.js or the edge.

## Quick start

```bash
npm install @nandan-varma/platex
```

Create a client once, with your defaults baked in, and use it everywhere:

```typescript
// lib/platex.ts
import { createPlatexClient } from '@nandan-varma/platex'

export const platex = createPlatexClient({
  serviceUrl: process.env.PLATEX_SERVICE_URL, // omit this line entirely — it's read automatically anyway
  timeout: 25_000,
})
```

```typescript
// anywhere in your app
import { platex } from '@/lib/platex'

const result = await platex.compile(source)
if (result.pdf) { /* Buffer, ready to return/save/stream */ }
```

Or skip the client and drop a ready-made request handler straight into a route — it works identically in every framework below:

```typescript
// app/api/compile/route.ts (Next.js) — see "Framework recipes" for Astro, TanStack Start, SvelteKit, Remix
import { handleCompileRequest } from '@nandan-varma/platex'

export const POST = handleCompileRequest
```

That's it — zero config needed if `PLATEX_SERVICE_URL` (and, if you've enabled auth, `PLATEX_API_KEY`) are set as environment variables. Every option below is optional; nothing is hardcoded.

## Examples & demo

[`examples/nextjs-demo/`](examples/nextjs-demo/) is a real Next.js App Router docs site (shadcn/ui, Geist, dark mode). Docs and demos are separate: `/docs/rendering/*` is static documentation (explanation + code, zero runtime compute — confirmed by `next build` marking every one of them `○ Static`), while `/demo/*` actually compiles the same "kitchen sink" LaTeX document (math, tables, figures, citations, code, table of contents) live, per request (`ƒ Dynamic`).

| Route | Pattern | What it shows |
|---|---|---|
| `/` | — | Overview, install snippet, feature highlights |
| `/docs/installation` | — | Deploying the service and installing the client library |
| `/docs/rendering/*` | — | Static docs: how each pattern works, with its code sample |
| `/docs/api-reference` | — | `compile()`, `CompileOptions`, `CompileResult` |
| `/demo/ssr` | Server Component | Live: `compile()` runs during the server render; the PDF ships embedded in the initial HTML |
| `/demo/csr` | Client Component + `fetch` | Live: edit the source in the browser, compile on demand via `POST /api/compile` |
| `/demo/server-actions` | `'use server'` function | Live: a form submits straight to a server function via `useActionState` |
| `/demo/route-handlers` | Route Handler | Live: the raw Node.js API route the other patterns call — usable directly (e.g. with curl) |

Run it:

```bash
npm run build              # build platex itself first — the demo depends on dist/
cd examples/nextjs-demo
npm install
npm run dev
```

The individual feature `.tex` files it's assembled from (math, lists, tables, figures, bibliography, sectioning, code listings, hyperlinks) live in [`examples/tex/`](examples/tex/).

## Architecture

```
┌─────────────────────────────────┐     HTTP POST /compile      ┌──────────────────────────────────┐
│  Your app (any framework,       │ ─────────────────────────▶  │  platex service (Vercel/Fly/      │
│  Node.js or edge)                │                              │  Railway/Render/self-hosted)      │
│                                 │                              │                                  │
│  import { createPlatexClient }  │ ◀─────────────────────────  │  Tectonic TeX engine (bundled    │
│    from '@nandan-varma/platex'  │        PDF binary            │  ~13MB binary, auto-downloads    │
│                                 │                              │  LaTeX packages on first use)    │
│  const platex = createPlatexClient({ ... })                    │                                  │
│  await platex.compile(source)   │                              │  POST /compile → runs TeX →      │
│                                 │                              │  returns PDF as base64 JSON      │
└─────────────────────────────────┘                              └──────────────────────────────────┘
```

### Two deployment targets, same library

| Mode | When | Engine | Use case |
|---|---|---|---|
| **Remote** (recommended for Vercel/edge) | `serviceUrl` resolved | Tectonic (on the service) | Production, or any edge runtime |
| **Local** | No `serviceUrl`, system TeX found | pdflatex / xelatex / lualatex | Self-hosted or dev with TeX Live |
| **Local fallback** | No `serviceUrl`, no system TeX | Bundled Tectonic binary | Dev without TeX Live installed |

The library auto-selects the engine — you don't configure this directly. `serviceUrl` resolves from the explicit option, falling back to `PLATEX_SERVICE_URL`.

### Three entry points

| Import from | Runtime | What it's for |
|---|---|---|
| `@nandan-varma/platex` | Node.js | `compile`, `createPlatexClient`, `handleCompileRequest` — full library, local-compile fallback included |
| `@nandan-varma/platex/client` | Anything with `fetch` — Vercel/Next.js Edge Runtime, Cloudflare Workers, Bun, Deno, browsers | Same client/handler API, remote-only (see below) |
| `@nandan-varma/platex/server` | Node.js | `createApp`, `createCompileRoute` — embed the compile HTTP API into your own server instead of running the standalone service |

`platex/client` never imports `node:child_process`/`node:fs`/`node:os`, so it's safe to bundle for edge deployments. If you call `.compile()` without a `serviceUrl` configured (and none in `PLATEX_SERVICE_URL`), it throws immediately with a message telling you what's missing, instead of trying (and failing) to spawn a local TeX process that can't exist on that runtime.

```typescript
// app/api/compile/route.ts — deployed to the Edge Runtime
export const runtime = 'edge'
import { createPlatexClient, handleCompileRequest } from '@nandan-varma/platex/client'

export const POST = handleCompileRequest // or: createRequestHandler(createPlatexClient({ ... }))
```

### What Tectonic is

[Tectonic](https://tectonic-typesetting.github.io) is a self-contained TeX engine (~13 MB binary) based on XeTeX. Unlike pdflatex, it:
- Bundles everything it needs — no separate TeX Live installation required
- Automatically downloads missing LaTeX packages from its CDN on first use
- Handles multi-pass compilation and bibliography internally (no manual bibtex runs)
- Caches packages in `/tmp` on Vercel, making warm-container reuse fast

When system TeX Live is available (self-hosted Docker), the library uses pdflatex/xelatex/lualatex directly with full multi-pass control (same as Overleaf's CLSI).

---

## Setup

### 1. Deploy the platex service

The service is a standalone project that does the actual LaTeX compilation. Deploy it anywhere that runs Node.js — Vercel, Fly.io, Railway, Render, or your own Docker host.

```bash
git clone https://github.com/nandan-varma/platex
cd platex
npx vercel deploy
```

Vercel runs `npm run build:vercel`, which downloads the Tectonic binary for Linux x86_64 and packs it into the serverless function via `includeFiles: "bin/**"` in `vercel.json`. Your service is now live at something like `https://platex-xxx.vercel.app`.

### 2. Install the client library

```bash
npm install @nandan-varma/platex
```

### 3. Set environment variables

```
PLATEX_SERVICE_URL=https://your-platex-service.vercel.app
# PLATEX_API_KEY=...     # only if you enabled auth on the service — see "Server configuration"
```

Both `createPlatexClient()` and the plain `compile()`/`handleCompileRequest` read these automatically — you never have to thread `process.env.PLATEX_SERVICE_URL` through your own code.

---

## Usage

### The recommended pattern: one client, reused everywhere

```typescript
// lib/platex.ts
import { createPlatexClient } from '@nandan-varma/platex'

export const platex = createPlatexClient({
  timeout: 25_000,
  retry: 2,          // retry transient network/5xx failures against the service
  // engine, passes, bibliography, limits, apiKey, headers... all optional, all overridable per call
})
```

```typescript
// app/api/compile/route.ts
import { NextResponse } from 'next/server'
import { platex } from '@/lib/platex'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  const { source } = await req.json()
  const result = await platex.compile(source)

  if (!result.pdf) {
    return NextResponse.json({ errors: result.errors }, { status: 422 })
  }
  return new NextResponse(result.pdf, { headers: { 'Content-Type': 'application/pdf' } })
}
```

`createPlatexClient` returns plain functions — `const { compile } = platex` works fine, no `this` binding required.

### Even less code: `handleCompileRequest`

If your route just takes `{ source, ... }` and returns a PDF, skip writing the handler yourself:

```typescript
import { handleCompileRequest } from '@nandan-varma/platex'
export const POST = handleCompileRequest
```

It parses the JSON body, calls `compile()` (or your client, via `createRequestHandler`), and returns a `Response` — raw PDF bytes with `Content-Type: application/pdf` on success, or a JSON `{ errors, warnings }` body at `422` on compile failure, `400` for bad input, `502` if the remote service is unreachable. See **[Framework recipes](#framework-recipes)** below for the exact snippet per framework, and **[`handleCompileRequest` reference](#handlecompilerequestrequest-options)** for all options.

### Server Actions

```typescript
// app/actions/compile.ts
'use server'
import { platex } from '@/lib/platex'

export async function compileLatex(source: string) {
  const result = await platex.compile(source)
  if (!result.pdf) return { ok: false, errors: result.errors }
  // Buffers aren't serializable across the server/client boundary — use base64
  return { ok: true, pdf: result.pdf.toString('base64') }
}
```

### With additional files (.bib, images)

```typescript
import { readFile } from 'fs/promises'
import { platex } from '@/lib/platex'

const result = await platex.compile(source, {
  bibliography: 'bibtex',
  files: {
    'refs.bib': await readFile('refs.bib'),
    'figures/logo.png': await readFile('logo.png'),
  },
})
```

### Cancelling an in-flight compile

```typescript
const controller = new AbortController()
const result = platex.compile(source, { signal: controller.signal })
// ...later
controller.abort()
```

---

## Framework recipes

`handleCompileRequest` takes a standard [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) `Request` and returns a `Response` — the same function works everywhere below without modification. Use `@nandan-varma/platex` for Node.js routes (with local-compile fallback) or `@nandan-varma/platex/client` for edge routes (remote-only).

**Next.js (App Router)**
```typescript
// app/api/compile/route.ts
import { handleCompileRequest } from '@nandan-varma/platex'
export const runtime = 'nodejs'
export const POST = handleCompileRequest
```

**TanStack Start**
```typescript
// app/routes/api/compile.ts
import { createServerFileRoute } from '@tanstack/react-start/server'
import { handleCompileRequest } from '@nandan-varma/platex'

export const Route = createServerFileRoute('/api/compile').methods({
  POST: ({ request }) => handleCompileRequest(request),
})
```

**Astro**
```typescript
// src/pages/api/compile.ts
import type { APIRoute } from 'astro'
import { handleCompileRequest } from '@nandan-varma/platex'

export const POST: APIRoute = ({ request }) => handleCompileRequest(request)
```

**SvelteKit**
```typescript
// src/routes/api/compile/+server.ts
import { handleCompileRequest } from '@nandan-varma/platex'
export const POST = ({ request }) => handleCompileRequest(request)
```

**Remix**
```typescript
// app/routes/api.compile.ts
import { handleCompileRequest } from '@nandan-varma/platex'
export async function action({ request }: { request: Request }) {
  return handleCompileRequest(request)
}
```

**Bun / Deno / Hono / Cloudflare Workers** — anything with a `Request` in, `Response` out handler:
```typescript
import { handleCompileRequest } from '@nandan-varma/platex/client' // or 'platex' on Node/Bun/Deno for local fallback
Bun.serve({ fetch: (req) => handleCompileRequest(req) })
```

Want your client's defaults (custom `timeout`, `apiKey`, `retry`, ...) applied without repeating them? Bind the handler to a client once:

```typescript
import { createPlatexClient, createRequestHandler } from '@nandan-varma/platex'

const platex = createPlatexClient({ timeout: 25_000, retry: 2 })
export const POST = createRequestHandler(platex)
```

---

## Configuration reference

Nothing below is hardcoded — every default can be overridden per call, per client, or (for the server) per deployment.

### `CompileOptions` (per-call, also accepted by `createPlatexClient`'s config as defaults)

| Option | Type | Default | Description |
|---|---|---|---|
| `engine` | `'pdflatex' \| 'xelatex' \| 'lualatex'` | `'pdflatex'` | TeX engine (used when system TeX is available; Tectonic is always XeTeX-based) |
| `passes` | `'auto' \| 1 \| 2 \| 3` | `'auto'` | Compilation passes. `'auto'` reruns until stable (like Overleaf) |
| `bibliography` | `'bibtex' \| 'biber' \| 'none'` | `'bibtex'` | Bibliography engine |
| `files` | `Record<string, Buffer>` | `{}` | Additional files: `.bib`, images, included `.tex` files |
| `serviceUrl` | `string` | `PLATEX_SERVICE_URL` env var | URL of the platex service. If unset (and no env var), compiles locally (Node entry only) |
| `apiKey` | `string` | `PLATEX_API_KEY` env var | Sent as `Authorization: Bearer <apiKey>` to the service. Pairs with the service's own `PLATEX_API_KEY` |
| `headers` | `Record<string, string>` | `{}` | Extra headers merged into the remote request |
| `timeout` | `number` | `30000` | Overall wall-clock budget in milliseconds for the *entire* compile pipeline (all LaTeX passes plus bibliography combined for local; the whole HTTP round-trip for remote) — not per-process |
| `limits` | `CompileLimits` | see below | Override input-size ceilings for this call |
| `retry` | `number` | `0` | Extra attempts for the *remote* path on retryable failures (network error, our own timeout, or a 5xx). 4xx and caller-cancelled requests are never retried |
| `fetch` | `typeof fetch` | global `fetch` | Custom fetch implementation for the remote path |
| `signal` | `AbortSignal` | — | Cancel an in-flight compile (kills local subprocesses, or aborts the remote HTTP request) |

### `CompileLimits`

| Field | Default | Description |
|---|---|---|
| `maxSourceBytes` | `5_000_000` | Max size of `source`, in UTF-8 bytes |
| `maxFilesCount` | `50` | Max number of entries in `files` |
| `maxTotalFilesBytes` | `25_000_000` | Max combined decoded size of all `files` entries |

```typescript
// A client with a bigger budget for large multi-chapter documents
const platex = createPlatexClient({
  limits: { maxSourceBytes: 20_000_000, maxTotalFilesBytes: 100_000_000 },
})
```

Passing `limits` to a **remote** call is a client-side convenience only (it changes what your own app will accept before even sending the request) — it cannot raise what the *server* enforces. Configure the server's own limits when you deploy it; see [Server configuration](#server-configuration).

### `createPlatexClient(config?): PlatexClient`

`config` accepts everything in `CompileOptions` above except `files` and `signal` (those only make sense per call). Returns:

```typescript
interface PlatexClient {
  compile(source: string, options?: CompileOptions): Promise<CompileResult>
  health(): Promise<boolean>  // pings GET <serviceUrl>/health; true immediately if no serviceUrl configured
}
```

### `handleCompileRequest(request, options?)`

`options` is `CompileOptions` plus:

| Option | Type | Default | Description |
|---|---|---|---|
| `responseFormat` | `'pdf' \| 'json'` | `'pdf'` | `'pdf'`: raw PDF bytes on success, JSON `{errors, warnings}` at `422` on failure. `'json'`: always `200` with `{ pdf: base64 \| null, errors, warnings }` |

Request body: `{ source: string, engine?, passes?, bibliography?, files?: Record<string, base64>, timeout? }` — only `source` is required.

`createRequestHandler(client)` binds the same behavior to a specific `PlatexClient` instead of the default env-var-driven one.

---

## `CompileResult`

```typescript
interface CompileResult {
  pdf: Buffer | null        // null on fatal compile error
  errors: LatexError[]      // structured errors with file + line number
  warnings: LatexWarning[]  // overfull boxes, undefined refs, etc.
  logs: RawPassLog[]        // per-pass raw .log content for debugging; each entry has a `timedOut` flag
}

interface LatexError {
  type: 'error'
  file: string | null
  line: number | null
  message: string
  context: string | null    // surrounding lines from the TeX log
  source: 'latex' | 'bibtex' | 'biber'
}

interface LatexWarning {
  type: 'warning'
  code: 'overfull-hbox' | 'underfull-hbox' | 'undefined-reference' | 'undefined-citation' | ...
  file: string | null
  line: number | null
  message: string
}
```

---

## Self-hosted (Docker, maximum accuracy)

If you're self-hosting (not on Vercel), the Docker image uses full TeX Live — same as Overleaf:

```bash
# Build the service image
npm run build:server
docker build -f docker/Dockerfile -t platex .

# Run it
docker run -p 3001:3001 platex

# Or with docker compose
docker compose -f docker/docker-compose.yml up
```

Then set `PLATEX_SERVICE_URL=http://localhost:3001` in your app. With full TeX Live, pdflatex/xelatex/lualatex all run natively with the exact same flags and multi-pass logic Overleaf uses.

---

## Development without TeX installed

Run the service locally via Docker (above), or let the library use the bundled Tectonic:

```bash
# Download tectonic for your platform (macOS or Linux)
node scripts/download-tectonic.mjs

# Now compile without any other TeX installation
```

```typescript
// No serviceUrl → uses local tectonic binary automatically
const result = await compile(source)
```

---

## Service endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/compile` | Compile LaTeX. Body: `CompileRequest` JSON. Response: `CompileResponse` JSON |
| `GET` | `/health` | Health check. Returns `{ "status": "ok" }` (never requires auth) |

`CompileRequest` body shape:
```typescript
{
  source: string           // LaTeX source (main.tex content)
  engine: 'pdflatex' | 'xelatex' | 'lualatex'
  passes: 'auto' | 1 | 2 | 3
  bibliography: 'bibtex' | 'biber' | 'none'
  files: Record<string, string>   // filename → base64-encoded content
  timeout: number                 // milliseconds, overall pipeline budget (see above), capped at 120s
}
```

### Server configuration

The standalone server (`npm run dev`, the Docker image, or `node dist/server.cjs`) is zero-config by default — it reads these env vars, so a deployment needs nothing but `docker run`. If you're embedding the app yourself (e.g. a custom Node entrypoint), pass the same settings programmatically to `createApp()` instead:

```typescript
import { createApp } from '@nandan-varma/platex/server'
import { serve } from '@hono/node-server'

const app = createApp({
  apiKey: process.env.PLATEX_API_KEY,             // or read from your own secrets manager
  maxConcurrentCompiles: 8,                        // scale with your container's CPU count
  limits: { maxSourceBytes: 20_000_000 },
  maxRequestBodyBytes: 60_000_000,                 // auto-derived from `limits` if omitted
})
serve({ fetch: app.fetch, port: 3001 })
```

| Setting | Env var | Default | Description |
|---|---|---|---|
| `apiKey` | `PLATEX_API_KEY` | unset (no auth) | If set, `POST /compile` requires `Authorization: Bearer <key>`. Set this (or otherwise restrict network access) before exposing the service publicly — compiling is CPU-intensive |
| `maxConcurrentCompiles` | `PLATEX_MAX_CONCURRENT` | `4` | Max simultaneous compiles this instance runs; additional requests get `503` until a slot frees up |
| `limits` | — | see [`CompileLimits`](#compilelimits) | Input-size ceilings enforced for every request this deployment accepts — a client's own `limits` option can never raise these |
| `maxRequestBodyBytes` | — | derived from `limits` + margin | Raw request body cap (`413` if exceeded), checked before JSON parsing |
| `PORT` | `PORT` | `3001` | Port the standalone server listens on |

`createCompileRoute(config)` (same `maxConcurrentCompiles`/`limits` options) is also exported if you want to mount just the `/compile` route into your own Hono app instead of using the whole `createApp()`.

---

## How output matches Overleaf

When running with system TeX Live (Docker/self-hosted):
- Same engine flags: `-interaction=nonstopmode -halt-on-error -file-line-error`
- Same multi-pass logic: detects `\citation{}` in `.aux` → runs bibtex → re-runs LaTeX
- Same rerun patterns: `Rerun to get cross-references right`, `Label(s) may have changed`, hyperref outlines, natbib, longtable
- Same Docker base image: `texlive/texlive:latest` (official TeX Users Group image, full TeX Live)

When running on Vercel with Tectonic, output is XeTeX-based. Nearly identical for most documents; minor differences possible in documents that rely on pdflatex-specific font metrics.
