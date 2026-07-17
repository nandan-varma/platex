import type { Metadata } from 'next';
import { compileKitchenSink, pdfToDataUri, readKitchenSinkSource } from '@/lib/compile-kitchen-sink';
import { PageHeader } from '@/components/page-header';
import { ViewDocsLink } from '@/components/pattern-cross-link';
import { ApiCompiler } from '@/components/api-compiler';

export const metadata: Metadata = { title: 'Client Components demo' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CSRDemoPage() {
  const started = Date.now();
  const [initialSource, result] = await Promise.all([readKitchenSinkSource(), compileKitchenSink()]);
  const elapsedMs = Date.now() - started;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        tag="Live demo"
        title="Client Components"
        description="Edit the source and hit Recompile — the browser sends it to POST /api/compile via fetch and swaps in whatever comes back, no page reload."
      >
        <ViewDocsLink href="/docs/rendering/csr" />
      </PageHeader>

      <ApiCompiler
        initialSource={initialSource}
        initialResult={{
          pdfDataUri: pdfToDataUri(result.pdf),
          errors: result.errors,
          warnings: result.warnings,
        }}
        initialStats={{ elapsedMs, pdfBytes: result.pdf?.length ?? null }}
      />
    </div>
  );
}
