import { modifier } from "./digimon-rules.ts";

export function dualWielderMaxPartnerPoints(tamerCharisma: number, firstCharisma?: number, secondCharisma?: number, level = 1) {
  return Math.max(0, 1 + modifier(tamerCharisma) + modifier(firstCharisma ?? 10) + (level >= 14 && secondCharisma != null ? modifier(secondCharisma) : 0));
}

export function jogressCurrentHp(firstCurrentHp: number, secondCurrentHp: number) {
  return Math.ceil((Math.max(0, firstCurrentHp) + Math.max(0, secondCurrentHp)) / 2);
}

export function doubleLandingBudget(firstWisdom: number, secondWisdom: number) {
  return 20 + Math.floor((modifier(firstWisdom) + modifier(secondWisdom)) / 2);
}

export function fieldSyncSummary(sameField: boolean) {
  return sameField
    ? "1 PP, Tamer Action and one Partner Action. Double the dice of your other Partner's attacks this turn."
    : "1 PP, Tamer Action and one Partner Action. Your other Partner can have 2 Actions this turn.";
}
