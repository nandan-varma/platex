import { describe, expect, it, vi } from 'vitest';

// Isolated: force the compile pipeline to throw an unexpected (non-validation)
// error so we can verify the route's 500 contract — it reports only the error's
// constructor name, never the internal message, to operators. The stub branches
// on the source text so we can exercise both the Error and non-Error arms of the
// error-naming logic in one file.
vi.mock('../local/index.js', () => ({
  runLocalPipeline: async (source: string) => {
    if (source.includes('THROW_STRING')) throw 'a bare string, not an Error';
    throw new Error('secret internal failure with a stack trace');
  },
}));

async function post(source: string) {
  const { createApp } = await import('./app.js');
  return createApp().request('http://localhost/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
}

describe('POST /compile - unexpected compiler failure', () => {
  it('returns 500 with the error class name only, not the internal message', async () => {
    const res = await post('\\documentclass{article}\\begin{document}x\\end{document}');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Compilation failed: Error');
    expect(body.error).not.toContain('secret internal failure');
  });

  it('falls back to "Error" when a non-Error value is thrown', async () => {
    const res = await post(
      'THROW_STRING \\documentclass{article}\\begin{document}x\\end{document}',
    );
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe('Compilation failed: Error');
  });
});
