export function digidestinedSummary(slug: string, level: number, fieldEffect?: string | null) {
  if (slug === "power-of-friendship") {
    return `1 PP. Add ${level >= 14 ? "1d10" : "1d6"} to a roll.`;
  }
  if (slug === "tamer-inspiration") {
    return `1 PP. Heal ${level >= 14 ? "4d8" : "2d4"}+CHA.`;
  }
  if (slug === "field-mastery") return fieldEffect ?? "Field effect unavailable.";
  if (slug === "crested-strength") return "Use a Special Skill without spending Digislots, then de-Digivolve to the earliest possible stage.";
  if (slug === "adventurer") return "Whenever your partner fails a save, spend 1 PP to automatically pass the save.";
  return "";
}
