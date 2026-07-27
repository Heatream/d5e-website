"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  formatPower, resolveSkillStage, skillStageValue, type AttachmentSkill, type Attribute,
  type Digimon, type Field, type Item, type LevelChart, type PersonalitySkill, type TypeElement,
} from "../lib/supabase";
import { calculateHistoryHp, calculateHp, calculateMovement, calculateSkillDc, modifier, normalizeStage, stageRange } from "../lib/digimon-rules";

const GENERIC_IMAGE = "https://aboaavhsrjmecqyjoaek.supabase.co/storage/v1/object/public/D5e%20Assets/assets/symbols/Generic%20Symbol.png";
type Ability = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

function validType(value: unknown, types: TypeElement[]) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "-") return null;
  return types.find((type) => type.name.toLowerCase() === normalized) ?? null;
}

function DigimonPortrait({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <img className={className} src={!src || failed ? GENERIC_IMAGE : src} alt={name} onError={() => setFailed(true)} />;
}

function RangeValue({ value }: { value: string }) {
  const clean = value.trim();
  const measurements = clean.match(/\d+\s*(?:ft|rd)\.?/gi) ?? [];
  const parenthetical = clean.match(/^(.+?)\s*(\([^)]*\))$/);
  const lines = measurements.length > 1
    ? measurements
    : parenthetical
      ? [parenthetical[1], parenthetical[2]]
      : [clean];
  return <span className="range-value" data-fit>{lines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}</span>;
}

function useAutoFitText(dependencies: unknown[]) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const fit = () => {
      sheet.querySelectorAll<HTMLElement>("[data-fit]").forEach((element) => {
        element.style.removeProperty("font-size");
        const base = Number.parseFloat(getComputedStyle(element).fontSize);
        const minimum = element.closest(".held-items-strip")
          ? Math.max(3, base * 0.25)
          : Math.max(5, base * 0.45);
        const overflows = () => {
          if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) return true;
          return [...element.querySelectorAll<HTMLElement>("*")].some(
            (child) => child.scrollWidth > child.clientWidth + 1 || child.scrollHeight > child.clientHeight + 1,
          );
        };
        let size = base;
        while (size > minimum && overflows()) {
          size -= 0.5;
          element.style.fontSize = `${size}px`;
        }
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(sheet);
    document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  // The selected content and level intentionally trigger a fresh measurement.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return sheetRef;
}

export function MonsterManual({ digimon, fields, attributes, levels, skills, types, personalitySkills, initialSelectedSlug = "", initialLevel, levelBounds, embedded = false, heldItems = [], heldItemsTemplate, onEdit, onDelete, onDigivolve, onDedigivolve, onManageItems }: {
  digimon: Digimon[]; fields: Field[]; attributes: Attribute[]; levels: LevelChart[];
  skills: AttachmentSkill[]; types: TypeElement[]; personalitySkills: PersonalitySkill[];
  initialSelectedSlug?: string; initialLevel?: number; levelBounds?: [number, number]; embedded?: boolean;
  heldItems?: Array<Item | null>; heldItemsTemplate?: string | null;
  onEdit?: () => void; onDelete?: () => void; onDigivolve?: () => void; onDedigivolve?: () => void; onManageItems?: () => void;
}) {
  const [selectedSlug, setSelectedSlug] = useState(initialSelectedSlug);
  const [expandedSkillSlot, setExpandedSkillSlot] = useState<number | null>(null);
  const [expandedSpecialIndex, setExpandedSpecialIndex] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [attributeFilter, setAttributeFilter] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");
  const [level, setLevel] = useState(initialLevel ?? 1);
  const selected = digimon.find((item) => item.slug === selectedSlug) ?? null;
  const sheetRef = useAutoFitText([selectedSlug, level, expandedSkillSlot, expandedSpecialIndex, heldItems]);
  const stageOptions = useMemo(() => [...new Set(digimon.map((item) => item.stage).filter(Boolean))], [digimon]);
  const attributeOptions = useMemo(() => [...new Set(digimon.map((item) => item.attribute).filter(Boolean))], [digimon]);
  const fieldOptions = useMemo(() => [...new Set(digimon.map((item) => item.field).filter(Boolean))], [digimon]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return digimon.filter((item) => {
      if (search && !`${item.name} ${item.stage} ${item.attribute} ${item.field}`.toLowerCase().includes(search)) return false;
      if (stageFilter && item.stage.toLowerCase() !== stageFilter.toLowerCase()) return false;
      if (attributeFilter && item.attribute.toLowerCase() !== attributeFilter.toLowerCase()) return false;
      if (fieldFilter && item.field.toLowerCase() !== fieldFilter.toLowerCase()) return false;
      return true;
    });
  }, [digimon, query, stageFilter, attributeFilter, fieldFilter]);

  const view = useMemo(() => {
    if (!selected) return null;
    const attribute = attributes.find((item) => item.name.toLowerCase() === selected.attribute.toLowerCase());
    const field = fields.find((item) => item.abbreviation.toLowerCase() === selected.field.toLowerCase());
    const levelRow = levels.find((item) => item.level === level) ?? levels[0];
    const stats: Record<Ability, number> = {
      strength: selected.strength, dexterity: selected.dexterity, constitution: selected.constitution,
      intelligence: selected.intelligence, wisdom: selected.wisdom, charisma: selected.charisma,
    };
    const attributeBonuses = selected.attributeHistory?.length
      ? selected.attributeHistory.map((name) => attributes.find((item) => item.name.toLowerCase() === name.toLowerCase())).filter(Boolean)
      : attribute ? [attribute] : [];
    attributeBonuses.forEach((stageAttribute) => stageAttribute?.statBuffs.forEach((buff) => {
      const key = buff.toLowerCase() as Ability;
      if (key in stats) stats[key] += 2;
    }));
    const stageName = normalizeStage(selected.stage);
    const hitDie = attribute?.hpDice[stageName === "7th stage" ? "mega" : stageName] ?? "1d6";
    const historyDice = attributeBonuses.map((stageAttribute, index) => {
      const historyStage = ["rookie", "champion", "ultimate", "mega"][index] ?? "mega";
      return stageAttribute?.hpDice[historyStage] ?? "1d6";
    });
    const attachmentSkills = selected.attachmentSkills
      .slice(0, Math.max(0, Math.min(4, levelRow?.attachmentSkill ?? 0)))
      .map((ref) => {
        if (!ref) return null;
        const skill = skills.find((entry) => entry.slug.toLowerCase() === ref.skill.toLowerCase()) ?? null;
        if (!skill) {
          if (process.env.NODE_ENV !== "production") console.warn(`Unresolved attachment skill reference: ${ref.raw}`);
          return { ref, skill: null, type: null, stage: ref.startingStage, power: ref.powerOverride, damage: "Unavailable" };
        }
        const resolvedStage = resolveSkillStage(ref, levelRow?.attachmentSkillUpgrade ?? 0);
        const power = ref.powerOverride ?? skill.power;
        const value = skillStageValue(skill, resolvedStage);
        return {
          ref, skill, type: validType(ref.typeToken, types), stage: resolvedStage, power,
          damage: value ?? `DC ${calculateSkillDc(power, levelRow?.proficiency, stats, resolvedStage)}`,
        };
      });
    const [personality = "", skillName = ""] = selected.personalitySkill.split(",").map((part) => part.trim());
    const personalitySkill = personalitySkills.find(
      (item) => item.name.toLowerCase() === skillName.toLowerCase()
        && item.personalities.some((value) => value.toLowerCase() === personality.toLowerCase()),
    );
    return {
      attribute, field, levelRow, stats, hitDie,
      hp: selected.hpByLevel?.[level] ?? (historyDice.length > 1
        ? calculateHistoryHp(historyDice, selected.stage, level, stats.constitution)
        : calculateHp(hitDie, level, stats.constitution)),
      ac: (selected.baseAc ?? 10) + modifier(stats.dexterity),
      movement: calculateMovement(stats.dexterity),
      attachmentSkills, personality, skillName, personalitySkill,
    };
  }, [selected, attributes, fields, levels, level, skills, types, personalitySkills]);

  function selectDigimon(item: Digimon) {
    if (selectedSlug === item.slug) {
      setSelectedSlug("");
      setExpandedSkillSlot(null);
      setExpandedSpecialIndex(null);
      return;
    }
    const [minimum] = stageRange(item.stage);
    setLevel(minimum);
    setExpandedSkillSlot(null);
    setExpandedSpecialIndex(null);
    setSelectedSlug(item.slug);
  }

  if (!digimon.length) return <div className="empty-state"><h2>No Digimon available</h2><p>The field guide has no entries yet.</p></div>;

  const range = levelBounds ?? (selected ? stageRange(selected.stage) : stageRange("rookie"));
  const specialSkills = selected?.specialSkills ?? [];
  const expandedSpecial = expandedSpecialIndex === null ? null : specialSkills[expandedSpecialIndex] ?? null;
  const expandedSpecialType = expandedSpecial ? validType(expandedSpecial.type, types) : null;
  const expandedEntry = view?.attachmentSkills.find((entry) => entry?.ref.slot === expandedSkillSlot && entry.skill);
  const abilityOrder: Ability[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

  const selectedContent = selected && view ? (
    <section className="selected-digimon" id={`digimon-sheet-${selected.slug}`}>
      <div className="manual-controls sheet-level-controls">
        <div className="level-control">
          <div><span>D-Level · {selected.stage}</span><strong>{level}</strong></div>
          <input type="range" min={range[0]} max={range[1]} value={level} onChange={(event) => { setLevel(Number(event.target.value)); setExpandedSkillSlot(null); setExpandedSpecialIndex(null); }} aria-label={`${selected.name} level`} />
          <div className="level-marks"><span>{range[0]}</span><span>{range[1]}</span></div>
        </div>
        <div className="sheet-actions">
          {onDedigivolve && <button type="button" className="dedigivolution-button" onClick={onDedigivolve}>De-Digivolve</button>}
          {onDigivolve && <button type="button" className="digivolution-button" onClick={onDigivolve}>Digivolve</button>}
          {onManageItems && <button type="button" className="held-items-button" onClick={onManageItems}>Held Items</button>}
          {!embedded && <Link className="edit-digimon-link" href={`/character-creation?template=${encodeURIComponent(selected.slug)}`}>Edit Digimon</Link>}
          {onEdit && <button type="button" className="edit-digimon-link" onClick={onEdit}>Edit</button>}
          {onDelete && <button type="button" className="delete-digimon-button" onClick={onDelete}>Delete</button>}
        </div>
      </div>
      <div ref={sheetRef} className={`digimon-sheet-stack${heldItems.some(Boolean) ? " has-held-items" : ""}`}>
      <article className="digimon-sheet" aria-label={`${selected.name} level ${level} stat sheet`}>
        <DigimonPortrait className="sheet-portrait" src={selected.image} name={selected.name} />
        {view.field?.border && <img className="sheet-template" src={view.field.border} alt="" aria-hidden="true" />}
        <h2 className="print-name" data-fit>{selected.name}</h2>
        <div className="print-level"><strong>{level}</strong></div>
        <div className="print-hp"><small>{view.hitDie}</small><strong>{view.hp}</strong></div>
        <div className="print-ac"><span>{view.ac}</span></div>
        <div className="print-prof"><span>{view.levelRow?.proficiency ?? "+2"}</span></div>
        <div className="print-dl"><strong>{view.levelRow?.digislot ?? 1}</strong></div>
        <div className="print-speed"><strong>{view.movement}<small>ft</small></strong></div>
        {view.attribute?.image && <img className="print-attribute" src={view.attribute.image} alt={`${selected.attribute} attribute`} />}
        <div className="print-abilities">{abilityOrder.map((ability) => <div key={ability}><strong>{view.stats[ability]}</strong></div>)}</div>
        {specialSkills.length > 0 && <div className="print-special" data-count={specialSkills.length}>
          {specialSkills.map((special, index) => <button type="button" key={`${special.name}-${index}`} onClick={() => { setExpandedSpecialIndex((current) => current === index ? null : index); setExpandedSkillSlot(null); }} aria-expanded={expandedSpecialIndex === index} aria-controls={`manual-special-details-${selected.slug}`}>
            <strong data-fit>{special.name}</strong>
            <RangeValue value={special.range} />
            <span data-fit>{formatPower(special.power)}</span>
            <span data-fit>{special.damage}</span>
          </button>)}
        </div>}
        <div className="print-attachments">
          {view.attachmentSkills.length ? view.attachmentSkills.map((entry, index) => {
            if (!entry) return <div className="attachment-slot-empty" key={`empty-${index}`} />;
            const { ref, skill, type, stage: skillStage, power, damage } = entry;
            if (!skill) return <div className="attachment-slot-unavailable" key={`invalid-${ref.slot}`} title={ref.raw}><span>Unavailable skill</span><span>—</span><span>—</span><span>—</span></div>;
            return <button type="button" key={`${ref.slot}-${ref.skill}`} onClick={() => { setExpandedSkillSlot((current) => current === ref.slot ? null : ref.slot); setExpandedSpecialIndex(null); }} aria-expanded={expandedSkillSlot === ref.slot} aria-controls={`manual-skill-details-${selected.slug}`}>
              <span data-fit>{type ? `${type.name} ${skill.name}` : skill.name}{skillStage > 1 ? ` · ${skillStage === 2 ? "II" : "III"}` : ""}</span>
              <RangeValue value={skill.range} /><span data-fit>{formatPower(power)}</span><span data-fit>{damage}</span>
            </button>;
          }) : <p>No attachment skills unlocked.</p>}
        </div>
        <div className="print-proficiencies" data-fit><p>{selected.proficiencies.join(" · ") || "—"}</p></div>
        <div className="print-saves" data-fit><p>{selected.savingThrows.length ? selected.savingThrows.slice(0, view.levelRow?.savingThrows ?? 1).map((value) => <span key={value}>{value}</span>) : "—"}</p></div>
        <div className="print-weaknesses" data-fit><p>{selected.weakness.length ? selected.weakness.map((value) => <span key={value}>{value}</span>) : "—"}</p></div>
        <div className="print-personality" data-fit><h3>{view.personality || "Personality"}{view.skillName ? ` · ${view.skillName}` : ""}</h3><p>{view.personalitySkill?.description ?? (view.skillName ? "Description unavailable." : "—")}</p></div>
      </article>
      {heldItems.some(Boolean) && <div className="held-items-strip" data-count={heldItems.filter(Boolean).length} aria-label={`${selected.name} held items`}>
        {heldItemsTemplate && <img className="held-items-template" src={heldItemsTemplate} alt="" aria-hidden="true" />}
        <div className="held-items-content">
          {heldItems.filter((item): item is Item => Boolean(item)).map((item, index) => <div className="held-item-slot" key={`${item.id}-${index}`}>
            <span className="held-item-image">{item.image && <img src={item.image} alt="" />}</span>
            <strong data-fit>{item.name}</strong>
            <span data-fit>{item.description}</span>
          </div>)}
        </div>
      </div>}
      </div>
      {expandedSpecial && <section className="manual-skill-details special-skill-details" id={`manual-special-details-${selected.slug}`} aria-live="polite">
        <div className="manual-skill-title special-skill-title"><div><span className="eyebrow">Special Skill</span><h3>{expandedSpecial.name}</h3></div>{expandedSpecialType && <div className="special-type-summary"><strong>{expandedSpecialType.name} Type</strong><span>{expandedSpecialType.effect}</span></div>}<button type="button" onClick={() => setExpandedSpecialIndex(null)} aria-label="Close special skill details">×</button></div>
        <dl className="manual-skill-stats special-skill-stats">
          <div><dt>Power</dt><dd>{formatPower(expandedSpecial.power)}</dd></div>
          <div><dt>Time</dt><dd>{expandedSpecial.time}</dd></div>
          <div><dt>Damage</dt><dd>{expandedSpecial.damage}</dd></div>
          <div><dt>Range</dt><dd>{expandedSpecial.range}</dd></div>
          <div><dt>Target</dt><dd>{expandedSpecial.target}</dd></div>
          <div><dt>Hit Type</dt><dd>{expandedSpecial.hitType}</dd></div>
          <div><dt>Critical</dt><dd>{expandedSpecial.critical}</dd></div>
          <div><dt>Digislot</dt><dd>{expandedSpecial.digislotCost === "—" ? "—" : `${expandedSpecial.digislotCost} ${expandedSpecial.digislotCost === "1" ? "slot" : "slots"}`}</dd></div>
        </dl>
        {expandedSpecial.effects?.length ? <div className="special-skill-effects"><strong>Effects</strong><ul>{expandedSpecial.effects.map((effect) => <li key={effect}>{effect}</li>)}</ul></div> : null}
        {expandedSpecial.description && <p>{expandedSpecial.description}</p>}
      </section>}
      {expandedEntry?.skill && <section className="manual-skill-details" id={`manual-skill-details-${selected.slug}`} aria-live="polite">
        <div className="manual-skill-title"><div><span className="eyebrow">Attachment Skill</span><h3>{expandedEntry.type ? `${expandedEntry.type.name} ${expandedEntry.skill.name}` : expandedEntry.skill.name}</h3></div><button type="button" onClick={() => setExpandedSkillSlot(null)} aria-label="Close skill details">×</button></div>
        <dl className="manual-skill-stats">
          <div><dt>Stage</dt><dd>{expandedEntry.stage === 1 ? "I" : expandedEntry.stage === 2 ? "II" : "III"}</dd></div>
          <div><dt>Power</dt><dd>{formatPower(expandedEntry.power)}</dd></div>
          <div><dt>Time</dt><dd>{expandedEntry.skill.time}</dd></div>
          <div><dt>Damage / DC</dt><dd>{expandedEntry.damage}</dd></div>
          <div><dt>Range</dt><dd>{expandedEntry.skill.range}</dd></div>
          <div><dt>Duration</dt><dd>{expandedEntry.skill.duration}</dd></div>
        </dl>
        <p>{expandedEntry.skill.description}</p>
        {expandedEntry.type && <div className="manual-type-effect"><strong>{expandedEntry.type.name} Type</strong><p>{expandedEntry.type.effect}</p></div>}
      </section>}
    </section>
  ) : null;

  if (embedded) return selectedContent ?? <div className="empty-state"><p>Complete the form to preview the sheet.</p></div>;

  return <section className="manual-directory" aria-label="Digimon directory">
    <div className="manual-search-row">
      <div className="directory-search-and-filters">
        <label className="search-field">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <span className="sr-only">Search Digimon</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Digimon by name…" />
          {query && <button type="button" onClick={() => setQuery("")}>Clear</button>}
        </label>
        <div className="filter-row" aria-label="Filter Digimon">
          <label><span>Stage</span><select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All stages</option>{stageOptions.map((stage) => <option value={stage} key={stage}>{stage}</option>)}</select></label>
          <label><span>Attribute</span><select value={attributeFilter} onChange={(event) => setAttributeFilter(event.target.value)}><option value="">All attributes</option>{attributeOptions.map((attribute) => <option value={attribute} key={attribute}>{attribute}</option>)}</select></label>
          <label><span>Field</span><select value={fieldFilter} onChange={(event) => setFieldFilter(event.target.value)}><option value="">All fields</option>{fieldOptions.map((field) => <option value={field} key={field}>{fields.find((item) => item.abbreviation.toLowerCase() === field.toLowerCase())?.name ?? field}</option>)}</select></label>
        </div>
      </div>
      <p aria-live="polite"><strong>{filtered.length}</strong> / {digimon.length} Digimon</p>
    </div>
    {filtered.length ? <div className="digimon-directory-grid">{filtered.map((item) => {
      const field = fields.find((entry) => entry.abbreviation.toLowerCase() === item.field.toLowerCase());
      const isSelected = selectedSlug === item.slug;
      return <div className={`digimon-accordion-item${isSelected ? " selected" : ""}`} key={item.id}>
        <button type="button" className={`digimon-directory-card${isSelected ? " selected" : ""}`} onClick={() => selectDigimon(item)} aria-expanded={isSelected} aria-controls={`digimon-sheet-${item.slug}`}>
          <span className="directory-portrait"><DigimonPortrait src={item.image} name="" /></span>
          <span className="directory-copy"><strong>{item.name}</strong><small>{item.stage} · {item.attribute}</small></span>
          {field?.symbol && <img className="directory-field" src={field.symbol} alt={`${field.name} field`} />}
        </button>
        {isSelected && selectedContent}
      </div>;
    })}</div> : <div className="empty-state"><h2>No matching Digimon</h2><p>Try a different name or filter.</p><button type="button" onClick={() => { setQuery(""); setStageFilter(""); setAttributeFilter(""); setFieldFilter(""); }}>Clear filters</button></div>}
  </section>;
}
