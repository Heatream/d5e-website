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

export function isDamagingSkill(skill: AttachmentSkill) {
  const value = skill.damage.trim().toLowerCase();
  return value !== "" && value !== "-" && value !== "—" && value !== "none";
}
