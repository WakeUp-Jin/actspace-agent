# Tailwind v4 + Vite 插件需要 ESM 配置

## 是什么

Tailwind v4 推荐在 Vite 项目中使用 `@tailwindcss/vite` 插件，并在 CSS 里通过 `@import "tailwindcss";` 引入 Tailwind。这个插件是 ESM-only 包。

如果项目的 `package.json` 没有 `"type": "module"`，并且 Vite 配置文件叫 `vite.config.ts`，Vite 在加载配置时可能会走 CJS 打包路径。这样 ESM-only 插件会在构建时报错：

```text
"@tailwindcss/vite" resolved to an ESM file.
ESM file cannot be loaded by `require`.
```

## 怎么处理

对只想让 Vite config 使用 ESM、但不想影响 Electron main / preload CommonJS 编译的项目，最小做法是把配置文件改成 `.mts`：

```text
packages/desktop/vite.config.ts  ->  packages/desktop/vite.config.mts
```

然后把 renderer tsconfig 的 include 一起改掉：

```json
{
  "include": [
    "src/renderer",
    "src/global.d.ts",
    "vite.config.mts"
  ]
}
```

如果 TypeScript 对 `.d.mts` 类型解析报错，可以在 renderer tsconfig 中使用 Vite 更匹配的解析模式：

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler"
  }
}
```

这不会影响 Electron main 的 `tsconfig.electron.json`，它仍然可以保持 `module: "CommonJS"`。

## 为什么不是直接改 package.json

把整个 `packages/desktop/package.json` 改成 `"type": "module"` 会影响所有 `.js` / `.ts` 产物的默认模块语义，对 Electron main、preload、现有脚本和测试都有更大影响。

`.mts` 的好处是边界很窄：只有 Vite config 是 ESM，其他运行时配置保持原状。

## 自检

- `pnpm --filter @actspace/desktop typecheck` 能通过。
- `pnpm --filter @actspace/desktop build` 能通过。
- 构建日志不再出现 ESM-only package 被 `require` 的报错。
- Electron main / preload 编译仍由 `tsconfig.electron.json` 控制。
