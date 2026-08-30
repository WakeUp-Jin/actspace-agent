import type { RuntimeStateController } from "./runtime-state.js";
export class RestartController { constructor(private readonly state: RuntimeStateController) {} request(reason: string, source: string, candidateDigest?: string): void { this.state.requestRestart(reason, source, candidateDigest); } }
