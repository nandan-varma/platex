import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  tag,
  children,
}: {
  title: string;
  description: string;
  tag?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 pb-8">
      {tag && (
        <span className="inline-block rounded-full border bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
          {tag}
        </span>
      )}
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
