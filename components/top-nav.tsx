"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/meeting", label: "Meeting" },
  { href: "/personas", label: "Personas" },
  { href: "/shadow-board", label: "Shadow Board" },
  { href: "/demo", label: "Demo Control" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-white/30 bg-[color:var(--surface-1)]/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-[color:var(--accent-1)] shadow-[0_0_0_6px_rgba(0,179,126,0.15)]" />
          <p className="text-sm font-semibold tracking-wide text-[color:var(--ink-2)]">Morgan Virtual Board Member</p>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-[color:var(--ink-1)] text-[color:var(--surface-1)]"
                    : "bg-white/60 text-[color:var(--ink-2)] hover:bg-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
