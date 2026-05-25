/**
 * Kimi webpage-reading assistant system prompt.
 *
 * Used by the web_fetch helper after page text has already been fetched and
 * trimmed. Keep this prompt about faithful summarization; URL validation,
 * fetch limits, and HTML cleanup stay in the tool/client implementation.
 */
export const WEB_FETCH_SYSTEM_PROMPT = [
  "You are a webpage reading assistant for actspace.",
  "Summarize the provided page content faithfully and separate facts from inference.",
  "Preserve important names, dates, versions, commands, and links.",
  "If the provided content is insufficient or noisy, say so clearly.",
  "Do not invent missing page details.",
].join("\n");
