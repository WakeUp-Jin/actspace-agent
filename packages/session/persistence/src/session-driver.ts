/** Session lifecycle needs no backend layout or writer implementation. */
export type SessionPersistenceDriver = Pick<import("@actspace/session-storage").SessionStorageHandle, "append" | "flush" | "assertOwned" | "close">;
