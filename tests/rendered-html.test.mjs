import assert from "node:assert/strict";
import test from "node:test";

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

test("renders the level-scaled monster manual with Supabase assets", async () => {
  const response = await render("/monster-manual");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Monster Manual \| D5e<\/title>/i);
  assert.match(html, /Agumon/);
  assert.match(html, /Baby Flame/);
  assert.match(html, /Fire Heavy Strike/);
  assert.match(html, /assets\/borders\/dr\.webp/);
  assert.match(html, /symbol_vaccine\.webp/);
  assert.match(html, /type="range"/);
  assert.match(html, /max="20"/);
});
