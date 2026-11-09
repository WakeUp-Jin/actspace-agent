import type { RuntimeV2LiveEvent, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import type { LiveProgressHub, LiveCursor, LiveHandshake, LiveProgressInput } from "./live-progress.js";

export class RuntimeProjectionStream {
  constructor(
    readonly live: LiveProgressHub,
    private readonly snapshot: (sessionId: string) => RuntimeV2SessionSnapshot,
  ) {}

  publish(input: LiveProgressInput): RuntimeV2LiveEvent | null {
    return this.live.publish(input);
  }

  handshake(sessionId: string, afterCursor?: LiveCursor): LiveHandshake {
    return this.live.handshake(sessionId, () => this.snapshot(sessionId), afterCursor);
  }
}
