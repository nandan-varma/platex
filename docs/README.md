# platex docs

The documentation site for [`@nandan-varma/platex`](https://github.com/nandan-varma/platex),
built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).
Content lives under `src/content/docs/` as Markdown (`.md`) and MDX (`.mdx`,
for pages that use Starlight components like `Tabs`, `Steps`, and `Aside`).

## Local development

```bash
cd docs
npm install
npm run dev      # http://localhost:4321
```

| Command | Action |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Build the static site to `dist/` |
| `npm run preview` | Preview the production build locally |

## Editing content

Each page is a Markdown/MDX file in `src/content/docs/`:

```
src/content/docs/
  index.mdx                          # landing / overview (splash)
  installation.mdx
  quick-start.mdx
  api-reference.mdx
  guides/
    how-it-works.mdx
    compiling.mdx
    files-and-bibliography.mdx
    cancellation-and-retries.mdx
    request-handlers.mdx
    cli.mdx                          # CLI & watch mode
  rendering/                         # Next.js patterns
    ssr.md                           # Server Components
    csr.md                           # Client Components
    server-actions.md
    route-handlers.md
  frameworks/
    index.mdx                        # framework recipes
    edge.mdx                         # edge & serverless
  deployment/
    service.mdx
    docker.mdx
    server-config.mdx
  reference/
    cli.mdx                          # CLI reference
    http-api.mdx                     # HTTP API
```

The sidebar and site metadata live in `astro.config.mjs`. Add a page by
dropping a new `.md`/`.mdx` file in and adding a `link` entry to the `sidebar`
array. Keep pages that import Starlight components as `.mdx`.

## Deploying to Vercel

This is a static Astro site — Vercel auto-detects the framework, so no adapter
or `vercel.json` is needed. Because the site lives in a subdirectory:

1. Import the repo into Vercel.
2. Set the project **Root Directory** to `docs`.
3. Vercel runs `npm run build` and serves `dist/`.

Update the `site` value in `astro.config.mjs` to your production URL for correct
canonical links and sitemap generation.
