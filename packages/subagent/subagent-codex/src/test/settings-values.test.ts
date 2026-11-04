import { describe, expect, it } from "vitest";
import { CODEX_APPROVAL_POLICY_VALUES, CODEX_SANDBOX_VALUES, DEFAULT_EXTERNAL_SUBAGENT_SETTINGS } from "@actspace/shared";
import { CODEX_APPROVAL_POLICIES, CODEX_SANDBOX_MODES, DEFAULT_CODEX_CONFIG } from "../backend.js";

// 桌面设置页（renderer 不能 import 后端包）用 shared 里的取值表；这里钉住它和插件包一致。
describe("Codex 设置取值与 shared 一致", () => {
  it("取值和默认相同", () => {
    expect([...CODEX_APPROVAL_POLICY_VALUES]).toEqual([...CODEX_APPROVAL_POLICIES]);
    expect([...CODEX_SANDBOX_VALUES]).toEqual([...CODEX_SANDBOX_MODES]);
    expect(DEFAULT_EXTERNAL_SUBAGENT_SETTINGS.codex).toEqual(DEFAULT_CODEX_CONFIG);
  });
});
