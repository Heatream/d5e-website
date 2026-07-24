const stageRanges: Record<string, readonly [number, number]> = {
  rookie: [1, 4],
  champion: [5, 9],
  ultimate: [10, 14],
  mega: [15, 20],
  "7th stage": [15, 20],
};

export function modifier(score: number) { return Math.floor((score - 10) / 2); }
export function normalizeStage(stage: string) { return stage.trim().toLowerCase().replace(/\s+/g, " "); }
export function stageRange(stage: string) { return stageRanges[normalizeStage(stage)] ?? stageRanges.rookie; }
export function dieSize(die: string) { return Number(die.toLowerCase().match(/\d*d(\d+)/)?.[1] ?? 6); }
export function calculateHp(die: string, level: number, constitution: number) {
  const size = dieSize(die);
  const fullLevels = Math.min(level, 5);
  const halfLevels = Math.max(0, level - 5);
  return Math.max(1, fullLevels * size + halfLevels * (size / 2) + modifier(constitution) * level);
}
export function calculateEvolvedHp(
  parentHpAtEvolution: number,
  die: string,
  parentConstitution: number,
  constitution: number,
  evolvedAtLevel: number,
  requestedLevel: number,
) {
  const anchorLevel = Math.max(1, Math.min(20, evolvedAtLevel));
  const size = dieSize(die);
  let hp = parentHpAtEvolution + (3 * size)
    + ((modifier(constitution) - modifier(parentConstitution)) * anchorLevel);
  for (let level = anchorLevel + 1; level <= requestedLevel; level += 1) {
    hp += (level <= 5 ? size : size / 2) + modifier(constitution);
  }
  return Math.max(1, hp);
}
export function calculateMovement(dexterity: number) {
  const raw = 30 + (modifier(dexterity) / 3) * 5;
  return Math.round(raw / 5) * 5;
}

export function proficiencyNumber(value: string | number | null | undefined) {
  const parsed = Number.parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function abilityScore(power: string | null | undefined, stats: Record<string, number>) {
  const key = String(power ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    str: "strength", strength: "strength", dex: "dexterity", dexterity: "dexterity",
    con: "constitution", constitution: "constitution", int: "intelligence", intelligence: "intelligence",
    wis: "wisdom", wisdom: "wisdom", cha: "charisma", charisma: "charisma",
  };
  return stats[aliases[key] ?? ""] ?? 10;
}

export function calculateSkillDc(
  power: string | null | undefined,
  proficiency: string | number | null | undefined,
  stats: Record<string, number>,
  stage: 1 | 2 | 3,
) {
  return 8 + proficiencyNumber(proficiency) + modifier(abilityScore(power, stats)) + ((stage - 1) * 5);
}
