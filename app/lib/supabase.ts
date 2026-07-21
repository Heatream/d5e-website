export type AttachmentSkill = {
  id: string;
  name: string;
  slug: string;
  power: string;
  time: string;
  duration: string;
  range: string;
  description: string;
  damage: string;
};

export type TypeElement = {
  id: string;
  name: string;
  effect: string;
};

export type PersonalitySkill = {
  id: string;
  name: string;
  personalities: string[];
  description: string;
};

export type DigimonSkillRef = { level: number; skill: string; type: string };
export type SpecialSkill = { name: string; type: string; range: string; damage: string; description: string; power: string };
export type Digimon = {
  id: number; name: string; slug: string; attribute: string; field: string; stage: string; image: string | null;
  strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number;
  proficiencies: string[]; savingThrows: string[]; weakness: string[]; attachmentSkills: DigimonSkillRef[]; specialSkills: SpecialSkill[];
  personalitySkill: string;
};
export type Field = { id: number; name: string; abbreviation: string; symbol: string; border: string };
export type Attribute = { id: string; name: string; statBuffs: string[]; hpDice: Record<string, string>; image: string };
export type LevelChart = { id: string; level: number; proficiency: string; digislot: number };

type SkillRow = {
  id: string;
  name: string | null;
  slug: string | null;
  skill_power: string | null;
  skill_time: string | null;
  duration: string | null;
  range: string | null;
  description: string | null;
  Damage: string | null;
};

type TypeRow = {
  id: string;
  name: string | null;
  effect: string | null;
};

type PersonalityRow = {
  id: string;
  name: string | null;
  personality: string | null;
  description: string | null;
};

type DigimonRow = {
  id: number; name: string | null; slug: string | null; attribute: string | null; field: string | null; Stage: string | null; image: string | null;
  strength: string | null; dexterity: string | null; constitution: string | null; intelligence: string | null; wisdom: string | null; charisma: string | null;
  proficiencies: unknown[] | null; "saving throws": unknown[] | null; weakness: unknown[] | null; "attachment skills": DigimonSkillRef[] | null;
  "Special Skill": Array<{ name?: string; type?: string; range?: string; damage?: string; description?: string; "skill power"?: string }> | null;
  "personality skill": string | null;
};
type FieldRow = { id: number; name: string | null; abbreviation: string | null; symbol: string | null; border: string | null };
type AttributeRow = { id: string; name: string | null; "+2 stat buff": string | null; "hp dice rookie": string | null; "hp dice champion": string | null; "hp dice ultimate": string | null; "hp dice mega": string | null; image: string | null };
type LevelRow = { id: string; level: string | null; proficiency: string | null; digislot: string | null };

function normalizeTextList(value: unknown, objectKeys: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return entry.trim() ? [entry.trim()] : [];
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const match = objectKeys.map((key) => record[key]).find((item) => typeof item === "string" && item.trim());
    return typeof match === "string" ? [match.trim()] : [];
  });
}

function configuration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("D5e data connection is not configured.");
  }

  return { url: url.replace(/\/$/, ""), key };
}

async function request<T>(table: string, query: string): Promise<T> {
  const { url, key } = configuration();
  const response = await fetch(
    `${url}/rest/v1/${encodeURIComponent(table)}?${query}`,
    {
      headers: { apikey: key },
      next: { revalidate: 300 },
    },
  );

  if (!response.ok) {
    throw new Error(`D5e data request failed (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

function text(value: string | null, fallback = "—") {
  const clean = value?.trim();
  return clean || fallback;
}

function toSkill(row: SkillRow): AttachmentSkill {
  return {
    id: row.id,
    name: text(row.name, "Unnamed skill"),
    slug: text(row.slug, ""),
    power: text(row.skill_power),
    time: text(row.skill_time),
    duration: text(row.duration),
    range: text(row.range),
    description: text(row.description, "No description available."),
    damage: text(row.Damage),
  };
}

export async function getSkills(): Promise<AttachmentSkill[]> {
  const rows = await request<SkillRow[]>(
    "Attachment Skills",
    "select=*&order=name.asc",
  );

  return rows.filter((row) => row.slug && row.name).map(toSkill);
}

export async function getSkill(slug: string): Promise<AttachmentSkill | null> {
  const rows = await request<SkillRow[]>(
    "Attachment Skills",
    `select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );

  return rows[0] ? toSkill(rows[0]) : null;
}

export async function getTypeElements(): Promise<TypeElement[]> {
  const rows = await request<TypeRow[]>(
    "Type Elements",
    "select=*&order=name.asc",
  );

  return rows
    .filter((row) => row.name && row.effect)
    .map((row) => ({
      id: row.id,
      name: text(row.name),
      effect: text(row.effect),
    }));
}

export async function getPersonalitySkills(): Promise<PersonalitySkill[]> {
  const rows = await request<PersonalityRow[]>(
    "Personality Skills",
    "select=*&order=name.asc",
  );

  return rows
    .filter((row) => row.name && row.personality)
    .map((row) => ({
      id: row.id,
      name: text(row.name, "Unnamed skill"),
      personalities: text(row.personality, "Uncategorized")
        .split(",")
        .map((personality) => personality.trim())
        .filter(Boolean),
      description: text(row.description, "No description available."),
    }));
}

const number = (value: string | null, fallback = 0) => Number.parseInt(value ?? "", 10) || fallback;

export async function getMonsterManualData() {
  const [digimonRows, fieldRows, attributeRows, levelRows, skills, types, personalitySkills] = await Promise.all([
    request<DigimonRow[]>("Digimon", "select=*&order=name.asc"),
    request<FieldRow[]>("Field", "select=*&order=name.asc"),
    request<AttributeRow[]>("Attributes", "select=*&order=name.asc"),
    request<LevelRow[]>("D Level Chart", "select=*&order=level.asc"),
    getSkills(),
    getTypeElements(),
    getPersonalitySkills(),
  ]);

  const digimon: Digimon[] = digimonRows.filter((row) => row.name && row.slug).map((row) => ({
    id: row.id,
    name: text(row.name, "Unnamed Digimon"),
    slug: text(row.slug, ""),
    attribute: text(row.attribute),
    field: text(row.field),
    stage: text(row.Stage, "Rookie"),
    image: row.image?.trim() || null,
    strength: number(row.strength), dexterity: number(row.dexterity), constitution: number(row.constitution),
    intelligence: number(row.intelligence), wisdom: number(row.wisdom), charisma: number(row.charisma),
    proficiencies: normalizeTextList(row.proficiencies, ["proficiency", "name", "value"]),
    savingThrows: normalizeTextList(row["saving throws"], ["save", "savingThrow", "name", "value"]),
    weakness: normalizeTextList(row.weakness, ["weakness", "type", "name", "value"]),
    attachmentSkills: row["attachment skills"] ?? [],
    personalitySkill: text(row["personality skill"], ""),
    specialSkills: (row["Special Skill"] ?? []).map((skill) => ({
      name: text(skill.name ?? null), type: text(skill.type ?? null, "-"), range: text(skill.range ?? null),
      damage: text(skill.damage ?? null), description: text(skill.description ?? null, ""), power: text(skill["skill power"] ?? null),
    })),
  }));

  const fields: Field[] = fieldRows.filter((row) => row.abbreviation).map((row) => ({
    id: row.id, name: text(row.name), abbreviation: text(row.abbreviation), symbol: text(row.symbol, ""), border: text(row.border, ""),
  }));
  const attributes: Attribute[] = attributeRows.filter((row) => row.name).map((row) => ({
    id: row.id, name: text(row.name),
    statBuffs: text(row["+2 stat buff"], "").split(",").map((item) => item.trim()).filter(Boolean),
    hpDice: { rookie: text(row["hp dice rookie"]), champion: text(row["hp dice champion"]), ultimate: text(row["hp dice ultimate"]), mega: text(row["hp dice mega"]) },
    image: text(row.image, ""),
  }));
  const levels: LevelChart[] = levelRows.map((row) => ({ id: row.id, level: number(row.level, 1), proficiency: text(row.proficiency, "+2"), digislot: number(row.digislot, 1) }));

  return { digimon, fields, attributes, levels, skills, types, personalitySkills };
}

export function isDamagingSkill(skill: AttachmentSkill) {
  const value = skill.damage.trim().toLowerCase();
  return value !== "" && value !== "-" && value !== "—" && value !== "none";
}

export function formatPower(value: string) {
  const abbreviations: Record<string, string> = {
    strength: "STR", dexterity: "DEX", constitution: "CON",
    intelligence: "INT", wisdom: "WIS", charisma: "CHA",
  };
  return value.replace(/\b(strength|dexterity|constitution|intelligence|wisdom|charisma)\b/gi, (match) => abbreviations[match.toLowerCase()]);
}
