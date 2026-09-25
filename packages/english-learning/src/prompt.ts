import { readFileSync } from "node:fs";
import { renderSystemPrompt, type LogicalRequestCandidate } from "@actspace/prompt";

export const PROMPT_ID = "english-learning/v1";
export const PLUGIN_ID = "actspace.english-learning";
export const ENGLISH_LEARNING_PROMPT = readFileSync(new URL("./prompts/english-learning.md", import.meta.url), "utf8").trim();
const marker = `<english-learning version="1" id="${PROMPT_ID}">`;
const section = `${marker}\n${ENGLISH_LEARNING_PROMPT}\n</english-learning>`;

/** Keep the model-visible prompt and its durable projection in agreement. */
export function injectEnglishLearning<T extends LogicalRequestCandidate>(candidate: T): T {
  const systemSections = [...candidate.systemSections.filter((value) => !(typeof value === "string" && value.startsWith(marker))), section];
  const contributorProvenance = [
    ...candidate.contributorProvenance.filter((value) => !(value && typeof value === "object" && !Array.isArray(value) && "contributorId" in value && value.contributorId === PROMPT_ID)),
    { contributorId: PROMPT_ID, ownerPluginId: PLUGIN_ID, layer: "plugin", promptVersion: 1 },
  ];
  return Object.freeze({ ...candidate, systemSections: Object.freeze(systemSections), contributorProvenance: Object.freeze(contributorProvenance), renderedSystemPrompt: renderSystemPrompt(systemSections, candidate.modelFacts) });
}
