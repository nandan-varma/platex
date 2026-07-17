---
title: Client-Side Rendering
description: >-
  A Client Component posts the source to POST /api/compile via fetch and
  renders whatever comes back.
sidebar:
  label: Client Components
---

A Client Component posts the source to `POST /api/compile` via `fetch` and
renders whatever comes back — entirely client-driven, no page reload.

```tsx
// app/docs/rendering/csr/csr-compiler.tsx
'use client';
import { useState } from 'react';

export function Compiler({ initialSource }: { initialSource: string }) {
  const [source, setSource] = useState(initialSource);
  const [pdf, setPdf] = useState<string | null>(null);

  async function handleCompile() {
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    const data = await res.json();
    setPdf(data.pdf);
  }

  return (
    <>
      <textarea value={source} onChange={(e) => setSource(e.target.value)} />
      <button onClick={handleCompile}>Compile</button>
      {pdf && <embed src={`data:application/pdf;base64,${pdf}`} type="application/pdf" />}
    </>
  );
}
```

This posts to a route that returns `{ pdf: base64, ... }`. Back that route with
the drop-in [`handleCompileRequest`](/guides/request-handlers/) using
`responseFormat: 'json'`, or the hand-written [Route Handler](/rendering/route-handlers/).

## See also

- [Route Handlers](/rendering/route-handlers/) — the endpoint this component calls.
- [Request handlers](/guides/request-handlers/) — the one-line handler and JSON mode.
- [Cancellation, retries & timeouts](/guides/cancellation-and-retries/) — abort an in-flight `fetch`.
