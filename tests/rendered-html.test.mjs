import assert from "node:assert/strict";
import test from "node:test";
import { calculateHp, calculateMovement, dieSize, stageRange } from "../app/lib/digimon-rules.ts";
import { parseAttachmentReference, resolveSkillStage } from "../app/lib/supabase.ts";

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
  assert.match(html, /digimon-directory-grid/);
  assert.doesNotMatch(html, /type="range"/);
  assert.doesNotMatch(html, /class="digimon-sheet"/);
});
