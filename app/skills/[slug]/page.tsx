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
          <TypeSelector skillName={skill.name} description={skill.description} types={damaging ? types : []} skill={skill} />
        </article>
      </div>
    </main>
  );
}
