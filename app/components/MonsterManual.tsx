"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttachmentSkill, Attribute, Digimon, Field, LevelChart, TypeElement } from "../lib/supabase";

const GENERIC_IMAGE = "https://aboaavhsrjmecqyjoaek.supabase.co/storage/v1/object/public/D5e%20Assets/assets/symbols/Generic%20Symbol.png";
const abilityLabels = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" } as const;
type Ability = keyof typeof abilityLabels;

function modifier(score: number) { return Math.floor((score - 10) / 2); }
function maxDie(die: string) {
  const match = die.toLowerCase().match(/(\d+)d(\d+)/);
  return match ? Number(match[1]) * Number(match[2]) : 6;
}
function validType(value: string, types: TypeElement[]) { return types.find((type) => type.name.toLowerCase() === value.toLowerCase()) ?? null; }

function DigimonPortrait({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return <img src={!src || failed ? GENERIC_IMAGE : src} alt={name} onError={() => setFailed(true)} />;
}

export function MonsterManual({ digimon, fields, attributes, levels, skills, types }: {
  digimon: Digimon[]; fields: Field[]; attributes: Attribute[]; levels: LevelChart[]; skills: AttachmentSkill[]; types: TypeElement[];
}) {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState(digimon[0]?.slug ?? "");
  const [level, setLevel] = useState(1);
  const selected = digimon.find((item) => item.slug === selectedSlug) ?? digimon[0];

  const view = useMemo(() => {
    if (!selected) return null;
    const attribute = attributes.find((item) => item.name.toLowerCase() === selected.attribute.toLowerCase());
    const field = fields.find((item) => item.abbreviation.toLowerCase() === selected.field.toLowerCase());
    const levelRow = levels.find((item) => item.level === level) ?? levels[0];
    const stats = { strength: selected.strength, dexterity: selected.dexterity, constitution: selected.constitution, intelligence: selected.intelligence, wisdom: selected.wisdom, charisma: selected.charisma };
    attribute?.statBuffs.forEach((buff) => {
      const key = buff.toLowerCase() as Ability;
      if (key in stats) stats[key] += 2;
    });
    const stage = selected.stage.toLowerCase();
    const hitDie = attribute?.hpDice[stage] ?? "1d6";
    const hp = Math.max(1, level * (maxDie(hitDie) + modifier(stats.constitution)));
    const attachmentSkills = selected.attachmentSkills.filter((ref) => ref.level <= level).map((ref) => ({ ref, skill: skills.find((skill) => skill.slug === ref.skill), type: validType(ref.type, types) })).filter((entry) => entry.skill);
    return { attribute, field, levelRow, stats, hitDie, hp, attachmentSkills };
  }, [selected, attributes, fields, levels, level, skills, types]);

  if (!selected || !view) return <div className="empty-state"><h2>No Digimon available</h2></div>;
  const stageLevel = ({ rookie: 1, champion: 2, ultimate: 3, mega: 4 } as Record<string, number>)[selected.stage.toLowerCase()] ?? 1;
  const special = selected.specialSkills[0];

  function openSkill(slug: string, type: string) {
    const matchingType = validType(type, types);
    if (matchingType) sessionStorage.setItem(`d5eSkillType:${slug}`, matchingType.name);
    router.push(`/skills/${slug}`);
  }

  return <>
    <section className="manual-controls" aria-label="Monster manual controls">
      <label className="digimon-select"><span>Digimon</span><select value={selectedSlug} onChange={(event) => setSelectedSlug(event.target.value)}>{digimon.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
      <div className="level-control">
        <div><span>D-Level</span><strong>{level}</strong></div>
        <input type="range" min="1" max="20" value={level} onChange={(event) => setLevel(Number(event.target.value))} aria-label="Digimon level" />
        <div className="level-marks"><span>1</span><span>5</span><span>10</span><span>15</span><span>20</span></div>
      </div>
    </section>

    <div className="sheet-scroll">
      <article className="digimon-sheet" style={{ "--field-border": `url("${view.field?.border ?? ""}")` } as React.CSSProperties}>
        <section className="sheet-identity">
          <div className="sheet-name-row"><h2>{selected.name}</h2><span>Lv <b>{level}</b></span></div>
          <div className="portrait-frame"><DigimonPortrait src={selected.image} name={selected.name} /></div>
        </section>

        <section className="sheet-vitals">
          <div className="hp-stat"><small>{view.hitDie}</small><span>HP</span><strong>{view.hp}</strong></div>
          <div className="pill-stat"><b>AC</b><span>{10 + modifier(view.stats.dexterity)}</span></div>
          <div className="pill-stat"><b>Prof</b><span>{view.levelRow?.proficiency ?? "+2"}</span></div>
          <div className="big-stat"><span>DL</span><strong>{view.levelRow?.digislot ?? 1}</strong></div>
          <div className="big-stat"><span>Speed</span><strong>30<small>ft</small></strong></div>
          <div className="symbol-card"><img src={view.attribute?.image} alt={`${selected.attribute} attribute`} /><span>{selected.attribute}</span></div>
          <div className="symbol-card"><img src={view.field?.symbol} alt={`${view.field?.name ?? selected.field} field`} /><span>{view.field?.abbreviation ?? selected.field}</span></div>
        </section>

        <section className="ability-grid">
          {(Object.keys(abilityLabels) as Ability[]).map((ability) => <div key={ability}><span>{abilityLabels[ability]}</span><strong>{view.stats[ability]}</strong><small>{modifier(view.stats[ability]) >= 0 ? "+" : ""}{modifier(view.stats[ability])}</small></div>)}
        </section>

        <section className="sheet-actions">
          {special && <div className="special-skill-panel"><div className="action-head"><strong>{special.name}</strong><span>{special.range}</span><span>{special.power}</span><span>{special.damage}</span></div><p>{validType(special.type, types)?.name ?? special.type} Type</p></div>}
          <div className="attachment-panel"><div className="attachment-head"><strong>Attachment Skills</strong><span>Range</span><span>Power</span><span>Damage</span></div>
            {view.attachmentSkills.length ? view.attachmentSkills.map(({ ref, skill, type }) => <button type="button" className="manual-skill-row" key={ref.skill} onClick={() => openSkill(ref.skill, ref.type)}><span>{type ? `${type.name} ${skill!.name}` : skill!.name}</span><span>{skill!.range}</span><span>{skill!.power}</span><span>{skill!.damage}</span></button>) : <p className="locked-message">No attachment skills unlocked at this level.</p>}
          </div>
        </section>

        <aside className="sheet-traits">
          <div className="trait-card proficiency-card"><h3>Proficiency</h3><p>{selected.proficiencies.join(" · ") || "—"}</p></div>
          <div className="split-traits"><div className="trait-card"><h3>Saving Throws</h3><p>{selected.savingThrows.join(" · ") || "—"}</p></div><div className="trait-card"><h3>Weaknesses</h3><p>{selected.weakness.join(" · ") || "—"}</p></div></div>
          <div className="trait-card identity-card"><h3>{view.field?.name ?? selected.field}</h3><p>{selected.stage} · Stage {stageLevel}</p></div>
        </aside>
      </article>
    </div>
  </>;
}
