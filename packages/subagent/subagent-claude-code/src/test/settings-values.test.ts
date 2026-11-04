import { describe, expect, it } from "vitest";
import { CLAUDE_CODE_PERMISSION_MODE_VALUES, DEFAULT_EXTERNAL_SUBAGENT_SETTINGS } from "@actspace/shared";
import { CLAUDE_CODE_PERMISSION_MODES, DEFAULT_CLAUDE_CODE_CONFIG } from "../backend.js";

// 桌面设置页（renderer 不能 import 后端包）用 shared 里的取值表；这里钉住它和插件包一致。
describe("Claude Code 设置取值与 shared 一致", () => {
  it("取值和默认相同", () => {
    expect([...CLAUDE_CODE_PERMISSION_MODE_VALUES]).toEqual([...CLAUDE_CODE_PERMISSION_MODES]);
    expect(DEFAULT_EXTERNAL_SUBAGENT_SETTINGS.claudeCode).toEqual(DEFAULT_CLAUDE_CODE_CONFIG);
  });
});
