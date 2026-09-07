import { EXPLORE_SUBAGENT_DESCRIPTOR } from "./descriptor.js";
export function exploreSubagentRequest(task: string) { return Object.freeze({ descriptor: EXPLORE_SUBAGENT_DESCRIPTOR, task }); }
