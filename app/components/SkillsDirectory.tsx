"use client";

import { useMemo, useState } from "react";
import { formatPower, hasSkillStages, skillStageValue, type AttachmentSkill, type PersonalitySkill, type SkillStage, type TypeElement } from "../lib/supabase";

type Tab = "attachment" | "personality";

const typeColors: Record<string, string> = {
  darkness: "#71617d", earth: "#a8743a", fire: "#df4b32",
  ice: "#4d9bb6", light: "#d19b23", lightning: "#c39416",
  null: "#68727b", plant: "#4d8b55", steel: "#637783",
  water: "#3d78b6", wind: "#4b947c",
};
const typeLabels: Record<string, string> = {
  darkness: "Dk", earth: "Ea", fire: "Fi", ice: "Ic", light: "Lt", lightning: "Li",
  null: "Nu", plant: "Pl", steel: "St", water: "Wa", wind: "Wi",
};

function isDamaging(damage: string | null) {
  const value = (damage ?? "").trim().toLowerCase();
  return value !== "" && value !== "-" && value !== "—" && value !== "none";
}

function AttachmentRow({ skill, types }: { skill: AttachmentSkill; types: TypeElement[] }) {
  const [selectedType, setSelectedType] = useState("");
  const [stage, setStage] = useState<SkillStage>(1);
  const type = types.find((item) => item.id === selectedType);
  const damaging = isDamaging(skill.damage);
  const stageValue = skillStageValue(skill, stage);
  const displayValue = stageValue ?? `DC 8 + Prof + ${formatPower(skill.power)} mod${stage > 1 ? ` + ${(stage - 1) * 5}` : ""}`;

  return (
    <details className="skill-accordion">
      <summary>
        <span className="accordion-chevron" aria-hidden="true">›</span>
        <span className="accordion-name">{type ? `${type.name} ${skill.name}` : skill.name}</span>
        <span className="accordion-meta"><b>{formatPower(skill.power)}</b><span>{skill.time}</span></span>
        <span className={damaging ? "damage-chip" : "muted"}>{displayValue}</span>
      </summary>
      <div className="accordion-content attachment-content">
        <div className="compact-stats">
          <span><b>Range</b>{skill.range}</span>
          <span><b>Duration</b>{skill.duration}</span>
          <span><b>Power</b>{formatPower(skill.power)}</span>
          <span><b>Damage / DC</b>{displayValue}</span>
        </div>
        {hasSkillStages(skill) && <div className="skill-stage-picker" role="group" aria-label={`${skill.name} stage`}>
          <span>Stage</span>
          {([1, 2, 3] as SkillStage[]).map((value) => <button key={value} type="button" className={stage === value ? "selected" : ""} aria-pressed={stage === value} onClick={() => setStage(value)}>{value === 1 ? "I" : value === 2 ? "II" : "III"}</button>)}
        </div>}
        <div className="inline-description">
          <p>{skill.description}</p>
          {type && (
            <div className="inline-type-effect" style={{ "--type-color": typeColors[type.name.toLowerCase()] ?? "#68727b" } as React.CSSProperties}>
              <strong>{type.name} effect</strong>
              <span>{type.effect}</span>
            </div>
          )}
        </div>
        {damaging && <div className="compact-type-picker">
          <span>Elemental type</span>
          <div className="mini-type-row" role="group" aria-label="Choose elemental type">
            {types.map((item) => <button key={item.id} type="button" title={item.name} aria-label={item.name} aria-pressed={selectedType === item.id} className={selectedType === item.id ? "selected" : ""} style={{ "--type-color": typeColors[item.name.toLowerCase()] ?? "#68727b" } as React.CSSProperties} onClick={() => setSelectedType(selectedType === item.id ? "" : item.id)}>{typeLabels[item.name.toLowerCase()] ?? item.name.slice(0, 2)}</button>)}
          </div>
        </div>}
      </div>
    </details>
  );
}

function PersonalityRow({ skill }: { skill: PersonalitySkill }) {
  return (
    <details className="skill-accordion personality-accordion">
      <summary>
        <span className="accordion-chevron" aria-hidden="true">›</span>
        <span className="accordion-name">{skill.name}</span>
        <span className="personality-count">{skill.personalities.length > 1 ? `${skill.personalities.length} personalities` : "Personality skill"}</span>
      </summary>
      <div className="accordion-content personality-content">
        <p>{skill.description}</p>
      </div>
    </details>
  );
}

export function SkillsDirectory({
  attachmentSkills,
  personalitySkills,
  types,
}: {
  attachmentSkills: AttachmentSkill[];
  personalitySkills: PersonalitySkill[];
  types: TypeElement[];
}) {
  const [tab, setTab] = useState<Tab>("attachment");
  const [query, setQuery] = useState("");

  const filteredAttachments = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search ? attachmentSkills.filter((skill) => skill.name.toLowerCase().includes(search)) : attachmentSkills;
  }, [attachmentSkills, query]);

  const personalityGroups = useMemo(() => {
    const search = query.trim().toLowerCase();
    const groups = new Map<string, PersonalitySkill[]>();
    personalitySkills.forEach((skill) => {
      if (search && !skill.name.toLowerCase().includes(search) && !skill.personalities.some((name) => name.toLowerCase().includes(search))) return;
      skill.personalities.forEach((personality) => {
        const entries = groups.get(personality) ?? [];
        entries.push(skill);
        groups.set(personality, entries);
      });
    });
    return [...groups.entries()];
  }, [personalitySkills, query]);

  const personalityResultCount = new Set(personalityGroups.flatMap(([, skills]) => skills.map((skill) => skill.id))).size;
  const count = tab === "attachment" ? filteredAttachments.length : personalityResultCount;
  const total = tab === "attachment" ? attachmentSkills.length : personalitySkills.length;

  return (
    <section className="directory" aria-labelledby="directory-heading">
      <div className="skill-tabs" role="tablist" aria-label="Skill categories">
        <button role="tab" aria-selected={tab === "attachment"} className={tab === "attachment" ? "selected" : ""} onClick={() => { setTab("attachment"); setQuery(""); }}>
          <span>Attachment Skills</span><b>{attachmentSkills.length}</b>
        </button>
        <button role="tab" aria-selected={tab === "personality"} className={tab === "personality" ? "selected" : ""} onClick={() => { setTab("personality"); setQuery(""); }}>
          <span>Personality Skills</span><b>{personalitySkills.length}</b>
        </button>
      </div>
      <div className="directory-tools">
        <label className="search-field">
          <span className="sr-only">Search {tab} skills</span>
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "attachment" ? "Search attachment skills..." : "Search skills or personalities..."} autoComplete="off" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">Clear</button>}
        </label>
        <p className="result-count" aria-live="polite"><strong>{count}</strong> / {total} skills</p>
      </div>

      <h2 id="directory-heading" className="sr-only">{tab === "attachment" ? "Attachment skills" : "Personality skills"}</h2>
      <div className="accordion-list" role="tabpanel">
        {tab === "attachment" && filteredAttachments.map((skill) => <AttachmentRow key={skill.id} skill={skill} types={types} />)}
        {tab === "personality" && personalityGroups.map(([personality, skills]) => (
          <section className="personality-group" key={personality}>
            <div className="personality-heading"><h3>{personality}</h3><span>{skills.length} {skills.length === 1 ? "skill" : "skills"}</span></div>
            {skills.map((skill) => <PersonalityRow key={`${personality}-${skill.id}`} skill={skill} />)}
          </section>
        ))}
        {count === 0 && (
          <div className="empty-state"><span aria-hidden="true">◇</span><h3>No skills found</h3><p>Try a different name or clear your search.</p><button type="button" onClick={() => setQuery("")}>Clear search</button></div>
        )}
      </div>
    </section>
  );
}
