export function parseTrackerExpression(input: string, currentValue: number): number | null {
  const compact = input.replace(/\s+/g, "");
  if (!compact) return null;

  // A leading operator is a convenient relative adjustment: -20 or +5.
  if (/^[+-]\d+$/.test(compact)) return currentValue + Number(compact);
  if (!/^\d+(?:[+-]\d+)*$/.test(compact)) return null;

  const tokens = compact.match(/\d+|[+-]/g);
  if (!tokens?.length) return null;
  let result = Number(tokens[0]);
  for (let index = 1; index < tokens.length; index += 2) {
    const amount = Number(tokens[index + 1]);
    result = tokens[index] === "+" ? result + amount : result - amount;
  }
  return Number.isSafeInteger(result) ? result : null;
}
