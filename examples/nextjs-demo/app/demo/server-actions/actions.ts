'use server';

import { compileKitchenSink } from '@/lib/compile-kitchen-sink';
import type { SerializedCompileResult } from '@/components/compile-result-view';

export interface CompileActionState {
  status: 'done';
  elapsedMs: number | null;
  pdfBytes: number | null;
  result: SerializedCompileResult;
}

export async function compileAction(
  _prevState: CompileActionState,
  formData: FormData,
): Promise<CompileActionState> {
  const source = String(formData.get('source') ?? '');
  const started = Date.now();
  const result = await compileKitchenSink(source);

  return {
    status: 'done',
    elapsedMs: Date.now() - started,
    pdfBytes: result.pdf?.length ?? null,
    result: {
      pdfDataUri: result.pdf ? `data:application/pdf;base64,${result.pdf.toString('base64')}` : null,
      errors: result.errors,
      warnings: result.warnings,
    },
  };
}
