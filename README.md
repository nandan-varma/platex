# platex

[![npm version](https://img.shields.io/npm/v/platex.svg)](https://www.npmjs.com/package/platex)
[![license](https://img.shields.io/npm/l/platex.svg)](LICENSE)

Compile LaTeX to PDF in TypeScript, with output as close to Overleaf as possible. Designed for Next.js apps on Vercel.

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
│  Your Next.js app (Vercel)      │ ─────────────────────────▶  │  platex service (also Vercel)    │
│                                 │                              │                                  │
│  import { compile } from        │ ◀─────────────────────────  │  Tectonic TeX engine (bundled    │
│    'platex'                     │        PDF binary            │  ~13MB binary, auto-downloads    │
│                                 │                              │  LaTeX packages on first use)    │
│  compile(source, {              │                              │                                  │
│    serviceUrl: process.env      │                              │  POST /compile → runs TeX →      │
│      .PLATEX_SERVICE_URL        │                              │  returns PDF as base64 JSON      │
│  })                             │                              │                                  │
└─────────────────────────────────┘                              └──────────────────────────────────┘
```

### Two deployment targets, same library

| Mode | When | Engine | Use case |
|---|---|---|---|
| **Remote** (recommended for Vercel) | `serviceUrl` is set | Tectonic (on the service) | Production on Vercel |
| **Local** | No `serviceUrl`, system TeX found | pdflatex / xelatex / lualatex | Self-hosted or dev with TeX Live |
| **Local fallback** | No `serviceUrl`, no system TeX | Bundled Tectonic binary | Dev without TeX Live installed |

The library auto-selects the engine — you don't configure this directly.

### What Tectonic is

[Tectonic](https://tectonic-typesetting.github.io) is a self-contained TeX engine (~13 MB binary) based on XeTeX. Unlike pdflatex, it:
- Bundles everything it needs — no separate TeX Live installation required
- Automatically downloads missing LaTeX packages from its CDN on first use
- Handles multi-pass compilation and bibliography internally (no manual bibtex runs)
- Caches packages in `/tmp` on Vercel, making warm-container reuse fast

When system TeX Live is available (self-hosted Docker), the library uses pdflatex/xelatex/lualatex directly with full multi-pass control (same as Overleaf's CLSI).

---

## Setup

### 1. Deploy the platex service to Vercel

The service is a standalone Vercel project that does the actual LaTeX compilation.

```bash
git clone https://github.com/nandan-varma/platex
cd platex
npx vercel deploy
```

Vercel runs `npm run build:vercel` which:
1. Downloads the Tectonic binary for Linux x86_64 (Vercel's build environment)
2. Packs it into the serverless function via `includeFiles: "bin/**"` in `vercel.json`

Your service is now live at something like `https://platex-xxx.vercel.app`.

### 2. Install the client library in your Next.js app

```bash
npm install platex
```

### 3. Set the environment variable

In your Next.js project's Vercel dashboard (or `.env.local` for dev):

```
PLATEX_SERVICE_URL=https://your-platex-service.vercel.app
```

---

## Usage

### In a Next.js API Route

```typescript
// app/api/compile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { compile } from 'platex'

export const runtime = 'nodejs'    // required — not edge
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { source, engine = 'pdflatex' } = await req.json()

  const result = await compile(source, {
    engine,
    serviceUrl: process.env.PLATEX_SERVICE_URL,
    timeout: 25_000,
  })

  if (!result.pdf) {
    return NextResponse.json({ errors: result.errors }, { status: 422 })
  }

  return new NextResponse(result.pdf, {
    headers: { 'Content-Type': 'application/pdf' },
  })
}
```

### In a Server Action

```typescript
// app/actions/compile.ts
'use server'
import { compile } from 'platex'

export async function compileLatex(source: string) {
  const result = await compile(source, {
    engine: 'pdflatex',
    serviceUrl: process.env.PLATEX_SERVICE_URL,
    timeout: 25_000,
  })

  if (!result.pdf) {
    return { ok: false, errors: result.errors }
  }

  // Buffers aren't serializable across the server/client boundary — use base64
  return { ok: true, pdf: result.pdf.toString('base64') }
}
```

### With additional files (.bib, images)

```typescript
import { readFile } from 'fs/promises'
import { compile } from 'platex'

const bib = await readFile('refs.bib')
const logo = await readFile('logo.png')

const result = await compile(source, {
  engine: 'pdflatex',
  bibliography: 'bibtex',
  files: {
    'refs.bib': bib,
    'figures/logo.png': logo,
  },
  serviceUrl: process.env.PLATEX_SERVICE_URL,
})
```

---

## API

### `compile(source, options?): Promise<CompileResult>`

| Option | Type | Default | Description |
|---|---|---|---|
| `engine` | `'pdflatex' \| 'xelatex' \| 'lualatex'` | `'pdflatex'` | TeX engine (used when system TeX is available; Tectonic is always XeTeX-based) |
| `passes` | `'auto' \| 1 \| 2 \| 3` | `'auto'` | Compilation passes. `'auto'` reruns until stable (like Overleaf) |
| `bibliography` | `'bibtex' \| 'biber' \| 'none'` | `'bibtex'` | Bibliography engine |
| `files` | `Record<string, Buffer>` | `{}` | Additional files: `.bib`, images, included `.tex` files |
| `serviceUrl` | `string` | — | URL of the platex service. If unset, compiles locally |
| `timeout` | `number` | `30000` | Timeout in milliseconds |

### `CompileResult`

```typescript
interface CompileResult {
  pdf: Buffer | null        // null on fatal compile error
  errors: LatexError[]      // structured errors with file + line number
  warnings: LatexWarning[]  // overfull boxes, undefined refs, etc.
  logs: RawPassLog[]        // per-pass raw .log content for debugging
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

Then set `PLATEX_SERVICE_URL=http://localhost:3001` in your Next.js app. With full TeX Live, pdflatex/xelatex/lualatex all run natively with the exact same flags and multi-pass logic Overleaf uses.

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
| `GET` | `/health` | Health check. Returns `{ "status": "ok" }` |

`CompileRequest` body shape:
```typescript
{
  source: string           // LaTeX source (main.tex content)
  engine: 'pdflatex' | 'xelatex' | 'lualatex'
  passes: 'auto' | 1 | 2 | 3
  bibliography: 'bibtex' | 'biber' | 'none'
  files: Record<string, string>   // filename → base64-encoded content
  timeout: number                 // milliseconds
}
```

---

## How output matches Overleaf

When running with system TeX Live (Docker/self-hosted):
- Same engine flags: `-interaction=nonstopmode -halt-on-error -file-line-error`
- Same multi-pass logic: detects `\citation{}` in `.aux` → runs bibtex → re-runs LaTeX
- Same rerun patterns: `Rerun to get cross-references right`, `Label(s) may have changed`, hyperref outlines, natbib, longtable
- Same Docker base image: `texlive/texlive:latest` (official TeX Users Group image, full TeX Live)

When running on Vercel with Tectonic, output is XeTeX-based. Nearly identical for most documents; minor differences possible in documents that rely on pdflatex-specific font metrics.
