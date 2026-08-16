"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const upcoming = ["Rules"];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link className="brand" href="/monster-manual" aria-label="D5e home">
          <span className="brand-mark" aria-hidden="true">D5</span>
          <span className="brand-word">D5e</span>
        </Link>
        <nav className="main-nav" aria-label="Primary navigation">
          <Link className={`nav-link ${pathname.startsWith("/monster-manual") ? "active" : ""}`} href="/monster-manual" aria-current={pathname.startsWith("/monster-manual") ? "page" : undefined}>
            Monster Manual
          </Link>
          <Link className={`nav-link ${pathname.startsWith("/skills") ? "active" : ""}`} href="/skills" aria-current={pathname.startsWith("/skills") ? "page" : undefined}>
            Skills
          </Link>
          <Link className={`nav-link ${pathname.startsWith("/items") ? "active" : ""}`} href="/items" aria-current={pathname.startsWith("/items") ? "page" : undefined}>
            Items
          </Link>
          <Link className={`nav-link ${pathname.startsWith("/character-creation") ? "active" : ""}`} href="/character-creation" aria-current={pathname.startsWith("/character-creation") ? "page" : undefined}>
            Character Creation
          </Link>
          <Link className={`nav-link ${pathname.startsWith("/encounter-manager") ? "active" : ""}`} href="/encounter-manager" aria-current={pathname.startsWith("/encounter-manager") ? "page" : undefined}>Encounter Manager</Link>
          {upcoming.map((item) => (
            <span className="nav-link disabled" aria-disabled="true" key={item}>
              {item}
              <span className="coming-soon">Soon</span>
            </span>
          ))}
        </nav>
      </div>
    </header>
  );
}
