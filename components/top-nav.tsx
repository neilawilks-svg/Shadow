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
    <header className="sticky top-0 z-30 overflow-hidden border-b border-[color:var(--line)] bg-[color:var(--surface-1)]/80 backdrop-blur-xl">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,rgba(0,171,189,0.2)_0%,rgba(0,153,221,0.14)_42%,rgba(255,122,72,0.2)_100%)]"
      />
      <div className="relative mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-[linear-gradient(135deg,var(--accent-1),var(--accent-2))] shadow-[0_0_0_6px_rgba(0,171,189,0.2)]" />
          <p className="text-sm font-semibold tracking-wide text-[color:var(--ink-2)]">Morgan Virtual Board Member</p>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full border border-[color:var(--line)] px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-[linear-gradient(120deg,var(--accent-1),var(--accent-3),var(--accent-2))] text-[color:var(--surface-1)]"
                    : "bg-[color:var(--card-bg)] text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)]"
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
