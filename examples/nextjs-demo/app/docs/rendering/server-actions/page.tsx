import type { Metadata } from 'next';
import { CodeBlock } from '@/components/code-block';
import { PageHeader } from '@/components/page-header';
import { DocsPager } from '@/components/docs-pager';
import { ViewDemoLink } from '@/components/pattern-cross-link';
import { SERVER_ACTION_SNIPPET } from '@/lib/snippets';

export const metadata: Metadata = { title: 'Server Actions' };

export default function ServerActionsDocsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        tag="'use server' function"
        title="Server Actions"
        description="A form submits straight to compileAction, a function marked 'use server' — no fetch, no hand-written API route. Next.js generates the RPC wiring; state is managed with React's useActionState."
      >
        <ViewDemoLink href="/demo/server-actions" />
      </PageHeader>

      <CodeBlock code={SERVER_ACTION_SNIPPET} lang="tsx" />

      <DocsPager pathname="/docs/rendering/server-actions" />
    </div>
  );
}
