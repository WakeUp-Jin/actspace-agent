# python-runtime

`@actspace/python-runtime` 让 Host 找到随包的 Python、把它描述给 `bash` 工具，并按需把数据扩展层装到数据目录。它不启动进程，也不含任何 Python 文件：运行时目录由仓库脚本产出，应用只读里面的 `runtime.json`。

公开入口：`.`。

## 两层

| 层 | 内容 | 在哪 |
| --- | --- | --- |
| 核心层（随包） | CPython 3.12（python-build-standalone `install_only_stripped`）+ openpyxl、XlsxWriter、python-docx、python-pptx、lxml、Pillow、pypdf、pdfplumber（带 pypdfium2）及其依赖 | macOS `Contents/Resources/app/runtime/python/`，Linux / Windows `resources/app/runtime/python/` |
| 扩展层（按需） | numpy、pandas、markitdown 及其依赖，wheel 按 sha256 固定 | `<dataRoot>/runtime/python-ext/<digest>/site-packages`，digest 是 wheel sha256 排序后再 sha256 的前 16 位 |

markitdown 进扩展层而不是核心层，是因为它的依赖 magika 会带上 onnxruntime（mac-x64 还有 sympy），不适合随包。

## 产出运行时

- 版本钉在 `lock.json`（`pnpm python-runtime:lock` 重新解析：用 host pip 的 `--dry-run --report` 按五个目标平台各解析一次 wheel 闭包，核心层 = 核心包的依赖闭包，其余归扩展层）。
- `pnpm python-runtime:prepare --target <mac-arm64|mac-x64|linux-x64|linux-arm64|win-x64> [--output dir]` 下载解释器与核心 wheel、校验 sha256、裁掉 tkinter / idlelib / test / pip 等，写 `shim/actspace-python`（Windows 另有 `actspace-python.cmd`）、`sitecustomize.py` 和 `runtime.json`。默认输出 `dist/python-runtime/<target>`；`--layer extension` 则把扩展层装到 `<target>-ext`，供本机验证。
- `pnpm python-runtime:verify <dir> [--extension <dir>]` 用 shim 跑 `--version`、标准库与核心包导入、确认没有 pip 且忽略用户 site。`scripts/release-package.sh` 在每个平台打包后都跑它。
- Linux 目标删掉未被引用的 `lib/libpython3*.so*`（二进制是静态链接）；macOS 要保留 dylib，签名时 `release-package.sh` 对运行时内每个 `.so` / `.dylib` / `bin/*` 单独 codesign，并给解释器加 `scripts/python-runtime/entitlements.plist`。

## 运行时怎么被用

- shim 以 `-E -s -X utf8` 启动解释器：忽略用户的 `PYTHON*` 环境变量和 user site，所以本机装的 Python 包不会漏进来；`ACTSPACE_PYTHON_EXT` 不受 `-E` 影响，由 `sitecustomize.py` 读到后 `site.addsitedir`。
- Host 用 `loadPythonRuntime` / `findBundledPythonRuntime` 定位（桌面端 `apps/desktop/src/main/python-runtime/`，agent-host `resolveNodeHostPythonRuntime`：先 `ACTSPACE_PYTHON_RUNTIME`，再仓库的 `dist/python-runtime/<target>`），再用 `pythonRuntimeForBash` 变成 `BashPythonRuntime` 交给 `@actspace/tool-shell`：每条命令 `PATH` 前置 shim 目录，导出 `ACTSPACE_PYTHON`，扩展层装好后再导出 `ACTSPACE_PYTHON_EXT`。
- `installExtensionLayer` 把 wheel 下载到 `.partial-<uuid>` 暂存目录逐个校验、用自带的最小 ZIP 读取器展开（`.data/purelib|platlib` 折叠、丢 `scripts/data/headers`、跳过 `tests` 与 `__pycache__`），写 `extension.json` 后原子改名，并删掉旧 digest 的层。放在 `<dataRoot>/runtime/python-ext/wheels/` 的同名 wheel 校验通过就不下载，给离线机器用。

## 测试

`pnpm --filter @actspace/python-runtime test`：清单校验、目标映射、定位、ZIP 读取、wheel 安装路径、扩展层下载 / 篡改拒绝 / 离线 wheel。
