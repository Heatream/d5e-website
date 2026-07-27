export function addMatchingDice(baseDamage: string, additionalDice: number) {
  const match = baseDamage.trim().match(/^(\d+)d(\d+)$/i);
  if (!match || additionalDice <= 0) return baseDamage;
  return `${Number(match[1]) + additionalDice}d${match[2]}`;
}

export type SpecialChoices = Record<string, string | string[]>;

export function selectedChoiceKeys(choices: SpecialChoices) {
  return Object.values(choices).flatMap((value) => Array.isArray(value) ? value : [value]);
}

export function toggleMultiChoice(choices: SpecialChoices, category: string, key: string) {
  const current = Array.isArray(choices[category]) ? choices[category] : [];
  const next = current.includes(key) ? current.filter((value) => value !== key) : [...current, key];
  return { ...choices, [category]: next };
}

export function resolveStoredSpecialDamage(
  storedDamage: string,
  diceOptionKey: unknown,
  additionalDice: unknown,
  damageOptions: Array<{ key: string; name: string }>,
) {
  if (typeof diceOptionKey !== "string") return storedDamage;
  const baseDamage = damageOptions.find((option) => option.key === diceOptionKey)?.name;
  if (!baseDamage || !/^\d+d\d+$/i.test(baseDamage.trim())) return storedDamage;
  const repeats = Number(additionalDice);
  return addMatchingDice(baseDamage, Number.isFinite(repeats) ? Math.max(0, repeats) : 0);
}
