import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TypeSelector } from "../../components/TypeSelector";
import { getSkill, getTypeElements, isDamagingSkill } from "../../lib/supabase";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const skill = await getSkill(slug);
  if (!skill) return { title: "Skill not found" };
  return { title: skill.name, description: skill.description };
}

export default async function SkillDetailPage({ params }: Props) {
  const { slug } = await params;
  const skill = await getSkill(slug);
  if (!skill) notFound();

  const damaging = isDamagingSkill(skill);
  const types = damaging ? await getTypeElements() : [];

  return (
    <main className="detail-page">
      <div className="detail-accent" />
      <div className="page-shell detail-shell">
        <Link href="/skills" className="back-link"><span aria-hidden="true">←</span> All skills</Link>
        <article className="skill-sheet">
          {damaging ? (
            <TypeSelector skillName={skill.name} description={skill.description} types={types} />
          ) : (
            <>
              <div className="detail-title-row">
                <div>
                  <p className="eyebrow">Attachment Skill</p>
                  <h1>{skill.name}</h1>
                </div>
                <span className="utility-badge">Utility</span>
              </div>
              <section className="description-block" aria-labelledby="description-title">
                <h2 id="description-title">Description</h2>
                <p>{skill.description}</p>
              </section>
            </>
          )}

          <dl className="stat-grid" aria-label="Skill statistics">
            <div><dt>Skill Power</dt><dd>{skill.power}</dd></div>
            <div><dt>Skill Time</dt><dd>{skill.time}</dd></div>
            <div><dt>Damage</dt><dd>{skill.damage}</dd></div>
            <div><dt>Duration</dt><dd>{skill.duration}</dd></div>
            <div><dt>Range</dt><dd>{skill.range}</dd></div>
          </dl>
        </article>
      </div>
    </main>
  );
}
