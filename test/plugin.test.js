import assert from "node:assert/strict";
import test from "node:test";
import plugin from "../src/index.js";

const models = { "gateway/reasoner": { name: "Reasoner", variants: ["low", "high"] } };

async function registry(options) {
  const providers = new Map();
  const transforms = [];
  await plugin.setup({
    options,
    model: { transform: async (callback) => transforms.push(callback) },
  });

  return {
    transforms,
    add(id, name, ...ids) {
      providers.set(id, {
        provider: { id, name },
        models: ids.map((id) => ({
          id,
          name: id,
          limit: { context: 80_000 },
          variants: [{ id: "original" }],
        })),
      });
    },
    build() {
      const candidates = new Map([...providers].map(([id, value]) => [id, structuredClone(value.models)]));
      for (const transform of transforms) {
        transform({
          provider: { get: (id) => providers.get(id) },
          list: (id) => candidates.get(id) ?? [],
          update: (id, modelID, update) => update(candidates.get(id).find((model) => model.id === modelID)),
        });
      }
      return candidates;
    },
  };
}

test("replaces the variants and name for a known model in the default profile", async () => {
  const state = await registry({ models });
  state.add("personal", "Personal", "gateway/reasoner", "other");
  const [known, unknown] = state.build().get("personal");
  assert.deepEqual(known, {
    id: "gateway/reasoner",
    name: "Personal Reasoner",
    limit: { context: 80_000 },
    variants: [
      { id: "low", settings: { reasoningEffort: "low" } },
      { id: "high", settings: { reasoningEffort: "high" } },
    ],
  });
  assert.equal(unknown.name, "other");
  assert.deepEqual(unknown.variants, [{ id: "original" }]);
});

test("matches both profile ID and name and replays after provider refresh", async () => {
  const state = await registry({ models, profiles: [{ id: "team", name: "Team" }] });
  state.add("personal", "Personal", "gateway/reasoner");
  state.add("unrelated", "Team", "gateway/reasoner");
  state.add("team", "Different", "gateway/reasoner");
  for (const [model] of state.build().values()) assert.equal(model.name, "gateway/reasoner");

  state.add("team", "Team", "gateway/reasoner");
  assert.equal(state.build().get("team")[0].name, "Team Reasoner");
  state.add("team", "Team", "other");
  assert.deepEqual(state.build().get("team").map(({ name }) => name), ["other"]);
});

test("does not register a transform without a catalog or selected profiles", async () => {
  assert.deepEqual((await registry({})).transforms, []);
  assert.deepEqual((await registry({ profiles: [], models })).transforms, []);
});

test("rejects malformed options in setup rather than during registry replay", async () => {
  await assert.rejects(registry({ profiles: [{ id: "team" }], models }), /requires a non-empty id and name/);
  await assert.rejects(registry({ models: { broken: { name: "Broken", variants: ["high", "high"] } } }), /invalid entry for model "broken"/);
});
