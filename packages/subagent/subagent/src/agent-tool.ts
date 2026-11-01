import { AGENT_SUBAGENT_DESCRIPTOR } from "./descriptor.js";
export function agentSubagentRequest(task: string) { return Object.freeze({ descriptor: AGENT_SUBAGENT_DESCRIPTOR, task }); }
