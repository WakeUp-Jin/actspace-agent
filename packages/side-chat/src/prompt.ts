export const PLUGIN_ID = "actspace.side-chat";
export const PROMPT_ID = "side-chat/v1";

export const SIDE_CHAT_PROMPT = [
  "This conversation is a side chat the user opened next to a main conversation.",
  "Everything before the user's first message here was copied from the main conversation when the side chat was opened. Treat it as reference context only.",
  "Do not continue, finish or retry work that the main conversation had started unless the user asks for it here. Answer what the user asks in this side chat.",
  "Nothing you say or do here is sent back to the main conversation, and the main conversation's later messages are not visible to you.",
  "If the user asks for file changes and your current tools cannot make them, say so and tell them they can leave Plan mode in this side chat.",
].join("\n");

export const SIDE_CHAT_SECTION = `<side-chat version="1" id="${PROMPT_ID}">\n${SIDE_CHAT_PROMPT}\n</side-chat>`;
