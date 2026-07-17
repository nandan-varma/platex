import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

// Isolated: replace the compile route with one whose handler throws a raw
// (non-HTTPException) error, so it bubbles past the route to the app's
// last-resort onError handler — the branch that maps unexpected handler errors
// to a generic 500. (The real compile route catches its own errors, so this is
// the only way to exercise app.onError's generic path.)
vi.mock('./routes/compile.js', () => ({
  createCompileRoute: () => {
    const route = new Hono();
    route.post('/', () => {
      throw new Error('unexpected handler explosion');
    });
    return route;
  },
}));

describe('createApp - unhandled handler error', () => {
  it('maps an unexpected non-HTTPException error to a generic 500', async () => {
    const { createApp } = await import('./app.js');
    const app = createApp();

    const res = await app.request('http://localhost/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'x' }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Internal server error');
  });
});
