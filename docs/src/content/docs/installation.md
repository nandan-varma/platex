---
title: Installation
description: >-
  Deploy the platex compilation service and install the client library your
  Next.js app calls.
---

platex is a two-part system: a compilation service that does the actual
LaTeX → PDF work, and a thin client library your Next.js app calls.

## 1. Deploy the platex service

The service does the actual compilation and is a standalone Vercel project. It
runs `build:vercel`, which downloads the bundled Tectonic binary for Vercel's
Linux runtime and packs it into the serverless function.

```bash
git clone https://github.com/nandan-varma/platex
cd platex
npx vercel deploy
```

## 2. Install the client library

In your Next.js app:

```bash
npm install @nandan-varma/platex
```

## 3. Point the client at the service

Set `PLATEX_SERVICE_URL` in your Next.js project's environment (Vercel
dashboard, or `.env.local` for local dev):

```bash
PLATEX_SERVICE_URL=https://your-platex-service.vercel.app
```

## Engine selection

The library auto-selects an engine — you don't configure this directly.

| Mode | When | Engine | Use case |
| --- | --- | --- | --- |
| Remote | `serviceUrl` is set | Tectonic (on the service) | Production on Vercel |
| Local | No serviceUrl, system TeX found | pdflatex / xelatex / lualatex | Self-hosted or dev with TeX Live |
| Local fallback | No serviceUrl, no system TeX | Bundled Tectonic binary | Dev without TeX Live installed |

## Self-hosted (Docker, maximum accuracy)

If you're not on Vercel, the Docker image uses full TeX Live — the same engine
Overleaf runs:

```bash
npm run build:server
docker build -f docker/Dockerfile -t platex .
docker run -p 3001:3001 platex
```

Then set `PLATEX_SERVICE_URL=http://localhost:3001`.

## Development without any TeX installed

Skip the service entirely and let the library use the bundled Tectonic binary
directly — this is exactly what powers every live example in these docs:

```bash
node scripts/download-tectonic.mjs
```
