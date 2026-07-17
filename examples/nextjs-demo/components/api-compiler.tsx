'use client';

import { useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CompileResultView,
  type CompileStats,
  type SerializedCompileResult,
} from '@/components/compile-result-view';

type State =
  | { status: 'ready'; result: SerializedCompileResult; stats: CompileStats }
  | { status: 'loading' }
  | { status: 'error'; message: string };

export function ApiCompiler({
  initialSource,
  initialResult,
  initialStats,
}: {
  initialSource: string;
  initialResult: SerializedCompileResult;
  initialStats: CompileStats;
}) {
  const [source, setSource] = useState(initialSource);
  const [state, setState] = useState<State>({ status: 'ready', result: initialResult, stats: initialStats });

  async function handleCompile() {
    setState({ status: 'loading' });
    const started = performance.now();
    try {
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      if (!res.ok) {
        setState({ status: 'error', message: `Request failed: ${res.status}` });
        return;
      }
      const data = (await res.json()) as { pdf: string | null; errors: unknown[]; warnings: unknown[] };
      setState({
        status: 'ready',
        stats: {
          elapsedMs: Math.round(performance.now() - started),
          pdfBytes: data.pdf ? Math.floor((data.pdf.length * 3) / 4) : null,
        },
        result: {
          pdfDataUri: data.pdf ? `data:application/pdf;base64,${data.pdf}` : null,
          errors: data.errors as SerializedCompileResult['errors'],
          warnings: data.warnings as SerializedCompileResult['warnings'],
        },
      });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {state.status === 'loading' ? (
        <Skeleton className="h-[640px] w-full rounded-lg" />
      ) : state.status === 'ready' ? (
        <CompileResultView {...state.result} stats={state.stats} />
      ) : (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Edit the source and recompile</p>
          <Button size="sm" onClick={handleCompile} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
            {state.status === 'loading' ? 'Compiling…' : 'Recompile'}
          </Button>
        </div>
        <Textarea
          className="min-h-[240px] font-mono text-[12.5px] leading-relaxed"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
