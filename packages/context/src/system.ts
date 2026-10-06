import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";

export function renderSystemPrompt(systemSections: readonly RuntimeV2JsonValue[], modelFacts: readonly RuntimeV2JsonValue[]): string {
  const sections = systemSections.map(renderSection).filter((section) => section.length > 0);
  if (modelFacts.length > 0) sections.push(`<runtime_facts>\n${JSON.stringify(modelFacts)}\n</runtime_facts>`);
  return sections.join("\n\n");
}

function renderSection(value: RuntimeV2JsonValue): string {
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value);
}
