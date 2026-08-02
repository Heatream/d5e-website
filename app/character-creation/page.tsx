import { Suspense } from "react";
import { CharacterCreation } from "../components/CharacterCreation";
import { getCharacterCreationData } from "../lib/supabase";

export const metadata = { title: "Character Creation | D5e" };

export default async function CharacterCreationPage() {
  const data = await getCharacterCreationData();
  return <main>
    <section className="page-hero">
      <div className="hero-orbit orbit-one" />
      <div className="hero-orbit orbit-two" />
      <div className="page-shell hero-content">
        <p className="eyebrow light">D5e Character Builder</p>
        <h1>Character Creation</h1>
        <p>Build tamers, create Digimon partners, and keep every sheet together in your D5e account.</p>
      </div>
    </section>
    <div className="page-shell creation-page-shell">
      <Suspense fallback={<div className="loading-state">Loading creator…</div>}><CharacterCreation {...data} /></Suspense>
    </div>
  </main>;
}
