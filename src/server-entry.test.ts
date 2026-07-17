import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApp, createCompileRoute } from './server-entry.js';

// `platex/server` is one of the three public entry points. app.test.ts drives
// createApp() directly; this file guards the *entry point contract* — that the
// re-exports are wired and that the documented "mount createCompileRoute() into
// an existing Hono app" use case actually works when embedded, not just standalone.

describe('platex/server entry point', () => {
  it('re-exports createApp and createCompileRoute as functions', () => {
    expect(typeof createApp).toBe('function');
    expect(typeof createCompileRoute).toBe('function');
  });

  it('createApp() produces a working app (health check responds 200)', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/health');
    expect(res.status).toBe(200);
  });

  it('createCompileRoute() can be mounted into a caller-owned Hono app', async () => {
    const parent = new Hono();
    parent.get('/', (c) => c.text('my own app'));
    parent.route('/api/compile', createCompileRoute());

    // The caller's own routes still work alongside the mounted compile route.
    const own = await parent.request('http://localhost/');
    expect(own.status).toBe(200);
    expect(await own.text()).toBe('my own app');

    // And the embedded route validates input under its mount path.
    const bad = await parent.request('http://localhost/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notSource: true }),
    });
    expect(bad.status).toBe(400);
  });

  it('honors per-instance limits passed to the mounted route', async () => {
    const parent = new Hono();
    parent.route('/api/compile', createCompileRoute({ limits: { maxSourceBytes: 10 } }));

    const res = await parent.request('http://localhost/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'x'.repeat(50) }),
    });
    expect(res.status).toBe(400);
  });
});
