import { createHash, timingSafeEqual } from "node:crypto";

export function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function validateUsername(value: unknown) {
  const display = String(value ?? "").trim().replace(/\s+/g, " ");
  const normalized = normalizeUsername(display);
  if (display.length < 3 || display.length > 24 || !/^[\p{L}\p{N}_ -]+$/u.test(display)) {
    return { error: "Username must be 3–24 characters and use only letters, numbers, spaces, underscores, or hyphens." };
  }
  return { display, normalized };
}

export function accountEmail(normalized: string) {
  return `d5e-${createHash("sha256").update(normalized, "utf8").digest("hex")}@accounts.invalid`;
}

export function secureSecretMatches(candidate: unknown, expected: string | undefined) {
  if (!expected) return false;
  const left = Buffer.from(String(candidate ?? ""));
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
