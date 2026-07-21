"use client";

import { useMemo, useState } from "react";
import { formatPower, type AttachmentSkill, type Attribute, type Digimon, type Field, type LevelChart, type PersonalitySkill, type TypeElement } from "../lib/supabase";
import { calculateHp, calculateMovement, modifier, normalizeStage, stageRange } from "../lib/digimon-rules";

const GENERIC_IMAGE = "https://aboaavhsrjmecqyjoaek.supabase.co/storage/v1/object/public/D5e%20Assets/assets/symbols/Generic%20Symbol.png";
type Ability = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
function validType(value: string, types: TypeElement[]) { return types.find((type) => type.name.toLowerCase() === value.toLowerCase()) ?? null; }
function printableListValue(value: unknown, keys: string[]) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const match = keys.map((key) => record[key]).find((entry) => typeof entry === "string");
  return typeof match === "string" ? match : "";
}

function DigimonPortrait({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <img className={className} src={!src || failed ? GENERIC_IMAGE : src} alt={name} onError={() => setFailed(true)} />;
}

export function MonsterManual({ digimon, fields, attributes, levels, skills, types, personalitySkills }: {
  digimon: Digimon[]; fields: Field[]; attributes: Attribute[]; levels: LevelChart[]; skills: AttachmentSkill[]; types: TypeElement[]; personalitySkills: PersonalitySkill[];
}) {
  const [selectedSlug, setSelectedSlug] = useState("");
  const [expandedSkillSlug, setExpandedSkillSlug] = useState("");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState(1);
  const selected = digimon.find((item) => item.slug === selectedSlug) ?? null;
  const filtered = useMemo(() => digimon.filter((item) => `${item.name} ${item.stage} ${item.attribute} ${item.field}`.toLowerCase().includes(query.trim().toLowerCase())), [digimon, query]);

  const view = useMemo(() => {
    if (!selected) return null;
    const attribute = attributes.find((item) => item.name.toLowerCase() === selected.attribute.toLowerCase());
    const field = fields.find((item) => item.abbreviation.toLowerCase() === selected.field.toLowerCase());
    const levelRow = levels.find((item) => item.level === level) ?? levels[0];
    const stats = { strength: selected.strength, dexterity: selected.dexterity, constitution: selected.constitution, intelligence: selected.intelligence, wisdom: selected.wisdom, charisma: selected.charisma };
    attribute?.statBuffs.forEach((buff) => { const key = buff.toLowerCase() as Ability; if (key in stats) stats[key] += 2; });
    const stage = normalizeStage(selected.stage);
    const hitDie = attribute?.hpDice[stage === "7th stage" ? "mega" : stage] ?? "1d6";
    const attachmentSkills = selected.attachmentSkills.filter((ref) => ref.level <= level).map((ref) => ({ ref, skill: skills.find((skill) => skill.slug === ref.skill), type: validType(ref.type, types) })).filter((entry) => entry.skill);
    const [personality = "", skillName = ""] = selected.personalitySkill.split(",").map((part) => part.trim());
    const personalitySkill = personalitySkills.find((item) => item.name.toLowerCase() === skillName.toLowerCase() && item.personalities.some((value) => value.toLowerCase() === personality.toLowerCase()));
    return { attribute, field, levelRow, stats, hitDie, hp: calculateHp(hitDie, level, stats.constitution), movement: calculateMovement(stats.dexterity), attachmentSkills, personality, skillName, personalitySkill };
  }, [selected, attributes, fields, levels, level, skills, types, personalitySkills]);

  function selectDigimon(item: Digimon) {
    if (selectedSlug === item.slug) { setSelectedSlug(""); setExpandedSkillSlug(""); return; }
    const [minimum] = stageRange(item.stage);
    setLevel(minimum);
    setExpandedSkillSlug("");
    setSelectedSlug(item.slug);
  }

  if (!digimon.length) return <div className="empty-state"><h2>No Digimon available</h2><p>The field guide has no entries yet.</p></div>;

  const directory = <section className="manual-directory" aria-label="Digimon directory">
    <div className="manual-search-row">
      <label className="search-box"><span>Search Digimon</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, stage, attribute, or field" /></label>
      <p aria-live="polite"><strong>{filtered.length}</strong> {filtered.length === 1 ? "Digimon" : "Digimon"}</p>
    </div>
    {filtered.length ? <div className="digimon-directory-grid">{filtered.map((item) => {
      const field = fields.find((entry) => entry.abbreviation.toLowerCase() === item.field.toLowerCase());
      const isSelected = selectedSlug === item.slug;
      return <button type="button" className={`digimon-directory-card${isSelected ? " selected" : ""}`} key={item.id} onClick={() => selectDigimon(item)} aria-expanded={isSelected}>
        <span className="directory-portrait"><DigimonPortrait src={item.image} name="" /></span>
        <span className="directory-copy"><strong>{item.name}</strong><small>{item.stage} · {item.attribute}</small></span>
        {field?.symbol && <img className="directory-field" src={field.symbol} alt={`${field.name} field`} />}
      </button>;
    })}</div> : <div className="empty-state"><h2>No matching Digimon</h2><p>Try a different name, stage, attribute, or field.</p></div>}
  </section>;

  if (!selected || !view) return directory;

  const [minimum, maximum] = stageRange(selected.stage);
  const special = selected.specialSkills[0];
  const expandedEntry = view.attachmentSkills.find(({ ref }) => ref.skill === expandedSkillSlug);
  const abilityOrder: Ability[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
  return <>{directory}<section className="selected-digimon">
    <div className="manual-controls sheet-level-controls">
      <div className="level-control"><div><span>D-Level · {selected.stage}</span><strong>{level}</strong></div><input type="range" min={minimum} max={maximum} value={level} onChange={(event) => setLevel(Number(event.target.value))} aria-label={`${selected.name} level`} /><div className="level-marks"><span>{minimum}</span><span>{maximum}</span></div></div>
    </div>

    <div className="sheet-scroll">
      <article className="digimon-sheet" aria-label={`${selected.name} level ${level} stat sheet`}>
        <DigimonPortrait className="sheet-portrait" src={selected.image} name={selected.name} />
        {view.field?.border && <img className="sheet-template" src={view.field.border} alt="" aria-hidden="true" />}
        <h2 className="print-name">{selected.name}</h2><div className="print-level"><strong>{level}</strong></div>
        <div className="print-hp"><small>{view.hitDie}</small><strong>{view.hp}</strong></div>
        <div className="print-ac"><span>{10 + modifier(view.stats.dexterity)}</span></div>
        <div className="print-prof"><span>{view.levelRow?.proficiency ?? "+2"}</span></div>
        <div className="print-dl"><strong>{view.levelRow?.digislot ?? 1}</strong></div>
        <div className="print-speed"><strong>{view.movement}<small>ft</small></strong></div>
        {view.attribute?.image && <img className="print-attribute" src={view.attribute.image} alt={`${selected.attribute} attribute`} />}
        <div className="print-abilities">{abilityOrder.map((ability) => <div key={ability}><strong>{view.stats[ability]}</strong></div>)}</div>
        {special && <div className="print-special"><div><strong>{special.name}</strong><span>{special.range}</span><span>{formatPower(special.power)}</span><span>{special.damage}</span></div><p>{validType(special.type, types)?.name ?? special.type} Type</p></div>}
        <div className="print-attachments">{view.attachmentSkills.length ? view.attachmentSkills.map(({ ref, skill, type }) => <button type="button" key={`${ref.skill}-${ref.level}`} onClick={() => setExpandedSkillSlug((current) => current === ref.skill ? "" : ref.skill)} aria-expanded={expandedSkillSlug === ref.skill} aria-controls="manual-skill-details"><span>{type ? `${type.name} ${skill!.name}` : skill!.name}</span><span>{skill!.range}</span><span>{formatPower(skill!.power)}</span><span>{skill!.damage}</span></button>) : <p>No attachment skills unlocked.</p>}</div>
        <div className="print-proficiencies"><p>{selected.proficiencies.join(" · ") || "—"}</p></div>
        <div className="print-saves"><p>{selected.savingThrows.length ? selected.savingThrows.map((value, index) => { const label = printableListValue(value, ["save", "savingThrow", "name", "value"]); return label ? <span key={`${label}-${index}`}>{label}</span> : null; }) : "—"}</p></div>
        <div className="print-weaknesses"><p>{selected.weakness.length ? selected.weakness.map((value, index) => { const label = printableListValue(value, ["weakness", "type", "name", "value"]); return label ? <span key={`${label}-${index}`}>{label}</span> : null; }) : "—"}</p></div>
        <div className="print-personality"><h3>{view.personality || "Personality"}{view.skillName ? ` · ${view.skillName}` : ""}</h3><p>{view.personalitySkill?.description ?? (view.skillName ? "Description unavailable." : "—")}</p></div>
      </article>
    </div>
    {expandedEntry?.skill && <section className="manual-skill-details" id="manual-skill-details" aria-live="polite">
      <div className="manual-skill-title"><div><span className="eyebrow">Attachment Skill</span><h3>{expandedEntry.type ? `${expandedEntry.type.name} ${expandedEntry.skill.name}` : expandedEntry.skill.name}</h3></div><button type="button" onClick={() => setExpandedSkillSlug("")} aria-label="Close skill details">×</button></div>
      <dl className="manual-skill-stats"><div><dt>Power</dt><dd>{formatPower(expandedEntry.skill.power)}</dd></div><div><dt>Time</dt><dd>{expandedEntry.skill.time}</dd></div><div><dt>Damage</dt><dd>{expandedEntry.skill.damage}</dd></div><div><dt>Range</dt><dd>{expandedEntry.skill.range}</dd></div><div><dt>Duration</dt><dd>{expandedEntry.skill.duration}</dd></div></dl>
      <p>{expandedEntry.skill.description}</p>
      {expandedEntry.type && <div className="manual-type-effect"><strong>{expandedEntry.type.name} Type</strong><p>{expandedEntry.type.effect}</p></div>}
    </section>}
  </section></>;
}
