export function resolveDigispiritedFieldId(level: number, selectedFieldId: number | null | undefined, partnerFieldId: number | null | undefined) {
  return level >= 9 ? selectedFieldId ?? partnerFieldId ?? null : partnerFieldId ?? null;
}

export function digispiritedUnarmedDamage(partnerStrength: number | null | undefined) {
  return partnerStrength == null ? null : Math.max(1, 1 + Math.floor((partnerStrength - 10) / 2));
}

export function digispiritedRange(fieldName: string | null | undefined, unlocked: boolean, configuredRange = "Melee") {
  if (!unlocked) return configuredRange;
  if (fieldName?.toLowerCase() === "deep savers") return "Self (15ft Radius)";
  if (fieldName?.toLowerCase() === "wind guardians") return "30ft";
  return configuredRange;
}
