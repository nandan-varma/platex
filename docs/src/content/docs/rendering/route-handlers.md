---
title: Raw API Route
description: >-
  POST /api/compile is a plain Node.js Route Handler — a normal HTTP endpoint
  that works from curl, a mobile app, or any other client.
sidebar:
  label: Route Handlers
---

`POST /api/compile` is a plain Node.js Route Handler — the same one the Client
Component pattern calls. It's a normal HTTP endpoint, so it works from curl, a
mobile app, or any other client, not just this app.

## Code

```tsx
// app/api/compile/route.ts
import { NextResponse } from 'next/server';
import { compile } from '@nandan-varma/platex';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { source } = await req.json();
  const result = await compile(source, { bibliography: 'bibtex' });

  return NextResponse.json({
    pdf: result.pdf ? result.pdf.toString('base64') : null,
    errors: result.errors,
    warnings: result.warnings,
  });
}
```

## curl

Every field except `source` is optional — see the [API reference](/api-reference/)
for the full request shape.

```bash
curl -X POST http://localhost:3000/api/compile \
  -H "Content-Type: application/json" \
  -d '{"source": "\\documentclass{article}\\begin{document}Hi\\end{document}"}' \
  | jq -r '.pdf' | base64 -d > output.pdf
```

:::tip
Don't want to hand-write this route? `export const POST = handleCompileRequest`
does the same thing in one line, and works in every framework — see
[Request handlers](/guides/request-handlers/) and [Framework recipes](/frameworks/).
:::

## See also

- [Request handlers](/guides/request-handlers/) — the drop-in handler, response codes, and JSON mode.
- [Client Components](/rendering/csr/) — the browser UI that calls this route.
- [HTTP API](/reference/http-api/) — the underlying service wire format.
