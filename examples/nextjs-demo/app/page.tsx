import Link from 'next/link';
import { ArrowRight, FileCode2, Boxes, ListTree, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CodeBlock } from '@/components/code-block';
import { NAV } from '@/lib/nav-config';

const INSTALL_SNIPPET = `npm install platex`;

const USAGE_SNIPPET = `import { compile } from 'platex'

const result = await compile(source, {
  engine: 'pdflatex',
  serviceUrl: process.env.PLATEX_SERVICE_URL,
})

if (result.pdf) {
  // result.pdf is a Buffer
}`;

const FEATURES = [
  {
    icon: FileCode2,
    title: 'Overleaf-accurate output',
    description: 'Same engine flags, same multi-pass logic, same rerun heuristics as Overleaf’s CLSI.',
  },
  {
    icon: Boxes,
    title: 'Two deployment targets',
    description: 'A remote service for Vercel (bundled Tectonic), or full TeX Live locally/self-hosted.',
  },
  {
    icon: ListTree,
    title: 'Structured diagnostics',
    description: 'Errors and warnings parsed from raw TeX logs, with file, line, and category.',
  },
  {
    icon: Layers,
    title: 'Every rendering pattern',
    description: 'Server Components, Client Components, Server Actions, and Route Handlers all work the same way.',
  },
];

const demoGroup = NAV.find((g) => g.title === 'Demo')!;

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14">
      <div className="space-y-5">
        <span className="inline-block rounded-full border bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
          platex
        </span>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance">
          Compile LaTeX to PDF in TypeScript, built for Next.js
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-balance">
          Output as close to Overleaf as possible — as a library that runs anywhere Node.js runs,
          on Vercel or self-hosted.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button nativeButton={false} render={<Link href="/docs/installation" />}>
            Get started <ArrowRight className="size-4" />
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/docs/api-reference" />}>
            API reference
          </Button>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Install</p>
          <CodeBlock code={INSTALL_SNIPPET} lang="bash" />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Use it anywhere in the App Router</p>
          <CodeBlock code={USAGE_SNIPPET} lang="typescript" />
        </div>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Card key={f.title} className="gap-2">
            <CardHeader>
              <f.icon className="mb-1 size-5 text-muted-foreground" />
              <CardTitle className="text-base">{f.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{f.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-16">
        <h2 className="text-lg font-semibold">See it live</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          The same kitchen-sink LaTeX document — math, tables, figures, citations, code, table of
          contents — actually compiled through every natural platex integration pattern. Docs
          explain the code; these pages show real, live output.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {demoGroup.items.map((item) => (
            <Link key={item.href} href={item.href} prefetch={false}>
              <Card className="h-full transition-colors hover:border-foreground/20 hover:bg-accent/40">
                <CardHeader>
                  <CardTitle className="text-sm">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
