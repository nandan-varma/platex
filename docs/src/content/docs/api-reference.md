---
title: API Reference
description: >-
  The entire public surface is one function — compile(). Every rendering
  pattern in these docs calls it the same way.
---

The entire public surface is one function: `compile()`. Every rendering pattern
in these docs calls it the same way.

## compile(source, options?)

Returns a Promise resolving to a `CompileResult`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `engine` | `'pdflatex' \| 'xelatex' \| 'lualatex'` | `'pdflatex'` | Used when system TeX is available; Tectonic is always XeTeX-based. |
| `passes` | `'auto' \| 1 \| 2 \| 3` | `'auto'` | `'auto'` reruns until output is stable. |
| `bibliography` | `'bibtex' \| 'biber' \| 'none'` | `'bibtex'` | Bibliography engine. |
| `files` | `Record<string, Buffer>` | `{}` | Additional files: `.bib`, images, included `.tex` files. |
| `serviceUrl` | `string` | — | URL of the platex service. If unset, compiles locally. |
| `timeout` | `number` | `30000` | Timeout in milliseconds. |

## CompileResult

```typescript
interface CompileResult {
  pdf: Buffer | null        // null on fatal compile error
  errors: LatexError[]      // structured errors with file + line number
  warnings: LatexWarning[]  // overfull boxes, undefined refs, etc.
  logs: RawPassLog[]        // per-pass raw .log content for debugging
}

interface LatexError {
  type: 'error'
  file: string | null
  line: number | null
  message: string
  context: string | null    // surrounding lines from the TeX log
  source: 'latex' | 'bibtex' | 'biber'
}

interface LatexWarning {
  type: 'warning'
  code: 'overfull-hbox' | 'underfull-hbox' | 'undefined-reference'
      | 'undefined-citation' | 'multiply-defined-label'
      | 'font-warning' | 'package-warning' | 'other'
  file: string | null
  line: number | null
  message: string
}
```

## With additional files

`files` keys become filenames inside the compilation sandbox — use this for
`.bib` files, images, or any `\input`-ed sub-document.

```typescript
import { readFile } from 'fs/promises'
import { compile } from '@nandan-varma/platex'

const bib = await readFile('refs.bib')
const logo = await readFile('logo.png')

const result = await compile(source, {
  bibliography: 'bibtex',
  files: {
    'refs.bib': bib,
    'figures/logo.png': logo,
  },
  serviceUrl: process.env.PLATEX_SERVICE_URL,
})
```
