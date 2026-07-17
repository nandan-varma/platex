import type { Metadata } from 'next';
import { compileKitchenSink, pdfToDataUri, readKitchenSinkSource } from '@/lib/compile-kitchen-sink';
import { PageHeader } from '@/components/page-header';
import { ViewDocsLink } from '@/components/pattern-cross-link';
import { ServerActionForm } from './server-action-form';

export const metadata: Metadata = { title: 'Server Actions demo' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ServerActionsDemoPage() {
  const started = Date.now();
  const [initialSource, result] = await Promise.all([readKitchenSinkSource(), compileKitchenSink()]);
  const elapsedMs = Date.now() - started;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        tag="Live demo"
        title="Server Actions"
        description="Hitting Recompile calls compileAction directly from the form — no fetch, no hand-written API route."
      >
        <ViewDocsLink href="/docs/rendering/server-actions" />
      </PageHeader>

      <ServerActionForm
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
