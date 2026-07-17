// Curated, minimal illustrations of each pattern — not raw file dumps — kept
// in sync by hand with the actual implementation under app/docs/rendering/*.

export const SSR_SNIPPET = `// app/docs/rendering/ssr/page.tsx
import { compile } from 'platex';

// platex spawns a child process (Tectonic) — must run on Node.js.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await compile(source, {
    bibliography: 'bibtex',
    files: { 'figure.png': image, 'refs.bib': bib },
  });

  const pdfDataUri = result.pdf
    ? \`data:application/pdf;base64,\${result.pdf.toString('base64')}\`
    : null;

  // The PDF is embedded directly in the HTML this request returns.
  return <embed src={pdfDataUri ?? undefined} type="application/pdf" />;
}`;

export const CSR_SNIPPET = `// app/docs/rendering/csr/csr-compiler.tsx
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
      {pdf && <embed src={\`data:application/pdf;base64,\${pdf}\`} type="application/pdf" />}
    </>
  );
}`;

export const SERVER_ACTION_SNIPPET = `// app/docs/rendering/server-actions/actions.ts
'use server';
import { compile } from 'platex';

export async function compileAction(_prevState: State, formData: FormData) {
  const source = String(formData.get('source') ?? '');
  const result = await compile(source, { bibliography: 'bibtex' });

  return {
    pdf: result.pdf ? result.pdf.toString('base64') : null,
    errors: result.errors,
  };
}

// app/docs/rendering/server-actions/form.tsx
'use client';
import { useActionState } from 'react';
import { compileAction } from './actions';

export function Form({ initialSource }: { initialSource: string }) {
  const [state, formAction, isPending] = useActionState(compileAction, initialState);
  return (
    <form action={formAction}>
      <textarea name="source" defaultValue={initialSource} />
      <button type="submit" disabled={isPending}>Compile</button>
    </form>
  );
}`;

export const ROUTE_HANDLER_SNIPPET = `// app/api/compile/route.ts
import { NextResponse } from 'next/server';
import { compile } from 'platex';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { source } = await req.json();
  const result = await compile(source, { bibliography: 'bibtex' });

  return NextResponse.json({
    pdf: result.pdf ? result.pdf.toString('base64') : null,
    errors: result.errors,
    warnings: result.warnings,
  });
}`;

export const ROUTE_HANDLER_CURL_SNIPPET = `curl -X POST http://localhost:3000/api/compile \\
  -H "Content-Type: application/json" \\
  -d '{"source": "\\\\documentclass{article}\\\\begin{document}Hi\\\\end{document}"}' \\
  | jq -r '.pdf' | base64 -d > output.pdf`;
