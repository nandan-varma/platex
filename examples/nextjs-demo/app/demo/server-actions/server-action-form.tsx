'use client';

import { useActionState, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { compileAction, type CompileActionState } from './actions';
import { CompileResultView, type CompileStats, type SerializedCompileResult } from '@/components/compile-result-view';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

export function ServerActionForm({
  initialSource,
  initialResult,
  initialStats,
}: {
  initialSource: string;
  initialResult: SerializedCompileResult;
  initialStats: CompileStats;
}) {
  const [source, setSource] = useState(initialSource);
  const [state, formAction, isPending] = useActionState<CompileActionState, FormData>(compileAction, {
    status: 'done',
    elapsedMs: initialStats.elapsedMs,
    pdfBytes: initialStats.pdfBytes,
    result: initialResult,
  });

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {isPending ? (
        <Skeleton className="h-[640px] w-full rounded-lg" />
      ) : (
        <CompileResultView
          {...state.result}
          stats={{ elapsedMs: state.elapsedMs ?? 0, pdfBytes: state.pdfBytes }}
        />
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Edit the source and recompile</p>
          <Button size="sm" type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
            {isPending ? 'Compiling…' : 'Recompile via Server Action'}
          </Button>
        </div>
        <Textarea
          className="min-h-[240px] font-mono text-[12.5px] leading-relaxed"
          name="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
        />
      </div>
    </form>
  );
}
