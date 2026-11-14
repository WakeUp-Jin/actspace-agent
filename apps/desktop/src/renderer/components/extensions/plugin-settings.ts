import {
  CLAUDE_CODE_PERMISSION_MODE_VALUES,
  CODEX_APPROVAL_POLICY_VALUES,
  CODEX_SANDBOX_VALUES,
  type SettingsV4Tools,
} from "@actspace/shared";

/** 插件设置项：哪些插件有设置、每项的取值与文案。取值与后端插件包导出的常量一致，由 main 里的测试比对。 */
export type PluginSettingField = {
  /** `PluginListItem.settings` 里的键，也是插件 config 里的键。 */
  key: string;
  title: string;
  description: string;
  options: readonly { value: string; label: string }[];
  /** 把一次修改写成 tools 命名空间的补丁。 */
  patch: (value: string) => Partial<SettingsV4Tools>;
};

export type PluginSettingsSpec = { note: string; fields: readonly PluginSettingField[] };

const labelled = (values: readonly string[], labels: Readonly<Record<string, string>>) =>
  values.map((value) => ({ value, label: `${value} · ${labels[value]}` }));

export const PLUGIN_SETTINGS: Readonly<Record<string, PluginSettingsSpec>> = {
  "subagent-codex": {
    note: "使用本机的 codex 命令行和它自己的权限，不经过 ActSpace 的审批与沙箱。",
    fields: [
      {
        key: "approvalPolicy",
        title: "审批策略",
        description: "Codex 执行命令前是否要审批；子智能体在后台运行，没人点审批，默认从不审批。",
        options: labelled(CODEX_APPROVAL_POLICY_VALUES, {
          untrusted: "不在信任名单的命令要审批",
          "on-request": "Codex 认为需要时审批",
          never: "从不审批",
        }),
        patch: (value) => ({
          externalSubagents: { codex: { approvalPolicy: value as (typeof CODEX_APPROVAL_POLICY_VALUES)[number] } },
        }),
      },
      {
        key: "sandbox",
        title: "沙箱",
        description: "Codex 自己的沙箱范围。",
        options: labelled(CODEX_SANDBOX_VALUES, {
          "read-only": "只读",
          "workspace-write": "可写工作区",
          "danger-full-access": "不限制",
        }),
        patch: (value) => ({
          externalSubagents: { codex: { sandbox: value as (typeof CODEX_SANDBOX_VALUES)[number] } },
        }),
      },
    ],
  },
  "subagent-claude-code": {
    note: "使用本机的 claude 命令行和它自己的权限，不经过 ActSpace 的审批与沙箱。",
    fields: [
      {
        key: "permissionMode",
        title: "权限模式",
        description: "Claude Code 遇到没有授权的操作时怎么处理；默认直接拒绝，不弹审批。",
        options: labelled(CLAUDE_CODE_PERMISSION_MODE_VALUES, {
          dontAsk: "没授权的操作直接拒绝",
          acceptEdits: "自动接受文件修改",
          auto: "自动判断",
          manual: "逐项询问",
          plan: "只做计划",
          bypassPermissions: "跳过全部权限检查",
        }),
        patch: (value) => ({
          externalSubagents: {
            claudeCode: { permissionMode: value as (typeof CLAUDE_CODE_PERMISSION_MODE_VALUES)[number] },
          },
        }),
      },
    ],
  },
};
