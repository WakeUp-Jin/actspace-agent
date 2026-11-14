## [2026-11-13 21:00] | Task: 修复本地更新「构建出的 Actspace.app 未通过启动前验证」

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI, main checkout, branch fix/python-verify-pycache`

### 📥 User Query

> 设置 › 更新 › 构建并更新，失败：「构建出的 Actspace.app 未通过启动前验证，已保留当前版本。」看看原因并修复。

### 🛠 Changes Overview

**Scope:** `scripts/`、`docs/learnings/`

**Key Actions:**

- **[Python 验证只读]**: `verify-python-runtime.mjs` 的每次调用都带 `-B`，不再往随包 Python 里写 `__pycache__/*.pyc`。
- **[验证后复检签名]**: `release-package.sh` 在 macOS 包内检查（browser components、nono、Python）全部跑完后，按签名方式再 `codesign --verify` 一次。
- **[learning]**: 补进已有的 ad-hoc 签名 learning：签名后在包里跑的东西必须只读。

### 🧠 Design Intent (Why)

`release-package.sh` 先 ad-hoc 签名，再用随包 Python 做导入检查。Python 导入时会写 `.pyc`，一次检查往已签名的包里写了 700 多个文件，签名失效。打包脚本签完名后没有再校验，所以打包成功；本地更新替换前的 `codesign --verify` 报 `a sealed resource is missing or invalid`，拒绝替换。问题从 2026-11-09 随包 Python（`7b41d9b1`）起就存在。

随包 shim 带 `-E`，`PYTHONDONTWRITEBYTECODE` 会被忽略，所以用参数 `-B`。验证后的签名复检让同类问题在打包阶段就失败，而不是等到本地更新。

已验证：对已有构建产物重新 ad-hoc 签名后，跑修改后的脚本，签名仍有效、`.pyc` 为 0；跑 main 上的旧脚本，生成 721 个 `.pyc`，签名报同样错误。

### 📁 Files Modified

- `scripts/verify-python-runtime.mjs`
- `scripts/release-package.sh`
- `docs/learnings/2026-06/electron-ad-hoc-codesign-without-deep.md`
