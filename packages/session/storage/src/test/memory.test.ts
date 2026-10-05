import { createCoreCodecRegistry } from "@actspace/session-journal";
import { MemorySessionStorage } from "../testing/memory-storage.js";
import { storageContract } from "./contract.js";
storageContract("memory", async () => ({ storage: new MemorySessionStorage(createCoreCodecRegistry()), cleanup: async () => undefined }));
