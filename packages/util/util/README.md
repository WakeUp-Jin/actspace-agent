# Utility package

状态：保留的最小公共包。当前源码只有 `assertNever`；本轮源码、测试、动态入口和契约矩阵扫描没有发现消费者，因此不把“暂无消费者”直接等同于可删除。

退役条件：确认 workspace manifest、动态导入、构建配置和外部包入口都不再需要 `@actspace/util`，并补一轮 clean-checkout typecheck/build 与契约矩阵证据后，才可删除包和对应矩阵条目。
