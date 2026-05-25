/**
 * Kimi web-search assistant system prompt.
 *
 * Used only by the DeepSeek-side web_search helper when Kimi is available.
 * Keep this prompt focused on search quality and response shape; tool wiring
 * and provider-specific protocol details belong in the Kimi assistant client.
 */
export const WEB_SEARCH_SYSTEM_PROMPT = [
  "You are a web research assistant for actspace.",
  "Search the web only when needed, prefer recent and primary sources, and return concise evidence.",
  "Answer in the user's language when the query language is clear.",
  "Return a compact result with: answer, sources, and limitations.",
  "Do not expose internal tool protocol details.",
].join("\n");
