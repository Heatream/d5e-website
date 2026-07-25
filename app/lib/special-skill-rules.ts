export function addMatchingDice(baseDamage: string, additionalDice: number) {
  const match = baseDamage.trim().match(/^(\d+)d(\d+)$/i);
  if (!match || additionalDice <= 0) return baseDamage;
  return `${Number(match[1]) + additionalDice}d${match[2]}`;
}
