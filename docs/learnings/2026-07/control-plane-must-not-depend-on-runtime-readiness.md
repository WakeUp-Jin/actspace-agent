# 控制面不能依赖运行时已就绪

关联 history：`docs/histories/2026-07/20260725-1916-hide-lab-and-fix-kairos-config-ipc.md`

## 问题

一个可选运行时通常有两类能力：

- 控制面：读写配置、选择模型、查看可用性。
- 数据面：执行循环、发送事件、调用工具、生成通知。

如果把两者的 IPC 都放在运行时 Controller 创建成功之后注册，就会形成循环依赖：

```text
创建 Controller
  需要可用模型
    需要用户打开设置页配置
      需要配置 IPC
        但配置 IPC 等 Controller 创建后才注册
```

最终表现为“未配置的功能永远无法通过 UI 完成首次配置”。

## 模式

按生命周期拆分注册边界：

1. 应用数据目录初始化后，立即注册常驻控制面 IPC。
2. 控制面直接操作持久化配置，不要以运行时对象作为必需依赖。
3. Controller 存在时，配置写入可以额外通知它 reload；Controller 不存在时，持久化成功就是有效结果。
4. 当前置条件变为可用时，支持在当前进程创建运行时，不把重启应用当成隐式初始化步骤。

```ts
registerConfigIpc({
  getController: () => controller,
});

async function writeConfig(input: ConfigInput) {
  await persist(input);
  await controller?.reloadConfig();
}

async function onRuntimePrerequisiteChanged() {
  if (prerequisitesAreReady()) {
    controller ??= await createController();
  }
}
```

## 为什么不创建假 Controller

为未配置状态构造一个假 Controller 看似能保持接口一致，但会混淆“未就绪”和“已停止”两种状态，还需要为工具、事件和持久化行为补大量特判。

更稳定的边界是：控制面始终存在，真实运行时只在前置条件满足时存在。

## 常见陷阱

- **只解耦读取，忘了写入**：首屏不再报错，但保存仍会因 Controller 不存在而失败。
- **配好后仍要重启**：说明前置条件变更只更新了配置，没有驱动运行时生命周期。
- **配置 handler 跟随 Controller dispose**：模型失效或重建期间会再次失去恢复入口。常驻 handler 应只在应用退出时释放。
- **没有首次配置测试**：仅在“Controller 已启动”的测试夹具中验证 IPC，无法发现这类循环依赖。

## 自检

1. 一个全新用户能否在任何运行时对象都不存在时完成首次配置？
2. 运行时因依赖失效被销毁后，配置和修复入口是否仍可用？
3. 前置条件从不可用变为可用时，是否会在当前进程主动创建运行时？
