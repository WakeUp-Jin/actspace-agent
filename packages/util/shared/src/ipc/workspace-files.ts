// 工作区文件浏览器 IPC（见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`）：
// Markdown 清单与写回、读单个文件、stat、关联应用、用系统应用打开。renderer 不直接读 FS，全部经此 IPC。

/**
 * 取回工作区里全部 Markdown 的相对路径清单（「文档」面板用，见 `docs/design-docs/frontend/front-文档面板规范.md`）。
 * 只有路径，不读内容；renderer 在本地把清单组装成树。renderer 不直接读 FS，全部经此 IPC。
 */
export type WorkspaceListMarkdownFilesInput = {
  /** 工作区根的绝对路径。 */
  workspaceRoot: string;
  /** 用户点了「继续加载」：非 git 遍历用放大的上限再走一遍。 */
  expanded?: boolean;
};

export type WorkspaceListMarkdownFilesResult =
  | {
      ok: true;
      /** 相对 workspaceRoot 的 POSIX 路径，已去重、按路径排序。 */
      files: string[];
      /** 超过篇数上限或遍历项数上限，清单只是前一部分。 */
      truncated: boolean;
      /** 截断时没有走完的目录（相对路径，最多 20 个，按遍历顺序）；没有截断时不给。 */
      incompleteDirs?: string[];
      /** git 仓库用 `git ls-files`（遵守 .gitignore）；否则是有上限的递归遍历，遇到本身是 git 仓库的子目录改用 `git ls-files`。 */
      source: "git" | "walk";
    }
  | { ok: false; error: "not_found" | "not_a_directory" | "escapes_root" };

/** 写回一个已存在的工作区 Markdown 文件（「文档」面板的源码编辑保存）。不新建文件。 */
export type WorkspaceWriteMarkdownFileInput = {
  workspaceRoot: string;
  relativePath: string;
  content: string;
};

export type WorkspaceWriteMarkdownFileResult =
  | { ok: true; mtimeMs: number; size: number }
  | { ok: false; error: "not_found" | "escapes_root" | "not_markdown" | "write_failed" };

/** 读取单个工作区文件，供右侧面板复用现有渲染视图打开。 */
export type WorkspaceReadFileInput = {
  workspaceRoot?: string;
  relativePath: string;
};

/** markdown / image 在应用内渲染；external 只返回 stat，由调用方交给系统打开。 */
export type WorkspaceFileRenderKind = "markdown" | "image" | "external";

/**
 * 文本预览的字节上限：超过就只返回上限内的完整行并置 `truncated`。
 *
 * 放在契约层是因为两侧都要用同一个数：main 用它决定读多少，renderer 要在提示条里
 * 复述「仅显示前 X」。各留一份的话，改了 main 的上限就会让提示文案说谎。
 */
export const WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES = 2 * 1024 * 1024;

export type WorkspaceReadFileResult = {
  relativePath: string;
  renderKind: WorkspaceFileRenderKind;
  /** markdown：UTF-8 文本；image / external：空。 */
  content?: string;
  /** image：data URL（base64）；其余空。 */
  dataUrl?: string;
  /** 文件字节数（磁盘上的完整大小，不因截断而变小）。 */
  size: number;
  /**
   * 文本超过大小上限，`content` 只含上限内的完整行。
   * 消费方必须显式告知用户内容不完整，不能当完整文件对待。
   */
  truncated?: boolean;
  /** 最后修改时间（epoch 毫秒），供右侧面板判断已打开的 Tab 是否过期；错误分支为 0。 */
  mtimeMs: number;
  error?: "not_found" | "not_a_file" | "too_large" | "escapes_root";
};

/**
 * 只取文件的大小与 mtime，不读内容。
 * 右侧面板用它在「Tab 激活 / 窗口重获焦点 / turn 结束」三个时机做 O(1) 新鲜度重校验，
 * 不做轮询；详见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`。
 */
export type WorkspaceStatFileInput = {
  workspaceRoot?: string;
  relativePath: string;
};

export type WorkspaceStatFileResult = {
  relativePath: string;
  size: number;
  mtimeMs: number;
  error?: "not_found" | "not_a_file" | "escapes_root";
};

/**
 * 工作区文件的关联应用（交付卡的「用应用打开」下拉）。只有 macOS 会列出应用；
 * 其他平台返回空列表，前端退回「默认打开 + 在文件夹中显示」。
 */
export type WorkspaceFileApplication = {
  /** 应用包的绝对路径；打开时原样传回，main 会对照当前关联列表再校验一次。 */
  id: string;
  name: string;
  default: boolean;
  /** 32×32 PNG data URL。 */
  iconDataUrl?: string;
};

export type WorkspaceFileApplicationsInput = {
  workspaceRoot?: string;
  relativePath: string;
};

export type WorkspaceFileApplicationsResult = {
  applications: WorkspaceFileApplication[];
  error?: "invalid_target" | "query_failed";
};

export type WorkspaceOpenFileInput = {
  workspaceRoot?: string;
  relativePath: string;
  /** open：用 applicationId 指定的应用打开，不传则用系统默认应用；reveal：在 Finder / 文件夹中显示。 */
  action: "open" | "reveal";
  applicationId?: string;
};

export type WorkspaceOpenFileResult = {
  ok: boolean;
  /** no_application：系统里没有任何应用能打开这个文件（`shell.openPath` 返回了错误串），renderer 据此弹兜底对话框。 */
  error?: "invalid_target" | "not_registered" | "open_failed" | "no_application";
  message?: string;
};
