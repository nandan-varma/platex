'use client';

import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { findNavItem, findGroup } from '@/lib/nav-config';

export function DocsBreadcrumb() {
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const group = findGroup(pathname);

  if (!current) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {group && current.href !== '/' && (
          <>
            <BreadcrumbItem className="hidden md:block">
              <span className="text-muted-foreground">{group.title}</span>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
          </>
        )}
        <BreadcrumbItem>
          <BreadcrumbPage>{current.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
