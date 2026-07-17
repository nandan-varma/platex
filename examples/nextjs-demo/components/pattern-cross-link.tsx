import Link from 'next/link';
import { ArrowRight, PlayCircle, BookOpen } from 'lucide-react';

export function ViewDemoLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <PlayCircle className="size-4" /> View live demo <ArrowRight className="size-3.5" />
    </Link>
  );
}

export function ViewDocsLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <BookOpen className="size-4" /> How this works <ArrowRight className="size-3.5" />
    </Link>
  );
}
