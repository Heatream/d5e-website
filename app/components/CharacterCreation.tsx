"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MonsterManual } from "./MonsterManual";
import type {
  AttachmentSkill, Attribute, Digimon, DigimonStage, Field, LevelChart, PersonalitySkill,
  SpecialSkill, SpecialSkillOption, TypeElement,
} from "../lib/supabase";
import { calculateEvolvedHp, calculateHp, modifier, normalizeStage } from "../lib/digimon-rules";
import { addMatchingDice } from "../lib/special-skill-rules";

type Account = { username: string; rootCount: number; limit: number; limitUnlocked: boolean };
type SavedSkillRow = {
  skill_kind?: string; slot_number?: number; attachment_skill_id?: string | null; element_id?: string | null;
  attachment_stage?: number | null; personality_skill_id?: string | null; special_skill_choices?: Record<string, unknown> | null;
};
type SavedDigimonRow = Record<string, unknown> & { player_digimon_skills?: SavedSkillRow[] };
type SpecialDraft = {
  name: string; description: string; typeId: string; extraTypeIds: string[];
  stage: 1 | 2 | 3; choices: Record<string, string>; repeatCounts: Record<string, number>;
};
type FormState = {
  name: string; speciesName: string; stageId: number; level: number; attributeId: string; stageAttributeIds: string[]; fieldId: number;
  parentDigimonId: string | null; evolvedAtLevel: number | null;
  strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number;
  proficiencies: string[]; savingThrows: string[]; weaknesses: string[]; personality: string; personalitySkillId: string; image: string;
  attachments: Array<{ skillId: string; elementId: string; powerOverride: string; stage: 1 | 2 | 3 }>;
  specialName: string; specialDescription: string; specialTypeId: string; specialExtraTypeIds: string[];
  specialStage: 1 | 2 | 3; specialChoices: Record<string, string>; repeatCounts: Record<string, number>;
  specialTwo: SpecialDraft;
};

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
    attributeId: attributes[0]?.id ?? "", stageAttributeIds: attributes[0]?.id ? [attributes[0].id] : [], fieldId: fields[0]?.id ?? 0,
    parentDigimonId: null, evolvedAtLevel: null,
    strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8,
    proficiencies: [], savingThrows: [""], weaknesses: ["", ""], personality: "", personalitySkillId: "", image: "",
    attachments: Array.from({ length: 4 }, () => ({ skillId: "", elementId: "", powerOverride: "", stage: 1 as const })),
    specialName: "", specialDescription: "", specialTypeId: "", specialExtraTypeIds: [], specialStage: 1, specialChoices: {}, repeatCounts: {},
    specialTwo: { name: "", description: "", typeId: "", extraTypeIds: [], stage: 1, choices: {}, repeatCounts: {} },
  };
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
  const [account, setAccount] = useState<Account | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [dmOverrideOpen, setDmOverrideOpen] = useState(false);
  const [dmPassword, setDmPassword] = useState("");

  const stage = props.stages.find((item) => item.id === form.stageId) ?? props.stages[0];
  const levelRow = props.levels.find((item) => item.level === form.level) ?? props.levels[0];
  const attribute = props.attributes.find((item) => item.id === (form.stageAttributeIds.at(-1) ?? form.attributeId));
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
    const templateStageIndex = Math.max(0, props.stages.findIndex((item) => item.id === templateStage?.id));
    const fallbackAttributeId = props.attributes[0]?.id ?? "";
    const templateAttributeIds = Array.from(
      { length: templateStageIndex + 1 },
      (_, index) => index === templateStageIndex ? templateAttribute?.id ?? fallbackAttributeId : fallbackAttributeId,
    );
    const templateSpecial = template.specialSkills[0];
    const templateSpecialTwo = template.specialSkills[1];
    const specialTypeIds = (templateSpecial?.types ?? [templateSpecial?.type ?? ""])
      .map((name) => props.types.find((item) => item.name.toLowerCase() === name.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));
    const secondTypeIds = (templateSpecialTwo?.types ?? [templateSpecialTwo?.type ?? ""])
      .map((name) => props.types.find((item) => item.name.toLowerCase() === name.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));
    setForm((current) => ({
      ...current, name: template.name, speciesName: template.name, image: template.image ?? "",
      stageId: templateStage?.id ?? current.stageId, level: templateStage?.minimumLevel ?? current.level,
      attributeId: templateAttribute?.id ?? current.attributeId, stageAttributeIds: templateAttributeIds, fieldId: templateField?.id ?? current.fieldId,
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
      specialName: templateSpecial?.name ?? "", specialDescription: templateSpecial?.description ?? "",
      specialTypeId: specialTypeIds[0] ?? "", specialExtraTypeIds: specialTypeIds.slice(1),
      specialStage: templateSpecial?.stage ?? 1,
      specialChoices: templateSpecial?.options ?? {},
      repeatCounts: templateSpecial?.repeats ?? {},
      specialTwo: {
        name: templateSpecialTwo?.name ?? "", description: templateSpecialTwo?.description ?? "",
        typeId: secondTypeIds[0] ?? "", extraTypeIds: secondTypeIds.slice(1),
        stage: templateSpecialTwo?.stage ?? 1,
        choices: templateSpecialTwo?.options ?? {},
        repeatCounts: templateSpecialTwo?.repeats ?? {},
      },
    }));
    setMode("details");
  }, [searchParams, props.digimon, props.stages, props.attributes, props.fields, props.personalitySkills, props.skills, props.types]);

  async function refreshAccount() {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) {
      setAccount(null);
      return null;
    }
    const result = await response.json() as Account & { authenticated: boolean };
    const next = { username: result.username, rootCount: result.rootCount, limit: result.limit, limitUnlocked: result.limitUnlocked };
    setAccount(next);
    return next;
  }

  async function loadSavedDigimon() {
    const response = await fetch("/api/player-digimon", { cache: "no-store" });
    if (response.status === 401) {
      setAccount(null);
      setSaved([]);
      return;
    }
    if (!response.ok) throw new Error("Could not load saved Digimon.");
    setSaved(await response.json());
  }

  useEffect(() => {
    refreshAccount()
      .then((current) => current ? loadSavedDigimon() : undefined)
      .catch((error) => setStatus(error.message))
      .finally(() => setAuthLoading(false));
  // Checking once on mount is intentional; authenticated mutations refresh account data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitAuth() {
    setSaving(true); setStatus("");
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Authentication failed.");
      await refreshAccount();
      await loadSavedDigimon();
      setAuthPassword("");
      setStatus(authMode === "signup" ? "Account created. Welcome to D5e!" : "Welcome back!");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Authentication failed.");
    } finally { setSaving(false); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAccount(null); setSaved([]); setSelectedSavedId(""); setEditingId(""); setMode("list");
    setStatus("You are logged out.");
  }

  async function unlockLimit() {
    setSaving(true); setStatus("");
    try {
      const response = await fetch("/api/auth/dm-override", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: dmPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not unlock this account.");
      await refreshAccount();
      setDmOverrideOpen(false); setDmPassword("");
      setStatus("DM limit unlocked for this account.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not unlock this account.");
    } finally { setSaving(false); }
  }

  const selectedOptions = useMemo(() => Object.entries(form.specialChoices)
    .map(([, key]) => props.specialSkillOptions.find((option) => option.key === key))
    .filter((option): option is SpecialSkillOption => Boolean(option)), [form.specialChoices, props.specialSkillOptions]);
  const repeatedOptions = props.specialSkillOptions.filter((option) => (form.repeatCounts[option.key] ?? 0) > 0);
  const secondSelectedOptions = useMemo(() => Object.values(form.specialTwo.choices)
    .map((key) => props.specialSkillOptions.find((option) => option.key === key))
    .filter((option): option is SpecialSkillOption => Boolean(option)), [form.specialTwo.choices, props.specialSkillOptions]);
  const secondRepeatedOptions = props.specialSkillOptions.filter((option) => (form.specialTwo.repeatCounts[option.key] ?? 0) > 0);
  const damageOption = selectedOptions.find((option) => option.category === "dice_size");
  const damageKey = damageOption?.key.trim().toLowerCase() ?? "";
  const damageName = damageOption?.name.trim() ?? "";
  const specialHasNoDamage = damageKey === "0_dmg" || damageName === "-";
  const specialUsesDc = damageKey.includes("dc") || damageName.toLowerCase() === "dc";
  const specialUsesPowerDamage = /^\d+$/.test(damageName);
  const specialAllowsType = Boolean(damageOption) && !specialHasNoDamage && !specialUsesDc && !specialUsesPowerDamage;
  const secondDamageOption = secondSelectedOptions.find((option) => option.category === "dice_size");
  const secondDamageKey = secondDamageOption?.key.trim().toLowerCase() ?? "";
  const secondDamageName = secondDamageOption?.name.trim() ?? "";
  const secondHasNoDamage = secondDamageKey === "0_dmg" || secondDamageName === "-";
  const secondUsesDc = secondDamageKey.includes("dc") || secondDamageName.toLowerCase() === "dc";
  const secondUsesPowerDamage = /^\d+$/.test(secondDamageName);
  const secondAllowsType = Boolean(secondDamageOption) && !secondHasNoDamage && !secondUsesDc && !secondUsesPowerDamage;
  const orderedSpecialGroups = SPECIAL_CATEGORY_ORDER
    .filter((category) => groupedOptions[category]?.length && (category !== "type" || specialAllowsType))
    .map((category) => [category, groupedOptions[category]!] as const);
  const orderedSecondSpecialGroups = SPECIAL_CATEGORY_ORDER
    .filter((category) => groupedOptions[category]?.length && (category !== "type" || secondAllowsType))
    .map((category) => [category, groupedOptions[category]!] as const);
  const firstSpent = selectedOptions.reduce((sum, option) => sum + option.pointCost, 0)
    + repeatedOptions.reduce((sum, option) => sum + option.pointCost * (form.repeatCounts[option.key] ?? 0), 0);
  const secondSpent = secondSelectedOptions.reduce((sum, option) => sum + option.pointCost, 0)
    + secondRepeatedOptions.reduce((sum, option) => sum + option.pointCost * (form.specialTwo.repeatCounts[option.key] ?? 0), 0);
  const spent = firstSpent + (stage?.specialSkillAmount === 2 ? secondSpent : 0);
  const stageIndex = Math.max(0, props.stages.findIndex((item) => item.id === form.stageId));
  const selectedStageAttributes = form.stageAttributeIds.slice(0, stageIndex + 1)
    .map((id) => props.attributes.find((item) => item.id === id))
    .filter((item): item is Attribute => Boolean(item));
  const effectiveWisdom = form.wisdom + selectedStageAttributes.reduce(
    (bonus, item) => bonus + (item.statBuffs.some((buff) => buff.toLowerCase() === "wisdom") ? 2 : 0), 0,
  );
  const wisdomModifier = modifier(effectiveWisdom);
  const budget = (stage?.specialSkillPoints ?? 0) + wisdomModifier;
  const remaining = budget - spent;
  const allocatedAbilityPoints = abilities.reduce((sum, ability) => sum + Math.max(0, form[ability] - 8), 0);
  const stageAbilityPoints = props.stages.slice(0, stageIndex + 1).reduce((sum, item) => sum + item.asiIncrease, 0);
  const levelAbilityPoints = props.levels.filter((item) => item.level <= form.level).reduce((sum, item) => sum + item.asiIncrease, 0);
  const freeAttributeBonus = selectedStageAttributes.filter((item) => item.name.toLowerCase() === "free").length * 3;
  const totalAbilityPoints = stageAbilityPoints + levelAbilityPoints + freeAttributeBonus;
  const abilityPointsRemaining = totalAbilityPoints - allocatedAbilityPoints;
  const attachmentSlots = Math.max(0, Math.min(4, levelRow?.attachmentSkill ?? 0));
  const savingThrowSlots = Math.max(0, Math.min(2, levelRow?.savingThrows ?? 0));
  const extraTypingCount = Math.max(0, form.repeatCounts.multitype ?? 0);
  const secondExtraTypingCount = Math.max(0, form.specialTwo.repeatCounts.multitype ?? 0);
  const attachmentUpgradeBudget = Math.max(stageIndex, levelRow?.attachmentSkillUpgrade ?? 0);
  const attachmentUpgradesUsed = form.attachments.slice(0, attachmentSlots).reduce((sum, item) => {
    const skill = props.skills.find((candidate) => candidate.id === item.skillId);
    return sum + (attachmentDamageMode(skill) === "none" ? 0 : Math.max(0, item.stage - 1));
  }, 0);
  const attachmentUpgradesRemaining = attachmentUpgradeBudget - attachmentUpgradesUsed;

  const savedDigimon = useMemo(() => {
    const rowsById = new Map(saved.map((row) => [String(row.id), row]));
    const attributeIdsFor = (row: SavedDigimonRow) => {
      const history = Array.isArray(row.stage_attribute_ids) ? row.stage_attribute_ids.map(String).filter(Boolean) : [];
      return history.length ? history : row.attribute_id ? [String(row.attribute_id)] : [];
    };
    const effectiveConstitution = (row: SavedDigimonRow) => Number(row.constitution ?? 8) + attributeIdsFor(row).reduce((bonus, id) => {
      const item = props.attributes.find((candidate) => candidate.id === id);
      return bonus + (item?.statBuffs.some((buff) => buff.toLowerCase() === "constitution") ? 2 : 0);
    }, 0);
    const hitDieFor = (row: SavedDigimonRow) => {
      const savedStage = props.stages.find((item) => item.id === Number(row.stage_id));
      const currentAttributeId = attributeIdsFor(row).at(-1);
      const currentAttribute = props.attributes.find((item) => item.id === currentAttributeId);
      const stageName = normalizeStage(savedStage?.name ?? "rookie");
      return currentAttribute?.hpDice[stageName] ?? "1d6";
    };
    const hpFor = (row: SavedDigimonRow, requestedLevel: number, visited = new Set<string>()): number => {
      const id = String(row.id);
      const constitution = effectiveConstitution(row);
      const parentId = row.parent_digimon_id ? String(row.parent_digimon_id) : "";
      const parent = parentId ? rowsById.get(parentId) : undefined;
      if (!parent || visited.has(id)) return calculateHp(hitDieFor(row), requestedLevel, constitution);
      const nextVisited = new Set(visited).add(id);
      const anchorLevel = Math.max(1, Math.min(20, Number(row.evolved_at_level ?? row.level ?? 1)));
      const parentConstitution = effectiveConstitution(parent);
      return calculateEvolvedHp(
        hpFor(parent, anchorLevel, nextVisited), hitDieFor(parent), hitDieFor(row),
        parentConstitution, constitution, anchorLevel, requestedLevel,
      );
    };
    return saved.map((row): { row: SavedDigimonRow; digimon: Digimon; level: number } => {
    const savedStage = props.stages.find((item) => item.id === Number(row.stage_id));
    const savedAttributeIds = attributeIdsFor(row);
    const currentAttributeId = savedAttributeIds.at(-1) ?? String(row.attribute_id ?? "");
    const savedAttribute = props.attributes.find((item) => item.id === currentAttributeId);
    const savedAttributeHistory = savedAttributeIds
      .map((id) => props.attributes.find((item) => item.id === id)?.name)
      .filter((name): name is string => Boolean(name));
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
    const rawSpecials = Array.isArray(row.special_skill)
      ? row.special_skill.filter((item): item is SpecialSkill => Boolean(item && typeof item === "object"))
      : row.special_skill && typeof row.special_skill === "object" ? [row.special_skill as SpecialSkill] : [];
    const hpByLevel = Object.fromEntries(Array.from({ length: 20 }, (_, index) => {
      const requestedLevel = index + 1;
      return [requestedLevel, hpFor(row, requestedLevel)];
    }));
    return {
      row,
      level: Number(row.level ?? savedStage?.minimumLevel ?? 1),
      digimon: {
        id: -1, name: String(row.name ?? "Created Digimon"), slug: `saved-${String(row.id)}`,
        stage: savedStage?.name ?? "Rookie", attribute: savedAttribute?.name ?? "",
        attributeHistory: savedAttributeHistory.length ? savedAttributeHistory : undefined,
        field: savedField?.abbreviation ?? "", image: row.image_path ? String(row.image_path) : null,
        strength: Number(row.strength ?? 8), dexterity: Number(row.dexterity ?? 8),
        constitution: Number(row.constitution ?? 8), intelligence: Number(row.intelligence ?? 8),
        wisdom: Number(row.wisdom ?? 8), charisma: Number(row.charisma ?? 8),
        proficiencies: String(row.proficiencies ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        savingThrows: String(row.saving_throws ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        weakness: String(row.weaknesses ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        personalitySkill: String(row.personality_skill ?? ""), attachmentSkills,
        specialSkills: rawSpecials, hpByLevel, baseAc: savedStage?.baseAc ?? 10,
        parentId: row.parent_digimon_id ? String(row.parent_digimon_id) : null,
        evolvedAtLevel: row.evolved_at_level ? Number(row.evolved_at_level) : null,
      },
    };
    });
  }, [saved, props.stages, props.attributes, props.fields, props.skills, props.types]);

  function chooseStage(id: number) {
    const next = props.stages.find((item) => item.id === id);
    const nextIndex = Math.max(0, props.stages.findIndex((item) => item.id === id));
    const fallbackAttributeId = props.attributes[0]?.id ?? "";
    setForm((current) => ({
      ...current, stageId: id, level: next?.minimumLevel ?? 1,
      stageAttributeIds: Array.from(
        { length: nextIndex + 1 },
        (_, index) => current.stageAttributeIds[index] ?? (index === nextIndex ? current.attributeId : fallbackAttributeId),
      ),
      attributeId: current.stageAttributeIds[nextIndex] ?? current.attributeId ?? fallbackAttributeId,
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
    const specialRows = skillRows.filter((item) => item.skill_kind === "special")
      .sort((left, right) => Number(left.slot_number ?? 1) - Number(right.slot_number ?? 1));
    const specialRow = specialRows[0];
    const specialRowTwo = specialRows[1];
    const choices = specialRow?.special_skill_choices ?? {};
    const choicesTwo = specialRowTwo?.special_skill_choices ?? {};
    const resolvedList = Array.isArray(row.special_skill)
      ? row.special_skill.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      : row.special_skill && typeof row.special_skill === "object" ? [row.special_skill as Record<string, unknown>] : [];
    const resolved = resolvedList[0] ?? {};
    const resolvedTwo = resolvedList[1] ?? {};
    const typeIds = Array.isArray(choices.typeIds) ? choices.typeIds.map(String) : [];
    const typeIdsTwo = Array.isArray(choicesTwo.typeIds) ? choicesTwo.typeIds.map(String) : [];
    const [personalityName = ""] = String(row.personality_skill ?? "").split(",").map((item) => item.trim());
    setForm({
      name: String(row.name ?? ""), speciesName: String(row.species_name ?? row.name ?? ""),
      stageId: savedStage?.id ?? props.stages[0]?.id ?? 1, level: Number(row.level ?? savedStage?.minimumLevel ?? 1),
      parentDigimonId: row.parent_digimon_id ? String(row.parent_digimon_id) : null,
      evolvedAtLevel: row.evolved_at_level ? Number(row.evolved_at_level) : null,
      attributeId: String(row.attribute_id ?? props.attributes[0]?.id ?? ""),
      stageAttributeIds: Array.isArray(row.stage_attribute_ids) && row.stage_attribute_ids.length
        ? row.stage_attribute_ids.map(String)
        : Array.from({ length: Math.max(1, props.stages.findIndex((item) => item.id === savedStage?.id) + 1) }, () => String(row.attribute_id ?? props.attributes[0]?.id ?? "")),
      fieldId: Number(row.field_id ?? props.fields[0]?.id ?? 0),
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
      specialTwo: {
        name: String(resolvedTwo.name ?? ""), description: String(resolvedTwo.description ?? ""),
        typeId: typeIdsTwo[0] ?? "", extraTypeIds: typeIdsTwo.slice(1),
        stage: Math.max(1, Math.min(3, Number(choicesTwo.stage ?? 1))) as 1 | 2 | 3,
        choices: choicesTwo.options && typeof choicesTwo.options === "object" ? choicesTwo.options as Record<string, string> : {},
        repeatCounts: choicesTwo.repeats && typeof choicesTwo.repeats === "object" ? choicesTwo.repeats as Record<string, number> : {},
      },
    });
    setEditingId(String(row.id));
    setSelectedSavedId("");
    setMode("details");
    setStatus("");
  }

  function digivolveSavedDigimon(row: SavedDigimonRow) {
    const rowId = String(row.id);
    const existingChild = saved.find((candidate) => String(candidate.parent_digimon_id ?? "") === rowId);
    if (existingChild) {
      setSelectedSavedId(String(existingChild.id));
      return;
    }
    const currentStageIndex = props.stages.findIndex((item) => item.id === Number(row.stage_id));
    const nextStage = props.stages[currentStageIndex + 1];
    if (!nextStage) return;
    editSavedDigimon(row);
    setForm((current) => {
      const knownAttributes = current.stageAttributeIds.length ? current.stageAttributeIds : [current.attributeId];
      const currentAttributeId = knownAttributes.at(-1) ?? props.attributes[0]?.id ?? "";
      return {
        ...current,
        stageId: nextStage.id,
        level: Number(row.level ?? current.level),
        parentDigimonId: rowId,
        evolvedAtLevel: Number(row.level ?? current.level),
        stageAttributeIds: [...knownAttributes, currentAttributeId],
        attributeId: currentAttributeId,
        specialTwo: nextStage.specialSkillAmount > 1 ? current.specialTwo : initialForm(props.stages, props.attributes, props.fields).specialTwo,
      };
    });
    setEditingId("");
    setStatus(`Create the ${nextStage.name} evolution.`);
  }

  function dedigivolveSavedDigimon(row: SavedDigimonRow) {
    const parentId = row.parent_digimon_id ? String(row.parent_digimon_id) : "";
    if (parentId) setSelectedSavedId(parentId);
  }

  async function deleteSavedDigimon(id: string, name: string) {
    if (!window.confirm(`Delete ${name} and every evolution linked after it? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/player-digimon?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not delete the Digimon.");
      setSelectedSavedId("");
      await loadSavedDigimon();
      await refreshAccount();
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
        : specialHasNoDamage ? "—" : addMatchingDice(damageName || "—", addDice),
      digislotCost: choice("digislot_cost"),
    };
  }

  const specialSkill = buildSpecialSkill();
  function buildSecondSpecialSkill(): SpecialSkill | null {
    if (stage?.specialSkillAmount !== 2 || !form.specialTwo.name.trim()) return null;
    const choice = (category: string) => secondSelectedOptions.find((option) => option.category === category)?.name ?? "—";
    const addDice = form.specialTwo.repeatCounts.add_dice ?? 0;
    const range30 = form.specialTwo.repeatCounts.add_30ft ?? 0;
    const radius10 = form.specialTwo.repeatCounts.add_10rd ?? 0;
    const targets = 1 + (form.specialTwo.repeatCounts.multitarget ?? 0);
    const typeNames = secondAllowsType ? [form.specialTwo.typeId, ...form.specialTwo.extraTypeIds.slice(0, secondExtraTypingCount)]
      .map((id) => props.types.find((item) => item.id === id)?.name)
      .filter((name): name is string => Boolean(name)) : [];
    return {
      name: form.specialTwo.name.trim(), description: form.specialTwo.description.trim(),
      type: typeNames.join(" / ") || "—",
      power: choice("skill_power"), time: choice("duration"), duration: "Instant",
      hitType: choice("hit_type"), range: range30 ? `${range30 * 30}ft${radius10 ? ` (${radius10 * 10}ft radius)` : ""}` : choice("range"),
      target: targets > 1 ? `${targets} Targets` : choice("target"), critical: choice("critical_hit"),
      damage: secondUsesDc
        ? `DC ${8 + (Number.parseInt(String(levelRow?.proficiency ?? "2").replace("+", ""), 10) || 2) + modifier(form[{ STR: "strength", DEX: "dexterity", CON: "constitution", INT: "intelligence", WIS: "wisdom", CHA: "charisma" }[choice("skill_power").toUpperCase()] as typeof abilities[number]] ?? 8) + (form.specialTwo.stage - 1) * 5}`
        : secondHasNoDamage ? "—" : addMatchingDice(secondDamageName || "—", addDice),
      digislotCost: choice("digislot_cost"),
    };
  }
  const secondSpecialSkill = buildSecondSpecialSkill();
  async function saveDigimon() {
    if (!form.name.trim() || !stage || !attribute || !field) {
      setStatus("Name, stage, attribute, and field are required."); return;
    }
    if (remaining < 0) { setStatus("The Special Skill exceeds its point budget."); setMode("special"); return; }
    if (abilityPointsRemaining !== 0) { setStatus(`Allocate all ability points before saving (${abilityPointsRemaining} remaining).`); setMode("details"); return; }
    if (attachmentUpgradesRemaining < 0) { setStatus("The attachment skills use more stage upgrades than this Digimon has earned."); setMode("details"); return; }
    if (form.savingThrows.slice(0, savingThrowSlots).some((value) => !value)) { setStatus("Choose every available saving throw."); setMode("details"); return; }
    const selectedWeaknesses = form.weaknesses.filter(Boolean);
    if (new Set(selectedWeaknesses.map((value) => value.toLowerCase())).size !== selectedWeaknesses.length) {
      setStatus("Choose two different weaknesses."); setMode("details"); return;
    }
    if (specialAllowsType && extraTypingCount > 0 && form.specialExtraTypeIds.slice(0, extraTypingCount).some((value) => !value)) {
      setStatus("Choose every extra Special Skill typing."); setMode("special"); return;
    }
    if (stage.specialSkillAmount === 2 && secondAllowsType && secondExtraTypingCount > 0
      && form.specialTwo.extraTypeIds.slice(0, secondExtraTypingCount).some((value) => !value)) {
      setStatus("Choose every extra typing for Special Skill 2."); setMode("special"); return;
    }
    setSaving(true); setStatus("");
    try {
      if (!account) throw new Error("Log in before saving a Digimon.");
      if (!editingId && !form.parentDigimonId && account.rootCount >= account.limit && !account.limitUnlocked) {
        setDmOverrideOpen(true);
        throw new Error("This account has reached its 50 Digimon limit. Enter the DM password to continue.");
      }
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
          resolved: specialSkill, pointsSpent: firstSpent, pointBudget: budget,
        },
      });
      if (secondSpecialSkill) skillRows.push({
        skill_kind: "special", slot_number: 2, learned_at_level: form.level,
        attachment_skill_id: null, element_id: null, attachment_stage: null,
        personality_skill_id: null, special_skill_name: secondSpecialSkill.name,
        special_skill_choices: {
          options: form.specialTwo.choices, repeats: form.specialTwo.repeatCounts,
          typeIds: secondAllowsType ? [form.specialTwo.typeId, ...form.specialTwo.extraTypeIds.slice(0, secondExtraTypingCount)].filter(Boolean) : [],
          stage: form.specialTwo.stage,
          resolved: secondSpecialSkill, pointsSpent: secondSpent, pointBudget: budget,
        },
      });
      const currentAttributeId = form.stageAttributeIds.slice(0, stageIndex + 1).at(-1) ?? form.attributeId;
      const response = await fetch("/api/player-digimon", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          digimon: {
            template_id: null, name: form.name.trim(),
            species_name: form.speciesName.trim() || form.name.trim(), level: form.level, stage_id: stage.id,
            attribute_id: currentAttributeId, stage_attribute_ids: form.stageAttributeIds.slice(0, stageIndex + 1),
            parent_digimon_id: form.parentDigimonId, evolved_at_level: form.evolvedAtLevel,
            field_id: field.id, strength: form.strength, dexterity: form.dexterity,
            constitution: form.constitution, intelligence: form.intelligence, wisdom: form.wisdom, charisma: form.charisma,
            proficiencies: form.proficiencies.join(", "),
            saving_throws: form.savingThrows.slice(0, savingThrowSlots).filter(Boolean).join(", "),
            weaknesses: form.weaknesses.filter(Boolean).join(", "),
            personality_skill: personality ? `${form.personality},${personality.name}` : null,
            image_path: form.image || null, special_skill: [specialSkill, secondSpecialSkill].filter(Boolean),
          },
          skills: skillRows,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "DIGIMON_LIMIT_REACHED") setDmOverrideOpen(true);
        throw new Error(result.error ?? "Could not save the Digimon.");
      }
      await loadSavedDigimon(); setSelectedSavedId(String(result.id)); setMode("list"); setStatus(`${form.name} was ${editingId ? "updated" : "saved"}.`);
      await refreshAccount();
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
      {authLoading ? <div className="loading-state">Checking your account…</div> : !account ? <section className="account-gate">
        <div className="account-tabs" role="tablist" aria-label="D5e account">
          <button role="tab" aria-selected={authMode === "login"} onClick={() => setAuthMode("login")}>Log In</button>
          <button role="tab" aria-selected={authMode === "signup"} onClick={() => setAuthMode("signup")}>Create Account</button>
        </div>
        <div className="account-form">
          <div><span className="eyebrow">{authMode === "login" ? "Welcome back" : "Save your partners"}</span><h2>{authMode === "login" ? "Log in to D5e" : "Create your D5e account"}</h2></div>
          <label>Username<input autoComplete="username" value={authUsername} maxLength={24} onChange={(event) => setAuthUsername(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authPassword} minLength={8} onChange={(event) => setAuthPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitAuth(); }} /></label>
          <button className="primary-button" disabled={saving || !authUsername.trim() || !authPassword} onClick={submitAuth}>{saving ? "Please wait…" : authMode === "login" ? "Log In" : "Create Account"}</button>
        </div>
      </section> : <>
      <div className="account-bar"><div><strong>{account.username}</strong><span>{account.limitUnlocked ? `${account.rootCount} Digimon · DM limit unlocked` : `${account.rootCount} / ${account.limit} Digimon`}</span></div><button onClick={logout}>Log Out</button></div>
      {dmOverrideOpen && <section className="dm-override-panel"><div><span className="eyebrow">DM Override</span><h3>Unlock additional Digimon slots</h3><p>This permanently marks the account as DM-approved in Supabase.</p></div><label>DM Password<input type="password" value={dmPassword} onChange={(event) => setDmPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") unlockLimit(); }} /></label><div><button onClick={() => { setDmOverrideOpen(false); setDmPassword(""); }}>Cancel</button><button className="primary-button" disabled={saving || !dmPassword} onClick={unlockLimit}>Unlock Account</button></div></section>}
      {mode === "list" && <div className="creation-list">
        <div className="creation-list-heading"><div><span className="eyebrow">Your partners</span><h2>Saved Digimon</h2></div><button className="primary-button" onClick={() => { setEditingId(""); setForm(initialForm(props.stages, props.attributes, props.fields)); setMode("details"); }}>Create Digimon</button></div>
        {savedDigimon.length ? <div className="saved-digimon-list">{savedDigimon.map(({ row, digimon: savedEntry, level: savedLevel }) => {
          const rowId = String(row.id);
          const open = selectedSavedId === rowId;
          const savedStageIndex = props.stages.findIndex((item) => item.name.toLowerCase() === savedEntry.stage.toLowerCase());
          const minimumLevel = savedEntry.evolvedAtLevel ?? savedStageMinimum(savedEntry.stage, props.stages);
          return <article className={`saved-digimon-item${open ? " open" : ""}`} key={rowId}>
            <button type="button" className="saved-digimon-card" onClick={() => setSelectedSavedId(open ? "" : rowId)} aria-expanded={open}>
              <span><strong>{savedEntry.name}</strong><small>{savedEntry.stage} · Level {savedLevel}</small></span><span aria-hidden="true">{open ? "−" : "+"}</span>
            </button>
            {open && <MonsterManual {...props} digimon={[savedEntry]} initialSelectedSlug={savedEntry.slug} initialLevel={savedLevel} levelBounds={[minimumLevel, 20]} embedded
              onDigivolve={savedStageIndex >= 0 && savedStageIndex < props.stages.length - 1 ? () => digivolveSavedDigimon(row) : undefined}
              onDedigivolve={savedEntry.parentId ? () => dedigivolveSavedDigimon(row) : undefined}
              onEdit={() => editSavedDigimon(row)} onDelete={() => deleteSavedDigimon(rowId, savedEntry.name)} />}
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
            <label>Stage<select value={form.stageId} disabled={Boolean(form.parentDigimonId && !editingId)} onChange={(event) => chooseStage(Number(event.target.value))}>{props.stages.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>D-Level<select value={form.level} onChange={(event) => setForm({ ...form, level: Number(event.target.value) })}>{Array.from({ length: 20 - (form.evolvedAtLevel ?? stage?.minimumLevel ?? 1) + 1 }, (_, index) => (form.evolvedAtLevel ?? stage?.minimumLevel ?? 1) + index).map((value) => <option value={value} key={value}>Level {value}</option>)}</select></label>
            <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: capitalize(event.target.value) })} /></label>
            <label>Species Name<input value={form.speciesName} onChange={(event) => setForm({ ...form, speciesName: capitalize(event.target.value) })} /></label>
            <fieldset className="stage-attribute-picker wide"><legend>Attributes by Stage</legend><div>{props.stages.slice(0, stageIndex + 1).map((stageOption, index) => <label key={stageOption.id}>{stageOption.name}<select value={form.stageAttributeIds[index] ?? props.attributes[0]?.id ?? ""} onChange={(event) => setForm((current) => {
              const stageAttributeIds = [...current.stageAttributeIds];
              stageAttributeIds[index] = event.target.value;
              return { ...current, stageAttributeIds, attributeId: index === stageIndex ? event.target.value : current.attributeId };
            })}>{props.attributes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>)}</div></fieldset>
            <label>Field<select value={form.fieldId} onChange={(event) => setForm({ ...form, fieldId: Number(event.target.value) })}>{props.fields.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label className="wide">Image URL<input type="url" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} placeholder="Optional" /></label>
          </div>
          <fieldset><legend>Ability Scores · {abilityPointsRemaining} points remaining</legend><div className="stat-inputs">{abilities.map((ability) => <label key={ability}>{ability.slice(0, 3).toUpperCase()}<input type="number" min="8" max={8 + totalAbilityPoints} value={form[ability]} onChange={(event) => setForm({ ...form, [ability]: Math.max(8, Number(event.target.value)) })} /></label>)}</div></fieldset>
          <fieldset><legend>Proficiencies</legend><div className="proficiency-grid">{PROFICIENCIES.map((proficiency) => <label className="check-choice" key={proficiency}><input type="checkbox" checked={form.proficiencies.includes(proficiency)} onChange={(event) => setForm((current) => ({ ...current, proficiencies: event.target.checked ? [...current.proficiencies, proficiency] : current.proficiencies.filter((item) => item !== proficiency) }))} />{proficiency}</label>)}</div></fieldset>
          <div className="form-grid">
            <fieldset><legend>Saving Throws · {savingThrowSlots}</legend>{Array.from({ length: savingThrowSlots }, (_, index) => <label key={index}>Save {index + 1}<select value={form.savingThrows[index] ?? ""} onChange={(event) => setForm((current) => ({ ...current, savingThrows: Array.from({ length: savingThrowSlots }, (_, itemIndex) => itemIndex === index ? event.target.value : current.savingThrows[itemIndex] ?? "") }))}><option value="">Choose save</option>{SAVING_THROWS.map((save) => <option value={save} key={save}>{save}</option>)}</select></label>)}</fieldset>
            <fieldset><legend>Weaknesses</legend>{[0, 1].map((index) => <label key={index}>Weakness {index + 1}<select value={form.weaknesses[index] ?? ""} onChange={(event) => setForm((current) => ({ ...current, weaknesses: current.weaknesses.map((value, itemIndex) => itemIndex === index ? capitalize(event.target.value) : value) }))}><option value="">None</option>{props.types.map((item) => <option value={item.name} key={item.id} disabled={form.weaknesses.some((value, itemIndex) => itemIndex !== index && value.toLowerCase() === item.name.toLowerCase())}>{item.name}</option>)}</select></label>)}</fieldset>
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
          {stage?.specialSkillAmount === 2 && <section className="second-special-editor" aria-labelledby="second-special-title">
            <h3 id="second-special-title">Special Skill 2</h3>
            <div className="form-grid special-heading-grid">
              <label>Skill Name<input value={form.specialTwo.name} onChange={(event) => setForm((current) => ({ ...current, specialTwo: { ...current.specialTwo, name: capitalize(event.target.value) } }))} /></label>
              {secondUsesDc && <label>Stage<select value={form.specialTwo.stage} onChange={(event) => setForm((current) => ({ ...current, specialTwo: { ...current.specialTwo, stage: Number(event.target.value) as 1 | 2 | 3 } }))}><option value="1">Stage I</option><option value="2">Stage II (+5 DC)</option><option value="3">Stage III (+10 DC)</option></select></label>}
              {secondAllowsType && <label>Primary Element<select value={form.specialTwo.typeId} onChange={(event) => setForm((current) => ({ ...current, specialTwo: { ...current.specialTwo, typeId: event.target.value } }))}><option value="">Untyped</option>{props.types.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
              {secondAllowsType && Array.from({ length: secondExtraTypingCount }, (_, index) => <label key={index}>Extra Element {index + 1}<select value={form.specialTwo.extraTypeIds[index] ?? ""} onChange={(event) => setForm((current) => {
                const extraTypeIds = Array.from({ length: secondExtraTypingCount }, (_, itemIndex) => itemIndex === index ? event.target.value : current.specialTwo.extraTypeIds[itemIndex] ?? "");
                return { ...current, specialTwo: { ...current.specialTwo, extraTypeIds } };
              })}><option value="">Choose element</option>{props.types.filter((item) => item.id !== form.specialTwo.typeId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>)}
              <label className="wide">Description<textarea value={form.specialTwo.description} onChange={(event) => setForm((current) => ({ ...current, specialTwo: { ...current.specialTwo, description: event.target.value } }))} /></label>
            </div>
            <div className="special-option-grid">{orderedSecondSpecialGroups.map(([category, options]) => <fieldset key={category} data-category={category}><legend>{categoryLabels[category] ?? category}</legend>{options.filter((option) => !option.repeatable).map((option) => <label className="option-choice" key={option.id}><input type="radio" name={`second-${category}`} checked={form.specialTwo.choices[category] === option.key} onChange={() => setForm((current) => ({ ...current, specialTwo: { ...current.specialTwo, choices: { ...current.specialTwo.choices, [category]: option.key } } }))} /><span>{option.name}</span><small>{option.pointCost >= 0 ? "+" : ""}{option.pointCost}</small></label>)}{options.filter((option) => option.repeatable).map((option) => <label className="repeat-choice" key={option.id}><span>{option.name} ({option.pointCost >= 0 ? "+" : ""}{option.pointCost})</span><input type="number" min="0" max="10" value={form.specialTwo.repeatCounts[option.key] ?? 0} onChange={(event) => setForm((current) => ({ ...current, specialTwo: { ...current.specialTwo, repeatCounts: { ...current.specialTwo.repeatCounts, [option.key]: Number(event.target.value) } } }))} /></label>)}</fieldset>)}</div>
          </section>}
          <div className="creator-actions"><button onClick={() => setMode("details")}>Back</button><button className="primary-button" disabled={saving || remaining < 0} onClick={saveDigimon}>{saving ? "Saving…" : "Save Digimon"}</button></div>
        </div>}
      </div>}
      </>}
    </>}
  </section>;
}
