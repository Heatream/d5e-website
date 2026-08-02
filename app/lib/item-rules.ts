import type { Item } from "./supabase";

export type ItemAbility = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

const ABILITY_BY_TOKEN: Record<string, ItemAbility> = {
  STR: "strength",
  DEX: "dexterity",
  CON: "constitution",
  INT: "intelligence",
  WIS: "wisdom",
  CHA: "charisma",
};

export function itemAbilityBonuses(items: Array<Item | null | undefined>, proficiency: number) {
  const bonuses: Record<ItemAbility, number> = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  };

  items.forEach((item) => {
    const match = item?.description.trim().match(/^raise\s+(STR|DEX|CON|INT|WIS|CHA)\s+by\s+proficiency\.?$/i);
    if (!match) return;
    bonuses[ABILITY_BY_TOKEN[match[1].toUpperCase()]] += Math.max(0, Math.trunc(proficiency));
  });

  return bonuses;
}
