import Link from "next/link";

export default function SkillNotFound() {
  return (
    <main className="error-page">
      <div className="error-card not-found-card">
        <span aria-hidden="true">404</span>
        <p className="eyebrow">Unknown technique</p>
        <h1>That skill is not in the compendium.</h1>
        <p>It may have been renamed, or the link may be incomplete.</p>
        <Link href="/skills">Browse all skills</Link>
      </div>
    </main>
  );
}
