import { readFileSync } from "node:fs";

export const PROMPT_ID = "english-learning/v1";
export const PLUGIN_ID = "actspace.english-learning";
export const ENGLISH_LEARNING_PROMPT = readFileSync(new URL("./prompts/english-learning.md", import.meta.url), "utf8").trim();
const marker = `<english-learning version="1" id="${PROMPT_ID}">`;
export const ENGLISH_LEARNING_SECTION = `${marker}\n${ENGLISH_LEARNING_PROMPT}\n</english-learning>`;
