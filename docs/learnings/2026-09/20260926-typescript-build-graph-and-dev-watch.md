# 增量构建的两个边界

TypeScript 的增量编译只有在项目边界稳定时才可靠。把每个 workspace 包作为一个 composite project，用 `tsc -b` 按依赖边构建，编译器可以用 `.tsbuildinfo` 判断哪些包仍然有效；开发时再用同一张图启动 `--watch`，源文件修改只会触发受影响的项目。

## 为什么依赖图要从 manifest 派生

手写一份长期维护的 `references` 很容易在新增 workspace 包后过期。这里的生成脚本读取 `package.json` 的 workspace 依赖，做拓扑排序并生成每个包的 build config；`--check` 让 CI 或本地检查能发现配置漂移。这样依赖声明仍然只有一个来源。

## 开发和发布必须有不同入口

开发入口保留 `dist`，通过 `.tsbuildinfo` 复用结果，并常驻依赖、bundle 和资源监听。发布入口先清理再构建，避免删除源文件后旧的 JavaScript 或声明文件残留在制品里。把发布构建也改成“永不清理”会让增量速度更快，却会把过期文件带进安装包。

## 常见陷阱

- 只开启 `incremental` 而没有 `references`，跨包变更仍可能重复检查整个依赖闭包。
- 只监听 TypeScript，忘记 Client 的 esbuild bundle 或运行时复制的 prompt 资源。
- 用独立的手写包列表替代 workspace manifest，新增依赖后项目图静默失真。
- 只验证 warm build，不验证 clean build，无法发现残留产物问题。

自检：新增一个 workspace 依赖后，生成脚本是否能发现它？删除一个导出文件后，清理构建是否仍能产生不含旧文件的 `dist`？
