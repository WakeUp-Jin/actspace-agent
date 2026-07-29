# Astro 预渲染读取仓库文件时，路径基准属于构建产物

## 问题

Astro 静态页面可以在构建阶段读取 monorepo 根目录的 Markdown，并把内容预渲染进 HTML。但如果使用下面的方式计算路径：

```ts
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
return path.resolve(currentDirectory, "../../../../docs/roadmap.md");
```

源码检查可能通过，真正执行 `astro build` 时却可能读取到错误位置。

## 原因

预渲染阶段执行的是 Astro/Vite 生成的模块，而不是原始 TypeScript 文件。此时 `import.meta.url` 可能位于：

```text
packages/site/dist/.prerender/chunks/*.mjs
```

因此相对路径的起点是构建产物目录。源码文件原本位于 `src/lib` 还是 `src/lib/roadmap`，不会自动保留为运行时路径语义。

## 稳定做法

把数据源路径解析放在一个目录深度明确的独立模块中，并同时验证两种执行环境：

```text
源码测试：packages/site/src/lib/roadmap/source-path.ts
构建执行：packages/site/dist/.prerender/chunks/*.mjs
```

路径层级需要在这两个位置都能回到仓库根目录。仅测试纯解析函数不够，还要增加一次真实数据源加载测试，并运行生产构建：

```ts
it("loads the repository roadmap source", async () => {
  const result = await loadRoadmap();
  expect(result.length).toBeGreaterThan(0);
});
```

```sh
pnpm test:site
pnpm build:site
```

## 核心要点

- `astro check` 验证类型和模板诊断，不保证构建期文件路径正确。
- 纯 parser 单测不会执行 `readFile`，因此无法发现数据源定位错误。
- `import.meta.url` 的含义取决于实际执行的模块位置；打包后的模块可能改变路径基准。
- 仓库外部 Markdown 是构建输入，至少需要“真实加载测试 + production build”两层验证。

这个问题来自公开开发计划页面的实现，完成记录见 `docs/histories/2026-07/20260729-1140-public-roadmap-page.md`。
