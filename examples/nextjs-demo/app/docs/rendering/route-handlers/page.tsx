import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { DocsPager } from '@/components/docs-pager';
import { CodeBlock } from '@/components/code-block';
import { ViewDemoLink } from '@/components/pattern-cross-link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROUTE_HANDLER_SNIPPET, ROUTE_HANDLER_CURL_SNIPPET } from '@/lib/snippets';

export const metadata: Metadata = { title: 'Route Handlers' };

export default function RouteHandlerDocsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        tag="Route Handler"
        title="Raw API Route"
        description="POST /api/compile is a plain Node.js Route Handler — the same one the Client Component pattern calls. It's a normal HTTP endpoint, so it works from curl, a mobile app, or any other client, not just this app."
      >
        <ViewDemoLink href="/demo/route-handlers" />
      </PageHeader>

      <Tabs defaultValue="code">
        <TabsList>
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="curl">curl</TabsTrigger>
        </TabsList>
        <TabsContent value="code" className="mt-4">
          <CodeBlock code={ROUTE_HANDLER_SNIPPET} lang="tsx" />
        </TabsContent>
        <TabsContent value="curl" className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Every field except <code className="font-mono">source</code> is optional — see the{' '}
            <a href="/docs/api-reference" className="underline underline-offset-2">
              API reference
            </a>{' '}
            for the full request shape.
          </p>
          <CodeBlock code={ROUTE_HANDLER_CURL_SNIPPET} lang="bash" />
        </TabsContent>
      </Tabs>

      <DocsPager pathname="/docs/rendering/route-handlers" />
    </div>
  );
}
