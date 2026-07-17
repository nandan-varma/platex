export interface NavItem {
  title: string;
  href: string;
  description: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Whether this group's items participate in the docs prev/next pager sequence. Default true. */
  pager?: boolean;
}

export const NAV: NavGroup[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Overview', href: '/', description: 'What platex is and how it fits into a Next.js app.' },
      { title: 'Installation', href: '/docs/installation', description: 'Deploy the service and install the client library.' },
    ],
  },
  {
    title: 'Rendering Patterns',
    items: [
      {
        title: 'Server Components',
        href: '/docs/rendering/ssr',
        description: 'compile() runs during the server render — the PDF ships in the initial HTML.',
      },
      {
        title: 'Client Components',
        href: '/docs/rendering/csr',
        description: 'Edit LaTeX in the browser and compile on demand via fetch.',
      },
      {
        title: 'Server Actions',
        href: '/docs/rendering/server-actions',
        description: "A form submits straight to a 'use server' function.",
      },
      {
        title: 'Route Handlers',
        href: '/docs/rendering/route-handlers',
        description: 'The raw Node.js API route backing the other patterns.',
      },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'API Reference', href: '/docs/api-reference', description: 'compile(), CompileOptions, CompileResult.' },
    ],
  },
  {
    title: 'Demo',
    pager: false,
    items: [
      {
        title: 'Server Components',
        href: '/demo/ssr',
        description: 'Live: compiled server-side, embedded in the initial HTML.',
      },
      {
        title: 'Client Components',
        href: '/demo/csr',
        description: 'Live: edit the source, compile on demand from the browser.',
      },
      {
        title: 'Server Actions',
        href: '/demo/server-actions',
        description: 'Live: recompile via a form bound to a server function.',
      },
      {
        title: 'Route Handlers',
        href: '/demo/route-handlers',
        description: 'Live: call the raw endpoint directly.',
      },
    ],
  },
];

export const FLAT_NAV: NavItem[] = NAV.flatMap((group) => group.items);
const PAGER_NAV: NavItem[] = NAV.filter((group) => group.pager !== false).flatMap((group) => group.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return FLAT_NAV.find((item) => item.href === pathname);
}

export function findGroup(pathname: string): NavGroup | undefined {
  return NAV.find((group) => group.items.some((item) => item.href === pathname));
}

export function siblingNavItems(pathname: string): { prev: NavItem | null; next: NavItem | null } {
  const index = PAGER_NAV.findIndex((item) => item.href === pathname);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? PAGER_NAV[index - 1]! : null,
    next: index < PAGER_NAV.length - 1 ? PAGER_NAV[index + 1]! : null,
  };
}

/**
 * Demo pages compile the kitchen-sink document server-side on every visit.
 * Next.js prefetches any <Link> on screen, which would silently trigger a
 * real Tectonic compile for pages nobody asked to view. Links to these
 * routes should pass prefetch={false}.
 */
export function isCompileHeavy(href: string): boolean {
  return href.startsWith('/demo/');
}

/** Maps a docs rendering-pattern page to its live demo counterpart, and back. */
export function demoHrefFor(docsHref: string): string | null {
  if (!docsHref.startsWith('/docs/rendering/')) return null;
  return docsHref.replace('/docs/rendering/', '/demo/');
}

export function docsHrefFor(demoHref: string): string | null {
  if (!demoHref.startsWith('/demo/')) return null;
  return demoHref.replace('/demo/', '/docs/rendering/');
}
