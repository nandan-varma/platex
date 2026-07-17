import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { siblingNavItems, isCompileHeavy } from '@/lib/nav-config';

export function DocsPager({ pathname }: { pathname: string }) {
  const { prev, next } = siblingNavItems(pathname);
  if (!prev && !next) return null;

  return (
    <div className="mt-12 flex items-center justify-between gap-4 border-t pt-6">
      {prev ? (
        <Link
          href={prev.href}
          prefetch={!isCompileHeavy(prev.href)}
          className="flex flex-1 flex-col items-start gap-1 rounded-lg border p-4 text-sm transition-colors hover:bg-accent"
        >
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft className="size-3" /> Previous
          </span>
          <span className="font-medium">{prev.title}</span>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <Link
          href={next.href}
          prefetch={!isCompileHeavy(next.href)}
          className="flex flex-1 flex-col items-end gap-1 rounded-lg border p-4 text-right text-sm transition-colors hover:bg-accent"
        >
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Next <ArrowRight className="size-3" />
          </span>
          <span className="font-medium">{next.title}</span>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}
