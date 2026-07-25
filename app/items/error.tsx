"use client";

export default function ItemsError({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <div className="error-card">
        <span aria-hidden="true">!</span>
        <p className="eyebrow">Connection interrupted</p>
        <h1>The item archive could not be opened.</h1>
        <p>Please try again. No game data has been changed.</p>
        <button type="button" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
