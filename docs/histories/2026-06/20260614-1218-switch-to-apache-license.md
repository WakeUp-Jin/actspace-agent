## [2026-06-14 12:18] | Task: Switch project license to Apache-2.0

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 将项目许可证调整为 Apache License 2.0，希望允许商用与传播，同时保留项目来源归属。

### Changes Overview

**Scope:** repository metadata and documentation

**Key Actions:**

- **[License]**: Replaced the root MIT license with Apache License 2.0.
- **[Attribution]**: Added a root `NOTICE` file to preserve Actspace project attribution.
- **[Metadata]**: Updated README and package manifests to identify the project license as Apache-2.0.

### Design Intent (Why)

Apache-2.0 keeps Actspace genuinely open source and commercially usable while making attribution, NOTICE preservation, modification notices, patent licensing, and trademark boundaries clearer than MIT.

### Files Modified

- `LICENSE`
- `NOTICE`
- `README.md`
- `package.json`
- `packages/desktop/package.json`
- `packages/shared/package.json`
- `packages/agent-core/package.json`
