"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MonsterManual } from "./MonsterManual";
import type {
  AttachmentSkill, Attribute, Digimon, DigimonStage, Field, LevelChart, PersonalitySkill,
  SpecialSkill, SpecialSkillOption, TypeElement,
} from "../lib/supabase";
import { modifier } from "../lib/digimon-rules";

type Session = { accessToken: string; refreshToken: string; expiresAt: number; userId: string };
type SavedSkillRow = {
  skill_kind?: string; slot_number?: number; attachment_skill_id?: string | null; element_id?: string | null;
  attachment_stage?: number | null; personality_skill_id?: string | null; special_skill_choices?: Record<string, unknown> | null;
};
type SavedDigimonRow = Record<string, unknown> & { player_digimon_skills?: SavedSkillRow[] };
type FormState = {
  name: string; speciesName: string; stageId: number; level: number; attributeId: string; fieldId: number;
  strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number;
  proficiencies: string[]; savingThrows: string[]; weaknesses: string[]; personality: string; personalitySkillId: string; image: string;
  attachments: Array<{ skillId: string; elementId: string; powerOverride: string; stage: 1 | 2 | 3 }>;
  specialName: string; specialDescription: string; specialTypeId: string; specialExtraTypeIds: string[];
  specialStage: 1 | 2 | 3; specialChoices: Record<string, string>; repeatCounts: Record<string, number>;
};

const SESSION_KEY = "d5e-anonymous-session";
const abilities = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const categoryLabels: Record<string, string> = {
  skill_power: "Power", duration: "Action Time", hit_type: "Hit Type", range: "Range",
  dice_size: "Damage", digislot_cost: "Digislot Cost", critical_hit: "Critical Hit",
  target: "Target", type: "Typing", effect: "Effect",
};
const PROFICIENCIES = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight",
  "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion",
  "Religion", "Sleight of Hand", "Stealth", "Survival",
];
const SAVING_THROWS = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const SPECIAL_CATEGORY_ORDER = [
  "digislot_cost", "skill_power", "hit_type", "target",
  "duration", "range", "critical_hit", "type", "dice_size", "effect",
] as const;

function capitalize(value: string) {
  const clean = value.trimStart();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : "";
}

function attachmentDamageMode(skill?: AttachmentSkill) {
  const damage = skill?.damage?.trim() ?? "";
  if (damage === "-") return "none";
  if (/^\d+$/.test(damage)) return "power";
  return "type";
}

function savedStageMinimum(stageName: string, stages: DigimonStage[]) {
  return stages.find((item) => item.name.toLowerCase() === stageName.toLowerCase())?.minimumLevel ?? 1;
}

function initialForm(stages: DigimonStage[], attributes: Attribute[], fields: Field[]): FormState {
  const stage = stages[0];
  return {
    name: "", speciesName: "", stageId: stage?.id ?? 1, level: stage?.minimumLevel ?? 1,
    attributeId: attributes[0]?.id ?? "", fieldId: fields[0]?.id ?? 0,
    strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8,
    proficiencies: [], savingThrows: [""], weaknesses: ["", ""], personality: "", personalitySkillId: "", image: "",
    attachments: Array.from({ length: 4 }, () => ({ skillId: "", elementId: "", powerOverride: "", stage: 1 as const })),
    specialName: "", specialDescription: "", specialTypeId: "", specialExtraTypeIds: [], specialStage: 1, specialChoices: {}, repeatCounts: {},
  };
}

async function getSession(): Promise<Session> {
  const stored = localStorage.getItem(SESSION_KEY);
  const current = stored ? JSON.parse(stored) as Session : null;
  const refreshToken = current && current.expiresAt > Math.floor(Date.now() / 1000) + 60 ? undefined : current?.refreshToken;
  if (current && !refreshToken) return current;
  const response = await fetch("/api/anonymous-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not start an anonymous session.");
  localStorage.setItem(SESSION_KEY, JSON.stringify(result));
  return result;
}

export function CharacterCreation(props: {
  digimon: Digimon[]; fields: Field[]; attributes: Attribute[]; levels: LevelChart[];
  skills: AttachmentSkill[]; types: TypeElement[]; personalitySkills: PersonalitySkill[];
  stages: DigimonStage[]; specialSkillOptions: SpecialSkillOption[];
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"characters" | "digimon">("digimon");
  const [mode, setMode] = useState<"list" | "details" | "special">("list");
  const [form, setForm] = useState<FormState>(() => initialForm(props.stages, props.attributes, props.fields));
  const [saved, setSaved] = useState<SavedDigimonRow[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const stage = props.stages.find((item) => item.id === form.stageId) ?? props.stages[0];
  const levelRow = props.levels.find((item) => item.level === form.level) ?? props.levels[0];
  const attribute = props.attributes.find((item) => item.id === form.attributeId);
  const field = props.fields.find((item) => item.id === form.fieldId);
  const personality = props.personalitySkills.find((item) => item.id === form.personalitySkillId);
  const personalities = useMemo(
    () => [...new Set(props.personalitySkills.flatMap((item) => item.personalities))].sort(),
    [props.personalitySkills],
  );
  const availablePersonalitySkills = props.personalitySkills.filter(
    (item) => !form.personality || item.personalities.some((value) => value.toLowerCase() === form.personality.toLowerCase()),
  );
  const groupedOptions = useMemo(() => Object.groupBy(props.specialSkillOptions, (option) => option.category), [props.specialSkillOptions]);

  useEffect(() => {
    const templateSlug = searchParams.get("template");
    const template = props.digimon.find((item) => item.slug === templateSlug);
    if (!template) return;
    const templateStage = props.stages.find((item) => item.name.toLowerCase() === template.stage.toLowerCase());
    const templateAttribute = props.attributes.find((item) => item.name.toLowerCase() === template.attribute.toLowerCase());
    const templateField = props.fields.find((item) => item.abbreviation.toLowerCase() === template.field.toLowerCase());
    const templatePersonality = props.personalitySkills.find((item) => {
      const [personalityName, skillName] = template.personalitySkill.split(",").map((part) => part.trim().toLowerCase());
      return item.name.toLowerCase() === skillName && item.personalities.some((value) => value.toLowerCase() === personalityName);
    });
    setForm((current) => ({
      ...current, name: template.name, speciesName: template.name, image: template.image ?? "",
      stageId: templateStage?.id ?? current.stageId, level: templateStage?.minimumLevel ?? current.level,
      attributeId: templateAttribute?.id ?? current.attributeId, fieldId: templateField?.id ?? current.fieldId,
      strength: template.strength, dexterity: template.dexterity, constitution: template.constitution,
      intelligence: template.intelligence, wisdom: template.wisdom, charisma: template.charisma,
      proficiencies: template.proficiencies, savingThrows: template.savingThrows,
      weaknesses: [...template.weakness, "", ""].slice(0, 2), personality: templatePersonality?.personalities[0] ?? "",
      personalitySkillId: templatePersonality?.id ?? "",
      attachments: template.attachmentSkills.map((ref) => {
        const skill = props.skills.find((item) => item.slug.toLowerCase() === ref?.skill.toLowerCase());
        const element = props.types.find((item) => item.name.toLowerCase() === ref?.typeToken?.toLowerCase());
        return { skillId: skill?.id ?? "", elementId: element?.id ?? "", powerOverride: ref?.powerOverride ?? "", stage: ref?.startingStage ?? 1 };
      }),
      specialName: template.specialSkills[0]?.name ?? "", specialDescription: template.specialSkills[0]?.description ?? "",
      specialTypeId: props.types.find((item) => item.name.toLowerCase() === template.specialSkills[0]?.type.toLowerCase())?.id ?? "",
      specialStage: 1,
    }));
    setMode("details");
  }, [searchParams, props.digimon, props.stages, props.attributes, props.fields, props.personalitySkills, props.skills, props.types]);

  async function loadSavedDigimon() {
    const session = await getSession();
    const response = await fetch("/api/player-digimon", { headers: { Authorization: `Bearer ${session.accessToken}` } });
    if (!response.ok) throw new Error("Could not load saved Digimon.");
    setSaved(await response.json());
  }

  useEffect(() => {
    loadSavedDigimon().catch((error) => setStatus(error.message));
  // Loading once per browser session is intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedOptions = useMemo(() => Object.entries(form.specialChoices)
    .map(([, key]) => props.specialSkillOptions.find((option) => option.key === key))
    .filter((option): option is SpecialSkillOption => Boolean(option)), [form.specialChoices, props.specialSkillOptions]);
  const repeatedOptions = props.specialSkillOptions.filter((option) => (form.repeatCounts[option.key] ?? 0) > 0);
  const damageOption = selectedOptions.find((option) => option.category === "dice_size");
  const damageKey = damageOption?.key.trim().toLowerCase() ?? "";
  const damageName = damageOption?.name.trim() ?? "";
  const specialHasNoDamage = damageKey === "0_dmg" || damageName === "-";
  const specialUsesDc = damageKey.includes("dc") || damageName.toLowerCase() === "dc";
  const specialUsesPowerDamage = /^\d+$/.test(damageName);
  const specialAllowsType = Boolean(damageOption) && !specialHasNoDamage && !specialUsesDc && !specialUsesPowerDamage;
  const orderedSpecialGroups = SPECIAL_CATEGORY_ORDER
    .filter((category) => groupedOptions[category]?.length && (category !== "type" || specialAllowsType))
    .map((category) => [category, groupedOptions[category]!] as const);
  const spent = selectedOptions.reduce((sum, option) => sum + option.pointCost, 0)
    + repeatedOptions.reduce((sum, option) => sum + option.pointCost * (form.repeatCounts[option.key] ?? 0), 0);
  const effectiveWisdom = form.wisdom + (attribute?.statBuffs.some((buff) => buff.toLowerCase() === "wisdom") ? 2 : 0);
  const wisdomModifier = modifier(effectiveWisdom);
  const budget = (stage?.specialSkillPoints ?? 0) + wisdomModifier;
  const remaining = budget - spent;
  const allocatedAbilityPoints = abilities.reduce((sum, ability) => sum + Math.max(0, form[ability] - 8), 0);
  const stageIndex = Math.max(0, props.stages.findIndex((item) => item.id === form.stageId));
  const stageAbilityPoints = props.stages.slice(0, stageIndex + 1).reduce((sum, item) => sum + item.asiIncrease, 0);
  const levelAbilityPoints = props.levels.filter((item) => item.level <= form.level).reduce((sum, item) => sum + item.asiIncrease, 0);
  const freeAttributeBonus = attribute?.name.toLowerCase() === "free" ? 3 : 0;
  const totalAbilityPoints = stageAbilityPoints + levelAbilityPoints + freeAttributeBonus;
  const abilityPointsRemaining = totalAbilityPoints - allocatedAbilityPoints;
  const attachmentSlots = Math.max(0, Math.min(4, levelRow?.attachmentSkill ?? 0));
  const savingThrowSlots = Math.max(0, Math.min(2, levelRow?.savingThrows ?? 0));
  const extraTypingCount = Math.max(0, form.repeatCounts.multitype ?? 0);
  const attachmentUpgradeBudget = Math.max(stageIndex, levelRow?.attachmentSkillUpgrade ?? 0);
  const attachmentUpgradesUsed = form.attachments.slice(0, attachmentSlots).reduce((sum, item) => {
    const skill = props.skills.find((candidate) => candidate.id === item.skillId);
    return sum + (attachmentDamageMode(skill) === "none" ? 0 : Math.max(0, item.stage - 1));
  }, 0);
  const attachmentUpgradesRemaining = attachmentUpgradeBudget - attachmentUpgradesUsed;

  const savedDigimon = useMemo(() => saved.map((row): { row: SavedDigimonRow; digimon: Digimon; level: number } => {
    const savedStage = props.stages.find((item) => item.id === Number(row.stage_id));
    const savedAttribute = props.attributes.find((item) => item.id === String(row.attribute_id ?? ""));
    const savedField = props.fields.find((item) => item.id === Number(row.field_id));
    const skillRows = Array.isArray(row.player_digimon_skills) ? row.player_digimon_skills : [];
    const attachmentSkills: Digimon["attachmentSkills"] = Array.from({ length: 4 }, () => null);
    skillRows.filter((item) => item.skill_kind === "attachment").forEach((item) => {
      const slot = Math.max(1, Math.min(4, Number(item.slot_number ?? 1)));
      const skill = props.skills.find((entry) => entry.id === item.attachment_skill_id);
      if (!skill) return;
      const element = props.types.find((entry) => entry.id === item.element_id);
      const powerOverride = typeof item.special_skill_choices?.powerOverride === "string"
        ? item.special_skill_choices.powerOverride.toUpperCase() : null;
      const skillStage = Math.max(1, Math.min(3, Number(item.attachment_stage ?? 1))) as 1 | 2 | 3;
      attachmentSkills[slot - 1] = {
        raw: `${powerOverride ?? element?.name ?? "-"}.${skill.slug}.${skillStage === 1 ? "i" : skillStage === 2 ? "ii" : "iii"}`,
        slot, skill: skill.slug, typeToken: element?.name ?? null, powerOverride,
        startingStage: skillStage, upgradeOrders: [], valid: true,
      };
    });
    const rawSpecial = row.special_skill && typeof row.special_skill === "object" && !Array.isArray(row.special_skill)
      ? row.special_skill as SpecialSkill : null;
    return {
      row,
      level: Number(row.level ?? savedStage?.minimumLevel ?? 1),
      digimon: {
        id: -1, name: String(row.name ?? "Created Digimon"), slug: `saved-${String(row.id)}`,
        stage: savedStage?.name ?? "Rookie", attribute: savedAttribute?.name ?? "",
        field: savedField?.abbreviation ?? "", image: row.image_path ? String(row.image_path) : null,
        strength: Number(row.strength ?? 8), dexterity: Number(row.dexterity ?? 8),
        constitution: Number(row.constitution ?? 8), intelligence: Number(row.intelligence ?? 8),
        wisdom: Number(row.wisdom ?? 8), charisma: Number(row.charisma ?? 8),
        proficiencies: String(row.proficiencies ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        savingThrows: String(row.saving_throws ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        weakness: String(row.weaknesses ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        personalitySkill: String(row.personality_skill ?? ""), attachmentSkills,
        specialSkills: rawSpecial ? [rawSpecial] : [],
      },
    };
  }), [saved, props.stages, props.attributes, props.fields, props.skills, props.types]);

  function chooseStage(id: number) {
    const next = props.stages.find((item) => item.id === id);
    setForm((current) => ({
      ...current, stageId: id, level: next?.minimumLevel ?? 1,
      strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8,
    }));
  }

  function updateAttachment(index: number, patch: Partial<FormState["attachments"][number]>) {
    setForm((current) => ({ ...current, attachments: current.attachments.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }

  function chooseAttachmentSkill(index: number, skillId: string) {
    const skill = props.skills.find((item) => item.id === skillId);
    const mode = attachmentDamageMode(skill);
    updateAttachment(index, {
      skillId,
      elementId: "",
      powerOverride: "",
      stage: mode === "none" ? 1 : form.attachments[index]?.stage ?? 1,
    });
  }

  function canSetAttachmentStage(index: number, nextStage: 1 | 2 | 3) {
    const currentStage = form.attachments[index]?.stage ?? 1;
    return attachmentUpgradesUsed - (currentStage - 1) + (nextStage - 1) <= attachmentUpgradeBudget;
  }

  function editSavedDigimon(row: SavedDigimonRow) {
    const savedStage = props.stages.find((item) => item.id === Number(row.stage_id));
    const skillRows = Array.isArray(row.player_digimon_skills) ? row.player_digimon_skills : [];
    const attachments = Array.from({ length: 4 }, () => ({ skillId: "", elementId: "", powerOverride: "", stage: 1 as 1 | 2 | 3 }));
    skillRows.filter((item) => item.skill_kind === "attachment").forEach((item) => {
      const index = Math.max(0, Math.min(3, Number(item.slot_number ?? 1) - 1));
      attachments[index] = {
        skillId: item.attachment_skill_id ?? "",
        elementId: item.element_id ?? "",
        powerOverride: typeof item.special_skill_choices?.powerOverride === "string" ? item.special_skill_choices.powerOverride.toUpperCase() : "",
        stage: Math.max(1, Math.min(3, Number(item.attachment_stage ?? 1))) as 1 | 2 | 3,
      };
    });
    const specialRow = skillRows.find((item) => item.skill_kind === "special") as (SavedSkillRow & { special_skill_choices?: Record<string, unknown> }) | undefined;
    const choices = specialRow?.special_skill_choices ?? {};
    const resolved = row.special_skill && typeof row.special_skill === "object" && !Array.isArray(row.special_skill)
      ? row.special_skill as Record<string, unknown> : {};
    const typeIds = Array.isArray(choices.typeIds) ? choices.typeIds.map(String) : [];
    const [personalityName = ""] = String(row.personality_skill ?? "").split(",").map((item) => item.trim());
    setForm({
      name: String(row.name ?? ""), speciesName: String(row.species_name ?? row.name ?? ""),
      stageId: savedStage?.id ?? props.stages[0]?.id ?? 1, level: Number(row.level ?? savedStage?.minimumLevel ?? 1),
      attributeId: String(row.attribute_id ?? props.attributes[0]?.id ?? ""), fieldId: Number(row.field_id ?? props.fields[0]?.id ?? 0),
      strength: Number(row.strength ?? 8), dexterity: Number(row.dexterity ?? 8), constitution: Number(row.constitution ?? 8),
      intelligence: Number(row.intelligence ?? 8), wisdom: Number(row.wisdom ?? 8), charisma: Number(row.charisma ?? 8),
      proficiencies: String(row.proficiencies ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      savingThrows: String(row.saving_throws ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      weaknesses: [...String(row.weaknesses ?? "").split(",").map((item) => item.trim()).filter(Boolean), "", ""].slice(0, 2),
      personality: personalityName,
      personalitySkillId: skillRows.find((item) => item.skill_kind === "personality")?.personality_skill_id ?? "",
      image: row.image_path ? String(row.image_path) : "", attachments,
      specialName: String(resolved.name ?? ""), specialDescription: String(resolved.description ?? ""),
      specialTypeId: typeIds[0] ?? "", specialExtraTypeIds: typeIds.slice(1),
      specialStage: Math.max(1, Math.min(3, Number(choices.stage ?? 1))) as 1 | 2 | 3,
      specialChoices: choices.options && typeof choices.options === "object" ? choices.options as Record<string, string> : {},
      repeatCounts: choices.repeats && typeof choices.repeats === "object" ? choices.repeats as Record<string, number> : {},
    });
    setEditingId(String(row.id));
    setSelectedSavedId("");
    setMode("details");
    setStatus("");
  }

  async function deleteSavedDigimon(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      const session = await getSession();
      const response = await fetch(`/api/player-digimon?id=${encodeURIComponent(id)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not delete the Digimon.");
      setSelectedSavedId("");
      await loadSavedDigimon();
      setStatus(`${name} was deleted.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete the Digimon.");
    }
  }

  function buildSpecialSkill(): SpecialSkill | null {
    if (!form.specialName.trim()) return null;
    const choice = (category: string) => selectedOptions.find((option) => option.category === category)?.name ?? "—";
    const addDice = form.repeatCounts.add_dice ?? 0;
    const range30 = form.repeatCounts.add_30ft ?? 0;
    const radius10 = form.repeatCounts.add_10rd ?? 0;
    const targets = 1 + (form.repeatCounts.multitarget ?? 0);
    const typeNames = specialAllowsType ? [form.specialTypeId, ...form.specialExtraTypeIds.slice(0, extraTypingCount)]
      .map((id) => props.types.find((item) => item.id === id)?.name)
      .filter((name): name is string => Boolean(name)) : [];
    const type = typeNames.join(" / ") || "—";
    return {
      name: form.specialName.trim(), description: form.specialDescription.trim(), type,
      power: choice("skill_power"), time: choice("duration"), duration: "Instant",
      hitType: choice("hit_type"), range: range30 ? `${range30 * 30}ft${radius10 ? ` (${radius10 * 10}ft radius)` : ""}` : choice("range"),
      target: targets > 1 ? `${targets} Targets` : choice("target"), critical: choice("critical_hit"),
      damage: specialUsesDc
        ? `DC ${8 + (Number.parseInt(String(levelRow?.proficiency ?? "2").replace("+", ""), 10) || 2) + modifier(form[{ STR: "strength", DEX: "dexterity", CON: "constitution", INT: "intelligence", WIS: "wisdom", CHA: "charisma" }[choice("skill_power").toUpperCase()] as typeof abilities[number]] ?? 8) + (form.specialStage - 1) * 5}`
        : specialHasNoDamage ? "—" : `${damageName || "—"}${addDice && /\dd\d+/i.test(damageName) ? ` + ${addDice}d6` : ""}`,
      digislotCost: choice("digislot_cost"),
    };
  }

  const specialSkill = buildSpecialSkill();
  async function saveDigimon() {
    if (!form.name.trim() || !stage || !attribute || !field) {
      setStatus("Name, stage, attribute, and field are required."); return;
    }
    if (remaining < 0) { setStatus("The Special Skill exceeds its point budget."); setMode("special"); return; }
    if (abilityPointsRemaining !== 0) { setStatus(`Allocate all ability points before saving (${abilityPointsRemaining} remaining).`); setMode("details"); return; }
    if (attachmentUpgradesRemaining < 0) { setStatus("The attachment skills use more stage upgrades than this Digimon has earned."); setMode("details"); return; }
    if (form.savingThrows.slice(0, savingThrowSlots).some((value) => !value)) { setStatus("Choose every available saving throw."); setMode("details"); return; }
    if (specialAllowsType && extraTypingCount > 0 && form.specialExtraTypeIds.slice(0, extraTypingCount).some((value) => !value)) {
      setStatus("Choose every extra Special Skill typing."); setMode("special"); return;
    }
    setSaving(true); setStatus("");
    try {
      const session = await getSession();
      const skillRows: Record<string, unknown>[] = form.attachments.slice(0, attachmentSlots).flatMap((entry, index) => {
        if (!entry.skillId) return [];
        const selectedSkill = props.skills.find((item) => item.id === entry.skillId);
        const damageMode = attachmentDamageMode(selectedSkill);
        return [{
          skill_kind: "attachment", slot_number: index + 1, learned_at_level: form.level,
          attachment_skill_id: entry.skillId, element_id: damageMode === "type" ? entry.elementId || null : null,
          attachment_stage: damageMode === "none" ? 1 : entry.stage,
          personality_skill_id: null, special_skill_name: null,
          special_skill_choices: damageMode === "power" ? { powerOverride: entry.powerOverride || "STR" } : null,
        }];
      });
      if (form.personalitySkillId) skillRows.push({
        skill_kind: "personality", slot_number: 1, learned_at_level: form.level,
        attachment_skill_id: null, element_id: null, attachment_stage: null, personality_skill_id: form.personalitySkillId,
        special_skill_name: null, special_skill_choices: null,
      });
      if (specialSkill) skillRows.push({
        skill_kind: "special", slot_number: 1, learned_at_level: form.level,
        attachment_skill_id: null, element_id: null, attachment_stage: null,
        personality_skill_id: null,
        special_skill_name: specialSkill.name,
        special_skill_choices: {
          options: form.specialChoices, repeats: form.repeatCounts,
          typeIds: specialAllowsType ? [form.specialTypeId, ...form.specialExtraTypeIds.slice(0, extraTypingCount)].filter(Boolean) : [],
          stage: form.specialStage,
          resolved: specialSkill, pointsSpent: spent, pointBudget: budget,
        },
      });
      const response = await fetch("/api/player-digimon", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({
          id: editingId || undefined,
          digimon: {
            user_id: session.userId, template_id: null, name: form.name.trim(),
            species_name: form.speciesName.trim() || form.name.trim(), level: form.level, stage_id: stage.id,
            attribute_id: attribute.id, field_id: field.id, strength: form.strength, dexterity: form.dexterity,
            constitution: form.constitution, intelligence: form.intelligence, wisdom: form.wisdom, charisma: form.charisma,
            proficiencies: form.proficiencies.join(", "),
            saving_throws: form.savingThrows.slice(0, savingThrowSlots).filter(Boolean).join(", "),
            weaknesses: form.weaknesses.filter(Boolean).join(", "),
            personality_skill: personality ? `${form.personality},${personality.name}` : null,
            image_path: form.image || null, special_skill: specialSkill,
          },
          skills: skillRows,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save the Digimon.");
      await loadSavedDigimon(); setSelectedSavedId(String(result.id)); setMode("list"); setStatus(`${form.name} was ${editingId ? "updated" : "saved"}.`);
      setEditingId("");
      setForm(initialForm(props.stages, props.attributes, props.fields));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the Digimon.");
    } finally { setSaving(false); }
  }

  return <section className="creation-shell">
    <div className="creation-tabs" role="tablist" aria-label="Character creation categories">
      <button role="tab" aria-selected={tab === "characters"} onClick={() => setTab("characters")}>Characters</button>
      <button role="tab" aria-selected={tab === "digimon"} onClick={() => setTab("digimon")}>Digimon</button>
    </div>
    {tab === "characters" ? <div className="empty-state"><h2>Characters</h2><p>Character creation is coming later.</p></div> : <>
      {status && <p className="creation-status" role="status">{status}</p>}
      {mode === "list" && <div className="creation-list">
        <div className="creation-list-heading"><div><span className="eyebrow">Your partners</span><h2>Saved Digimon</h2></div><button className="primary-button" onClick={() => { setEditingId(""); setForm(initialForm(props.stages, props.attributes, props.fields)); setMode("details"); }}>Create Digimon</button></div>
        {savedDigimon.length ? <div className="saved-digimon-list">{savedDigimon.map(({ row, digimon: savedEntry, level: savedLevel }) => {
          const rowId = String(row.id);
          const open = selectedSavedId === rowId;
          return <article className={`saved-digimon-item${open ? " open" : ""}`} key={rowId}>
            <button type="button" className="saved-digimon-card" onClick={() => setSelectedSavedId(open ? "" : rowId)} aria-expanded={open}>
              <span><strong>{savedEntry.name}</strong><small>{savedEntry.stage} · Level {savedLevel}</small></span><span aria-hidden="true">{open ? "−" : "+"}</span>
            </button>
            {open && <MonsterManual {...props} digimon={[savedEntry]} initialSelectedSlug={savedEntry.slug} initialLevel={savedLevel} levelBounds={[savedStageMinimum(savedEntry.stage, props.stages), 20]} embedded onEdit={() => editSavedDigimon(row)} onDelete={() => deleteSavedDigimon(rowId, savedEntry.name)} />}
          </article>;
        })}</div>
          : <div className="empty-state"><h3>No saved Digimon yet</h3><p>Create your first partner to see it here.</p></div>}
      </div>}
      {mode !== "list" && <div className="creator-workspace">
        <nav className="creator-steps" aria-label="Digimon creation steps">
          <button aria-current={mode === "details" ? "step" : undefined} onClick={() => setMode("details")}>1. Digimon</button>
          <button aria-current={mode === "special" ? "step" : undefined} onClick={() => setMode("special")}>2. Special Skill</button>
        </nav>
        {mode === "details" && <div className="creator-panel">
          <div className="form-grid">
            <label>Stage<select value={form.stageId} onChange={(event) => chooseStage(Number(event.target.value))}>{props.stages.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>D-Level<select value={form.level} onChange={(event) => setForm({ ...form, level: Number(event.target.value) })}>{Array.from({ length: 20 - (stage?.minimumLevel ?? 1) + 1 }, (_, index) => (stage?.minimumLevel ?? 1) + index).map((value) => <option value={value} key={value}>Level {value}</option>)}</select></label>
            <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: capitalize(event.target.value) })} /></label>
            <label>Species Name<input value={form.speciesName} onChange={(event) => setForm({ ...form, speciesName: capitalize(event.target.value) })} /></label>
            <label>Attribute<select value={form.attributeId} onChange={(event) => setForm({ ...form, attributeId: event.target.value })}>{props.attributes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>Field<select value={form.fieldId} onChange={(event) => setForm({ ...form, fieldId: Number(event.target.value) })}>{props.fields.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label className="wide">Image URL<input type="url" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} placeholder="Optional" /></label>
          </div>
          <fieldset><legend>Ability Scores · {abilityPointsRemaining} points remaining</legend><div className="stat-inputs">{abilities.map((ability) => <label key={ability}>{ability.slice(0, 3).toUpperCase()}<input type="number" min="8" max={8 + totalAbilityPoints} value={form[ability]} onChange={(event) => setForm({ ...form, [ability]: Math.max(8, Number(event.target.value)) })} /></label>)}</div></fieldset>
          <fieldset><legend>Proficiencies</legend><div className="proficiency-grid">{PROFICIENCIES.map((proficiency) => <label className="check-choice" key={proficiency}><input type="checkbox" checked={form.proficiencies.includes(proficiency)} onChange={(event) => setForm((current) => ({ ...current, proficiencies: event.target.checked ? [...current.proficiencies, proficiency] : current.proficiencies.filter((item) => item !== proficiency) }))} />{proficiency}</label>)}</div></fieldset>
          <div className="form-grid">
            <fieldset><legend>Saving Throws · {savingThrowSlots}</legend>{Array.from({ length: savingThrowSlots }, (_, index) => <label key={index}>Save {index + 1}<select value={form.savingThrows[index] ?? ""} onChange={(event) => setForm((current) => ({ ...current, savingThrows: Array.from({ length: savingThrowSlots }, (_, itemIndex) => itemIndex === index ? event.target.value : current.savingThrows[itemIndex] ?? "") }))}><option value="">Choose save</option>{SAVING_THROWS.map((save) => <option value={save} key={save}>{save}</option>)}</select></label>)}</fieldset>
            <fieldset><legend>Weaknesses</legend>{[0, 1].map((index) => <label key={index}>Weakness {index + 1}<select value={form.weaknesses[index] ?? ""} onChange={(event) => setForm((current) => ({ ...current, weaknesses: current.weaknesses.map((value, itemIndex) => itemIndex === index ? capitalize(event.target.value) : value) }))}><option value="">None</option>{props.types.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select></label>)}</fieldset>
            <label>Personality<select value={form.personality} onChange={(event) => setForm({ ...form, personality: event.target.value, personalitySkillId: "" })}><option value="">Choose personality</option>{personalities.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
            <label>Personality Skill<select value={form.personalitySkillId} disabled={!form.personality} onChange={(event) => setForm({ ...form, personalitySkillId: event.target.value })}><option value="">Choose skill</option>{availablePersonalitySkills.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          </div>
          <fieldset><legend>Attachment Skills · {attachmentSlots} slots · {attachmentUpgradesRemaining}/{attachmentUpgradeBudget} upgrades left</legend><div className="attachment-form-list">{form.attachments.slice(0, attachmentSlots).map((entry, index) => {
            const selectedSkill = props.skills.find((item) => item.id === entry.skillId);
            const damageMode = attachmentDamageMode(selectedSkill);
            return <div key={index}>
              <strong>Slot {index + 1}</strong>
              <select aria-label={`Attachment skill ${index + 1}`} value={entry.skillId} onChange={(event) => chooseAttachmentSkill(index, event.target.value)}><option value="">Empty</option>{props.skills.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
              {entry.skillId && damageMode === "type" && <select aria-label={`Attachment skill ${index + 1} type`} value={entry.elementId} onChange={(event) => updateAttachment(index, { elementId: event.target.value })}><option value="">Untyped</option>{props.types.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>}
              {entry.skillId && damageMode === "power" && <select aria-label={`Attachment skill ${index + 1} power`} value={entry.powerOverride || "STR"} onChange={(event) => updateAttachment(index, { powerOverride: event.target.value })}>{["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((ability) => <option value={ability} key={ability}>{ability}</option>)}</select>}
              {entry.skillId && damageMode !== "none" && <select aria-label={`Attachment skill ${index + 1} stage`} value={entry.stage} onChange={(event) => updateAttachment(index, { stage: Number(event.target.value) as 1 | 2 | 3 })}><option value="1">Stage I</option><option value="2" disabled={!canSetAttachmentStage(index, 2)}>Stage II</option><option value="3" disabled={!canSetAttachmentStage(index, 3)}>Stage III</option></select>}
              {entry.skillId && damageMode === "none" && <span className="attachment-fixed-value">No type or stage</span>}
            </div>;
          })}</div></fieldset>
          <div className="creator-actions"><button onClick={() => { setEditingId(""); setMode("list"); }}>Cancel</button><button className="primary-button" onClick={() => setMode("special")}>Build Special Skill</button></div>
        </div>}
        {mode === "special" && <div className="creator-panel">
          <div className={`point-budget${remaining < 0 ? " over" : ""}`}><span>Special Skill points</span><strong>{remaining} / {budget}</strong><small>{stage?.specialSkillPoints ?? 0} stage + {wisdomModifier} WIS</small></div>
          <div className="form-grid special-heading-grid">
            <label>Skill Name<input value={form.specialName} onChange={(event) => setForm({ ...form, specialName: capitalize(event.target.value) })} /></label>
            {specialUsesDc && <label>Stage<select value={form.specialStage} onChange={(event) => setForm({ ...form, specialStage: Number(event.target.value) as 1 | 2 | 3 })}><option value="1">Stage I</option><option value="2">Stage II (+5 DC)</option><option value="3">Stage III (+10 DC)</option></select></label>}
            {specialAllowsType && <label>Primary Element<select value={form.specialTypeId} onChange={(event) => setForm({ ...form, specialTypeId: event.target.value })}><option value="">Untyped</option>{props.types.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
            {specialAllowsType && Array.from({ length: extraTypingCount }, (_, index) => <label key={index}>Extra Element {index + 1}<select value={form.specialExtraTypeIds[index] ?? ""} onChange={(event) => setForm((current) => ({ ...current, specialExtraTypeIds: Array.from({ length: extraTypingCount }, (_, itemIndex) => itemIndex === index ? event.target.value : current.specialExtraTypeIds[itemIndex] ?? "") }))}><option value="">Choose element</option>{props.types.filter((item) => item.id !== form.specialTypeId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>)}
            <label className="wide">Description<textarea value={form.specialDescription} onChange={(event) => setForm({ ...form, specialDescription: event.target.value })} /></label>
          </div>
          <div className="special-option-grid">{orderedSpecialGroups.map(([category, options]) => <fieldset key={category} data-category={category}><legend>{categoryLabels[category] ?? category}</legend>{options.filter((option) => !option.repeatable).map((option) => <label className="option-choice" key={option.id}><input type="radio" name={category} checked={form.specialChoices[category] === option.key} onChange={() => setForm((current) => ({ ...current, specialChoices: { ...current.specialChoices, [category]: option.key } }))} /><span>{option.name}</span><small>{option.pointCost >= 0 ? "+" : ""}{option.pointCost}</small></label>)}{options.filter((option) => option.repeatable).map((option) => <label className="repeat-choice" key={option.id}><span>{option.name} ({option.pointCost >= 0 ? "+" : ""}{option.pointCost})</span><input type="number" min="0" max="10" value={form.repeatCounts[option.key] ?? 0} onChange={(event) => setForm((current) => ({ ...current, repeatCounts: { ...current.repeatCounts, [option.key]: Number(event.target.value) } }))} /></label>)}</fieldset>)}</div>
          <div className="creator-actions"><button onClick={() => setMode("details")}>Back</button><button className="primary-button" disabled={saving || remaining < 0} onClick={saveDigimon}>{saving ? "Saving…" : "Save Digimon"}</button></div>
        </div>}
      </div>}
    </>}
  </section>;
}
