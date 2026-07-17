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
      description: 'Compile LaTeX to PDF in TypeScript, built for Next.js.',
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
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'Installation', link: '/installation/' },
          ],
        },
        {
          label: 'Rendering Patterns',
          items: [
            { label: 'Server Components', link: '/rendering/ssr/' },
            { label: 'Client Components', link: '/rendering/csr/' },
            { label: 'Server Actions', link: '/rendering/server-actions/' },
            { label: 'Route Handlers', link: '/rendering/route-handlers/' },
          ],
        },
        {
          label: 'Reference',
          items: [{ label: 'API Reference', link: '/api-reference/' }],
        },
      ],
    }),
  ],
});
