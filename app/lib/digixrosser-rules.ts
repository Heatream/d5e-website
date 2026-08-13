export const ARMY_STAGES = ["Rookie", "Champion", "Ultimate", "Mega", "7th Stage"] as const;

export function abilityModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

export function armyCapacity(tamerCharisma: number, partnerCharisma: number) {
  return Math.max(0, 1 + abilityModifier(tamerCharisma) + abilityModifier(partnerCharisma));
}

export function allowedArmyStages(tamerLevel: number, partnerStage: string, zeroBasedSlot: number): string[] {
  if (tamerLevel < 9 || zeroBasedSlot >= 3) return ["Rookie"];
  const partnerIndex = Math.max(0, ARMY_STAGES.findIndex((stage) => stage.toLowerCase() === partnerStage.toLowerCase()));
  return ARMY_STAGES.slice(0, Math.max(1, partnerIndex));
}

export function armyStageRank(stage: string) {
  const index = ARMY_STAGES.findIndex((candidate) => candidate.toLowerCase() === stage.trim().toLowerCase());
  return index < 0 ? 1 : index + 1;
}

export function armyXrossBonus(stage: string) {
  return armyStageRank(stage) * 5;
}

export function armyXrossBonuses(members: Array<{ main_ability: string; stage: string; is_xrossed?: boolean }>) {
  const bonuses: Record<string, number> = {};
  for (const member of members) {
    if (!member.is_xrossed) continue;
    const ability = member.main_ability.trim().toLowerCase();
    bonuses[ability] = (bonuses[ability] ?? 0) + armyXrossBonus(member.stage);
  }
  return bonuses;
}
