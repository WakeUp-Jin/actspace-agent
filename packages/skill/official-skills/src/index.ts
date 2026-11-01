import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
export const OFFICIAL_SKILLS_VERSION = "1";
// Resolve as Node resources. A new URL asset expression is rewritten by renderer tooling.
export const officialSkillsRoot = join(dirname(fileURLToPath(import.meta.url)), "../skills");
export const pluginDevelopmentRoot = join(officialSkillsRoot, "actspace-plugin-development");
