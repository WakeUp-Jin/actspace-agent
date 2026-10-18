import { effortOptionsFor, groupModels } from "../model-options";

it("returns the catalog efforts for a model that supports them", () => {
  expect(effortOptionsFor("openrouter/google/gemini-3.5-flash-lite")).toEqual(["minimal", "low", "medium", "high"]);
});

it("returns [] for unknown models and models without reasoning support", () => {
  expect(effortOptionsFor("mock/mock")).toEqual([]);
  expect(effortOptionsFor("anything/not-in-catalog-123")).toEqual([]);
  expect(effortOptionsFor("")).toEqual([]);
});

it("groups models by provider in host order", () => {
  const groups = groupModels([{ id: "a/x", provider: "a", name: "x" }, { id: "b/y", provider: "b", name: "y" }, { id: "a/z", provider: "a", name: "z" }]);
  expect(groups.map(group => [group.provider, group.models.map(model => model.name)])).toEqual([["a", ["x", "z"]], ["b", ["y"]]]);
});
