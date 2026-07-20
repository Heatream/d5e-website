import type { Metadata } from "next";
import { SkillsDirectory } from "../components/SkillsDirectory";
import { getPersonalitySkills, getSkills, getTypeElements } from "../lib/supabase";

export const metadata: Metadata = {
  title: "Skills",
  description: "Browse and search D5e attachment skills.",
};

export default async function SkillsPage() {
  const [skills, personalitySkills, types] = await Promise.all([
    getSkills(),
    getPersonalitySkills(),
    getTypeElements(),
  ]);

  return (
    <main>
      <section className="page-hero">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="page-shell hero-content">
          <p className="eyebrow light">D5e Reference Compendium</p>
          <h1>Attachment Skills</h1>
          <p>
            Search every combat technique, reaction, and support skill in one
            fast reference built for the table.
          </p>
        </div>
      </section>
      <div className="page-shell directory-shell">
        {skills.length ? (
          <SkillsDirectory attachmentSkills={skills} personalitySkills={personalitySkills} types={types} />
        ) : (
          <div className="empty-state permanent">
            <h2>No skills available</h2>
            <p>The compendium does not have any published skills yet.</p>
          </div>
        )}
      </div>
    </main>
  );
}
