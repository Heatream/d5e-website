import assert from "node:assert/strict";
import test from "node:test";
import { calculateEvolvedHp, calculateHistoryHp, calculateHp, calculateMovement, dieSize, stageRange } from "../app/lib/digimon-rules.ts";
import { getCharacterCreationData, getItems, parseAttachmentReference, parseAttributeHistory, resolveSkillStage } from "../app/lib/supabase.ts";
import { accountEmail, normalizeUsername, validateUsername } from "../app/lib/account-rules.ts";
import {
  addMatchingDice, resolveStoredSpecialDamage, selectedChoiceKeys, toggleMultiChoice,
} from "../app/lib/special-skill-rules.ts";
import { digidestinedSummary } from "../app/lib/tamer-rules.ts";
import { allowedArmyStages, armyCapacity, armyStageRank, armyXrossBonus, armyXrossBonuses } from "../app/lib/digixrosser-rules.ts";
import { digispiritedRange, digispiritedUnarmedDamage, resolveDigispiritedFieldId } from "../app/lib/digispirited-rules.ts";
import { doubleLandingBudget, dualWielderMaxPartnerPoints, fieldSyncSummary, jogressCurrentHp } from "../app/lib/dual-wielder-rules.ts";
import { DNA_ADAPTATION_FEATURE_SLUGS, dnaPulserSummary, dnaPulserSummaryLines } from "../app/lib/dna-pulser-rules.ts";

test("resolves DNA Pulser summaries and approved Adaptations", () => {
  assert.equal(dnaPulserSummary("charging-pulse", 13, 3), "Partner Action. Transfer up to 9 HP to your partner.");
  assert.equal(dnaPulserSummary("charging-pulse", 14, 4), "Free Action. Transfer up to 12 HP to your partner.");
  assert.match(dnaPulserSummary("aggressive-pulse", 6, 3), /Spend 9 HP/);
  assert.match(dnaPulserSummary("saving-pulse", 9, 4), /Spend 12 HP/);
  assert.match(dnaPulserSummary("pulse-break", 17, 6), /Spend 18 HP/);
  assert.deepEqual(dnaPulserSummaryLines("aggressive-pulse", 17, 6), ["Tamer Action. 18 HP; grant advantage", "to one partner attack this turn."]);
  assert.deepEqual(DNA_ADAPTATION_FEATURE_SLUGS, ["power-of-friendship", "fated-encounter", "spirit-evolution", "digimon-army"]);
});

test("resolves Dual Wielder partner rules", () => {
  assert.equal(jogressCurrentHp(11, 12), 12);
  assert.equal(doubleLandingBudget(14, 18), 23);
  assert.equal(dualWielderMaxPartnerPoints(16, 14, 18, 13), 6);
  assert.equal(dualWielderMaxPartnerPoints(16, 14, 18, 14), 10);
  assert.match(fieldSyncSummary(true), /Double the dice/);
  assert.match(fieldSyncSummary(false), /2 Actions/);
});

test("resolves Digispirited Field and strike progression", () => {
  assert.equal(resolveDigispiritedFieldId(8, 4, 2), 2);
  assert.equal(resolveDigispiritedFieldId(9, 4, 2), 4);
  assert.equal(resolveDigispiritedFieldId(9, null, 2), 2);
  assert.equal(resolveDigispiritedFieldId(9, null, null), null);
  assert.equal(digispiritedUnarmedDamage(10), 1);
  assert.equal(digispiritedUnarmedDamage(18), 5);
  assert.equal(digispiritedUnarmedDamage(1), 1);
  assert.equal(digispiritedUnarmedDamage(null), null);
  assert.equal(digispiritedRange("Deep Savers", true), "Self (15ft Radius)");
  assert.equal(digispiritedRange("Wind Guardians", true), "30ft");
  assert.equal(digispiritedRange("Deep Savers", false), "Melee");
  assert.equal(digispiritedRange("Nature Spirits", true, "Reach"), "Reach");
});

test("enforces Digixrosser Army capacity and promoted stages", () => {
  assert.equal(armyCapacity(15, 8), 2);
  assert.deepEqual(allowedArmyStages(8, "Mega", 0), ["Rookie"]);
  assert.deepEqual(allowedArmyStages(9, "Mega", 0), ["Rookie", "Champion", "Ultimate"]);
  assert.deepEqual(allowedArmyStages(9, "Mega", 2), ["Rookie", "Champion", "Ultimate"]);
  assert.deepEqual(allowedArmyStages(9, "Mega", 3), ["Rookie"]);
  assert.deepEqual(allowedArmyStages(17, "7th Stage", 0), ["Rookie", "Champion", "Ultimate", "Mega"]);
  assert.equal(armyStageRank("Champion"), 2);
  assert.equal(armyXrossBonus("Champion"), 10);
  assert.equal(armyXrossBonus("7th Stage"), 25);
  assert.deepEqual(armyXrossBonuses([
    { main_ability: "strength", stage: "Champion", is_xrossed: true },
    { main_ability: "strength", stage: "Rookie", is_xrossed: true },
    { main_ability: "wisdom", stage: "Mega", is_xrossed: false },
  ]), { strength: 15 });
});

test("resolves Digidestined sheet summaries and Tamer Command upgrades", () => {
  assert.match(digidestinedSummary("power-of-friendship", 13), /1d6/);
  assert.equal(digidestinedSummary("power-of-friendship", 13), "1 PP. Add 1d6 to a roll.");
  assert.match(digidestinedSummary("power-of-friendship", 14), /1d10/);
  assert.match(digidestinedSummary("tamer-inspiration", 13), /2d4\+CHA/);
  assert.equal(digidestinedSummary("tamer-inspiration", 13), "1 PP. Heal 2d4+CHA.");
  assert.match(digidestinedSummary("tamer-inspiration", 14), /4d8\+CHA/);
  assert.equal(digidestinedSummary("field-mastery", 6, "Add your proficiency to CON."), "Add your proficiency to CON.");
  assert.equal(digidestinedSummary("field-mastery", 6), "Field effect unavailable.");
});

test("adds matching dice to Special Skill damage", () => {
  assert.equal(addMatchingDice("1d6", 1), "2d6");
  assert.equal(addMatchingDice("1d8", 1), "2d8");
  assert.equal(addMatchingDice("2d10", 2), "4d10");
  assert.equal(addMatchingDice("DC", 1), "DC");
});

test("repairs legacy saved Special Skill dice from builder choices", () => {
  const damageOptions = [
    { key: "1d10_dmg", name: "1d10" },
    { key: "dc_dmg", name: "DC" },
    { key: "0_dmg", name: "-" },
    { key: "fixed_dmg", name: "2" },
  ];
  assert.equal(resolveStoredSpecialDamage("1d10 + 2d6", "1d10_dmg", 2, damageOptions), "3d10");
  assert.equal(resolveStoredSpecialDamage("DC 14", "dc_dmg", 2, damageOptions), "DC 14");
  assert.equal(resolveStoredSpecialDamage("—", "0_dmg", 2, damageOptions), "—");
  assert.equal(resolveStoredSpecialDamage("2", "fixed_dmg", 2, damageOptions), "2");
  assert.equal(resolveStoredSpecialDamage("Malformed", "missing", 2, damageOptions), "Malformed");
});

test("supports multiple independently priced Special Skill effects", () => {
  let choices = toggleMultiChoice({}, "effect", "burn");
  choices = toggleMultiChoice(choices, "effect", "poison");
  assert.deepEqual(selectedChoiceKeys(choices), ["burn", "poison"]);
  choices = toggleMultiChoice(choices, "effect", "burn");
  assert.deepEqual(selectedChoiceKeys(choices), ["poison"]);
});

test("loads readable Special Skills and character item catalogs", async () => {
  const data = await getCharacterCreationData();
  const babyFlame = data.digimon.find((digimon) => digimon.slug === "agumon")?.specialSkills[0];
  assert.equal(babyFlame?.damage, "2d6");
  assert.equal(babyFlame?.power, "Constitution");
  assert.equal(babyFlame?.range, "30ft");
  assert.deepEqual(babyFlame?.types, ["Fire"]);
  const veemonHead = data.digimon.find((digimon) => digimon.slug === "veemon")?.specialSkills[0];
  assert.equal(veemonHead?.digislotCost, "1");
  assert.deepEqual(veemonHead?.types, ["Null"]);
  assert.equal(veemonHead?.effects?.includes("Heal 1/4th of the damage deal, rounded up"), true);
  assert.equal(veemonHead?.options, undefined);
  assert.equal(data.items.filter((item) => item.type.toLowerCase() === "held").length, 13);
  assert.equal(data.items.filter((item) => item.type.toLowerCase() === "enhancement").length, 7);
  assert.equal(data.feats.length, 15);
  assert.equal(data.feats.every((feat) => feat.types.some((type) => type.toLowerCase() === "digimon")), true);
  assert.equal(data.fields.every((field) => /_feat\.png$/i.test(field.featBorder)), true);
  assert.match(data.fields.find((field) => field.name === "Nature Spirits")?.fieldMasteryEffect ?? "", /^Add your proficiency to CON\.?$/);
  assert.equal(data.tamerSubclassFeatures.filter((feature) => feature.subclassId === 1).length >= 6, true);
  assert.match(data.heldItemsTemplate ?? "", /held_item\.(?:png|webp)$/);
  assert.match(data.enhancementItemsTemplate ?? "", /enhancement_item\.(?:png|webp)$/);
});

test("normalizes and validates account usernames", () => {
  assert.equal(normalizeUsername("  Digi   Tamer  "), "digi tamer");
  assert.equal(accountEmail(normalizeUsername("Digi Tamer")), accountEmail(normalizeUsername("digi tamer")));
  assert.match(accountEmail("digi tamer"), /^d5e-[a-f0-9]{64}@accounts\.invalid$/);
  assert.equal(validateUsername("ab").error !== undefined, true);
  assert.equal(validateUsername("Digi!Tamer").error !== undefined, true);
  assert.equal(validateUsername("Digi Tamer").normalized, "digi tamer");
});

test("applies stage level bands", () => {
  assert.deepEqual(stageRange("Rookie"), [1, 4]);
  assert.deepEqual(stageRange("Champion"), [5, 9]);
  assert.deepEqual(stageRange("Ultimate"), [10, 14]);
  assert.deepEqual(stageRange("Mega"), [15, 20]);
  assert.deepEqual(stageRange(" 7th   Stage "), [15, 20]);
  assert.deepEqual(stageRange("Unknown"), [1, 4]);
});

test("calculates progressive HP and movement", () => {
  assert.equal(dieSize("2d20"), 20);
  assert.equal(calculateHp("2d20", 1, 10), 20);
  assert.equal(calculateHp("2d20", 5, 10), 100);
  assert.equal(calculateHp("2d20", 6, 10), 110);
  assert.equal(calculateHp("1d10", 6, 14), 67);
  assert.equal(calculateMovement(10), 30);
  assert.equal(calculateMovement(14), 35);
  assert.equal(calculateMovement(8), 30);
});

test("stacks evolution HP, new dice, and Constitution changes", () => {
  const rookieAtFour = calculateHp("1d6", 4, 10);
  const championAtFour = calculateEvolvedHp(rookieAtFour, "1d6", "1d10", 10, 12, 4, 4);
  assert.equal(championAtFour, rookieAtFour + 18 + 4);
  assert.equal(calculateEvolvedHp(rookieAtFour, "1d6", "1d10", 10, 12, 4, 6), championAtFour + 11 + 6);
  const ultimateAtSix = calculateEvolvedHp(championAtFour + 11 + 6, "1d10", "1d12", 12, 8, 6, 6);
  assert.equal(ultimateAtSix, championAtFour + 17 + 30 - 12);
});

test("uses prior attribute dice across official Digimon stages", () => {
  assert.equal(calculateHistoryHp(["1d8", "1d10"], "champion", 5, 10), 64);
  assert.equal(calculateHistoryHp(["1d8", "1d10"], "champion", 6, 10), 69);
  assert.equal(calculateHistoryHp(["1d6", "1d10", "1d16", "1d20"], "mega", 10, 18), 143);
  assert.equal(calculateHistoryHp(["1d6", "1d10", "1d16", "1d20"], "mega", 15, 24), 296);
});

test("parses dotted attachment references and applies cumulative upgrades", () => {
  const progressive = parseAttachmentReference("fire.heavy-strike.upgrade1.upgrade3", 1);
  assert.ok(progressive);
  assert.equal(progressive.typeToken, "fire");
  assert.equal(progressive.skill, "heavy-strike");
  assert.equal(resolveSkillStage(progressive, 0), 1);
  assert.equal(resolveSkillStage(progressive, 1), 2);
  assert.equal(resolveSkillStage(progressive, 2), 2);
  assert.equal(resolveSkillStage(progressive, 3), 3);

  const stageTwo = parseAttachmentReference("fire.heavy-strike.ii.upgrade2", 2);
  assert.ok(stageTwo);
  assert.equal(resolveSkillStage(stageTwo, 0), 2);
  assert.equal(resolveSkillStage(stageTwo, 2), 3);

  const dcSkill = parseAttachmentReference("STR.charge.upgrade1", 4);
  assert.ok(dcSkill);
  assert.equal(dcSkill.powerOverride, "STR");
  assert.equal(dcSkill.typeToken, null);
});

test("parses official Digimon attributes as an ordered evolution history", () => {
  assert.deepEqual(parseAttributeHistory("vaccine,vaccine,vaccine"), {
    history: ["vaccine", "vaccine", "vaccine"],
    current: "vaccine",
  });
  assert.deepEqual(parseAttributeHistory("vaccine, data, virus"), {
    history: ["vaccine", "data", "virus"],
    current: "virus",
  });
});

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function render(path) {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the complete attachment skill directory", async () => {
  const response = await render("/skills");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Skills \| D5e<\/title>/i);
  assert.match(html, /Attachment Skills/);
  assert.match(html, /Heavy Strike/);
  assert.match(html, /Texture Blow/);
  assert.match(html, /Personality Skills/);
  assert.match(html, /Non-damaging/);
  assert.match(html, /Great Embrace/);
  assert.match(html, /Adoring/);
  assert.match(html, /skill-accordion/);
  assert.match(html, /aria-label="Fire"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("renders a damaging skill with all elemental choices", async () => {
  const response = await render("/skills/heavy-strike");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Heavy Strike \| D5e<\/title>/i);
  assert.match(html, /<dd>STR<\/dd>/);
  assert.match(html, /Choose an element to preview its name and combat effect/);
  for (const type of [
    "Darkness", "Earth", "Fire", "Ice", "Light", "Lightning",
    "Null", "Plant", "Steel", "Water", "Wind",
  ]) {
    assert.match(html, new RegExp(`aria-label="${type}"`));
  }
});

test("renders utility skills without a type selector", async () => {
  const response = await render("/skills/attack-reflection");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, />Utility</);
  assert.doesNotMatch(html, /Choose an element/);
});

test("returns a not-found page for an unknown skill", async () => {
  const response = await render("/skills/not-a-real-skill");
  assert.equal(response.status, 404);
  assert.match(await response.text(), /That skill is not in the compendium/);
});

test("renders the searchable Monster Manual directory before any sheet", async () => {
  const response = await render("/monster-manual");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Monster Manual \| D5e<\/title>/i);
  assert.match(html, /Agumon/);
  assert.match(html, /Gabumon/);
  assert.match(html, /Search Digimon/);
  assert.match(html, /All stages/);
  assert.match(html, /All attributes/);
  assert.match(html, /All fields/);
  assert.match(html, /digimon-directory-grid/);
  assert.doesNotMatch(html, /type="range"/);
  assert.doesNotMatch(html, /class="digimon-sheet"/);
});

test("renders the compact searchable Items directory", async () => {
  const items = await getItems();
  assert.ok(items.length >= 20);
  assert.ok([101, 102, 103].every((id) => items.some((item) => item.id === id)));

  const response = await render("/items");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Items \| D5e<\/title>/i);
  assert.match(html, /ATK Augment Chip/);
  assert.match(html, /Black Digitron/);
  assert.match(html, /Raise STR by proficiency/);
  assert.match(html, /Search by item or effect/);
  assert.match(html, /All types/);
});
