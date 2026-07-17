import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the node-server binding so importing the standalone entry doesn't
// actually open a listening socket; we just assert it wires the app + port.
const serveMock = vi.fn();
vi.mock('@hono/node-server', () => ({ serve: serveMock }));

describe('standalone server entry (src/server/index.ts)', () => {
  const originalPort = process.env.PORT;

  afterEach(() => {
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    vi.resetModules();
    serveMock.mockClear();
  });

  it('starts the app on the PORT env var via @hono/node-server', async () => {
    process.env.PORT = '4567';
    vi.resetModules();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mod = await import('./index.js');

    expect(serveMock).toHaveBeenCalledOnce();
    const [config, onListen] = serveMock.mock.calls[0] as [
      { fetch: unknown; port: number },
      () => void,
    ];
    expect(config.port).toBe(4567);
    expect(config.fetch).toBe(mod.app.fetch);

    // The listen callback logs the port — invoke it to cover that branch.
    onListen();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('4567'));
    logSpy.mockRestore();
  });

  it('defaults to port 3001 when PORT is unset', async () => {
    delete process.env.PORT;
    vi.resetModules();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('./index.js');

    const [config] = serveMock.mock.calls[0] as [{ port: number }];
    expect(config.port).toBe(3001);
    logSpy.mockRestore();
  });
});
