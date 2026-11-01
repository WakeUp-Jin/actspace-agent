# Cordis adapter

唯一允许直接接触 DSH Cordis 类型和 exact package family 的 ActSpace boundary。领域 package 只依赖这里的 ActSpace Plugin ABI。

本包封装现有 Cordis/Loader、插件 manifest、behavior/codec 与显式来源加载。旧 `source-loader` 的配置和 integrity 语义保持不变。

## 固定插件产物

`publishPluginArtifact({ sourceRoot, artifactRoot, plugin, files, sharedModules? })` 接受已构建 ESM 和显式文件闭包。每个文件读一次，AST 检查导入，复制到 staging，再按内容身份发布；已有身份先核验再复用。`verifyPluginArtifact` 在准入时重新校验磁盘字节，`importArtifactModule` 只加载已核验产物中列出的模块。发布失败只清理本次 staging，不删除其他产物。

支持 `.mjs` / ESM `.js`、相对静态导入、字面量动态导入及枚举的资源文件；Node builtin 保留。显式共享 Host 模块提供 specifier、文件 URL 和入口 SHA-256，导入改写到该 URL，准入时再次校验；其传递依赖由 Host 负责固定。不要把 Cordis 复制成第二个框架单例。共享 URL 是 Host 环境身份的一部分，不承诺跨机器搬迁后摘要相同；可编辑源目录位置不进入内容身份。

拒绝路径越界、symlink、缺失依赖、未批准的外部导入、非字面量动态导入、直接 require/eval 和原生 `.node` 文件。TypeScript 是现有版本的运行依赖，仅作 AST 解析，不在此编译或打包。调用方必须提供已经构建完成的目录；并发写源目录不具有事务快照保证。

文件清单无法证明任意 JS 的隐藏依赖完整，也不限制任意 `fs` 调用。产物存储由调用方保护为不可变；这是受约束、可信插件的加载协议，不是恶意代码沙箱。相同模块 URL 会共享 ESM 缓存，模块全局可变变量不能承载组合实例状态。释放实例不卸载 ESM 缓存，也不自动删除磁盘产物。

## 隔离组合树

`mountIsolatedCordisTree({ parent, entries, sharedServices, decorate? })` 使用既有 Host root 的 Loader，在独立内存树和 group realm 中装配服务。entry ID 复用 manifest 的 identity 校验规则，`harness` 为内部保留 ID。不同树可有同名服务；本树 provider/consumer 使用普通 Cordis 注入。Host 能力须明确列入 sharedServices，不能与本地提供者重名。

普通 `provide` 在调用前检查 manifest 声明，激活后核验服务与 realm。返回的 `getService` 只查询本树服务；不改 Host baseUrl，不重写 Host Loader 的模块表。scope 由上层通过 decorate 注入，adapter 不依赖 core-scope。需要按 scope 发事件，普通无目标广播仍保持 Cordis 的广播语义。

`dispose()` 幂等并等待本树清理，保留 Host。Cordis 本身会记录部分 teardown 异常而不拒绝 dispose；此入口按树归属捕获这些错误，并以 AggregateError 汇报。它不接管任务取消或 Host 关闭。
