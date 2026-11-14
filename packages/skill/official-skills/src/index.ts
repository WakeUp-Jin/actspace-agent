import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
export const OFFICIAL_SKILLS_VERSION = "2";
// Resolve as Node resources. A new URL asset expression is rewritten by renderer tooling.
export const officialSkillsRoot = join(dirname(fileURLToPath(import.meta.url)), "../skills");
export const pluginDevelopmentRoot = join(officialSkillsRoot, "actspace-plugin-development");
/** Skills that teach the model to script against the bundled `actspace-python` runtime. */
export const SCRIPTING_SKILL_IDS = Object.freeze([
  "office-docx",
  "office-xlsx",
  "office-pptx",
  "pdf",
  "data-analysis",
] as const);
