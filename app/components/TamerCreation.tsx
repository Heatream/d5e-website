"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { MonsterManual } from "./MonsterManual";
import type {
  AttachmentSkill, Attribute, Digimon, DigimonStage, Feat, Field, Item, LevelChart,
  PersonalitySkill, SpecialSkill, SpecialSkillOption, TamerLevel, TamerSubclass, TamerSubclassFeature, TypeElement,
} from "../lib/supabase";
import { calculateHistoryHp, calculateHp, modifier } from "../lib/digimon-rules";
import { addMatchingDice, selectedChoiceKeys, toggleMultiChoice, type SpecialChoices } from "../lib/special-skill-rules";
import { digidestinedSummary } from "../lib/tamer-rules";
import { allowedArmyStages, armyXrossBonuses } from "../lib/digixrosser-rules";
import { digispiritedRange, digispiritedUnarmedDamage, resolveDigispiritedFieldId } from "../lib/digispirited-rules";
import { doubleLandingBudget, dualWielderMaxPartnerPoints, fieldSyncSummary, jogressCurrentHp } from "../lib/dual-wielder-rules";
import { DNA_ADAPTATION_FEATURE_SLUGS, dnaPulserSummary, dnaPulserSummaryLines } from "../lib/dna-pulser-rules";
import { itemAbilityBonuses } from "../lib/item-rules";
import { parseTrackerExpression } from "../lib/tracker-expression";

type Account = { username: string; rootCount: number; limit: number; limitUnlocked: boolean };
type Training = { training_kind: "skill" | "save"; name: string };
type TamerRow = Record<string, unknown> & {
  player_tamer_trainings?: Array<Training & { id?: string }>;
  player_tamer_feats?: Array<{ feat_id?: number }>;
  player_tamer_items?: TamerInventoryEntry[];
  player_tamer_partners?: PartnerRow[];
  player_tamer_army?: ArmyMember[];
  player_tamer_digispirited?: DigispiritedConfig | DigispiritedConfig[];
  player_tamer_dual_wielder?: DualWielderConfig | DualWielderConfig[];
  player_tamer_dna_pulser?: DnaPulserConfig | DnaPulserConfig[];
};
type DnaPulserConfig = { tamer_id?: string; adapted_feature_id?: number | null };
type AdaptationManagerState = { tamerId: string; tamerName: string; featureId: number | null };
type DualWielderConfig = { tamer_id?: string; special_skill?: SpecialSkill | null; builder_choices?: Record<string, unknown> | null };
type BondManagerState = { tamerId: string; tamerName: string; budget: number; proficiency: number; stats: Record<string, number>; config: DualWielderConfig };
type DigispiritedConfig = {
  tamer_id?: string; selected_field_id?: number | null; elemental_type_id?: string | null;
  weapon_name?: string | null; weapon_damage?: string | null; weapon_power?: string | null;
  weapon_range?: string | null; weapon_damage_type?: string | null;
};
type DigiArmsManagerState = {
  tamerId: string; tamerName: string; activeFieldName: string; config: DigispiritedConfig;
};
type ArmyMember = {
  id?: string; slot_number: number; name: string; field_id: number;
  main_ability: typeof ABILITIES[number]; stage: string; image_path?: string | null; is_xrossed?: boolean;
};
type ArmyManagerState = {
  tamerId: string; name: string; capacity: number; level: number; partnerStage: string; members: ArmyMember[];
};
type PartnerRow = {
  id?: string; slot_number?: number; player_digimon_id?: string;
  player_digimon?: Record<string, unknown> & {
    player_digimon_skills?: Array<Record<string, unknown>>;
    player_digimon_feats?: Array<{ feat_id?: number }>;
  };
};
type TamerInventoryEntry = {
  id?: string; item_id?: number | null; custom_name?: string | null;
  custom_description?: string | null; quantity?: number;
};
type EditableInventoryEntry = {
  key: string; itemId: number | null; customName: string; customDescription: string; quantity: number;
};
type InventoryManagerState = { tamerId: string | null; tamerName: string; items: EditableInventoryEntry[]; initialPanel?: "catalog" | "custom" };
type FormState = {
  name: string; level: number; image: string; subclassId: string;
  strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number;
  maxHp: number; currentHp: number; temporaryHp: number; armorClass: number; movement: number;
  currentPartnerPoints: number; skills: string[]; saves: string[]; featIds: number[];
  items: Array<{ itemId: number | null; customName: string; customDescription: string; quantity: number }>;
};

const ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const SAVES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const SKILLS = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight",
  "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion",
  "Religion", "Sleight of Hand", "Stealth", "Survival",
];
const SKILL_ABILITIES: Record<string, typeof ABILITIES[number]> = {
  Acrobatics: "dexterity", "Animal Handling": "wisdom", Arcana: "intelligence", Athletics: "strength",
  Deception: "charisma", History: "intelligence", Insight: "wisdom", Intimidation: "charisma",
  Investigation: "intelligence", Medicine: "wisdom", Nature: "intelligence", Perception: "wisdom",
  Performance: "charisma", Persuasion: "charisma", Religion: "intelligence", "Sleight of Hand": "dexterity",
  Stealth: "dexterity", Survival: "wisdom",
};

function numbersOnlyKeyDown(event: { key: string; preventDefault: () => void }) {
  if (["e", "E", "+", "-", "."].includes(event.key)) event.preventDefault();
}

function numericCounterValue(value: string, maximum: number) {
  const digits = value.replace(/\D/g, "");
  return Math.min(maximum, Math.max(0, Number(digits || 0)));
}
const PROFICIENCY_GROUPS: Array<{ ability: typeof ABILITIES[number]; label: string }> = [
  { ability: "strength", label: "STR" }, { ability: "dexterity", label: "DEX" },
  { ability: "intelligence", label: "INT" }, { ability: "wisdom", label: "WIS" },
  { ability: "charisma", label: "CHA" },
];
const STAGE_BOUNDS: Record<string, [number, number]> = {
  rookie: [1, 4], champion: [5, 9], ultimate: [10, 14], mega: [15, 20], "7th stage": [15, 20],
};
type SubclassSheetSlot = { slug: string; className: string };
const SUBCLASS_SHEET_LAYOUTS: Record<string, SubclassSheetSlot[]> = {
  digidestined: [
    { slug: "power-of-friendship", className: "feature-power-of-friendship" },
    { slug: "tamer-inspiration", className: "feature-tamer-inspiration" },
    { slug: "field-mastery", className: "feature-field-mastery" },
    { slug: "crested-strength", className: "feature-crested-strength" },
    { slug: "adventurer", className: "feature-adventurer" },
  ],
  digixrosser: [
    { slug: "xross-warrior", className: "feature-xross-warrior" },
  ],
  digispirited: [
    { slug: "frontier-spirit", className: "feature-frontier-spirit" },
  ],
  "dna-pulser": [
    { slug: "charging-pulse", className: "feature-power-of-friendship feature-dna-charging" },
    { slug: "aggressive-pulse", className: "feature-tamer-inspiration feature-dna-aggressive" },
    { slug: "saving-pulse", className: "feature-field-mastery feature-dna-saving" },
    { slug: "adaptation", className: "feature-crested-strength feature-dna-adaptation" },
    { slug: "pulse-break", className: "feature-adventurer feature-dna-break" },
  ],
};
const DIGIXROSSER_SUMMARIES: Record<string, string> = {
  "xross-evolution": "1 PP. Xross a sub Digimon and raise an ability by its proficiency.",
  "armys-field": "Matching Fields grant additional ability bonuses.",
  "proficient-xrossing": "Xross Evolution becomes a bonus action.",
  "xross-warrior": "Once per rest. Raid gains +5 per non-Xrossed Army Digimon.",
};
const SPECIAL_CATEGORY_ORDER = ["digislot_cost", "skill_power", "hit_type", "target", "duration", "range", "critical_hit", "type", "dice_size", "effect"] as const;
const SPECIAL_CATEGORY_LABELS: Record<string, string> = { digislot_cost: "Digislot Cost", skill_power: "Power", hit_type: "Hit Type", target: "Target", duration: "Action Time", range: "Range", critical_hit: "Critical Hit", type: "Typing", dice_size: "Damage", effect: "Effect" };

function initialForm(): FormState {
  return {
    name: "", level: 1, image: "", subclassId: "",
    strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10,
    maxHp: 6, currentHp: 6, temporaryHp: 0, armorClass: 8, movement: 30, currentPartnerPoints: 1,
    skills: ["Animal Handling"], saves: ["Charisma"], featIds: [], items: [],
  };
}

function csv(value: unknown) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function trainingsFor(row: TamerRow): Training[] {
  if (row.player_tamer_trainings?.length) return row.player_tamer_trainings;
  return [
    ...[row.skill_proficiency_1, row.skill_proficiency_2].filter(Boolean).map((name) => ({ training_kind: "skill" as const, name: String(name) })),
    ...(row.saving_throw_choice ? [{ training_kind: "save" as const, name: String(row.saving_throw_choice) }] : []),
  ];
}

function fieldColor(field?: Field) {
  const palette = ["#e22b1d", "#079bc8", "#7c4cc9", "#1b9b66", "#d38b14", "#445fc2"];
  return palette[Math.max(0, (field?.id ?? 1) - 1) % palette.length];
}

function digimonProficiency(level: number, levels: LevelChart[]) {
  const value = levels.find((row) => row.level === level)?.proficiency ?? "+2";
  const parsed = Number(String(value).replace("+", ""));
  return Number.isFinite(parsed) ? parsed : 2;
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function digispiritedConfig(row: TamerRow): DigispiritedConfig {
  const value = row.player_tamer_digispirited;
  return (Array.isArray(value) ? value[0] : value) ?? {};
}

function dualWielderConfig(row: TamerRow): DualWielderConfig {
  const value = row.player_tamer_dual_wielder;
  return (Array.isArray(value) ? value[0] : value) ?? {};
}

function dnaPulserConfig(row: TamerRow): DnaPulserConfig {
  const value = row.player_tamer_dna_pulser;
  return (Array.isArray(value) ? value[0] : value) ?? {};
}


function partnerMaximumHp(digimon: Digimon | null, level: number, attributes: Attribute[]) {
  if (!digimon) return 0;
  const history = digimon.attributeHistory?.length ? digimon.attributeHistory : [digimon.attribute];
  const dice = history.map((name, index) => {
    const attribute = attributes.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const stage = ["rookie", "champion", "ultimate", "mega"][Math.min(index, 3)] as "rookie" | "champion" | "ultimate" | "mega";
    return attribute?.hpDice[stage] ?? "1d6";
  });
  return dice.length > 1 ? calculateHistoryHp(dice, digimon.stage, level, digimon.constitution) : calculateHp(dice[0] ?? "1d6", level, digimon.constitution);
}

function EditableNumber({ value, maximum, label, onSave, compact = false }: {
  value: number; maximum?: number; label: string; onSave: (value: number) => Promise<void>; compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  async function commit() {
    const parsed = parseTrackerExpression(draft, value);
    const next = parsed == null
      ? value
      : Math.max(0, Math.min(maximum ?? Number.MAX_SAFE_INTEGER, parsed));
    setDraft(String(next));
    setEditing(false);
    if (next !== value) await onSave(next);
  }
  if (editing) return <input className={`tracker-input${compact ? " compact" : ""}`} type="text" inputMode="numeric"
    aria-label={label} value={draft} autoFocus onChange={(event) => setDraft(event.target.value)}
    onFocus={(event) => event.currentTarget.select()}
    onBlur={() => void commit()} onKeyDown={(event) => {
      if (event.key === "Enter") void commit();
      if (event.key === "Escape") { setDraft(String(value)); setEditing(false); }
    }} />;
  return <button type="button" className={`tracker-value${compact ? " compact" : ""}`} title={`Edit ${label}`}
    onClick={() => { setDraft(String(value)); setEditing(true); }}>
    {maximum === undefined
      ? value
      : <><span className="sheet-current-value">{value}</span><span className="sheet-value-divider">/</span><span className="sheet-maximum-value">{maximum}</span></>}
  </button>;
}

function DigimonExperienceTracker({ name, value, level, levels, onSave }: {
  name: string; value: number; level: number; levels: LevelChart[]; onSave: (value: number) => Promise<void>;
}) {
  const current = levels.find((row) => row.level === level);
  const next = levels.find((row) => row.level === level + 1);
  const floor = current?.neededExperience ?? 0;
  const target = next?.neededExperience;
  const range = target == null ? 0 : Math.max(1, target - floor);
  const progress = target == null ? 100 : Math.max(0, Math.min(100, ((value - floor) / range) * 100));
  const ready = target != null && value >= target;
  const progressLabel = target == null
    ? `${name} is at maximum D-Level`
    : `${Math.round(progress)}% toward level ${level + 1}: ${value} of ${target} EXP`;

  return <div className={`experience-tracker partner-experience${ready ? " level-ready" : ""}`} aria-label={`${name} experience tracker`}>
    <span>{name} EXP</span>
    <span className="digimon-exp-value">{ready && <span className="level-ready-arrow" aria-label="Ready to level up">↑</span>}<EditableNumber compact value={value} label={`${name} experience`} onSave={onSave} /></span>
    <span className="digimon-exp-progress" role="progressbar" aria-label={progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} title={progressLabel}>
      <span style={{ width: `${progress}%` }} />
    </span>
  </div>;
}

function asDigimon(
  row: PartnerRow["player_digimon"],
  props: Pick<TamerCreationProps, "stages" | "attributes" | "fields" | "skills" | "types" | "items" | "levels">,
  abilityBonuses: Record<string, number> = {},
): Digimon | null {
  if (!row) return null;
  const stage = props.stages.find((item) => item.id === Number(row.stage_id));
  const attributeIds = Array.isArray(row.stage_attribute_ids) ? row.stage_attribute_ids.map(String) : [String(row.attribute_id ?? "")];
  const attribute = props.attributes.find((item) => item.id === attributeIds.at(-1));
  const attributeHistory = attributeIds
    .map((id) => props.attributes.find((item) => item.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const field = props.fields.find((item) => item.id === Number(row.field_id));
  const attachments: Digimon["attachmentSkills"] = Array.from({ length: 4 }, () => null);
  (row.player_digimon_skills ?? []).filter((skill) => skill.skill_kind === "attachment").forEach((skill) => {
    const slot = Math.max(1, Math.min(4, Number(skill.slot_number ?? 1)));
    const attachment = props.skills.find((item) => item.id === String(skill.attachment_skill_id ?? ""));
    if (!attachment) return;
    const element = props.types.find((item) => item.id === String(skill.element_id ?? ""));
    const choices = skill.special_skill_choices && typeof skill.special_skill_choices === "object"
      ? skill.special_skill_choices as Record<string, unknown> : {};
    attachments[slot - 1] = {
      raw: attachment.slug, slot, skill: attachment.slug, typeToken: element?.name ?? null,
      powerOverride: typeof choices.powerOverride === "string" ? choices.powerOverride : null,
      startingStage: Math.max(1, Math.min(3, Number(skill.attachment_stage ?? 1))) as 1 | 2 | 3,
      upgradeOrders: [], valid: true,
    };
  });
  const rawSpecial = Array.isArray(row.special_skill) ? row.special_skill : row.special_skill ? [row.special_skill] : [];
  const equippedItems = (Array.isArray(row.player_digimon_items) ? row.player_digimon_items : [])
    .map((entry) => props.items.find((item) => item.id === Number(entry.item_id)))
    .filter((item): item is Item => Boolean(item));
  const proficiency = Number(String(props.levels.find((item) => item.level === Number(row.level ?? 1))?.proficiency ?? 2).replace("+", "")) || 2;
  const itemBonuses = itemAbilityBonuses(equippedItems, proficiency);
  return {
    id: -1, name: String(row.name ?? "Partner"), slug: `tamer-partner-${String(row.id)}`,
    stage: stage?.name ?? "Rookie", attribute: attribute?.name ?? "", attributeHistory, field: field?.abbreviation ?? "",
    image: row.image_path ? String(row.image_path) : null,
    strength: Number(row.strength ?? 10) + itemBonuses.strength + (abilityBonuses.strength ?? 0),
    dexterity: Number(row.dexterity ?? 10) + itemBonuses.dexterity + (abilityBonuses.dexterity ?? 0),
    constitution: Number(row.constitution ?? 10) + itemBonuses.constitution + (abilityBonuses.constitution ?? 0),
    intelligence: Number(row.intelligence ?? 10) + itemBonuses.intelligence + (abilityBonuses.intelligence ?? 0),
    wisdom: Number(row.wisdom ?? 10) + itemBonuses.wisdom + (abilityBonuses.wisdom ?? 0),
    charisma: Number(row.charisma ?? 10) + itemBonuses.charisma + (abilityBonuses.charisma ?? 0),
    proficiencies: csv(row.proficiencies), savingThrows: csv(row.saving_throws), weakness: csv(row.weaknesses),
    personalitySkill: String(row.personality_skill ?? ""), attachmentSkills: attachments,
    specialSkills: rawSpecial.filter((item): item is SpecialSkill => Boolean(item && typeof item === "object")),
    baseAc: stage?.baseAc ?? 10, itemBonusesApplied: true,
  };
}

function digimonLoadout(row: PartnerRow["player_digimon"], items: Item[]) {
  const entries = Array.isArray(row?.player_digimon_items) ? row.player_digimon_items : [];
  const resolveSlot = (slot: number) => {
    const entry = entries.find((candidate) => Number(candidate.slot_number) === slot);
    return items.find((item) => item.id === Number(entry?.item_id)) ?? null;
  };
  return { heldItems: [resolveSlot(1), resolveSlot(2)] as Array<Item | null>, enhancementItem: resolveSlot(3) };
}

function digimonFeats(row: PartnerRow["player_digimon"], feats: Feat[]) {
  const entries = Array.isArray(row?.player_digimon_feats) ? row.player_digimon_feats : [];
  return entries
    .map((entry) => feats.find((feat) => feat.id === Number(entry.feat_id)))
    .filter((feat): feat is Feat => Boolean(feat));
}

export type TamerCreationProps = {
  account: Account | null; authLoading: boolean; onAccountChanged: () => Promise<void>;
  onEditPartner: (playerDigimonId: string) => void;
  onDigivolvePartner: (playerDigimonId: string, tamerId: string, partnerId: string) => void;
  digimon: Digimon[]; fields: Field[]; attributes: Attribute[]; levels: LevelChart[];
  skills: AttachmentSkill[]; types: TypeElement[]; personalitySkills: PersonalitySkill[];
  stages: DigimonStage[]; specialSkillOptions: SpecialSkillOption[];
  items: Item[]; feats: Feat[]; heldItemsTemplate: string | null; enhancementItemsTemplate: string | null;
  tamerSubclasses: TamerSubclass[]; tamerLevels: TamerLevel[]; tamerSubclassFeatures: TamerSubclassFeature[];
  tamerFeats: Feat[]; tamerItems: Item[];
};

export function TamerCreation(props: TamerCreationProps) {
  const [rows, setRows] = useState<TamerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState("");
  const [openId, setOpenId] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [partnerPicker, setPartnerPicker] = useState<string | null>(null);
  const [armyManager, setArmyManager] = useState<ArmyManagerState | null>(null);
  const [fieldManager, setFieldManager] = useState<{ tamerId: string; tamerName: string; fieldId: number | null; config: DigispiritedConfig } | null>(null);
  const [digiArmsManager, setDigiArmsManager] = useState<DigiArmsManagerState | null>(null);
  const [bondManager, setBondManager] = useState<BondManagerState | null>(null);
  const [adaptationManager, setAdaptationManager] = useState<AdaptationManagerState | null>(null);
  const [inventoryManager, setInventoryManager] = useState<InventoryManagerState | null>(null);
  const [expandedFeature, setExpandedFeature] = useState<{ tamerId: string; slug: string } | null>(null);
  const [activePartnerByTamer, setActivePartnerByTamer] = useState<Record<string, string>>({});
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function load() {
    const response = await fetch("/api/player-tamers", { cache: "no-store" });
    if (response.status === 401) { setRows([]); setLoaded(true); return; }
    const result = await response.json().catch(() => []);
    if (!response.ok) throw new Error(result?.error ?? "Could not load characters.");
    setRows(result); setLoaded(true);
  }
  useEffect(() => {
    if (!props.account) { setRows([]); setLoaded(true); return; }
    setLoaded(false);
    void load().catch((error) => { setStatus(error.message); setLoaded(true); });
  // Reloading is intentionally tied to the authenticated account.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.account?.username]);
  useLayoutEffect(() => {
    const sheets = [...document.querySelectorAll<HTMLElement>(".tamer-sheet")];
    const fit = () => sheets.forEach((sheet) => sheet.querySelectorAll<HTMLElement>("[data-fit]").forEach((element) => {
      element.style.removeProperty("font-size");
      const base = Number.parseFloat(getComputedStyle(element).fontSize);
      const minimum = Math.max(4, base * .42);
      let size = base;
      while (size > minimum && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)) {
        size -= .5;
        element.style.fontSize = `${size}px`;
      }
    }));
    fit();
    const observer = new ResizeObserver(fit);
    sheets.forEach((sheet) => observer.observe(sheet));
    document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [rows, expandedFeature]);

  const filtered = rows.filter((row) => String(row.name ?? "").toLowerCase().includes(query.trim().toLowerCase()));
  const levelRow = (level: number) => props.tamerLevels.find((row) => row.level === level) ?? { level, proficiencyBonus: 2, maxEvolutionStage: "Rookie" };

  async function authenticate() {
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
      });
      const text = await response.text();
      const result = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(result.error ?? "Authentication failed.");
      await props.onAccountChanged(); await load();
      setPassword(""); setStatus(authMode === "signup" ? "Account created." : "Welcome back!");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Authentication failed."); }
    finally { setBusy(false); }
  }

  function setAbility(ability: typeof ABILITIES[number], value: number) {
    setForm((current) => {
      const next = { ...current, [ability]: value };
      if (!editingId && ability === "constitution") {
        next.maxHp = Math.max(1, 6 + modifier(value)); next.currentHp = next.maxHp;
      }
      if (!editingId && ability === "dexterity") next.armorClass = 8 + modifier(value);
      return next;
    });
  }

  function edit(row: TamerRow) {
    const trainings = trainingsFor(row);
    setEditingId(String(row.id)); setMode("form");
    setForm({
      name: String(row.name ?? ""), level: Number(row.level ?? 1), image: String(row.image_path ?? ""),
      subclassId: row.subclass_id ? String(row.subclass_id) : "",
      strength: Number(row.strength ?? 10), dexterity: Number(row.dexterity ?? 10),
      constitution: Number(row.constitution ?? 10), intelligence: Number(row.intelligence ?? 10),
      wisdom: Number(row.wisdom ?? 10), charisma: Number(row.charisma ?? 10),
      maxHp: Number(row.max_hp ?? 6), currentHp: Number(row.current_hp ?? 6), temporaryHp: Number(row.temporary_hp ?? 0),
      armorClass: Number(row.armor_class ?? 10), movement: Number(row.movement ?? 30),
      currentPartnerPoints: Number(row.current_partner_points ?? 0),
      skills: trainings.filter((item) => item.training_kind === "skill").map((item) => item.name),
      saves: trainings.filter((item) => item.training_kind === "save").map((item) => item.name),
      featIds: (row.player_tamer_feats ?? []).map((item) => Number(item.feat_id)),
      items: (row.player_tamer_items ?? []).map((item) => ({ itemId: item.item_id == null ? null : Number(item.item_id), customName: String(item.custom_name ?? ""), customDescription: String(item.custom_description ?? ""), quantity: Number(item.quantity ?? 1) })),
    });
  }

  async function save() {
    if (!form.name.trim()) { setStatus("Give the character a name."); return; }
    setBusy(true); setStatus("");
    const maxPp = Math.max(0, 1 + modifier(form.charisma));
    try {
      const response = await fetch("/api/player-tamers", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          tamer: {
            name: form.name.trim(), level: form.level, subclass_id: form.subclassId ? Number(form.subclassId) : null,
            strength: form.strength, dexterity: form.dexterity, constitution: form.constitution,
            intelligence: form.intelligence, wisdom: form.wisdom, charisma: form.charisma,
            current_hp: Math.min(form.currentHp, form.maxHp + form.temporaryHp), max_hp: form.maxHp,
            temporary_hp: form.temporaryHp, armor_class: form.armorClass, movement: form.movement,
            current_partner_points: Math.min(form.currentPartnerPoints, maxPp), max_partner_points: maxPp,
            image_path: form.image.trim() || null,
            saving_throw_choice: form.saves[0] ?? null,
            skill_proficiency_1: form.skills[0] ?? null, skill_proficiency_2: form.skills[1] ?? null,
          },
          trainings: [
            ...form.skills.map((name) => ({ training_kind: "skill", name })),
            ...form.saves.map((name) => ({ training_kind: "save", name })),
          ],
          featIds: form.featIds,
          items: form.items.map((item) => ({ item_id: item.itemId, custom_name: item.itemId == null ? item.customName : null, custom_description: item.itemId == null ? item.customDescription : null, quantity: item.quantity })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not save the character.");
      await load(); setMode("list"); setEditingId(""); setForm(initialForm());
      setOpenId(String(result.id ?? editingId)); setStatus(`${form.name} was saved.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save the character."); }
    finally { setBusy(false); }
  }

  async function removeTamer(id: string, name: string) {
    if (!confirm(`Delete ${name}? Their attached Digimon will remain saved.`)) return;
    const response = await fetch(`/api/player-tamers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setStatus(result.error ?? "Could not delete the character."); return; }
    await load(); setOpenId(""); setStatus(`${name} was deleted.`);
  }

  function officialPayload(template: Digimon, _tamerLevel: number) {
    const stage = props.stages.find((item) => item.name.toLowerCase() === template.stage.toLowerCase()) ?? props.stages[0];
    const bounds = STAGE_BOUNDS[template.stage.toLowerCase()] ?? [1, 20];
    const level = bounds[0];
    const attributeNames = template.attributeHistory?.length ? template.attributeHistory : [template.attribute];
    const attributeIds = attributeNames.map((name) => props.attributes.find((item) => item.name.toLowerCase() === name.toLowerCase())?.id).filter(Boolean);
    const attributeId = attributeIds.at(-1) ?? props.attributes[0]?.id ?? null;
    const field = props.fields.find((item) => [item.name, item.abbreviation].some((value) => value.toLowerCase() === template.field.toLowerCase()));
    const skills = template.attachmentSkills.flatMap((ref, index) => {
      if (!ref) return [];
      const skill = props.skills.find((item) => item.slug.toLowerCase() === ref.skill.toLowerCase());
      if (!skill) return [];
      const element = props.types.find((item) => item.name.toLowerCase() === ref.typeToken?.toLowerCase());
      return [{
        skill_kind: "attachment", slot_number: index + 1, learned_at_level: level,
        attachment_skill_id: skill.id, element_id: element?.id ?? null, attachment_stage: ref.startingStage,
        personality_skill_id: null, special_skill_name: null,
        special_skill_choices: ref.powerOverride ? { powerOverride: ref.powerOverride } : null,
      }];
    });
    return {
      digimon: {
        template_id: template.id, name: template.name, species_name: template.name, level, stage_id: stage?.id ?? null,
        attribute_id: attributeId, stage_attribute_ids: attributeIds.length ? attributeIds : attributeId ? [attributeId] : [],
        field_id: field?.id ?? null, strength: template.strength, dexterity: template.dexterity,
        constitution: template.constitution, intelligence: template.intelligence, wisdom: template.wisdom, charisma: template.charisma,
        proficiencies: template.proficiencies.join(", "), saving_throws: template.savingThrows.join(", "),
        weaknesses: template.weakness.join(", "), personality_skill: template.personalitySkill || null,
        image_path: template.image, special_skill: template.specialSkills,
      },
      skills,
    };
  }

  async function attach(tamerId: string, body: { playerDigimonId?: string; official?: ReturnType<typeof officialPayload> }) {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/player-tamers/partners", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tamerId, ...body }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not add the partner.");
      await load(); await props.onAccountChanged(); setPartnerPicker(null); setStatus("Partner added.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not add the partner."); }
    finally { setBusy(false); }
  }

  async function removePartner(id: string) {
    const response = await fetch(`/api/player-tamers/partners?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) await load(); else setStatus("Could not remove the partner.");
  }

  async function movePartner(tamerId: string, partners: PartnerRow[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= partners.length) return;
    const reordered = [...partners]; [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const response = await fetch("/api/player-tamers/partners", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tamerId, partnerIds: reordered.map((item) => String(item.id)) }),
    });
    if (response.ok) await load(); else setStatus("Could not reorder partners.");
  }

  async function switchPartnerForm(tamerId: string, partner: PartnerRow, direction: "up" | "down") {
    const currentId = String(partner.player_digimon_id ?? "");
    if (!currentId) return;
    setBusy(true); setStatus("");
    try {
      const digimonResponse = await fetch("/api/player-digimon", { cache: "no-store" });
      const allDigimon = await digimonResponse.json().catch(() => []);
      if (!digimonResponse.ok || !Array.isArray(allDigimon)) throw new Error("Could not load the evolution chain.");
      const current = allDigimon.find((row) => String(row.id) === currentId);
      const target = direction === "up"
        ? allDigimon.find((row) => String(row.parent_digimon_id ?? "") === currentId)
        : allDigimon.find((row) => String(row.id) === String(current?.parent_digimon_id ?? ""));
      if (!target && direction === "up") {
        await clearArmyXross(tamerId);
        props.onDigivolvePartner(currentId, tamerId, String(partner.id));
        return;
      }
      if (!target) throw new Error("The previous evolution could not be found.");
      const response = await fetch("/api/player-tamers/partners", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tamerId, partnerId: String(partner.id), playerDigimonId: String(target.id) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not change the partner's evolution.");
      await clearArmyXross(tamerId);
      await load();
      setStatus(direction === "up" ? "Partner Digivolved." : "Partner De-Digivolved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not change the partner's evolution.");
    } finally { setBusy(false); }
  }

  async function clearArmyXross(tamerId: string) {
    const response = await fetch("/api/player-tamers/army", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tamerId, clear: true }),
    });
    if (!response.ok) throw new Error("The partner changed form, but its Digixross could not be cleared.");
  }

  async function toggleArmyXross(tamerId: string, memberId: string) {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/player-tamers/army", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tamerId, memberId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not update Digixross.");
      await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not update Digixross."); }
    finally { setBusy(false); }
  }

  async function updateTamerTracker(id: string, field: "current_hp" | "current_partner_points" | "experience" | "money", value: number) {
    const previous = rows;
    setRows((current) => current.map((row) => String(row.id) === id ? { ...row, [field]: value } : row));
    const response = await fetch("/api/player-tamers", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, tamer: { [field]: value } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setRows(previous); setStatus(result.error ?? "Could not update the tracker."); }
  }

  async function updateDigimonTracker(id: string, field: "current_hp" | "current_digislot" | "experience", value: number) {
    const previous = rows;
    setRows((current) => current.map((row) => ({
      ...row,
      player_tamer_partners: (row.player_tamer_partners ?? []).map((partner) =>
        String(partner.player_digimon_id) === id && partner.player_digimon
          ? { ...partner, player_digimon: { ...partner.player_digimon, [field]: value } }
          : partner),
    })));
    const response = await fetch("/api/player-digimon", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, digimon: { [field]: value } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setRows(previous); setStatus(result.error ?? "Could not update the tracker."); }
  }

  async function saveInventory() {
    if (!inventoryManager) return;
    const clean = inventoryManager.items.map((item) => ({
      itemId: item.itemId,
      customName: item.customName.trim(),
      customDescription: item.customDescription.trim(),
      quantity: Math.max(1, Math.trunc(item.quantity || 1)),
    }));
    if (clean.some((item) => item.itemId == null && !item.customName)) { setStatus("Custom items require a name."); return; }
    if (!inventoryManager.tamerId) {
      setForm((current) => ({ ...current, items: clean }));
      setInventoryManager(null);
      return;
    }
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/player-tamers/items", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tamerId: inventoryManager.tamerId, items: clean }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not save the inventory.");
      await load(); setInventoryManager(null); setStatus("Inventory saved.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save the inventory."); }
    finally { setBusy(false); }
  }

  function editableInventory(row: TamerRow): EditableInventoryEntry[] {
    return (row.player_tamer_items ?? []).map((entry, index) => ({
      key: String(entry.id ?? `saved-${index}`), itemId: entry.item_id == null ? null : Number(entry.item_id),
      customName: String(entry.custom_name ?? ""), customDescription: String(entry.custom_description ?? ""),
      quantity: Number(entry.quantity ?? 1),
    }));
  }

  async function updateInventoryInline(tamerId: string, items: EditableInventoryEntry[]) {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/player-tamers/items", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tamerId, items }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not update the inventory.");
      await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not update the inventory."); }
    finally { setBusy(false); }
  }

  async function saveBond(specialSkill: SpecialSkill, builderChoices: Record<string, unknown>) {
    if (!bondManager) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/player-tamers/dual-wielder", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tamerId: bondManager.tamerId, specialSkill, builderChoices }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not save Double Landing.");
      await load(); setBondManager(null); setStatus("Double Landing saved.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save Double Landing."); }
    finally { setBusy(false); }
  }

  async function saveAdaptation() {
    if (!adaptationManager) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/player-tamers/dna-pulser", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tamerId: adaptationManager.tamerId, adaptedFeatureId: adaptationManager.featureId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not save Adaptation.");
      await load(); setAdaptationManager(null); setStatus("Adaptation saved.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save Adaptation."); }
    finally { setBusy(false); }
  }

  async function saveArmy() {
    if (!armyManager) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/player-tamers/army", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tamerId: armyManager.tamerId,
          members: armyManager.members.map(({ name, field_id, main_ability, stage, image_path, is_xrossed }) => ({ name, field_id, main_ability, stage, image_path, is_xrossed })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not save the Digimon Army.");
      await load(); setArmyManager(null); setStatus("Digimon Army saved.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save the Digimon Army."); }
    finally { setBusy(false); }
  }

  async function saveDigispirited(payload: {
    tamerId: string; selectedFieldId?: number | null; elementalTypeId?: string | null;
    weapon?: { name: string; damage: string; power: string; range: string; damageType: string } | null;
  }) {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/player-tamers/digispirited", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not save Digispirited settings.");
      await load(); setFieldManager(null); setDigiArmsManager(null); setStatus("Digispirited settings saved.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save Digispirited settings."); }
    finally { setBusy(false); }
  }

  if (props.authLoading) return <div className="loading-state">Checking your account…</div>;
  if (!props.account) return <section className="account-gate">
    {status && <p className="creation-status" role="status">{status}</p>}
    <div className="account-tabs" role="tablist"><button aria-selected={authMode === "login"} onClick={() => setAuthMode("login")}>Log In</button><button aria-selected={authMode === "signup"} onClick={() => setAuthMode("signup")}>Create Account</button></div>
    <div className="account-form"><div><span className="eyebrow">Tamer records</span><h2>{authMode === "login" ? "Log in to D5e" : "Create your D5e account"}</h2></div>
      <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>Password<input type="password" value={password} minLength={8} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void authenticate(); }} /></label>
      <button className="primary-button" disabled={busy} onClick={() => void authenticate()}>{busy ? "Please wait…" : authMode === "login" ? "Log In" : "Create Account"}</button>
    </div>
  </section>;

  return <section className="tamer-creation">
    {status && <p className="creation-status" role="status">{status}</p>}
    {mode === "form" ? <section className="creator-panel tamer-form">
      <div className="creation-list-heading"><div><span className="eyebrow">Tamer builder</span><h2>{editingId ? "Edit Character" : "Add Character"}</h2></div><button onClick={() => { setMode("list"); setEditingId(""); }}>Cancel</button></div>
      <div className="form-grid">
        <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value.replace(/^./, (letter) => letter.toUpperCase()) })} /></label>
        <label>Level<select value={form.level} onChange={(event) => setForm({ ...form, level: Number(event.target.value) })}>{Array.from({ length: 20 }, (_, index) => <option key={index + 1} value={index + 1}>Level {index + 1}</option>)}</select></label>
        <label>Subclass<select value={form.subclassId} onChange={(event) => setForm({ ...form, subclassId: event.target.value })}><option value="">No subclass</option>{props.tamerSubclasses.map((item) => {
          const unavailable = item.slug.toLowerCase() === "application-expert";
          return <option key={item.id} value={item.id} disabled={unavailable}>{item.name}{unavailable ? " — Unavailable" : ""}</option>;
        })}</select></label>
        <label className="wide">Portrait URL<input type="url" placeholder="Optional" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /></label>
      </div>
      <fieldset><legend>Ability Scores</legend><p className="field-help">Standard Array is recommended: 15, 14, 13, 12, 10, 8.</p><div className="stat-inputs">{ABILITIES.map((ability) => <label key={ability}>{ability.slice(0, 3).toUpperCase()}<input type="number" min="1" max="30" value={form[ability]} onChange={(event) => setAbility(ability, Number(event.target.value))} /></label>)}</div></fieldset>
      <div className="form-grid tamer-derived-grid">
        <label>Maximum HP<input type="number" min="1" value={form.maxHp} onChange={(event) => setForm({ ...form, maxHp: Number(event.target.value) })} /></label>
        <label>Current HP<input type="number" min="0" value={form.currentHp} onChange={(event) => setForm({ ...form, currentHp: Number(event.target.value) })} /></label>
        <label>Temporary HP<input type="number" min="0" value={form.temporaryHp} onChange={(event) => setForm({ ...form, temporaryHp: Number(event.target.value) })} /></label>
        <label>AC<input type="number" min="0" value={form.armorClass} onChange={(event) => setForm({ ...form, armorClass: Number(event.target.value) })} /></label>
        <label>Movement (ft)<input type="number" min="0" step="5" value={form.movement} onChange={(event) => setForm({ ...form, movement: Number(event.target.value) })} /></label>
        <label>Current PP<input type="number" min="0" value={form.currentPartnerPoints} onChange={(event) => setForm({ ...form, currentPartnerPoints: Number(event.target.value) })} /></label>
      </div>
      <fieldset><legend>Skill Proficiencies</legend><p className="field-help">Animal Handling + 2 of any</p><div className="proficiency-grid">{SKILLS.map((name) => <label className="check-choice" key={name}><input type="checkbox" checked={form.skills.includes(name)} onChange={(event) => setForm((current) => ({ ...current, skills: event.target.checked ? [...current.skills, name] : current.skills.filter((item) => item !== name) }))} />{name}</label>)}</div></fieldset>
      <fieldset><legend>Saving Throws</legend><p className="field-help">Charisma + 1 of any</p><div className="proficiency-grid">{SAVES.map((name) => <label className="check-choice" key={name}><input type="checkbox" checked={form.saves.includes(name)} onChange={(event) => setForm((current) => ({ ...current, saves: event.target.checked ? [...current.saves, name] : current.saves.filter((item) => item !== name) }))} />{name}</label>)}</div></fieldset>
      <fieldset><legend>Feats</legend>{props.tamerFeats.length ? <div className="feat-selection-list">{props.tamerFeats.map((feat) => <label className="feat-selection-option" key={feat.id}><input type="checkbox" checked={form.featIds.includes(feat.id)} onChange={(event) => setForm((current) => ({ ...current, featIds: event.target.checked ? [...current.featIds, feat.id] : current.featIds.filter((id) => id !== feat.id) }))} /><span className="feat-selection-copy"><strong>{feat.name}</strong><small>{feat.description}</small></span></label>)}</div> : <p className="field-help">No tamer feats have been added to the Feats table yet.</p>}</fieldset>
      <fieldset><legend>Tamer Items</legend><div className="inventory-builder-summary"><span>{form.items.length} item{form.items.length === 1 ? "" : "s"} in inventory</span><div className="inventory-heading-actions"><button type="button" onClick={() => setInventoryManager({ tamerId: null, tamerName: form.name || "New tamer", initialPanel: "catalog", items: form.items.map((item, index) => ({ key: `form-${index}`, ...item })) })}>Add Item</button><button type="button" onClick={() => setInventoryManager({ tamerId: null, tamerName: form.name || "New tamer", initialPanel: "custom", items: form.items.map((item, index) => ({ key: `form-${index}`, ...item })) })}>Add Custom Item</button></div></div></fieldset>
      <button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save Character"}</button>
    </section> : <div className="creation-list">
      <div className="creation-list-heading"><div><span className="eyebrow">Your tamers</span><h2>Saved Characters</h2></div><button className="primary-button" onClick={() => { setForm(initialForm()); setEditingId(""); setMode("form"); }}>Add Character</button></div>
      <div className="directory-toolbar"><label className="search-control"><span>Search characters</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" /></label><span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span></div>
      {!loaded ? <div className="loading-state">Loading characters…</div> : filtered.length ? <div className="saved-digimon-list">{filtered.map((row) => {
        const id = String(row.id); const open = openId === id; const partners = [...(row.player_tamer_partners ?? [])].sort((a, b) => Number(a.slot_number) - Number(b.slot_number));
        const tamerLevel = Number(row.level ?? 1);
        const subclass = props.tamerSubclasses.find((item) => item.id === Number(row.subclass_id));
        const isDigixrosser = subclass?.slug.toLowerCase() === "digixrosser";
        const army = [...(row.player_tamer_army ?? [])].sort((a, b) => Number(a.slot_number) - Number(b.slot_number));
        const xrossBonuses = isDigixrosser ? armyXrossBonuses(army) : {};
        const partnerDigimon = (partner: PartnerRow | undefined) => asDigimon(
          partner?.player_digimon, props, partners.indexOf(partner as PartnerRow) === 0 ? xrossBonuses : {},
        );
        const proficiency = levelRow(Number(row.level)).proficiencyBonus;
        const firstPartner = partnerDigimon(partners[0]);
        const partnerCharisma = firstPartner
          ? firstPartner.charisma + (firstPartner.attributeHistory ?? []).reduce((total, name) => {
            const stageAttribute = props.attributes.find((item) => item.name.toLowerCase() === name.toLowerCase());
            return total + (stageAttribute?.statBuffs.some((buff) => buff.toLowerCase() === "charisma") ? 2 : 0);
          }, 0)
          : 10;
        const secondPartner = partnerDigimon(partners[1]);
        const secondPartnerCharisma = secondPartner
          ? secondPartner.charisma + (secondPartner.attributeHistory ?? []).reduce((total, name) => {
            const stageAttribute = props.attributes.find((item) => item.name.toLowerCase() === name.toLowerCase());
            return total + (stageAttribute?.statBuffs.some((buff) => buff.toLowerCase() === "charisma") ? 2 : 0);
          }, 0) : 10;
        const isDualWielder = subclass?.slug.toLowerCase() === "dual-wielder";
        const maxPp = dualWielderMaxPartnerPoints(Number(row.charisma), partnerCharisma, isDualWielder && secondPartner ? secondPartnerCharisma : undefined, tamerLevel);
        const trainings = trainingsFor(row);
        const tamerSkills = trainings.filter((item) => item.training_kind === "skill").map((item) => item.name);
        const tamerSaves = trainings.filter((item) => item.training_kind === "save").map((item) => item.name);
        const equippedFeats = (row.player_tamer_feats ?? []).map((entry) => props.tamerFeats.find((feat) => feat.id === Number(entry.feat_id))).filter((feat): feat is Feat => Boolean(feat));
        const activeField = props.fields.find((field) => [field.name, field.abbreviation]
          .some((value) => value.toLowerCase() === firstPartner?.field.toLowerCase()));
        const subclassFeatures = props.tamerSubclassFeatures.filter((feature) => feature.subclassId === subclass?.id);
        const featureLayout = SUBCLASS_SHEET_LAYOUTS[subclass?.slug.toLowerCase() ?? ""] ?? [];
        const isDigispirited = subclass?.slug.toLowerCase() === "digispirited";
        const isDnaPulser = subclass?.slug.toLowerCase() === "dna-pulser";
        const dnaConfig = dnaPulserConfig(row);
        const adaptedFeature = props.tamerSubclassFeatures.find((feature) => feature.id === Number(dnaConfig.adapted_feature_id));
        const adaptedSlug = adaptedFeature?.slug ?? "";
        const adaptedArmy = isDnaPulser && tamerLevel >= 6 && adaptedSlug === "digimon-army";
        const adaptedFatedEncounter = isDnaPulser && tamerLevel >= 6 && adaptedSlug === "fated-encounter";
        const dualConfig = dualWielderConfig(row);
        const dualSpecial = dualConfig.special_skill ?? null;
        const partnerViews = partners.slice(0, 2).map((partner) => {
          const digimon = partnerDigimon(partner);
          const partnerLevel = Number(partner.player_digimon?.level ?? 1);
          const maximumHp = partnerMaximumHp(digimon, partnerLevel, props.attributes);
          const maximumDigislot = props.levels.find((item) => item.level === partnerLevel)?.digislot ?? 1;
          return { partner, digimon, level: partnerLevel, maximumHp, currentHp: Math.min(Number(partner.player_digimon?.current_hp ?? maximumHp), maximumHp), maximumDigislot, currentDigislot: Math.min(Number(partner.player_digimon?.current_digislot ?? maximumDigislot), maximumDigislot), field: props.fields.find((item) => item.abbreviation.toLowerCase() === digimon?.field.toLowerCase()) };
        });
        const hasTwoPartners = partnerViews.length === 2 && partnerViews.every((item) => item.digimon);
        const requestedActivePartnerId = activePartnerByTamer[id];
        const activePartnerId = partners.some((partner) => String(partner.id) === requestedActivePartnerId)
          ? requestedActivePartnerId
          : String(partners[0]?.id ?? "");
        const activePartner = partners.find((partner) => String(partner.id) === activePartnerId) ?? partners[0];
        const activePartnerDigimon = partnerDigimon(activePartner);
        const displayedPartners = isDualWielder || adaptedFatedEncounter
          ? partners.filter((partner) => String(partner.id) === activePartnerId)
          : partners;
        const sameField = hasTwoPartners && partnerViews[0].field?.id === partnerViews[1].field?.id;
        const jogressHp = hasTwoPartners ? jogressCurrentHp(partnerViews[0].currentHp, partnerViews[1].currentHp) : null;
        const spiritConfig = digispiritedConfig(row);
        const spiritFieldId = resolveDigispiritedFieldId(tamerLevel, spiritConfig.selected_field_id, activeField?.id);
        const spiritField = props.fields.find((field) => field.id === spiritFieldId);
        const spiritType = props.types.find((type) => type.id === spiritConfig.elemental_type_id);
        const unarmedDamage = digispiritedUnarmedDamage(firstPartner?.strength);
        const hasDigiArms = tamerLevel >= 14 && Boolean(spiritConfig.weapon_name && spiritConfig.weapon_damage);
        const spiritPower = String(spiritConfig.weapon_power ?? "strength").toLowerCase();
        const spiritPowerLabel = spiritPower.slice(0, 3).toUpperCase();
        const isDragonSpirit = spiritField?.name.toLowerCase() === "dragon's roar";
        const selectedFeature = expandedFeature?.tamerId === id
          ? subclassFeatures.find((feature) => feature.slug === expandedFeature.slug)
          : undefined;
        const commandFeature = subclassFeatures.find((feature) => feature.slug === "tamer-command");
        return <article className={`saved-digimon-item tamer-item${open ? " open" : ""}`} key={id}>
          <button className="saved-digimon-card" onClick={() => setOpenId(open ? "" : id)} aria-expanded={open}><span><strong>{String(row.name)}</strong><small>Level {String(row.level)} · {subclass?.name ?? "No subclass"}</small></span><span>{open ? "−" : "+"}</span></button>
          {open && <div className="tamer-record">
            <div className="tamer-actions">
              <div className="experience-trackers" aria-label="Experience trackers">
                <label className="experience-tracker"><span>Tamer EXP</span><EditableNumber compact value={Number(row.experience ?? 0)} label={`${String(row.name)} experience`} onSave={(value) => updateTamerTracker(id, "experience", value)} /></label>
                <label className="experience-tracker money-tracker"><span>Money</span><EditableNumber compact value={Number(row.money ?? 0)} label={`${String(row.name)} money`} onSave={(value) => updateTamerTracker(id, "money", value)} /></label>
                {partners.map((partner, index) => {
                  const experienceDigimon = partnerDigimon(partner);
                  const experienceName = experienceDigimon?.name ?? `Partner ${index + 1}`;
                  return <DigimonExperienceTracker key={`experience-${String(partner.id)}`} name={experienceName}
                    value={Number(partner.player_digimon?.experience ?? 0)} level={Number(partner.player_digimon?.level ?? 1)} levels={props.levels}
                    onSave={(value) => updateDigimonTracker(String(partner.player_digimon_id), "experience", value)} />;
                })}
              </div>
              {isDigixrosser && tamerLevel >= 2 && firstPartner && <button className="army-button" onClick={() => setArmyManager({
                tamerId: id, name: String(row.name), capacity: maxPp, level: tamerLevel,
                partnerStage: firstPartner.stage, members: army.map((member) => ({ ...member })),
              })}>Army</button>}
              {adaptedArmy && firstPartner && <button className="army-button dna-adapted-action" onClick={() => setArmyManager({
                tamerId: id, name: String(row.name), capacity: maxPp, level: 2,
                partnerStage: firstPartner.stage, members: army.map((member) => ({ ...member })),
              })}>Army</button>}
              {isDnaPulser && tamerLevel >= 6 && <button className="adaptation-button" onClick={() => setAdaptationManager({
                tamerId: id, tamerName: String(row.name), featureId: dnaConfig.adapted_feature_id ?? null,
              })}>Adaptation</button>}
              {isDigispirited && tamerLevel >= 14 && <button className="digi-arms-button" onClick={() => setDigiArmsManager({
                tamerId: id, tamerName: String(row.name), activeFieldName: spiritField?.name ?? "",
                config: { ...spiritConfig },
              })}>Digi-Arms</button>}
              {isDualWielder && tamerLevel >= 17 && <button className="bond-button" disabled={!hasTwoPartners} onClick={() => setBondManager({
                tamerId: id, tamerName: String(row.name), budget: doubleLandingBudget(firstPartner?.wisdom ?? 10, secondPartner?.wisdom ?? 10),
                proficiency, stats: { strength: firstPartner?.strength ?? 10, dexterity: firstPartner?.dexterity ?? 10, constitution: firstPartner?.constitution ?? 10, intelligence: firstPartner?.intelligence ?? 10, wisdom: firstPartner?.wisdom ?? 10, charisma: firstPartner?.charisma ?? 10 }, config: dualConfig,
              })}>Bond</button>}
              <button className="primary-button" onClick={() => setPartnerPicker(partnerPicker === id ? null : id)}>Add Digimon</button><button onClick={() => edit(row)}>Edit</button><button className="danger-button" onClick={() => void removeTamer(id, String(row.name))}>Delete</button>
            </div>
            <article className={`tamer-sheet${subclass?.border || isDnaPulser ? " has-template" : ""}`}>
              <div className="tamer-portrait">{row.image_path ? <img src={String(row.image_path)} alt="" /> : <span>Portrait</span>}</div>
              {(subclass?.border || isDnaPulser) && <img className="tamer-template" src={subclass?.border || "/assets/borders/subclass_dna_pulser.webp"} alt="" aria-hidden="true" />}
              <strong className="tamer-name" data-fit>{String(row.name)}</strong><span className="tamer-level">{String(row.level)}</span>
              <div className="tamer-hp"><EditableNumber value={Number(row.current_hp ?? row.max_hp ?? 0)} maximum={Number(row.max_hp ?? 0)} label={`${String(row.name)} current HP`} onSave={(value) => updateTamerTracker(id, "current_hp", value)} /></div>
              <div className="tamer-ac"><strong>{String(row.armor_class)}</strong></div>
              <div className="tamer-prof"><strong>+{proficiency}</strong></div>
              <div className="tamer-pp"><EditableNumber value={Math.min(Number(row.current_partner_points ?? maxPp), maxPp)} maximum={maxPp} label={`${String(row.name)} current Partner Points`} onSave={(value) => updateTamerTracker(id, "current_partner_points", value)} /></div>
              <div className="tamer-mv"><strong>{String(row.movement)}ft</strong></div>
              <div className={`tamer-evolution${levelRow(Number(row.level)).maxEvolutionStage.length > 7 ? " compact" : ""}`}><strong>{levelRow(Number(row.level)).maxEvolutionStage}</strong></div>
              <div className="tamer-we"><strong>+{proficiency}</strong></div>
              <div className="tamer-saves"><p>{tamerSaves.join(" · ") || "—"}</p></div>
              <div className="tamer-abilities">{ABILITIES.map((ability) => <div key={ability}><strong>{String(row[ability])}</strong></div>)}</div>
              <div className="tamer-feats"><p>{equippedFeats.map((feat) => feat.name).join(" · ") || "—"}</p></div>
              <div className="tamer-proficiencies"><p>{tamerSkills.join(" · ") || "—"}</p></div>
              {isDigixrosser && <div className="digixrosser-army" aria-label={`${String(row.name)} Digimon Army`}>
                {tamerLevel >= 9 && <div className="army-promoted-slots">{army.slice(0, 3).map((member, index) => <ArmySlot key={member.id ?? index} member={member} field={props.fields.find((field) => field.id === Number(member.field_id))} digimon={props.digimon} promoted inactive={index >= maxPp} busy={busy} onToggle={member.id ? () => void toggleArmyXross(id, member.id!) : undefined} />)}</div>}
                <div className="army-standard-slots">{(tamerLevel >= 9 ? army.slice(3) : army).map((member, index) => {
                  const absoluteIndex = tamerLevel >= 9 ? index + 3 : index;
                  return <ArmySlot key={member.id ?? absoluteIndex} member={member} field={props.fields.find((field) => field.id === Number(member.field_id))} digimon={props.digimon} inactive={absoluteIndex >= maxPp || member.stage !== "Rookie"} busy={busy} onToggle={member.id ? () => void toggleArmyXross(id, member.id!) : undefined} />;
                })}</div>
              </div>}
              {adaptedFatedEncounter && partners.length > 1 && <div className="adapted-partner-switcher" aria-label="Choose active partner">
                {partners.slice(0, 2).map((partner) => {
                  const switcherDigimon = partnerDigimon(partner);
                  return <button type="button" key={String(partner.id)} className={activePartnerId === String(partner.id) ? "active" : ""}
                    aria-pressed={activePartnerId === String(partner.id)} onClick={() => setActivePartnerByTamer((current) => ({ ...current, [id]: String(partner.id) }))}>
                    {switcherDigimon?.image ? <img src={switcherDigimon.image} alt="" /> : null}<span>{switcherDigimon?.name ?? "Partner"}</span>
                  </button>;
                })}
              </div>}
              {isDigispirited && <>
                <button type="button" className={`digispirited-strike${tamerLevel < 2 ? " locked" : ""}`}
                  disabled={tamerLevel < 2}
                  aria-expanded={expandedFeature?.tamerId === id && ["spirit-evolution", "united-spirit"].includes(expandedFeature.slug)}
                  onClick={() => {
                    const slug = tamerLevel >= 6 ? "united-spirit" : "spirit-evolution";
                    setExpandedFeature((current) => current?.tamerId === id && current.slug === slug ? null : { tamerId: id, slug });
                  }}>
                  {tamerLevel < 2 ? <span data-fit>Unarmed Strike unlocks at level 2</span> : !firstPartner ? <span data-fit>Partner required</span> : <>
                    <strong data-fit>{isDragonSpirit && spiritType ? `${spiritType.name} ` : ""}{hasDigiArms ? spiritConfig.weapon_name : "Unarmed Strike"}</strong>
                    <span className="spirit-strike-profile" data-fit>
                      Bonus Action · {digispiritedRange(spiritField?.name, tamerLevel >= 6, hasDigiArms ? String(spiritConfig.weapon_range) : "Melee")} ·
                      {hasDigiArms ? spiritPowerLabel : "STR"}{spiritField?.name === "Jungle Troopers" && tamerLevel >= 6 && (!hasDigiArms || spiritPower === "strength") ? "/INT" : ""} ·
                      {hasDigiArms ? spiritConfig.weapon_damage : unarmedDamage}{hasDigiArms ? ` ${spiritConfig.weapon_damage_type}` : ""}
                    </span>
                    {tamerLevel >= 6 && <small data-fit>{spiritField?.digispiritedEffect ?? "Field effect unavailable."}</small>}
                  </>}
                </button>
                <button type="button" className={`digispirited-field${tamerLevel >= 9 ? " selectable" : ""}`}
                  disabled={tamerLevel < 9 || !firstPartner}
                  aria-label={tamerLevel >= 9 ? `Change Field. Current Field: ${spiritField?.name ?? "None"}` : `Current Field: ${spiritField?.name ?? "Partner required"}`}
                  onClick={() => setFieldManager({ tamerId: id, tamerName: String(row.name), fieldId: spiritField?.id ?? null, config: { ...spiritConfig } })}>
                  {spiritField?.symbol ? <img src={spiritField.symbol} alt={spiritField.name} /> : <span>?</span>}
                </button>
              </>}
              {isDualWielder && <>
                <button type="button" className={`dual-double-landing${tamerLevel < 17 || !hasTwoPartners ? " locked" : ""}`} disabled={tamerLevel < 17 || !hasTwoPartners || !dualSpecial}
                  aria-expanded={expandedFeature?.tamerId === id && expandedFeature.slug === "double-landing"}
                  onClick={() => setExpandedFeature((current) => current?.tamerId === id && current.slug === "double-landing" ? null : { tamerId: id, slug: "double-landing" })}>
                  <span className="dual-feature-content">{tamerLevel < 17 ? <span data-fit>Double Landing unlocks at level 17</span> : !hasTwoPartners ? null : dualSpecial ? <><strong data-fit>{dualSpecial.name}</strong><span data-fit>{dualSpecial.time} · {dualSpecial.range} · {dualSpecial.power} · {dualSpecial.damage}</span></> : <span data-fit>Use Bond to build Double Landing</span>}</span>
                </button>
                <button type="button" className={`dual-field-sync${tamerLevel < 6 ? " locked" : ""}`} disabled={tamerLevel < 6}
                  aria-expanded={expandedFeature?.tamerId === id && expandedFeature.slug === "field-sync"}
                  onClick={() => setExpandedFeature((current) => current?.tamerId === id && current.slug === "field-sync" ? null : { tamerId: id, slug: "field-sync" })}>
                  <span className="dual-feature-content"><strong>Field Sync</strong><span data-fit>{tamerLevel < 6 ? "Unlocks at level 6" : !hasTwoPartners ? "" : fieldSyncSummary(sameField)}</span></span>
                </button>
                <div className="dual-partner-panel">
                  {partnerViews.map((view) => <article className="dual-partner-row" key={String(view.partner.id)}>
                    <button type="button" className={`dual-partner-portrait${activePartnerId === String(view.partner.id) ? " active" : ""}`}
                      aria-label={`Show ${view.digimon?.name ?? "partner"} sheet`} aria-pressed={activePartnerId === String(view.partner.id)}
                      onClick={() => setActivePartnerByTamer((current) => ({ ...current, [id]: String(view.partner.id) }))}>
                      {view.digimon?.image ? <img src={view.digimon.image} alt="" /> : <span>?</span>}
                    </button>
                    <span className="dual-partner-field">{view.field?.symbol ? <img src={view.field.symbol} alt={view.field.name} /> : "?"}</span>
                    <label>HP <EditableNumber compact value={view.currentHp} maximum={view.maximumHp} label={`${view.digimon?.name} current HP`} onSave={(value) => updateDigimonTracker(String(view.partner.player_digimon_id), "current_hp", value)} /></label>
                    <label>DL <EditableNumber compact value={view.currentDigislot} maximum={view.maximumDigislot} label={`${view.digimon?.name} current Digislot`} onSave={(value) => updateDigimonTracker(String(view.partner.player_digimon_id), "current_digislot", value)} /></label>
                  </article>)}
                  <div className="dual-jogress-hp"><span>{tamerLevel < 9 || !hasTwoPartners ? "" : jogressHp}</span></div>
                </div>
              </>}
              {featureLayout.map((slot) => {
                const feature = subclassFeatures.find((candidate) => candidate.slug === slot.slug);
                if (!feature) return null;
                const unlocked = tamerLevel >= feature.levelRequired;
                const adaptationSummary = adaptedFeature
                  ? adaptedSlug === "spirit-evolution" && firstPartner
                    ? `${adaptedFeature.name}. Bonus Action · Melee · STR · ${digispiritedUnarmedDamage(firstPartner.strength)}`
                    : adaptedFeature.name
                  : "Use Adaptation to choose a feature.";
                const summary = isDnaPulser
                  ? slot.slug === "adaptation" ? adaptationSummary : dnaPulserSummary(slot.slug, tamerLevel, proficiency)
                  : isDigixrosser ? DIGIXROSSER_SUMMARIES[slot.slug] ?? feature.name
                    : isDigispirited ? "Reaction: counterattack with a skill. On a miss, add the natural roll to AC."
                      : digidestinedSummary(slot.slug, tamerLevel, activeField?.fieldMasteryEffect);
                const dnaLines = isDnaPulser && unlocked ? dnaPulserSummaryLines(slot.slug, tamerLevel, proficiency) : null;
                return <button type="button" className={`tamer-subclass-feature ${slot.className}${unlocked ? "" : " locked"}`}
                  key={slot.slug} disabled={!unlocked} aria-expanded={expandedFeature?.tamerId === id && expandedFeature.slug === slot.slug}
                  onClick={() => setExpandedFeature((current) => current?.tamerId === id && current.slug === slot.slug ? null : { tamerId: id, slug: slot.slug })}>
                  <span className="subclass-feature-content" data-fit>{isDnaPulser
                    ? <><strong>{feature.name}</strong><small>{dnaLines
                      ? <>{dnaLines.map((line) => <span key={line}>{line}</span>)}</>
                      : unlocked ? summary : `Unlocks at level ${feature.levelRequired}`}</small></>
                    : unlocked ? summary : `Unlocks at level ${feature.levelRequired}`}</span>
                </button>;
              })}
            </article>
            {partnerPicker === id && <section className="partner-picker"><div><h3>Add an existing Digimon</h3><div className="partner-choice-list">{props.account && <ExistingPartners tamer={row} onSelect={(digimonId) => void attach(id, { playerDigimonId: digimonId })} />}</div></div><div><h3>Copy from Monster Manual</h3><div className="partner-choice-list">{props.digimon.map((template) => <button key={template.id} disabled={busy} onClick={() => void attach(id, { official: officialPayload(template, Number(row.level)) })}><strong>{template.name}</strong><small>{template.stage}</small></button>)}</div></div></section>}
            {displayedPartners.map((partner) => {
              const digimon = partnerDigimon(partner);
              if (!digimon) return null;
              const bounds = STAGE_BOUNDS[digimon.stage.toLowerCase()] ?? [1, 20];
              const loadout = digimonLoadout(partner.player_digimon, props.items);
              const partnerFeats = digimonFeats(partner.player_digimon, props.feats);
              return <div className="tamer-partner" key={String(partner.id)}><MonsterManual {...props} digimon={[digimon]} initialSelectedSlug={digimon.slug} initialLevel={Number(partner.player_digimon?.level ?? bounds[0])} levelBounds={bounds} embedded hideLevelControl feats={partnerFeats}
                heldItems={loadout.heldItems} heldItemsTemplate={props.heldItemsTemplate}
                enhancementItem={loadout.enhancementItem} enhancementItemsTemplate={props.enhancementItemsTemplate}
                currentHp={partner.player_digimon?.current_hp == null ? null : Number(partner.player_digimon.current_hp)}
                onCurrentHpChange={(value) => updateDigimonTracker(String(partner.player_digimon_id), "current_hp", value)} /></div>;
            })}
              {selectedFeature && tamerLevel >= selectedFeature.levelRequired && !(isDualWielder && selectedFeature.slug === "double-landing" && dualSpecial) && <section className="subclass-feature-details" aria-live="polite">
              <div><span className="eyebrow">{subclass?.name} feature · Level {selectedFeature.levelRequired}</span><h3>{selectedFeature.name}</h3></div>
              <p>{selectedFeature.description}</p>
              {selectedFeature.slug === "field-mastery" && <div className="feature-field-effect"><strong>{activeField?.name ?? "No active Field"}</strong><span>{activeField?.fieldMasteryEffect ?? "Field effect unavailable."}</span></div>}
              {isDnaPulser && selectedFeature.slug === "charging-pulse" && <div className="feature-command-upgrade"><strong>Pulse Evolution</strong><span>{subclassFeatures.find((feature) => feature.slug === "pulse-evolution")?.description}</span></div>}
              {isDnaPulser && selectedFeature.slug === "charging-pulse" && tamerLevel >= 14 && <div className="feature-command-upgrade"><strong>One Core</strong><span>{subclassFeatures.find((feature) => feature.slug === "one-core")?.description}</span></div>}
              {isDnaPulser && selectedFeature.slug === "adaptation" && adaptedFeature && <div className="feature-command-upgrade"><strong>{adaptedFeature.name}</strong><span>{adaptedFeature.description}</span></div>}
              {isDigispirited && isDragonSpirit && <div className="spirit-detail-elements">
                <strong>Strike type</strong>
                <button type="button" aria-pressed={!spiritConfig.elemental_type_id} onClick={() => void saveDigispirited({
                  tamerId: id, selectedFieldId: spiritConfig.selected_field_id, elementalTypeId: null, weapon: weaponPayload(spiritConfig),
                })}>None</button>
                {props.types.map((type) => <button type="button" key={type.id} aria-pressed={spiritConfig.elemental_type_id === type.id} onClick={() => void saveDigispirited({
                  tamerId: id, selectedFieldId: spiritConfig.selected_field_id, elementalTypeId: type.id, weapon: weaponPayload(spiritConfig),
                })}>{type.name}</button>)}
              </div>}
              {tamerLevel >= 14 && commandFeature && ["power-of-friendship", "tamer-inspiration"].includes(selectedFeature.slug) && <div className="feature-command-upgrade"><strong>{commandFeature.name}</strong><span>{commandFeature.description}</span></div>}
              <button type="button" aria-label="Close subclass feature details" onClick={() => setExpandedFeature(null)}>×</button>
              </section>}
            {isDualWielder && expandedFeature?.tamerId === id && expandedFeature.slug === "double-landing" && dualSpecial && <section className="subclass-feature-details dual-special-details" aria-live="polite"><div><span className="eyebrow">Dual Wielder · Level 17</span><h3>{dualSpecial.name}</h3></div><p>{dualSpecial.description || "No description."}</p><div className="dual-special-stats"><span>{dualSpecial.time}</span><span>{dualSpecial.range}</span><span>{dualSpecial.power}</span><span>{dualSpecial.damage}</span><span>{dualSpecial.digislotCost} Digislot</span></div><button type="button" aria-label="Close Double Landing details" onClick={() => setExpandedFeature(null)}>×</button></section>}
            {partners.length > 0 && <section className="partner-management" aria-label="Partner management">{partners.map((partner, index) => {
              const digimon = partnerDigimon(partner);
              const canDedigivolve = Boolean(partner.player_digimon?.parent_digimon_id);
              const canDigivolve = Boolean(digimon) && digimon!.stage.toLowerCase() !== "7th stage";
              return <div className="partner-controls" key={String(partner.id)}><strong>{digimon?.name ?? `Partner ${index + 1}`}</strong><button disabled={index === 0} onClick={() => void movePartner(id, partners, index, -1)}>↑</button><button disabled={index === partners.length - 1} onClick={() => void movePartner(id, partners, index, 1)}>↓</button>{canDedigivolve && <button className="dedigivolution-button" disabled={busy} onClick={() => void switchPartnerForm(id, partner, "down")}>De-Digivolve</button>}{canDigivolve && <button className="digivolution-button" disabled={busy} onClick={() => void switchPartnerForm(id, partner, "up")}>Digivolve</button>}<button className="edit-digimon-link" disabled={busy || !partner.player_digimon_id} onClick={() => props.onEditPartner(String(partner.player_digimon_id))}>Edit</button><button className="partner-remove-button" onClick={() => void removePartner(String(partner.id))}>Remove</button></div>;
            })}</section>}
            <section className="combined-proficiencies saving-throw-table"><h3>Saving Throws</h3><div className="proficiency-groups saving-throw-groups">{ABILITIES.map((ability) => <article className="proficiency-group" key={ability}>
              <h4>{ability.slice(0, 3).toUpperCase()}</h4>
              <div className="compact-skill-row"><strong>{String(row.name)}</strong><span>{signed(modifier(Number(row[ability])) + (tamerSaves.some((save) => save.toLowerCase() === ability.toLowerCase()) ? proficiency : 0))}</span></div>
              {partners.map((partner, index) => {
                const digimon = partnerDigimon(partner);
                const partnerProf = digimonProficiency(Number(partner.player_digimon?.level ?? 1), props.levels);
                const trained = digimon?.savingThrows.some((save) => save.toLowerCase() === ability.toLowerCase());
                return <div className="compact-skill-row" key={String(partner.id)}><strong>{digimon?.name ?? `Partner ${index + 1}`}</strong><span style={{ color: fieldColor(props.fields.find((field) => field.abbreviation === digimon?.field)) }}>{signed(modifier(digimon?.[ability] ?? 10) + (trained ? partnerProf : 0))}</span></div>;
              })}
            </article>)}</div></section>
            <section className="combined-proficiencies"><h3>Proficiency Table</h3><div className="proficiency-groups">{PROFICIENCY_GROUPS.map(({ ability, label }) => {
              const groupedSkills = SKILLS.filter((skill) => SKILL_ABILITIES[skill] === ability);
              return <article className="proficiency-group" key={ability}><h4>{label}</h4>{groupedSkills.map((skill) => {
                const tamerValue = modifier(Number(row[ability])) + (tamerSkills.includes(skill) ? proficiency : 0);
                return <div className="compact-skill-row" key={skill}><strong>{skill}</strong><span title={String(row.name)}>{signed(tamerValue)}</span>{partners.map((partner) => {
                  const digimon = partnerDigimon(partner);
                  const partnerProf = digimonProficiency(Number(partner.player_digimon?.level ?? 1), props.levels);
                  const value = modifier(digimon?.[ability] ?? 10) + (digimon?.proficiencies.includes(skill) ? partnerProf : 0);
                  return <span key={String(partner.id)} title={digimon?.name} style={{ color: fieldColor(props.fields.find((field) => field.abbreviation === digimon?.field)) }}>{signed(value)}</span>;
                })}</div>;
              })}</article>;
            })}</div><div className="proficiency-legend"><span><i />{String(row.name)}</span>{partners.map((partner) => {
              const digimon = partnerDigimon(partner);
              const color = fieldColor(props.fields.find((field) => field.abbreviation === digimon?.field));
              return <span key={String(partner.id)} style={{ color }}><i style={{ background: color }} />{digimon?.name}</span>;
            })}</div></section>
            <section className="tamer-inventory">
              <div className="inventory-heading"><div><span className="eyebrow">Equipment & supplies</span><h3>Tamer Inventory</h3></div><div className="inventory-heading-actions"><button type="button" className="inventory-add-button" onClick={() => setInventoryManager({ tamerId: id, tamerName: String(row.name), initialPanel: "catalog", items: editableInventory(row) })}>Add Item</button><button type="button" className="inventory-custom-button" onClick={() => setInventoryManager({ tamerId: id, tamerName: String(row.name), initialPanel: "custom", items: editableInventory(row) })}>Add Custom Item</button></div></div>
              {(row.player_tamer_items ?? []).length ? <div>{(row.player_tamer_items ?? []).map((entry, index) => {
                const item = entry.item_id == null ? null : props.tamerItems.find((candidate) => candidate.id === Number(entry.item_id));
                const name = item?.name ?? String(entry.custom_name ?? "Custom Item");
                const description = item?.description ?? String(entry.custom_description ?? "");
                const inventory = editableInventory(row);
                const editable = inventory[index];
                return <article className="tamer-inventory-card" key={String(entry.id ?? `${name}-${index}`)}><div className="inventory-item-copy"><strong>{name}</strong>{description && <p>{description}</p>}</div><div className="inventory-inline-controls" aria-label={`${name} controls`}><button type="button" aria-label={`Remove one ${name}`} disabled={busy || Number(entry.quantity) <= 1} onClick={() => void updateInventoryInline(id, inventory.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, quantity: candidate.quantity - 1 } : candidate))}>−</button><span aria-label={`${name} quantity`}>{entry.quantity}</span><button type="button" aria-label={`Add one ${name}`} disabled={busy} onClick={() => void updateInventoryInline(id, inventory.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, quantity: candidate.quantity + 1 } : candidate))}>+</button><button type="button" className="inventory-inline-remove" disabled={busy} onClick={() => void updateInventoryInline(id, inventory.filter((candidate) => candidate.key !== editable.key))}>Remove</button></div></article>;
              })}</div> : <p className="empty-inventory-copy">No tamer items yet.</p>}
            </section>
          </div>}
        </article>;
      })}</div> : <div className="empty-state"><h3>No saved characters yet</h3><p>Add your first tamer to begin.</p></div>}
      {armyManager && <ArmyManager state={armyManager} fields={props.fields} digimon={props.digimon} busy={busy} onChange={setArmyManager} onCancel={() => setArmyManager(null)} onSave={() => void saveArmy()} />}
      {fieldManager && <FieldManager state={fieldManager} fields={props.fields} busy={busy}
        onChange={setFieldManager} onCancel={() => setFieldManager(null)}
        onSave={() => void saveDigispirited({
          tamerId: fieldManager.tamerId, selectedFieldId: fieldManager.fieldId,
          elementalTypeId: fieldManager.config.elemental_type_id,
          weapon: weaponPayload(fieldManager.config),
        })} />}
      {digiArmsManager && <DigiArmsManager state={digiArmsManager} types={props.types} busy={busy}
        onChange={setDigiArmsManager} onCancel={() => setDigiArmsManager(null)}
        onSave={() => void saveDigispirited({
          tamerId: digiArmsManager.tamerId,
          selectedFieldId: digiArmsManager.config.selected_field_id,
          elementalTypeId: digiArmsManager.config.elemental_type_id,
          weapon: weaponPayload(digiArmsManager.config),
        })} />}
      {bondManager && <BondManager state={bondManager} options={props.specialSkillOptions} types={props.types} busy={busy} onCancel={() => setBondManager(null)} onSave={(skill, choices) => void saveBond(skill, choices)} />}
      {adaptationManager && <AdaptationManager state={adaptationManager} features={props.tamerSubclassFeatures.filter((feature) => (DNA_ADAPTATION_FEATURE_SLUGS as readonly string[]).includes(feature.slug))}
        busy={busy} onChange={setAdaptationManager} onCancel={() => setAdaptationManager(null)} onSave={() => void saveAdaptation()} />}
      {inventoryManager && <InventoryManager state={inventoryManager} catalog={props.tamerItems} busy={busy} onChange={setInventoryManager} onCancel={() => setInventoryManager(null)} onSave={() => void saveInventory()} />}
    </div>}
  </section>;
}

function InventoryManager({ state, catalog, busy, onChange, onCancel, onSave }: {
  state: InventoryManagerState; catalog: Item[]; busy: boolean;
  onChange: (state: InventoryManagerState) => void; onCancel: () => void; onSave: () => void;
}) {
  const [showCatalog, setShowCatalog] = useState(state.initialPanel === "catalog");
  const [showCustom, setShowCustom] = useState(state.initialPanel === "custom");
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const addCatalogItem = (item: Item) => {
    const existing = state.items.find((entry) => entry.itemId === item.id);
    onChange({ ...state, items: existing
      ? state.items.map((entry) => entry.key === existing.key ? { ...entry, quantity: entry.quantity + 1 } : entry)
      : [...state.items, { key: `catalog-${item.id}`, itemId: item.id, customName: "", customDescription: "", quantity: 1 }] });
    setShowCatalog(false);
  };
  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    onChange({ ...state, items: [...state.items, { key: `custom-${Date.now()}`, itemId: null, customName: name, customDescription: customDescription.trim(), quantity: 1 }] });
    setCustomName(""); setCustomDescription(""); setShowCustom(false);
  };
  return <div className="army-dialog-backdrop" role="presentation"><section className="army-dialog inventory-dialog" role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title">
    <div className="army-dialog-heading"><div><span className="eyebrow">Tamer inventory</span><h2 id="inventory-dialog-title">{state.tamerName}</h2></div><strong>{state.items.length} entries</strong></div>
    <div className="inventory-add-actions"><button type="button" className="primary-button" onClick={() => { setShowCatalog((value) => !value); setShowCustom(false); }}>Add Item</button><button type="button" onClick={() => { setShowCustom((value) => !value); setShowCatalog(false); }}>Add Custom Item</button></div>
    {showCatalog && <div className="inventory-catalog" aria-label="Tamer item catalog">{catalog.length ? catalog.map((item) => <button type="button" key={item.id} onClick={() => addCatalogItem(item)}><strong>{item.name}</strong><span>{item.description}</span></button>) : <p>No tamer items are available.</p>}</div>}
    {showCustom && <div className="custom-item-form"><label>Name<input maxLength={100} value={customName} onChange={(event) => setCustomName(event.target.value)} /></label><label>Description<textarea maxLength={1000} value={customDescription} onChange={(event) => setCustomDescription(event.target.value)} /></label><button type="button" className="primary-button" disabled={!customName.trim()} onClick={addCustom}>Add Custom Item</button></div>}
    {state.items.length ? <div className="inventory-entry-list">{state.items.map((entry) => {
      const catalogItem = entry.itemId == null ? null : catalog.find((item) => item.id === entry.itemId);
      return <article key={entry.key}><div><strong>{catalogItem?.name ?? entry.customName}</strong><p>{(catalogItem?.description ?? entry.customDescription) || "No description."}</p></div><label>Quantity<input type="number" min="1" max="9999" value={entry.quantity} onChange={(event) => onChange({ ...state, items: state.items.map((item) => item.key === entry.key ? { ...item, quantity: Math.max(1, Number(event.target.value)) } : item) })} /></label><button type="button" className="danger-button" onClick={() => onChange({ ...state, items: state.items.filter((item) => item.key !== entry.key) })}>Remove</button></article>;
    })}</div> : <p className="empty-inventory-copy">No items added yet.</p>}
    <div className="army-dialog-actions"><button type="button" onClick={onCancel} disabled={busy}>Cancel</button><button type="button" className="primary-button" onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save Inventory"}</button></div>
  </section></div>;
}

function AdaptationManager({ state, features, busy, onChange, onCancel, onSave }: {
  state: AdaptationManagerState; features: TamerSubclassFeature[]; busy: boolean;
  onChange: (state: AdaptationManagerState) => void; onCancel: () => void; onSave: () => void;
}) {
  return <div className="army-dialog-backdrop" role="presentation">
    <section className="army-dialog adaptation-dialog" role="dialog" aria-modal="true" aria-labelledby="adaptation-dialog-title">
      <div><span className="eyebrow">DNA Pulser · Level 6</span><h2 id="adaptation-dialog-title">{state.tamerName}&apos;s Adaptation</h2></div>
      <p className="field-help">Choose one primary level-2 feature from another subclass. You can change it later.</p>
      <div className="adaptation-options">
        {features.map((feature) => <button type="button" key={feature.id} className={state.featureId === feature.id ? "selected" : ""}
          aria-pressed={state.featureId === feature.id} onClick={() => onChange({ ...state, featureId: feature.id })}>
          <strong>{feature.name}</strong><span>{feature.description}</span>
        </button>)}
      </div>
      <div className="army-dialog-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" onClick={() => onChange({ ...state, featureId: null })}>Clear</button><button type="button" className="primary-button" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Save Adaptation"}</button></div>
    </section>
  </div>;
}

function weaponPayload(config: DigispiritedConfig) {
  if (!config.weapon_name?.trim()) return null;
  return {
    name: config.weapon_name.trim(),
    damage: String(config.weapon_damage ?? "").trim(),
    power: String(config.weapon_power ?? "strength").toLowerCase(),
    range: String(config.weapon_range ?? "").trim(),
    damageType: String(config.weapon_damage_type ?? "").toLowerCase(),
  };
}

type BondDraft = {
  name: string; description: string; typeId: string; stage: 1 | 2 | 3;
  choices: SpecialChoices; repeats: Record<string, number>;
};

function BondManager({ state, options, types, busy, onCancel, onSave }: {
  state: BondManagerState; options: SpecialSkillOption[]; types: TypeElement[]; busy: boolean;
  onCancel: () => void; onSave: (skill: SpecialSkill, choices: Record<string, unknown>) => void;
}) {
  const stored = state.config.builder_choices ?? {};
  const skill = state.config.special_skill ?? null;
  const [draft, setDraft] = useState<BondDraft>({
    name: String(stored.name ?? skill?.name ?? "Double Landing"),
    description: String(stored.description ?? skill?.description ?? ""),
    typeId: String(stored.typeId ?? ""),
    stage: Math.max(1, Math.min(3, Number(stored.stage ?? 1))) as 1 | 2 | 3,
    choices: stored.choices && typeof stored.choices === "object" ? stored.choices as SpecialChoices : {},
    repeats: stored.repeats && typeof stored.repeats === "object" ? stored.repeats as Record<string, number> : {},
  });
  const selected = useMemo(() => selectedChoiceKeys(draft.choices).map((key) => options.find((option) => option.key === key)).filter((option): option is SpecialSkillOption => Boolean(option)), [draft.choices, options]);
  const repeated = options.filter((option) => (draft.repeats[option.key] ?? 0) > 0);
  const spent = selected.reduce((sum, option) => sum + option.pointCost, 0) + repeated.reduce((sum, option) => sum + option.pointCost * (draft.repeats[option.key] ?? 0), 0);
  const remaining = state.budget - spent;
  const damageOption = selected.find((option) => option.category === "dice_size");
  const damageName = damageOption?.name.trim() ?? "";
  const damageKey = damageOption?.key.toLowerCase() ?? "";
  const hasNoDamage = damageKey === "0_dmg" || damageName === "-";
  const usesDc = damageKey.includes("dc") || damageName.toLowerCase() === "dc";
  const usesNumber = /^\d+$/.test(damageName);
  const allowsType = Boolean(damageOption) && !hasNoDamage && !usesDc && !usesNumber;
  const groups = SPECIAL_CATEGORY_ORDER.filter((category) => options.some((option) => option.category === category) && (category !== "type" || allowsType));
  const choiceName = (category: string) => selected.find((option) => option.category === category)?.name ?? "—";

  function submit() {
    if (!draft.name.trim() || remaining < 0) return;
    const range30 = draft.repeats.add_30ft ?? 0;
    const radius10 = draft.repeats.add_10rd ?? 0;
    const targets = 1 + (draft.repeats.multitarget ?? 0);
    const power = choiceName("skill_power");
    const abilityKey = ({ STR: "strength", DEX: "dexterity", CON: "constitution", INT: "intelligence", WIS: "wisdom", CHA: "charisma" } as Record<string, string>)[power.toUpperCase()];
    const resolved: SpecialSkill = {
      name: draft.name.trim(), description: draft.description.trim(), type: allowsType ? types.find((type) => type.id === draft.typeId)?.name ?? "—" : "—",
      power, time: choiceName("duration"), duration: "Instant", hitType: choiceName("hit_type"),
      range: range30 ? `${range30 * 30}ft${radius10 ? ` (${radius10 * 10}ft radius)` : ""}` : radius10 ? `Self (${radius10 * 10}ft Radius)` : choiceName("range"),
      target: targets > 1 ? `${targets} Targets` : choiceName("target"), critical: choiceName("critical_hit"),
      damage: usesDc ? `DC ${8 + state.proficiency + modifier(state.stats[abilityKey] ?? 10) + ((draft.stage - 1) * 5)}` : hasNoDamage ? "—" : addMatchingDice(damageName || "—", draft.repeats.add_dice ?? 0),
      digislotCost: choiceName("digislot_cost"), effects: selected.filter((option) => option.category === "effect").map((option) => option.name),
    };
    onSave(resolved, { ...draft });
  }

  return <div className="army-dialog-backdrop" role="presentation"><section className="creator-panel bond-dialog" role="dialog" aria-modal="true" aria-labelledby="bond-title">
    <div className={`point-budget${remaining < 0 ? " over" : ""}`}><span>Double Landing points</span><strong>{remaining} / {state.budget}</strong><small>20 + half both partners&apos; WIS modifiers</small></div>
    <div className="bond-dialog-heading"><span className="eyebrow">Dual Wielder · Level 17</span><h2 id="bond-title">{state.tamerName}&apos;s Double Landing</h2></div>
    <div className="form-grid special-heading-grid"><label>Skill Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>{usesDc && <label>Stage<select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: Number(event.target.value) as 1 | 2 | 3 })}><option value="1">Stage I</option><option value="2">Stage II (+5 DC)</option><option value="3">Stage III (+10 DC)</option></select></label>}{allowsType && <label>Element<select value={draft.typeId} onChange={(event) => setDraft({ ...draft, typeId: event.target.value })}><option value="">Untyped</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>}<label className="wide">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div>
    <div className="special-option-grid">{groups.map((category) => <fieldset key={category} data-category={category}><legend>{SPECIAL_CATEGORY_LABELS[category] ?? category}</legend>{options.filter((option) => option.category === category && !option.repeatable).map((option) => { const multiple = category === "effect"; const checked = multiple ? (Array.isArray(draft.choices[category]) ? draft.choices[category] : []).includes(option.key) : draft.choices[category] === option.key; return <label className="option-choice" key={option.id}><input type={multiple ? "checkbox" : "radio"} name={`bond-${category}`} checked={checked} onChange={() => setDraft((current) => ({ ...current, choices: multiple ? toggleMultiChoice(current.choices, category, option.key) : { ...current.choices, [category]: option.key } }))} /><span>{option.name}</span><small>{option.pointCost >= 0 ? "+" : ""}{option.pointCost}</small></label>; })}{options.filter((option) => option.category === category && option.repeatable).map((option) => <label className="repeat-choice" key={option.id}><span>{option.name} ({option.pointCost >= 0 ? "+" : ""}{option.pointCost})</span><input type="number" inputMode="numeric" pattern="[0-9]*" step="1" min="0" max="10" value={draft.repeats[option.key] ?? 0} onKeyDown={numbersOnlyKeyDown} onChange={(event) => { const value = numericCounterValue(event.currentTarget.value, 10); setDraft((current) => ({ ...current, repeats: { ...current.repeats, [option.key]: value } })); }} /></label>)}</fieldset>)}</div>
    <div className="creator-actions"><button onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy || remaining < 0 || !draft.name.trim()} onClick={submit}>{busy ? "Saving…" : "Save Double Landing"}</button></div>
  </section></div>;
}

function FieldManager({ state, fields, busy, onChange, onCancel, onSave }: {
  state: { tamerId: string; tamerName: string; fieldId: number | null; config: DigispiritedConfig };
  fields: Field[]; busy: boolean;
  onChange: (state: { tamerId: string; tamerName: string; fieldId: number | null; config: DigispiritedConfig }) => void;
  onCancel: () => void; onSave: () => void;
}) {
  return <div className="army-dialog-backdrop" role="presentation">
    <section className="army-dialog spirit-field-dialog" role="dialog" aria-modal="true" aria-labelledby="spirit-field-title">
      <div><span className="eyebrow">Bestial Spirit</span><h2 id="spirit-field-title">Choose {state.tamerName}&apos;s Field</h2></div>
      <div className="spirit-field-options">{fields.map((field) => <button type="button" key={field.id}
        aria-pressed={state.fieldId === field.id} onClick={() => onChange({ ...state, fieldId: field.id })}>
        <span>{field.symbol ? <img src={field.symbol} alt="" /> : "?"}</span><strong>{field.name}</strong>
      </button>)}</div>
      <div className="army-dialog-actions"><button onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy || !state.fieldId} onClick={onSave}>{busy ? "Saving…" : "Save Field"}</button></div>
    </section>
  </div>;
}

function DigiArmsManager({ state, types, busy, onChange, onCancel, onSave }: {
  state: DigiArmsManagerState; types: TypeElement[]; busy: boolean;
  onChange: (state: DigiArmsManagerState) => void; onCancel: () => void; onSave: () => void;
}) {
  const config = state.config;
  const update = (patch: Partial<DigispiritedConfig>) => onChange({ ...state, config: { ...config, ...patch } });
  const complete = Boolean(config.weapon_name?.trim() && config.weapon_damage?.trim() && config.weapon_range?.trim()
    && config.weapon_power && config.weapon_damage_type);
  const dragon = state.activeFieldName.toLowerCase() === "dragon's roar";
  return <div className="army-dialog-backdrop" role="presentation">
    <section className="army-dialog digi-arms-dialog" role="dialog" aria-modal="true" aria-labelledby="digi-arms-title">
      <div><span className="eyebrow">Digispirited · Level 14</span><h2 id="digi-arms-title">{state.tamerName}&apos;s Digi-Arms</h2></div>
      <div className="digi-arms-grid">
        <label>Weapon name<input value={config.weapon_name ?? ""} onChange={(event) => update({ weapon_name: event.target.value })} /></label>
        <label>Damage<input placeholder="1d8" value={config.weapon_damage ?? ""} onChange={(event) => update({ weapon_damage: event.target.value })} /></label>
        <label>Power<select value={config.weapon_power ?? "strength"} onChange={(event) => update({ weapon_power: event.target.value })}>{ABILITIES.map((ability) => <option key={ability} value={ability}>{ability.slice(0, 3).toUpperCase()}</option>)}</select></label>
        <label>Range<input placeholder="Melee or 30ft" value={config.weapon_range ?? ""} onChange={(event) => update({ weapon_range: event.target.value })} /></label>
        <label>Damage type<select value={config.weapon_damage_type ?? ""} onChange={(event) => update({ weapon_damage_type: event.target.value })}><option value="">Choose type</option><option value="bludgeoning">Bludgeoning</option><option value="piercing">Piercing</option><option value="slashing">Slashing</option></select></label>
      </div>
      {dragon && <fieldset className="digi-arms-elements"><legend>Dragon&apos;s Roar elemental type</legend><button type="button" aria-pressed={!config.elemental_type_id} onClick={() => update({ elemental_type_id: null })}>None</button>{types.map((type) => <button type="button" key={type.id} aria-pressed={config.elemental_type_id === type.id} onClick={() => update({ elemental_type_id: type.id })}>{type.name}</button>)}</fieldset>}
      <div className="army-dialog-actions"><button onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy || !complete} onClick={onSave}>{busy ? "Saving…" : "Save Digi-Arms"}</button></div>
    </section>
  </div>;
}

function ArmyPortrait({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img className="army-digimon-image" src={src} alt="" onError={() => setFailed(true)} />;
}

function ArmySlot({ member, field, digimon, promoted = false, inactive = false, busy = false, onToggle }: { member: ArmyMember; field?: Field; digimon: Digimon[]; promoted?: boolean; inactive?: boolean; busy?: boolean; onToggle?: () => void }) {
  const officialImage = digimon.find((candidate) => candidate.name.trim().toLowerCase() === member.name.trim().toLowerCase())?.image;
  return <button type="button" className={`army-slot${promoted ? " promoted" : ""}${inactive ? " inactive" : ""}${member.is_xrossed ? " xrossed" : ""}`}
    aria-label={`${member.is_xrossed ? "Un-Xross" : "Xross"} ${member.name}`} aria-pressed={Boolean(member.is_xrossed)}
    title={`${member.is_xrossed ? "Un-Xross" : "Xross"} ${member.name}`} disabled={inactive || busy || !onToggle} onClick={onToggle}>
    <ArmyPortrait src={member.image_path || officialImage} />
    <strong>{member.main_ability.slice(0, 3).toUpperCase()}</strong>
    <span className="army-field-symbol">{field?.symbol ? <img src={field.symbol} alt="" /> : "?"}</span>
  </button>;
}

function ArmyManager({ state, fields, digimon, busy, onChange, onCancel, onSave }: {
  state: ArmyManagerState; fields: Field[]; digimon: Digimon[]; busy: boolean;
  onChange: (state: ArmyManagerState) => void; onCancel: () => void; onSave: () => void;
}) {
  function update(index: number, patch: Partial<ArmyMember>) {
    onChange({ ...state, members: state.members.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member) });
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= state.members.length) return;
    const members = [...state.members]; [members[index], members[target]] = [members[target], members[index]];
    onChange({ ...state, members: members.map((member, slot) => ({ ...member, slot_number: slot + 1 })) });
  }
  return <div className="army-dialog-backdrop" role="presentation">
    <section className="army-dialog" role="dialog" aria-modal="true" aria-labelledby="army-dialog-title">
      <div className="army-dialog-heading"><div><span className="eyebrow">Digixrosser Army</span><h2 id="army-dialog-title">{state.name}&apos;s Army</h2></div><strong>{state.members.length} / {state.capacity}</strong></div>
      <p className="field-help">Slots 1–3 become silver at level 9 and may be up to one stage below the main partner. All other slots are Rookie.</p>
      <div className="army-member-list">{state.members.map((member, index) => {
        const allowedStages = allowedArmyStages(state.level, state.partnerStage, index);
        return <article className="army-member-editor" key={member.id ?? index}>
          <span className={`army-slot-number${state.level >= 9 && index < 3 ? " promoted" : ""}`}>{index + 1}</span>
          <label>Name<input maxLength={40} value={member.name} onChange={(event) => {
            const name = event.target.value.replace(/^./, (letter) => letter.toUpperCase());
            const previousMatch = digimon.find((candidate) => candidate.name.trim().toLowerCase() === member.name.trim().toLowerCase());
            const nextMatch = digimon.find((candidate) => candidate.name.trim().toLowerCase() === name.trim().toLowerCase());
            const canReplaceImage = !member.image_path || member.image_path === previousMatch?.image;
            update(index, { name, ...(canReplaceImage ? { image_path: nextMatch?.image ?? "" } : {}) });
          }} /></label>
          <label>Field<select value={member.field_id} onChange={(event) => update(index, { field_id: Number(event.target.value) })}>{fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
          <label>Main stat<select value={member.main_ability} onChange={(event) => update(index, { main_ability: event.target.value as ArmyMember["main_ability"] })}>{ABILITIES.map((ability) => <option key={ability} value={ability}>{ability.slice(0, 3).toUpperCase()}</option>)}</select></label>
          <label>Stage<select value={allowedStages.includes(member.stage) ? member.stage : "Rookie"} onChange={(event) => update(index, { stage: event.target.value })}>{allowedStages.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
          <label className="army-image-field">Image URL<input type="url" placeholder="Optional; matched by name" value={member.image_path ?? ""} onChange={(event) => update(index, { image_path: event.target.value })} /></label>
          <div className="army-member-actions"><button disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button disabled={index === state.members.length - 1} onClick={() => move(index, 1)}>↓</button><button className="danger-button" onClick={() => onChange({ ...state, members: state.members.filter((_, memberIndex) => memberIndex !== index).map((item, slot) => ({ ...item, slot_number: slot + 1 })) })}>Remove</button></div>
        </article>;
      })}</div>
      <button className="army-add-button" disabled={state.members.length >= state.capacity || !fields.length} onClick={() => onChange({ ...state, members: [...state.members, {
        slot_number: state.members.length + 1, name: "", field_id: fields[0]?.id ?? 0, main_ability: "strength", stage: "Rookie", image_path: "",
      }] })}>Add Army Digimon</button>
      <div className="army-dialog-actions"><button onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy || state.members.some((member) => !member.name.trim())} onClick={onSave}>{busy ? "Saving…" : "Save Army"}</button></div>
    </section>
  </div>;
}

function ExistingPartners({ tamer, onSelect }: { tamer: TamerRow; onSelect: (id: string) => void }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void fetch("/api/player-digimon", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      setRows(Array.isArray(data) ? data : []); setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);
  const attached = new Set((tamer.player_tamer_partners ?? []).map((item) => String(item.player_digimon_id)));
  const available = rows.filter((row) => !row.parent_digimon_id && !attached.has(String(row.id)));
  return <>{available.map((row) => <button key={String(row.id)} onClick={() => onSelect(String(row.id))}><strong>{String(row.name)}</strong><small>Level {String(row.level)}</small></button>)}{loaded && !available.length && <p>No saved Digimon available.</p>}</>;
}
