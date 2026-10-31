import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Loader2, Square, SquareTerminal, X } from "lucide-react";
import type { BackgroundBashTaskView } from "@actspace/shared/runtime-v2";
import { tasksApi } from "../../api/tasks";
import { EnvironmentIcon } from "../messages/BashRunBlock";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import type { BackgroundTaskFocus } from "./RightPanelContext";

// 只列后台 Bash：后台子 Agent 已经在「子 Agent」面板里。登记表只在当前进程里，应用重启前的任务不在列表中。
const POLL_MS = 1000;
const rowClass = "w-full rounded-act-md px-3 py-2.5 text-left hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring";

export function BackgroundTasksPanel({ sessionId, focus }: { sessionId: string | null; focus?: BackgroundTaskFocus }) {
  const [tasks, setTasks] = useState<readonly BackgroundBashTaskView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  // 从消息里的「后台」标签进来：等列表到了再按 taskId 选中，找不到时回到列表并说明。
  const [pendingTask, setPendingTask] = useState(focus?.taskId);
  const [missingTask, setMissingTask] = useState(false);
  useEffect(() => { if (focus) setPendingTask(focus.taskId); }, [focus?.revision]);
  useEffect(() => {
    if (!pendingTask || !loaded) return;
    const found = tasks.some((task) => task.taskId === pendingTask);
    setSelectedId(found ? pendingTask : undefined);
    setMissingTask(!found);
    setPendingTask(undefined);
  }, [pendingTask, loaded, tasks]);
  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const items = await tasksApi.listBackground({ sessionId: sessionId! });
        if (!disposed) { setTasks(items); setLoaded(true); setError(undefined); }
      } catch (cause) { if (!disposed) setError(errorText(cause)); }
      finally { if (!disposed) timer = setTimeout(refresh, POLL_MS); }
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [sessionId]);

  if (!sessionId) return <p className="p-5 text-act-sm text-text-muted">选择会话查看后台任务。</p>;
  if (pendingTask) return <p role="status" className="p-5 text-act-sm text-text-muted">正在加载后台任务…</p>;
  const active = tasks.find((task) => task.taskId === selectedId);
  if (active) {
    return <BackgroundTaskDetail
      sessionId={sessionId}
      task={active}
      onBack={() => setSelectedId(undefined)}
      onTask={(next) => setTasks((current) => current.map((task) => task.taskId === next.taskId ? next : task))}
    />;
  }
  return <section className="h-full overflow-y-auto p-4" aria-label="后台任务列表">
    {error ? <p role="alert" className="mb-3 px-3 text-act-xs text-text-muted">无法加载后台任务：{error}</p> : null}
    {missingTask ? <p role="status" className="mb-3 px-3 text-act-xs text-text-muted">找不到这条后台命令。应用重启前启动的命令不会出现在这里。</p> : null}
    {([true, false] as const).map((running) => {
      const items = tasks.filter((task) => (task.status === "running") === running);
      if (!items.length) return null;
      return <div key={String(running)} className="mb-6"><h2 className="mb-2 px-3 text-act-xs font-normal text-text-faint">{running ? "运行中" : "已结束"} · {items.length}</h2>
        {items.map((task) => <button key={task.taskId} type="button" className={rowClass} onClick={() => { setSelectedId(task.taskId); setMissingTask(false); }}>
          <span className="flex items-start gap-3">
            <SquareTerminal size={15} strokeWidth={1.8} className="mt-0.5 flex-none text-text-faint" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-act-sm text-text-main" title={task.description}>{task.description}</span>
                <EnvironmentIcon sandboxed={task.sandboxed} />
              </span>
              <span className="mt-1 block truncate font-mono text-act-xs text-text-muted" title={task.command}>{task.command}</span>
            </span>
            <TaskStatus task={task} />
          </span>
        </button>)}
      </div>;
    })}
    {loaded && !tasks.length && !error ? <p className="px-3 text-act-sm text-text-muted">这次对话还没有在后台跑的命令。</p> : null}
  </section>;
}

function BackgroundTaskDetail({ sessionId, task, onBack, onTask }: {
  sessionId: string;
  task: BackgroundBashTaskView;
  onBack: () => void;
  onTask: (task: BackgroundBashTaskView) => void;
}) {
  const [text, setText] = useState<string>();
  const [outputError, setOutputError] = useState<string>();
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string>();
  const outputRef = useRef<HTMLPreElement | null>(null);
  const running = task.status === "running";
  // 运行中每秒拉一次输出；结束后再拉一次拿到最后的输出就停。
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const output = await tasksApi.readBackgroundOutput({ sessionId, taskId: task.taskId });
        if (disposed) return;
        setText(output.text);
        setOutputError(undefined);
      } catch (cause) { if (!disposed) setOutputError(errorText(cause)); }
      if (!disposed && running) timer = setTimeout(refresh, POLL_MS);
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [sessionId, task.taskId, running]);
  useEffect(() => {
    const element = outputRef.current;
    if (follow && element) element.scrollTop = element.scrollHeight;
  }, [text, follow]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (text === undefined) return;
    await navigator.clipboard?.writeText(text);
    setCopied(true);
  }
  async function stop() {
    setStopping(true);
    setStopError(undefined);
    try { onTask(await tasksApi.stopBackground({ sessionId, taskId: task.taskId })); }
    catch (cause) { setStopError(errorText(cause)); }
    finally { setStopping(false); }
  }

  const lineCount = text ? text.split("\n").length : 0;
  return <section className="flex h-full min-h-0 flex-col" aria-label="后台任务详情">
    <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
      <IconButton label="返回后台任务列表" tooltip="返回" onClick={onBack}><ArrowLeft size={16} /></IconButton>
      <h2 className="m-0 min-w-0 flex-1 truncate text-act-sm font-medium" title={task.description}>{task.description}</h2>
      <TaskStatus task={task} />
    </header>
    <dl className="m-0 grid shrink-0 grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-5 pb-3 text-act-xs">
      <dt className="text-text-faint">命令</dt>
      <dd className="m-0 font-mono text-text-main [overflow-wrap:anywhere]">{task.command}</dd>
      <dt className="text-text-faint">目录</dt>
      <dd className="m-0 truncate font-mono text-text-muted" title={task.cwd}>{task.cwd}</dd>
      <dt className="text-text-faint">环境</dt>
      <dd className="m-0 flex items-center gap-1.5 text-text-muted"><EnvironmentIcon sandboxed={task.sandboxed} />{task.sandboxed ? "沙盒" : "真实环境"}</dd>
      <dt className="text-text-faint">时间</dt>
      <dd className="m-0 text-text-muted">{running ? `已运行 ${elapsed(task)}` : `运行了 ${elapsed(task)}`}</dd>
    </dl>
    <div className="mx-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-act-md border border-line bg-surface-subtle">
      <div className="flex shrink-0 items-center gap-2 border-b border-line py-1 pr-1 pl-3 text-act-xs text-text-faint">
        <span className="flex-1">输出{text === undefined ? "" : ` · ${lineCount} 行`}</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-text-muted">
          <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
          跟随最新
        </label>
        <IconButton label={copied ? "已复制" : "复制输出"} size="sm" disabled={!text} onClick={() => void copy()}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </IconButton>
      </div>
      <pre ref={outputRef} aria-label="后台命令输出" className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[length:var(--act-font-mono-size,13px)] leading-[1.6] text-text-muted [word-break:break-word]">
        {outputError ? <span role="alert">无法读取输出：{outputError}</span> : text === undefined ? "正在读取输出…" : text || (running ? "还没有输出。" : "没有输出。")}
      </pre>
    </div>
    <footer className="flex shrink-0 items-center gap-3 px-4 py-3 text-act-xs text-text-muted">
      {running ? <>
        <span className="flex-1">{stopError ? <span role="alert" className="text-on-danger">停止失败：{stopError}</span> : "停止后会告诉模型是你停的"}</span>
        <Button variant="danger" busy={stopping} disabled={stopping} onClick={() => void stop()}>
          {stopping ? null : <Square size={11} fill="currentColor" aria-hidden="true" />}停止
        </Button>
      </> : <span>命令已结束。</span>}
    </footer>
  </section>;
}

function TaskStatus({ task }: { task: BackgroundBashTaskView }) {
  const base = "flex flex-none items-center gap-1 text-act-xs tabular-nums";
  if (task.status === "running") {
    return <span className={`${base} text-accent`}><Loader2 size={12} className="animate-spin" aria-hidden="true" />{elapsed(task)}</span>;
  }
  if (task.status === "stopped") return <span className={`${base} text-text-muted`}><Square size={10} fill="currentColor" aria-hidden="true" />已停止</span>;
  if (task.status === "lost") return <span className={`${base} text-text-muted`}>已中断</span>;
  const ok = task.status === "completed" && (task.exitCode ?? 0) === 0;
  const label = typeof task.exitCode === "number" ? `退出 ${task.exitCode}` : ok ? "已完成" : "失败";
  return <span className={`${base} ${ok ? "text-success" : "text-on-danger"}`}>{ok ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}{label}</span>;
}

/** 运行中算到现在，结束了算到结束时间：25s、3:27、1:02:03。 */
function elapsed(task: BackgroundBashTaskView): string {
  const seconds = Math.max(0, Math.floor(((task.endedAt ?? Date.now()) - task.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${minutes}:${pad(seconds % 60)}`;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
