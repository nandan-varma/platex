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
