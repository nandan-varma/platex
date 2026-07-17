import type { Metadata } from 'next';
import { compileKitchenSink, pdfToDataUri, readKitchenSinkSource } from '@/lib/compile-kitchen-sink';
import { PageHeader } from '@/components/page-header';
import { ViewDocsLink } from '@/components/pattern-cross-link';
import { ApiCompiler } from '@/components/api-compiler';

export const metadata: Metadata = { title: 'Route Handlers demo' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RouteHandlerDemoPage() {
  const started = Date.now();
  const [initialSource, result] = await Promise.all([readKitchenSinkSource(), compileKitchenSink()]);
  const elapsedMs = Date.now() - started;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        tag="Live demo"
        title="Route Handlers"
        description="This editor talks to POST /api/compile directly — the same raw endpoint you'd hit from curl, a mobile app, or any other HTTP client."
      >
        <ViewDocsLink href="/docs/rendering/route-handlers" />
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
