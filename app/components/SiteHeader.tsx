import Link from "next/link";

const upcoming = [
  "Monster Manual",
  "Character Creation",
  "Encounter Manager",
  "Rules",
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link className="brand" href="/skills" aria-label="D5e home">
          <span className="brand-mark" aria-hidden="true">D5</span>
          <span className="brand-word">D5e</span>
        </Link>
        <nav className="main-nav" aria-label="Primary navigation">
          <Link className="nav-link active" href="/skills" aria-current="page">
            Skills
          </Link>
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
