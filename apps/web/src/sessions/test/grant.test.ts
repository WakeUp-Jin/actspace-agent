import type { GrantSuggestion } from "@actspace/shared/runtime-v2";
import { commandPrefixGrant, getCommandPrefixGrant } from "../grant";

const suggestion = (selector: unknown, id = "g1"): GrantSuggestion => ({ suggestionId: id, lifetime: "session", action: "process.execute", access: "execute", selector, audience: { pluginId: "p", permissionDomain: "d", policyVersion: 1 }, label: "x" } as GrantSuggestion);

it("builds the prefix from a command_prefix suggestion", () => {
  const found = commandPrefixGrant([suggestion({ kind: "exact", canonicalPath: "/a" }, "f"), suggestion({ kind: "command_prefix", prefix: ["git", "status"], cwdRoot: "/w" }, "c")]);
  expect(found).toMatchObject({ prefix: "git status", suggestion: { suggestionId: "c" } });
});

it("rejects empty or malformed prefixes and returns null without a prefix suggestion", () => {
  expect(getCommandPrefixGrant(suggestion({ kind: "command_prefix", prefix: [], cwdRoot: "/w" }))).toBeNull();
  expect(getCommandPrefixGrant(suggestion({ kind: "command_prefix", prefix: ["git", ""], cwdRoot: "/w" }))).toBeNull();
  expect(commandPrefixGrant([suggestion({ kind: "subtree", canonicalRoot: "/a" })])).toBeNull();
  expect(commandPrefixGrant([])).toBeNull();
});
