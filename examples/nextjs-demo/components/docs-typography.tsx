import type { ReactNode } from 'react';

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 mb-3 scroll-m-20 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-4 leading-relaxed text-muted-foreground">{children}</p>;
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>
  );
}
