// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// Static Astro + Starlight docs site. Vercel auto-detects Astro and serves
// the `dist/` output — no adapter needed. When deploying, set the Vercel
// project's Root Directory to `docs`. Update `site` to your production URL.
export default defineConfig({
  site: 'https://platex-docs.vercel.app',
  integrations: [
    starlight({
      title: 'platex',
      description:
        'Compile LaTeX to PDF in TypeScript. Works in any framework that speaks the Fetch API — on Node.js or the edge.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/nandan-varma/platex',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/nandan-varma/platex/edit/main/docs/',
      },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'Installation', link: '/installation/' },
            { label: 'Quick start', link: '/quick-start/' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'How it works', link: '/guides/how-it-works/' },
            { label: 'Compiling LaTeX', link: '/guides/compiling/' },
            {
              label: 'Files & bibliography',
              link: '/guides/files-and-bibliography/',
            },
            {
              label: 'Cancellation, retries & timeouts',
              link: '/guides/cancellation-and-retries/',
            },
            { label: 'Request handlers', link: '/guides/request-handlers/' },
            {
              label: 'CLI & watch mode',
              link: '/guides/cli/',
              badge: { text: 'CLI', variant: 'tip' },
            },
          ],
        },
        {
          label: 'Next.js rendering patterns',
          items: [
            { label: 'Server Components', link: '/rendering/ssr/' },
            { label: 'Client Components', link: '/rendering/csr/' },
            { label: 'Server Actions', link: '/rendering/server-actions/' },
            { label: 'Route Handlers', link: '/rendering/route-handlers/' },
          ],
        },
        {
          label: 'Other frameworks',
          items: [
            { label: 'Framework recipes', link: '/frameworks/' },
            { label: 'Edge & serverless', link: '/frameworks/edge/' },
          ],
        },
        {
          label: 'Deployment',
          items: [
            { label: 'Deploy the service', link: '/deployment/service/' },
            { label: 'Self-hosting with Docker', link: '/deployment/docker/' },
            {
              label: 'Server configuration',
              link: '/deployment/server-config/',
            },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API reference', link: '/api-reference/' },
            { label: 'CLI reference', link: '/reference/cli/' },
            { label: 'HTTP API', link: '/reference/http-api/' },
          ],
        },
      ],
    }),
  ],
});
