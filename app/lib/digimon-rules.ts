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
export function calculateMovement(dexterity: number) {
  const raw = 30 + (modifier(dexterity) / 3) * 5;
  return Math.round(raw / 5) * 5;
}
