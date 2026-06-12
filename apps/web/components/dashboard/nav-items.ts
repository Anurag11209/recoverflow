export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Recovery Cases', href: '/dashboard/cases' },
  { label: 'Analytics', href: '/dashboard/analytics' },
  { label: 'Settings', href: '/dashboard/settings' },
];

/**
 * Whether a nav item is the active route for the current pathname.
 * - Overview (/dashboard) matches only the exact path (otherwise it would
 *   light up for every nested dashboard route).
 * - Section items (/dashboard/cases, /dashboard/analytics) match the path
 *   itself and any descendant, so /dashboard/cases/[token] keeps
 *   "Recovery Cases" highlighted.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The page title shown in the header for a given pathname. */
export function pageTitleFor(pathname: string): string {
  const match = NAV_ITEMS.find((item) => isNavItemActive(pathname, item.href));
  return match?.label ?? 'Dashboard';
}
