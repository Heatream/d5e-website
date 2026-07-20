import type { Metadata } from "next";
import { MonsterManual } from "../components/MonsterManual";
import { getMonsterManualData } from "../lib/supabase";

export const metadata: Metadata = { title: "Monster Manual", description: "Browse level-scaled D5e Digimon stat sheets." };

export default async function MonsterManualPage() {
  const data = await getMonsterManualData();
  return <main>
    <section className="manual-hero"><div className="page-shell"><p className="eyebrow light">D5e Field Guide</p><h1>Monster Manual</h1><p>Select a Digimon and tune its level to prepare a table-ready stat sheet.</p></div></section>
    <div className="page-shell manual-page-shell"><MonsterManual {...data} /></div>
  </main>;
}
