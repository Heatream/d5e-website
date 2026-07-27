export type SkillStage = 1 | 2 | 3;

export type AttachmentSkill = {
  id: string;
  name: string;
  slug: string;
  power: string;
  time: string;
  duration: string;
  range: string;
  description: string;
  damage: string | null;
  stageTwo: string | null;
  stageThree: string | null;
};

export type TypeElement = { id: string; name: string; effect: string };
export type PersonalitySkill = { id: string; name: string; personalities: string[]; description: string };
export type Item = { id: number; name: string; type: string; description: string; slug: string; image: string | null };
export type Feat = { id: number; name: string; types: string[]; description: string };

export type DigimonSkillRef = {
  raw: string;
  slot: number;
  skill: string;
  typeToken: string | null;
  powerOverride: string | null;
  startingStage: SkillStage;
  upgradeOrders: number[];
  valid: boolean;
};

export type SpecialSkill = {
  name: string;
  type: string;
  range: string;
  damage: string;
  description: string;
  power: string;
  time: string;
  duration: string;
  hitType: string;
  target: string;
  critical: string;
  digislotCost: string;
  effects?: string[];
  options?: Record<string, string | string[]>;
  repeats?: Record<string, number>;
  types?: string[];
  stage?: SkillStage;
};

export type Digimon = {
  id: number;
  name: string;
  slug: string;
  attribute: string;
  attributeHistory?: string[];
  field: string;
  stage: string;
  image: string | null;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies: string[];
  savingThrows: string[];
  weakness: string[];
  attachmentSkills: Array<DigimonSkillRef | null>;
  specialSkills: SpecialSkill[];
  personalitySkill: string;
  hpByLevel?: Record<number, number>;
  baseAc?: number;
  parentId?: string | null;
  evolvedAtLevel?: number | null;
};

export type Field = { id: number; name: string; abbreviation: string; symbol: string; border: string; featBorder: string };
export type Attribute = { id: string; name: string; statBuffs: string[]; hpDice: Record<string, string>; image: string };
export type LevelChart = {
  level: number;
  proficiency: string;
  digislot: number;
  attachmentSkill: number;
  savingThrows: number;
  attachmentSkillUpgrade: number;
  asiIncrease: number;
};

export type DigimonStage = {
  id: number;
  name: string;
  slug: string;
  minimumLevel: number;
  maximumLevel: number;
  specialSkillPoints: number;
  baseAc: number;
  specialSkillAmount: number;
  asiIncrease: number;
};

export type SpecialSkillOption = {
  id: number;
  category: string;
  key: string;
  name: string;
  pointCost: number;
  repeatable: boolean;
  prerequisite: string[];
  replaces: string | null;
  maximum: number | null;
};

type SkillRow = {
  id: string; name: string | null; slug: string | null; skill_power: string | null;
  skill_time: string | null; duration: string | null; range: string | null;
  description: string | null; Damage: string | null; stage_ii: string | null; stage_iii: string | null;
};
type TypeRow = { id: string; name: string | null; effect: string | null };
type PersonalityRow = { id: string; name: string | null; personality: string | null; description: string | null };
type ItemRow = {
  id: number | string | null; name: string | null; type: string | null;
  description: string | null; slug: string | null; image: string | null;
};
type AssetRow = { name: string | null; image: string | null };
type DigimonRow = {
  id: number; name: string | null; slug: string | null; attribute: string | null; field: string | null;
  stage: string | null; image: string | null;
  strength: number | string | null; dexterity: number | string | null; constitution: number | string | null;
  intelligence: number | string | null; wisdom: number | string | null; charisma: number | string | null;
  proficiencies: string | null; saving_throws: string | null; weakness: string | null;
  attachment_skill_1: string | null; attachment_skill_2: string | null;
  attachment_skill_3: string | null; attachment_skill_4: string | null;
  special_skill: Record<string, unknown> | Record<string, unknown>[] | null; "personality skill": string | null;
};
type FieldRow = { id: number; name: string | null; abbreviation: string | null; symbol: string | null; border: string | null; feat_border: string | null };
type FeatRow = { id: number | string | null; name: string | null; type: string | null; description: string | null };
type AttributeRow = {
  id: string; name: string | null; "+2 stat buff": string | null; "hp dice rookie": string | null;
  "hp dice champion": string | null; "hp dice ultimate": string | null; "hp dice mega": string | null; image: string | null;
};
type LevelRow = {
  level: number | string | null; proficiency: number | string | null; digislot: number | string | null;
  attachment_skill: number | string | null; saving_throws: number | string | null;
  attachment_skill_upgrade: number | string | null; asi_increase: number | string | null;
};
type DigimonStageRow = {
  id: number; name: string | null; slug: string | null; level_slider_min: number | null;
  level_slider_max: number | null; ss_points: number | null; base_ac: number | null;
  ss_ammount: number | null; asi_increase: number | null;
};
type SpecialSkillOptionRow = {
  id: number; category: string | null; option_key: string | null; name: string | null;
  point_cost: number | null; repeatable: boolean | null; pre_requisite: string | null;
  replaces_option: string | null; maximum_category_option: number | null;
};

const ABILITIES: Record<string, string> = {
  str: "STR", strength: "STR", dex: "DEX", dexterity: "DEX",
  con: "CON", constitution: "CON", int: "INT", intelligence: "INT",
  wis: "WIS", wisdom: "WIS", cha: "CHA", charisma: "CHA",
};

function cleanNullable(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean || null;
}

function text(value: unknown, fallback = "—") {
  return cleanNullable(value) ?? fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function commaList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(commaList);
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function parseAttributeHistory(value: unknown) {
  const history = commaList(value);
  return {
    history,
    current: history.at(-1) ?? text(value),
  };
}

export function normalizeAbility(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return ABILITIES[value.trim().toLowerCase()] ?? null;
}

export function parseAttachmentReference(value: unknown, slot = 1): DigimonSkillRef | null {
  const raw = cleanNullable(value);
  if (!raw) return null;
  const parts = raw.split(".").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { raw, slot, skill: "", typeToken: null, powerOverride: null, startingStage: 1, upgradeOrders: [], valid: false };

  const prefix = parts[0];
  const powerOverride = normalizeAbility(prefix);
  const typeToken = powerOverride || prefix === "-" ? null : prefix;
  const skill = parts[1].toLowerCase();
  let startingStage: SkillStage = 1;
  const upgrades = new Set<number>();
  let valid = Boolean(skill);

  for (const token of parts.slice(2)) {
    const normalized = token.toLowerCase();
    if (normalized === "i") startingStage = 1;
    else if (normalized === "ii") startingStage = 2;
    else if (normalized === "iii") startingStage = 3;
    else {
      const match = normalized.match(/^upgrade([123])$/);
      if (match) upgrades.add(Number(match[1]));
      else valid = false;
    }
  }

  return { raw, slot, skill, typeToken, powerOverride, startingStage, upgradeOrders: [...upgrades].sort(), valid };
}

export function resolveSkillStage(ref: DigimonSkillRef, earnedUpgradeOrder: number): SkillStage {
  const earned = ref.upgradeOrders.filter((order) => earnedUpgradeOrder >= order).length;
  return Math.min(3, ref.startingStage + earned) as SkillStage;
}

function configuration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("D5e data connection is not configured.");
  return { url: url.replace(/\/$/, ""), key };
}

async function request<T>(table: string, query: string): Promise<T> {
  const { url, key } = configuration();
  const response = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?${query}`, {
    headers: { apikey: key },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`D5e data request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

function toSkill(row: SkillRow): AttachmentSkill {
  return {
    id: row.id, name: text(row.name, "Unnamed skill"), slug: text(row.slug, ""),
    power: text(row.skill_power), time: text(row.skill_time), duration: text(row.duration),
    range: text(row.range), description: text(row.description, "No description available."),
    damage: cleanNullable(row.Damage), stageTwo: cleanNullable(row.stage_ii), stageThree: cleanNullable(row.stage_iii),
  };
}

export async function getSkills(): Promise<AttachmentSkill[]> {
  const rows = await request<SkillRow[]>("Attachment Skills", "select=*&order=id.asc");
  return rows.filter((row) => row.slug && row.name).map(toSkill);
}

export async function getSkill(slug: string): Promise<AttachmentSkill | null> {
  const rows = await request<SkillRow[]>("Attachment Skills", `select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`);
  return rows[0] ? toSkill(rows[0]) : null;
}

export async function getTypeElements(): Promise<TypeElement[]> {
  const rows = await request<TypeRow[]>("Type Elements", "select=*&order=id.asc");
  return rows.filter((row) => row.name && row.effect).map((row) => ({ id: row.id, name: text(row.name), effect: text(row.effect) }));
}

export async function getPersonalitySkills(): Promise<PersonalitySkill[]> {
  const rows = await request<PersonalityRow[]>("Personality Skills", "select=*&order=id.asc");
  return rows.filter((row) => row.name && row.personality).map((row) => ({
    id: row.id, name: text(row.name, "Unnamed skill"), personalities: commaList(row.personality),
    description: text(row.description, "No description available."),
  }));
}

function specialSkill(value: Record<string, unknown> | null): SpecialSkill | null {
  if (!value || !cleanNullable(value.name)) return null;
  const rawOptions = value.options && typeof value.options === "object" && !Array.isArray(value.options)
    ? value.options as Record<string, unknown> : null;
  const rawRepeats = value.repeats && typeof value.repeats === "object" && !Array.isArray(value.repeats)
    ? value.repeats as Record<string, unknown> : null;
  const options = rawOptions
    ? Object.entries(rawOptions).reduce<Record<string, string | string[]>>((result, [key, option]) => {
      if (typeof option === "string") result[key] = option;
      if (Array.isArray(option)) {
        const values = option.filter((item): item is string => typeof item === "string");
        if (values.length) result[key] = values;
      }
      return result;
    }, {}) : undefined;
  const repeats = rawRepeats
    ? Object.fromEntries(Object.entries(rawRepeats).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))) : undefined;
  const types = Array.isArray(value.types) ? value.types.filter((item): item is string => typeof item === "string") : undefined;
  const effects = Array.isArray(value.effects)
    ? value.effects.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : typeof value.effect === "string" && value.effect.trim() ? [value.effect.trim()] : undefined;
  const stage = [1, 2, 3].includes(Number(value.stage)) ? Number(value.stage) as SkillStage : undefined;
  const type = cleanNullable(value.type) ?? types?.[0] ?? "-";
  return {
    name: text(value.name), power: text(value.power ?? value.skill_power), time: text(value.time),
    duration: text(value.duration), hitType: text(value.hit_type), range: text(value.range),
    target: text(value.target), type, critical: text(value.critical),
    damage: text(value.damage), description: text(value.description, ""),
    digislotCost: value.digislot_cost === null || value.digislot_cost === undefined ? "—" : String(value.digislot_cost),
    effects, options, repeats, types, stage,
  };
}

function specialSkills(value: DigimonRow["special_skill"]): SpecialSkill[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.map(specialSkill).filter((skill): skill is SpecialSkill => skill !== null).slice(0, 2);
}

export async function getMonsterManualData() {
  const [digimonRows, fieldRows, attributeRows, levelRows, skills, types, personalitySkills] = await Promise.all([
    request<DigimonRow[]>("Digimon", "select=*&order=id.asc"),
    request<FieldRow[]>("Field", "select=*&order=name.asc"),
    request<AttributeRow[]>("Attributes", "select=*&order=name.asc"),
    request<LevelRow[]>("D Level Chart", "select=*&order=level.asc"),
    getSkills(), getTypeElements(), getPersonalitySkills(),
  ]);

  const digimon: Digimon[] = digimonRows.filter((row) => row.name && row.slug).map((row) => {
    const { history: attributeHistory, current: currentAttribute } = parseAttributeHistory(row.attribute);

    return {
      id: row.id, name: text(row.name, "Unnamed Digimon"), slug: text(row.slug, ""),
      attribute: currentAttribute, attributeHistory, field: text(row.field), stage: text(row.stage, "Rookie"),
      image: cleanNullable(row.image), strength: number(row.strength), dexterity: number(row.dexterity),
      constitution: number(row.constitution), intelligence: number(row.intelligence),
      wisdom: number(row.wisdom), charisma: number(row.charisma),
      proficiencies: commaList(row.proficiencies), savingThrows: commaList(row.saving_throws),
      weakness: commaList(row.weakness),
      attachmentSkills: [row.attachment_skill_1, row.attachment_skill_2, row.attachment_skill_3, row.attachment_skill_4]
        .map((reference, index) => parseAttachmentReference(reference, index + 1)),
      personalitySkill: text(row["personality skill"], ""), specialSkills: specialSkills(row.special_skill),
    };
  });

  const fields: Field[] = fieldRows.filter((row) => row.abbreviation).map((row) => ({
    id: row.id, name: text(row.name), abbreviation: text(row.abbreviation), symbol: text(row.symbol, ""),
    border: text(row.border, ""), featBorder: text(row.feat_border, ""),
  }));
  const attributes: Attribute[] = attributeRows.filter((row) => row.name).map((row) => ({
    id: row.id, name: text(row.name), statBuffs: commaList(row["+2 stat buff"]),
    hpDice: {
      rookie: text(row["hp dice rookie"]), champion: text(row["hp dice champion"]),
      ultimate: text(row["hp dice ultimate"]), mega: text(row["hp dice mega"]),
    },
    image: text(row.image, ""),
  }));
  const levels: LevelChart[] = levelRows.map((row) => ({
    level: number(row.level, 1), proficiency: text(row.proficiency, "+2"), digislot: number(row.digislot, 1),
    attachmentSkill: number(row.attachment_skill), savingThrows: number(row.saving_throws, 1),
    attachmentSkillUpgrade: number(row.attachment_skill_upgrade), asiIncrease: number(row.asi_increase),
  }));

  return { digimon, fields, attributes, levels, skills, types, personalitySkills };
}

export async function getItems(): Promise<Item[]> {
  const rows = await request<ItemRow[]>("Items", "select=*&order=id.asc");
  return rows.filter((row) => row.name).map((row) => ({
    id: number(row.id),
    name: text(row.name, "Unnamed Item"),
    type: text(row.type, "Item"),
    description: text(row.description, "No description available."),
    slug: text(row.slug, ""),
    image: cleanNullable(row.image),
  }));
}

export async function getFeats(): Promise<Feat[]> {
  const rows = await request<FeatRow[]>("Feats", "select=*&order=id.asc");
  return rows
    .filter((row) => row.name && commaList(row.type).some((type) => type.toLowerCase() === "digimon"))
    .map((row) => ({
      id: number(row.id),
      name: text(row.name, "Unnamed Feat"),
      types: commaList(row.type),
      description: text(row.description, "No description available."),
    }));
}

export async function getCharacterCreationData() {
  const [manual, stageRows, specialRows, items, feats, itemAssets] = await Promise.all([
    getMonsterManualData(),
    request<DigimonStageRow[]>("Digimon Stage", "select=*&order=id.asc"),
    request<SpecialSkillOptionRow[]>("Special Skill Table", "select=*&order=id.asc"),
    getItems(),
    getFeats(),
    request<AssetRow[]>("Asssets", "select=name,image&name=in.(held_items_border,enhancement_items_border)"),
  ]);
  const stages: DigimonStage[] = stageRows.filter((row) => row.name && row.slug).map((row) => ({
    id: row.id,
    name: text(row.name),
    slug: text(row.slug, "rookie"),
    minimumLevel: number(row.level_slider_min, 1),
    maximumLevel: number(row.level_slider_max, 4),
    specialSkillPoints: number(row.ss_points),
    baseAc: number(row.base_ac, 10),
    specialSkillAmount: number(row.ss_ammount, 1),
    asiIncrease: number(row.asi_increase, 10),
  }));
  const specialSkillOptions: SpecialSkillOption[] = specialRows.filter((row) => row.category && row.option_key && row.name).map((row) => ({
    id: row.id,
    category: text(row.category, ""),
    key: text(row.option_key, ""),
    name: text(row.name),
    pointCost: number(row.point_cost),
    repeatable: Boolean(row.repeatable),
    prerequisite: commaList(row.pre_requisite),
    replaces: cleanNullable(row.replaces_option),
    maximum: row.maximum_category_option === null ? null : number(row.maximum_category_option),
  }));
  return {
    ...manual,
    stages,
    specialSkillOptions,
    feats,
    items: items.filter((item) => ["held", "enhancement"].includes(item.type.trim().toLowerCase())),
    heldItemsTemplate: cleanNullable(itemAssets.find((asset) => asset.name === "held_items_border")?.image),
    enhancementItemsTemplate: cleanNullable(itemAssets.find((asset) => asset.name === "enhancement_items_border")?.image),
  };
}

export function skillStageValue(skill: AttachmentSkill, stage: SkillStage): string | null {
  if (stage === 3) return skill.stageThree;
  if (stage === 2) return skill.stageTwo;
  return skill.damage;
}

export function hasSkillStages(skill: AttachmentSkill) {
  return skill.damage === null || skill.stageTwo !== null || skill.stageThree !== null;
}

export function isDamagingSkill(skill: AttachmentSkill) {
  return [skill.damage, skill.stageTwo, skill.stageThree].some((value) => value !== null && !["", "-", "—", "none"].includes(value.toLowerCase()));
}

export function formatPower(value: string | null | undefined) {
  const abbreviations: Record<string, string> = {
    strength: "STR", dexterity: "DEX", constitution: "CON",
    intelligence: "INT", wisdom: "WIS", charisma: "CHA",
  };
  return (value ?? "—").replace(/\b(strength|dexterity|constitution|intelligence|wisdom|charisma)\b/gi, (match) => abbreviations[match.toLowerCase()]);
}
