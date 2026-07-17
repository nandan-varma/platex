import { NextResponse } from 'next/server';
import { compileKitchenSink } from '../../../lib/compile-kitchen-sink';

// Node.js runtime is required — platex spawns a child process (Tectonic),
// which cannot run on the Edge runtime.
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = (await req.json()) as { source?: string };
  const result = await compileKitchenSink(body.source);

  return NextResponse.json({
    pdf: result.pdf ? result.pdf.toString('base64') : null,
    errors: result.errors,
    warnings: result.warnings,
  });
}
