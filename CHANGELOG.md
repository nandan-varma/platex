# Changelog

All notable changes to `@nandan-varma/platex` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.0.5] — 2026-07-17

### Added

- **`platex` CLI** — `npx @nandan-varma/platex main.tex` compiles a `.tex`
  file straight from the terminal, locally or against a remote service.
  Supports `--engine`, `--passes`, `--bib`, `--file` (attach extra
  files/directories), `--timeout`, `--service-url`/`--api-key`, `--retry`,
  `--watch` (recompile on change), `--json` (full `CompileResult` on stdout),
  `--quiet`, and stdin input via `platex -`. Ctrl-C aborts in-flight compiles
  cleanly instead of orphaning TeX subprocesses.
- CI now verifies the built `platex/client` bundle contains no `node:`
  imports (the edge-safety invariant) and smoke-tests the built CLI with a
  real compile.
- `CONTRIBUTING.md` with the development workflow.

## [0.0.4] — 2026-07-17

### Added

- Framework-agnostic client/handler API: `createPlatexClient`,
  `handleCompileRequest`, and `createRequestHandler` work in any framework
  that speaks the Fetch API (Next.js, TanStack Start, Astro, SvelteKit,
  Remix, Bun, Deno, Cloudflare Workers).
- `@nandan-varma/platex/client` entry point: edge-runtime-safe, remote-only
  variant with zero Node built-ins.
- `@nandan-varma/platex/server` entry point: `createApp`/`createCompileRoute`
  factories for embedding the compile HTTP API into your own server.
- Fully configurable limits: `CompileLimits` overridable per call, per
  client, and per deployment; server body-size cap auto-derived from limits.
- `retry` option for the remote path (retryable failures only — network
  errors, timeouts, 5xx; never 4xx or caller-initiated aborts).
- Custom `fetch` and extra `headers` options for the remote path.

## [0.0.3] — 2026-07-17

### Fixed

- Resource-exhaustion hardening: input-size limits enforced in both the HTTP
  route and the local pipeline; per-instance concurrent-compile cap.
- `timeout` is now an overall wall-clock budget for the whole pipeline
  (deadline shared across passes and bibliography runs), not per-process.
- Integrity: `scripts/download-tectonic.mjs` verifies the Tectonic tarball
  against a pinned SHA256 per platform before extracting.

## [0.0.2] — 2026-07-17

### Fixed

- Security and correctness fixes from the first code audit: path-traversal
  rejection for filenames, minimal child-process environment, TeX
  write/open restrictions (`openout_any=p`, `openin_any=a`), optional
  bearer-token auth on `/compile`.

## [0.0.1] — 2026-07-16

### Added

- Initial release: LaTeX → PDF compilation with accurate output.
- Local pipeline (system TeX Live pdflatex/xelatex/lualatex with multi-pass +
  bibtex/biber, or bundled Tectonic fallback) and remote mode via the platex
  HTTP service.
- Structured `CompileResult` with parsed errors/warnings and per-pass logs.
- Standalone Hono server, Docker image (full TeX Live), Vercel deployment
  target, CI/release workflows, end-to-end test suite, and a Next.js
  docs/demo site.

[Unreleased]: https://github.com/nandan-varma/platex/compare/v0.0.5...HEAD
[0.0.5]: https://github.com/nandan-varma/platex/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/nandan-varma/platex/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/nandan-varma/platex/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/nandan-varma/platex/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/nandan-varma/platex/releases/tag/v0.0.1
