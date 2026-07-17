# CLAUDE.md

Project context for AI assistants working on platex.

## What this is

`@nandan-varma/platex` — a TypeScript library that compiles LaTeX to PDF. Supports two modes:
- **Remote**: sends source to a platex HTTP service (Vercel/serverless), receives PDF back
- **Local**: compiles directly via system TeX Live (pdflatex/xelatex/lualatex) or bundled Tectonic binary

## Build / Test / Lint

```bash
npm run typecheck    # tsc --noEmit — must pass
npm test             # vitest run — 96 tests, all must pass
npm run lint         # biome check src/ — must pass
npm run lint:fix     # biome check --write src/ — auto-fix
npm run format       # biome format --write src/
npm run build        # tsup — produces dist/
```

## Architecture

```
src/
  index.ts              # Public API: compile() function
  types.ts              # All exported types (CompileOptions, CompileResult, etc.)
  defaults.ts           # Shared default constants (engine, passes, bib, timeout)
  local/
    index.ts            # runLocalPipeline — orchestrates local compilation
    compiler.ts         # spawnProcess — low-level child process wrapper
    passes.ts           # runPasses — multi-pass TeX compilation (mirrors Overleaf CLSI)
    bibtex.ts           # runBibliography, detectBibliography
    log-parser.ts       # parseLog, needsRerun — TeX log parsing
    tectonic.ts         # resolveTectonicBinary, runTectonic — Tectonic engine support
  remote/
    client.ts           # callRemote — HTTP client for platex service
  server/
    app.ts              # Hono app factory
    index.ts            # Standalone server entry (node server)
    routes/compile.ts   # POST /compile route with Zod validation
```

## Conventions

- **TypeScript strict mode** with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- **ESM-first** (`"type": "module"` in package.json), uses `.js` extensions in imports
- **Naming**: `camelCase` for functions/variables, `PascalCase` for types/interfaces, `kebab-case` for files
- **Error handling**: throw `TypeError` for invalid inputs, return structured error objects for compilation failures
- **Tests**: colocated with source (`*.test.ts`), use `describe`/`it`/`expect` from vitest, real child processes for integration tests
- **Imports**: sorted alphabetically by Biome (enforced via lint)
- **Formatting**: 2-space indent, single quotes, trailing commas (Biome enforced)

## Key files to understand

- `src/server/routes/compile.ts` — the HTTP API; validates input with Zod, sanitizes filenames
- `src/local/passes.ts` — the multi-pass compilation pipeline; most complex logic
- `src/local/compiler.ts` — child process spawning with env isolation
- `src/local/log-parser.ts` — TeX log parsing for errors/warnings

## Security notes

- Path traversal in filenames is rejected (both in HTTP route and library)
- Child processes run with minimal env (PATH, HOME, TMPDIR only)
- TeX write/open restrictions enforced via `openout_any=p`, `openin_any=a`
- Source limited to 5MB, timeout capped at 120s
