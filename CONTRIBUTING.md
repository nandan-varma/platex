# Contributing to platex

Thanks for helping make platex better. This is a small, focused codebase —
most changes touch one file plus its colocated test.

## Setup

```bash
git clone https://github.com/nandan-varma/platex
cd platex
npm install
node scripts/download-tectonic.mjs   # bundled TeX engine the tests compile with
```

Node.js ≥ 20 is required. No TeX Live installation is needed — the test suite
compiles real LaTeX through the downloaded Tectonic binary (verified against a
pinned SHA256).

## Development workflow

```bash
npm run typecheck    # tsc --noEmit — must pass
npm test             # vitest run — must pass; real compiles, no mocked TeX
npm run lint         # biome check src/ — must pass
npm run lint:fix     # auto-fix lint/format issues
npm run build        # tsup — dist/{index,client,server-app}.{js,cjs,d.ts} + dist/cli.js
npm run dev          # run the standalone compile server locally
```

All three checks (typecheck, test, lint) must pass before a PR — CI runs them
on Node 20 and 22, then builds and smoke-tests the CLI.

## Project invariants

A few properties are load-bearing; please don't change them casually (see
`CLAUDE.md` for the full rationale):

- **Edge safety.** `platex/client` (built from `src/client-entry.ts` via the
  shared cores `client-core.ts`/`request-handler-core.ts`) must never import
  Node built-ins. After touching those files, verify the built bundle:

  ```bash
  npm run build
  grep -nE "[\"']node:" dist/client.js dist/client.cjs && echo "EDGE-UNSAFE" || echo "ok"
  ```

  CI enforces this on every push.

- **Server operator controls server resources.** A remote caller's `limits`
  option is a client-side pre-check only; it can never raise what the server
  enforces.

- **No hardcoded knobs.** Anything a caller might reasonably override
  (timeouts, limits, URLs, auth, concurrency) is a config field with an
  env-var fallback and a documented default — never a baked-in constant.

- **No module-level mutable state** in `createApp`/`createCompileRoute` —
  they're factories so each instance owns its own concurrency counter.

## Tests

- Colocated with source (`src/**/*.test.ts`), run with vitest.
- Integration tests spawn real child processes (fake-engine fixtures in
  `test/fixtures/fake-engines/`, or the bundled Tectonic) and real HTTP.
  Mock `fetch` only in the remote-client-layer tests.
- Fixtures live in `test/fixtures/`.

## Releasing (maintainers)

1. Update `CHANGELOG.md` (move Unreleased into a new version section).
2. Bump `version` in `package.json`, commit, and tag `vX.Y.Z`.
3. Push the tag — the release workflow publishes to npm with provenance and
   creates a GitHub release with generated notes.
