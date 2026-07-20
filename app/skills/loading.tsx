export default function SkillsLoading() {
  return (
    <main className="loading-page" aria-busy="true" aria-label="Loading skills">
      <div className="page-shell">
        <div className="loading-line wide" />
        <div className="loading-line" />
        <div className="loading-panel" />
      </div>
    </main>
  );
}
