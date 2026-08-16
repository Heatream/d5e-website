import { EncounterManager } from "../components/EncounterManager";
import { getCharacterCreationData } from "../lib/supabase";

export const metadata = { title: "Encounter Manager | D5e" };

export default async function EncounterManagerPage() {
  const data = await getCharacterCreationData();
  return <main>
    <section className="page-hero compact-hero"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="page-shell hero-content"><p className="eyebrow light">D5e Game Master Tools</p><h1>Encounter Manager</h1><p>Track initiative and combat resources without changing saved character sheets.</p></div></section>
    <div className="page-shell encounter-page-shell"><EncounterManager {...data} /></div>
  </main>;
}
