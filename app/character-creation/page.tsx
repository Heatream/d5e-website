import { Suspense } from "react";
import { CharacterCreation } from "../components/CharacterCreation";
import { getCharacterCreationData } from "../lib/supabase";

export const metadata = { title: "Character Creation | D5e" };

export default async function CharacterCreationPage() {
  const data = await getCharacterCreationData();
  return <main className="page-shell">
    <section className="page-hero">
      <div className="hero-content">
        <p className="eyebrow light">D5e Partner Builder</p>
        <h1>Character Creation</h1>
        <p>Create a Digimon from scratch, build its signature skill, and save it to this browser.</p>
      </div>
    </section>
    <Suspense fallback={<div className="loading-state">Loading creator…</div>}><CharacterCreation {...data} /></Suspense>
  </main>;
}
