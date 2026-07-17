# CLAUDE.md

Project context for AI assistants working on platex.

## What this is

`@nandan-varma/platex` — a TypeScript library that compiles LaTeX to PDF. Supports two modes:
- **Remote**: sends source to a platex HTTP service (Vercel/serverless), receives PDF back
- **Local**: compiles directly via system TeX Live (pdflatex/xelatex/lualatex) or bundled Tectonic binary

Three package entry points (see "Entry points" below) — `platex` (Node, full), `platex/client` (edge-safe, remote-only), `platex/server` (embed the HTTP API into your own server). DX principle: nothing is hardcoded that a caller might reasonably want to override — engine/timeout/limits/auth/retry are all `CompileOptions` fields with sane defaults and env-var fallbacks, not baked-in constants. New knobs should follow that pattern rather than adding another env-var-only setting.

## Build / Test / Lint

```bash
npm run typecheck    # tsc --noEmit — must pass
npm test             # vitest run — 158 tests, all must pass
npm run lint         # biome check src/ — must pass
npm run lint:fix     # biome check --write src/ — auto-fix
npm run format       # biome format --write src/
npm run build        # tsup — produces dist/{index,client,server-app}.{js,cjs,d.ts}
npm run build:server # tsup --config tsup.server.config.ts — bundled dist/server.cjs for the Docker image (separate from dist/server-app.* above — don't confuse the two)
```

## Architecture

```
src/
  index.ts                # Node entry point ("platex"): re-exports compile/createPlatexClient/handleCompileRequest/types
  client-entry.ts          # Edge entry point ("platex/client"): remote-only variants of the same API, zero Node built-ins
  server-entry.ts          # Server entry point ("platex/server"): re-exports createApp/createCompileRoute
  compile-core.ts          # compile() implementation — local/remote dispatch, limits/env-var resolution
  client-core.ts           # makeClient() — edge-safe factory shared by client.ts (Node) and client-entry.ts (edge)
  client.ts                # Node's createPlatexClient — wraps compile() (local+remote)
  handler.ts               # Node's handleCompileRequest/createRequestHandler — wraps compile()
  request-handler-core.ts  # makeRequestHandler()/createRequestHandler() — edge-safe Fetch API Request->Response adapter
  types.ts                 # All exported types (CompileOptions, CompileLimits, PlatexClient, PlatexClientConfig, ...)
  defaults.ts              # Default constants + resolveLimits()/defaultServiceUrl()/defaultApiKey()/utf8ByteLength()
  local/
    index.ts               # runLocalPipeline — orchestrates local compilation
    compiler.ts             # spawnProcess — low-level child process wrapper (timeout + AbortSignal support)
    passes.ts               # runPasses — multi-pass TeX compilation (mirrors Overleaf CLSI), deadline-budgeted
    bibtex.ts                # runBibliography, detectBibliography
    log-parser.ts            # parseLog, needsRerun — TeX log parsing
    tectonic.ts               # resolveTectonicBinary, runTectonic — Tectonic engine support
  remote/
    client.ts               # callRemote — HTTP client for the platex service (auth, retry, abort)
  server/
    app.ts                  # createApp(config?) — Hono app factory
    index.ts                # Standalone server entry (node server), reads env vars only
    routes/compile.ts        # createCompileRoute(config?) — POST /compile factory with Zod validation
```

Why so many small files at the top level instead of one `index.ts`: `client-core.ts`/`request-handler-core.ts` contain the actual logic (option merging, retry-free glue, Request/Response shaping) and are edge-safe (no Node built-ins) — each entry point (`index.ts`, `client-entry.ts`) supplies its own `compile` implementation into that shared core rather than duplicating the logic. Don't merge these back into one file; that's what makes `platex/client` genuinely edge-safe rather than just "doesn't happen to use `fs` today."

## Entry points

| Import | File | Runtime | Notes |
|---|---|---|---|
| `platex` | `src/index.ts` | Node | Full library, local-compile fallback |
| `platex/client` | `src/client-entry.ts` | Edge/anything with `fetch` | Remote-only; throws a clear error if no `serviceUrl` resolves instead of trying local compilation |
| `platex/server` | `src/server-entry.ts` | Node | `createApp`/`createCompileRoute`, for embedding the HTTP API |

When adding a new top-level export, decide which entry point(s) it belongs in and update `tsup.config.ts`'s `entry` map + `package.json`'s `exports` if you add a new entry point (not needed for adding exports to an existing one). If touching `client-core.ts`/`request-handler-core.ts`/`defaults.ts`, verify edge-safety after building: `grep -n "require(\|from '" dist/client.js` should show no `node:` specifiers.

## Conventions

- **TypeScript strict mode** with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — when threading an optional field (e.g. `signal`, `apiKey`) through multiple object shapes, declare it `field?: T | undefined` (not just `field?: T`) wherever it's assigned from a variable typed `T | undefined`, or build the object via property assignment (`obj.field = x`) inside an `if (x !== undefined)` guard instead of a nested conditional-spread — see `request-handler-core.ts` for the pattern and why (nested conditional-spreads with a cast to an indexed-access type that includes `| undefined` don't narrow correctly).
- **ESM-first** (`"type": "module"` in package.json), uses `.js` extensions in imports
- **Naming**: `camelCase` for functions/variables, `PascalCase` for types/interfaces, `kebab-case` for files
- **Error handling**: throw `TypeError` for invalid inputs, return structured error objects for compilation failures
- **Tests**: colocated with source (`*.test.ts`), use `describe`/`it`/`expect` from vitest, real child processes/real HTTP for integration tests — mock `fetch` only for the remote-client-layer tests (option merging, headers, retry), not for anything that could instead spawn the real fake-engine fixtures or bundled Tectonic
- **Imports**: sorted alphabetically by Biome (enforced via lint)
- **Formatting**: 2-space indent, single quotes, trailing commas (Biome enforced)
- **No hardcoded limits/URLs**: if you're tempted to add a constant that bounds request size, timeout, concurrency, or endpoint URL, make it a `CompileOptions`/`PlatexClientConfig`/`CreateAppConfig` field with an env-var fallback and a documented default instead (see `resolveLimits`, `defaultServiceUrl`, `defaultApiKey` in `defaults.ts` for the pattern)

## Key files to understand

- `src/compile-core.ts` — the actual `compile()` implementation; local/remote dispatch and limit/env-var resolution
- `src/client-core.ts` + `src/request-handler-core.ts` — the edge-safe cores both entry points build on
- `src/server/routes/compile.ts` — the HTTP API; validates input with Zod (schema built per-instance from `limits`), sanitizes filenames
- `src/local/passes.ts` — the multi-pass compilation pipeline; most complex logic, deadline-budgeted across all passes
- `src/local/compiler.ts` — child process spawning with env isolation, timeout, and AbortSignal support
- `src/local/log-parser.ts` — TeX log parsing for errors/warnings

## Security notes

- Path traversal in filenames is rejected (both in HTTP route and library)
- Child processes run with minimal env (PATH, HOME, TMPDIR only)
- TeX write/open restrictions enforced via `openout_any=p`, `openin_any=a`
- Source/files limits (`CompileLimits`: `maxSourceBytes` 5MB, `maxFilesCount` 50, `maxTotalFilesBytes` 25MB by default) are enforced in both the HTTP route and `runLocalPipeline` itself, but are *configurable* — per-call via `CompileOptions.limits`, per-client via `createPlatexClient({ limits })`, per-deployment via `createApp({ limits })`. A remote caller's own `limits` option is a client-side pre-check only; it can never raise what the server actually enforces (the server's `limits` config is what's authoritative) — don't change that invariant without discussing it, it's load-bearing for the "server operator controls server resources" security model.
- `timeout` is enforced as an overall wall-clock budget for the *whole* pipeline (`src/local/passes.ts` tracks a deadline and gives each subprocess only the remaining time), capped at 120s by the HTTP schema — not a per-process allowance, so total server-side time per request is actually bounded by the documented cap
- The HTTP server has no auth by default (`apiKey` config / `PLATEX_API_KEY` env var opts into bearer-token auth on `/compile`) and caps concurrent compiles per instance (`maxConcurrentCompiles` config / `PLATEX_MAX_CONCURRENT` env var, default 4) plus overall request body size (~45MB, auto-derived from `limits` or overridable via `maxRequestBodyBytes`) — see README's "Server configuration" section. `createCompileRoute()`/`createApp()` are factories (not module-level singletons), so each instance gets its own concurrency counter — don't reintroduce module-level mutable state there.
- `CompileOptions.signal` (`AbortSignal`) cancels in-flight local subprocesses or the remote HTTP request; the server also wires the incoming request's own abort signal through so a disconnected client doesn't leave orphaned compiles running
- `CompileOptions.retry` retries the *remote* path on retryable failures only (network error, our own timeout, 5xx) — never on 4xx or a caller-initiated `signal` abort. The retryability classification lives in `RemoteCompileError` in `src/remote/client.ts`; if you add new failure modes there, classify them explicitly rather than defaulting to retryable.
- `scripts/download-tectonic.mjs` verifies the downloaded Tectonic tarball against a pinned SHA256 per platform before extracting/executing it
