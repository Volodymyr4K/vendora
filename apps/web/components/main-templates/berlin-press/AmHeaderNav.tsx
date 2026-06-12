"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  matchPath: string;
};

function isActivePath(pathname: string, matchPath: string) {
  if (!matchPath || !pathname) return false;
  if (pathname === matchPath) return true;
  if (pathname.endsWith(matchPath)) return true;
  return pathname.includes(`${matchPath}/`);
}

export function AmHeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? "";

  return (
    <nav className="hidden lg:flex flex-1 items-stretch berlin-press-header-row">
      {items.map((item) => {
        const active = isActivePath(pathname, item.matchPath);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex-1 flex items-center justify-center text-[10px] uppercase tracking-[0.32em] font-bold relative group overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
              active ? "text-paper bg-ink" : "text-ink/80 bg-bg"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <div
              className={`absolute inset-0 bg-ink berlin-press-ink-noise transition-transform duration-500 ease-out-quart ${
                active ? "translate-y-0" : "translate-y-full group-hover:translate-y-0"
              }`}
            />
            <span
              className={`relative z-10 transition-colors duration-500 ${
                active ? "text-paper" : "group-hover:text-paper"
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
