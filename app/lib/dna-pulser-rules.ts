export const DNA_ADAPTATION_FEATURE_SLUGS = [
  "power-of-friendship", "fated-encounter", "spirit-evolution", "digimon-army",
] as const;

export function dnaPulserSummary(slug: string, level: number, proficiency = 2) {
  const hpCost = Math.max(0, Math.trunc(proficiency)) * 3;
  const summaries: Record<string, string> = {
    "charging-pulse": `${level >= 14 ? "Free Action" : "Partner Action"}. Transfer up to ${hpCost} HP to your partner.`,
    "aggressive-pulse": `Tamer Action. Spend ${hpCost} HP; grant advantage to one partner attack.`,
    "saving-pulse": `Reaction. Spend ${hpCost} HP; grant your partner one of your saving-throw proficiencies.`,
    "pulse-break": `Tamer Action. Spend ${hpCost} HP; change a Digimon weakness within 60ft for 1d4 rounds.`,
  };
  return summaries[slug] ?? "";
}

export function dnaPulserSummaryLines(slug: string, level: number, proficiency = 2): [string, string] | null {
  const hpCost = Math.max(0, Math.trunc(proficiency)) * 3;
  const lines: Record<string, [string, string]> = {
    "charging-pulse": [`${level >= 14 ? "Free Action" : "Partner Action"}. Transfer up to ${hpCost} HP`, "to your partner."],
    "aggressive-pulse": [`Tamer Action. ${hpCost} HP; grant advantage`, "to one partner attack this turn."],
    "saving-pulse": [`Reaction. ${hpCost} HP; grant your partner`, "one of your saving-throw proficiencies."],
  };
  return lines[slug] ?? null;
}
