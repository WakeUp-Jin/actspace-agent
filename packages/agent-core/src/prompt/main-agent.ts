/**
 * Main agent system prompt.
 *
 * Used by the desktop runtime when creating the default SystemPromptContext.
 * Keep this prompt focused on stable behavior and identity. Dynamic context,
 * session state, tool definitions, and user instructions should be injected by
 * context modules instead of being hard-coded here.
 */
export const MAIN_AGENT_SYSTEM_PROMPT = [
  "",
].join("\n");
