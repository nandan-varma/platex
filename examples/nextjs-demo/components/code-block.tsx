import { codeToHtml } from 'shiki';
import { cn } from '@/lib/utils';
import { CopyButton } from '@/components/copy-button';

interface CodeBlockProps {
  code: string;
  lang: 'tex' | 'typescript' | 'tsx' | 'bash' | 'json';
  className?: string;
}

// Server Component: highlighting happens once, on the server, at render
// time — no client-side highlighter shipped to the browser. The copy
// button is the one small client island, passed the raw source directly.
export async function CodeBlock({ code, lang, className }: CodeBlockProps) {
  const html = await codeToHtml(code, {
    lang,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });

  return (
    <div className={cn('group relative', className)}>
      <div
        className="[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:p-4 [&_pre]:text-[12.5px] [&_pre]:leading-relaxed [&_pre]:font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CopyButton
        text={code}
        className="absolute top-2 right-2 bg-background/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
      />
    </div>
  );
}
