## [2026-05-24 18:08] | Task: public release security checklist

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 写一份公共 GitHub 发布前的安全清单，放入 docs 中；顺带检查忽略文件、bash 工具的环境传递边界，以及文档里有没有真实密钥或本地敏感信息。

### 🛠 Changes Overview

**Scope:** `docs`

**Key Actions:**

- **[Checklist]**: 新增公共发布前安全清单，覆盖密钥、忽略规则、日志、文档泄露和运行时边界。
- **[Ignore Rules]**: 收紧 `.gitignore`，补充更多本地环境与临时文件模式，减少误入仓库的路径变体。
- **[Security Note]**: 在安全文档里补充 Bash 工具会把当前进程环境传给子进程这一实现边界。

### 🧠 Design Intent (Why)

公共仓库最怕的不是没有规则，而是规则只存在脑子里。把发布前检查项写成文档，可以让后续每次公开前都用同一套检查清单复核，同时把最容易漏掉的环境文件、日志和运行时敏感边界提前收口。

### 📁 Files Modified

- `docs/security-public-release-checklist.md`
- `docs/SECURITY.md`
- `.gitignore`
