import { Model, Plugin } from "@opencode/plugin";

const defaultProfiles = [{ id: "personal", name: "Personal" }];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function readProfiles(value = defaultProfiles) {
  if (!Array.isArray(value)) throw new Error("Neuron Model Variants: profiles must be an array");

  const profiles = new Map();
  for (const profile of value) {
    if (!isObject(profile) || !isNonEmptyString(profile.id) || !isNonEmptyString(profile.name)) {
      throw new Error("Neuron Model Variants: each profile requires a non-empty id and name");
    }
    if (profiles.has(profile.id)) throw new Error(`Neuron Model Variants: duplicate profile ${profile.id}`);
    profiles.set(profile.id, profile.name);
  }
  return profiles;
}

function readCatalog(value = {}) {
  if (!isObject(value)) throw new Error("Neuron Model Variants: models must be an object keyed by model ID");

  const catalog = new Map();
  for (const [id, definition] of Object.entries(value)) {
    if (!isNonEmptyString(id) || !isObject(definition) || !isNonEmptyString(definition.name)
      || !Array.isArray(definition.variants)
      || !definition.variants.every(isNonEmptyString)
      || new Set(definition.variants).size !== definition.variants.length) {
      throw new Error(`Neuron Model Variants: invalid entry for model ${JSON.stringify(id)}; expected a name and unique variant strings`);
    }
    catalog.set(id, definition);
  }
  return catalog;
}

export default Plugin.define({
  id: "neuron-model-variants",
  async setup(ctx) {
    const profiles = readProfiles(ctx.options.profiles);
    const catalog = readCatalog(ctx.options.models);
    if (profiles.size === 0 || catalog.size === 0) return;

    // Model transforms run after provider sources are resolved, including after inventory refreshes.
    await ctx.model.transform((editor) => {
      for (const [providerID, profileName] of profiles) {
        if (editor.provider.get(providerID)?.provider.name !== profileName) continue;

        for (const model of editor.list(providerID)) {
          const definition = catalog.get(model.id);
          if (!definition) continue;

          editor.update(providerID, model.id, (draft) => {
            draft.name = `${profileName} ${definition.name}`;
            draft.variants = definition.variants.map((effort) => ({
              id: Model.VariantID.make(effort),
              settings: { reasoningEffort: effort },
            }));
          });
        }
      }
    });
  },
});
