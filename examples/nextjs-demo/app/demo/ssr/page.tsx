import type { Metadata } from 'next';
import { compileKitchenSink, pdfToDataUri } from '@/lib/compile-kitchen-sink';
import { CompileResultView } from '@/components/compile-result-view';
import { PageHeader } from '@/components/page-header';
import { ViewDocsLink } from '@/components/pattern-cross-link';

export const metadata: Metadata = { title: 'Server Components demo' };

// platex spawns a child process (Tectonic) — must run on Node.js, not Edge.
export const runtime = 'nodejs';
// Recompile on every request rather than caching, so this page demonstrates
// a real per-request server compile.
export const dynamic = 'force-dynamic';

export default async function SSRDemoPage() {
  const started = Date.now();
  const result = await compileKitchenSink();
  const elapsedMs = Date.now() - started;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        tag="Live demo"
        title="Server Components"
        description="This PDF was compiled on the server during the request that rendered this page — refresh to compile it again."
      >
        <ViewDocsLink href="/docs/rendering/ssr" />
      </PageHeader>

      <CompileResultView
        pdfDataUri={pdfToDataUri(result.pdf)}
        errors={result.errors}
        warnings={result.warnings}
        stats={{ elapsedMs, pdfBytes: result.pdf?.length ?? null }}
      />
    </div>
  );
}
