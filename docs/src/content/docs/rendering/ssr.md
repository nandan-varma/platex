---
title: Server-Side Rendering
description: >-
  A plain async Server Component. compile() runs on the server during the
  request that renders the page.
sidebar:
  label: Server Components
---

A plain async Server Component. `compile()` runs on the server during the
request that renders this page — the PDF is embedded directly in the HTML
response as a base64 data URI. No client-side JavaScript is involved in
producing it.

```tsx
// app/docs/rendering/ssr/page.tsx
import { compile } from '@nandan-varma/platex';

// platex spawns a child process (Tectonic) — must run on Node.js.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await compile(source, {
    bibliography: 'bibtex',
    files: { 'figure.png': image, 'refs.bib': bib },
  });

  const pdfDataUri = result.pdf
    ? `data:application/pdf;base64,${result.pdf.toString('base64')}`
    : null;

  // The PDF is embedded directly in the HTML this request returns.
  return <embed src={pdfDataUri ?? undefined} type="application/pdf" />;
}
```

:::caution
`compile()` here runs locally (no `serviceUrl`), so it spawns a child process
and must use `runtime = 'nodejs'`. To compile on the edge, set a
`serviceUrl`/`PLATEX_SERVICE_URL` and use `@nandan-varma/platex/client` — see
[Edge & serverless](/frameworks/edge/).
:::

## See also

- [Compiling LaTeX](/guides/compiling/) — every option on `compile()`.
- [Files & bibliography](/guides/files-and-bibliography/) — how the `files` map works.
- [Client Components](/rendering/csr/) — compile on demand from the browser instead.
