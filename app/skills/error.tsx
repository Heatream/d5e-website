"use client";

export default function SkillsError({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <div className="error-card">
        <span aria-hidden="true">!</span>
        <p className="eyebrow">Connection interrupted</p>
        <h1>The compendium could not be opened.</h1>
        <p>Please try again. Your search and game data have not been changed.</p>
        <button type="button" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
