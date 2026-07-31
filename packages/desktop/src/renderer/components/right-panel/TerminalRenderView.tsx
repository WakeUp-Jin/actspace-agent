import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { RotateCcw } from "lucide-react";
import { TERMINAL_LIMITS, type TerminalSessionSnapshot } from "@actspace/shared";
import { readTerminalTheme } from "./terminal-theme";
import "@xterm/xterm/css/xterm.css";

function readFont() {
  const style = getComputedStyle(document.documentElement);
  return {
    fontFamily: style.getPropertyValue("--act-font-mono").trim() || getComputedStyle(document.body).fontFamily,
    fontSize: Number.parseFloat(style.getPropertyValue("--act-font-mono-size")) || 13,
  };
}

const terminalTextEncoder = new TextEncoder();

function splitTerminalInput(data: string): string[] {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of data) {
    const characterBytes = terminalTextEncoder.encode(character).byteLength;
    if (bytes + characterBytes > TERMINAL_LIMITS.maxInputBytes && current) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += characterBytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function TerminalRenderView({
  terminalId,
  sessionId,
  shellName,
  onRestart,
}: {
  terminalId: string;
  sessionId: string;
  shellName: string;
  onRestart: (terminal: TerminalSessionSnapshot) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "running" | "exited" | "error">("connecting");
  const [message, setMessage] = useState<string>(`正在连接 ${shellName}`);
  const [restarting, setRestarting] = useState(false);
  const sizeRef = useRef({ cols: 80, rows: 24 });
  const runningRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const font = readFont();
    const terminal = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      lineHeight: 1.35,
      scrollback: 5_000,
      theme: readTerminalTheme(),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);

    let disposed = false;
    let resizeTimer: number | undefined;
    const resize = () => {
      if (disposed || !host.isConnected || host.clientWidth <= 0 || host.clientHeight <= 0) return;
      try {
        fitAddon.fit();
        sizeRef.current = { cols: terminal.cols, rows: terminal.rows };
        void window.actspace.resizeTerminal?.({ terminalId, cols: terminal.cols, rows: terminal.rows });
      } catch {
        // The panel can become zero-sized during a compact-layout transition; the next observer tick retries.
      }
    };
    const scheduleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 40);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleResize);
    observer?.observe(host);

    const unsubscribe = window.actspace.onTerminalEvent?.((event) => {
      const eventTerminalId = event.type === "attached" ? event.terminal.id : event.terminalId;
      if (eventTerminalId !== terminalId) return;
      if (event.type === "attached") {
        setStatus(event.terminal.status === "exited" ? "exited" : "running");
        runningRef.current = event.terminal.status === "running";
        setMessage(event.terminal.status === "exited" ? `已退出 (${event.terminal.exitCode ?? 0})` : event.terminal.shellName);
      } else if (event.type === "init_log") {
        if (event.truncated) terminal.write("\x1b[90m[较早的终端输出已省略]\x1b[0m\r\n");
        terminal.write(event.data);
      } else if (event.type === "data") {
        terminal.write(event.data, () => {
          void window.actspace.ackTerminal?.({ terminalId, bytes: event.bytes });
        });
      } else if (event.type === "exit") {
        setStatus("exited");
        runningRef.current = false;
        setMessage(`进程已退出 (${event.exitCode})`);
        terminal.write(`\r\n\x1b[90m[进程已退出，状态码 ${event.exitCode}]\x1b[0m\r\n`);
      } else if (event.type === "error") {
        setStatus("error");
        runningRef.current = false;
        setMessage(event.error.message);
      }
    }) ?? (() => undefined);

    const inputDisposable = terminal.onData((data) => {
      if (!runningRef.current) return;
      for (const chunk of splitTerminalInput(data)) {
        void window.actspace.writeTerminal?.({ terminalId, data: chunk });
      }
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || !event.metaKey) return true;
      if (event.key.toLowerCase() === "c" && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection());
        return false;
      }
      if (event.key.toLowerCase() === "v") {
        void navigator.clipboard.readText().then((data) => {
          if (data && runningRef.current) {
            for (const chunk of splitTerminalInput(data)) {
              void window.actspace.writeTerminal?.({ terminalId, data: chunk });
            }
          }
        });
        return false;
      }
      return true;
    });

    const applyAppearance = () => {
      const nextFont = readFont();
      terminal.options.theme = readTerminalTheme();
      terminal.options.fontFamily = nextFont.fontFamily;
      terminal.options.fontSize = nextFont.fontSize;
    };
    const themeObserver = new MutationObserver(applyAppearance);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    const colorScheme = window.matchMedia?.("(prefers-color-scheme: dark)");
    colorScheme?.addEventListener?.("change", applyAppearance);

    requestAnimationFrame(() => {
      if (disposed) return;
      try { fitAddon.fit(); } catch { /* measured on the next ResizeObserver tick */ }
      const attach = window.actspace.attachTerminal;
      if (!attach) {
        setStatus("error");
        setMessage("当前桌面版本尚未加载终端桥接。");
        return;
      }
      void attach({ terminalId, cols: terminal.cols, rows: terminal.rows }).then((result) => {
        if (result.ok === false) {
          setStatus("error");
          setMessage(result.error.message);
        } else if (result.terminal.status === "running") {
          runningRef.current = true;
          terminal.focus();
        }
      });
    });

    return () => {
      disposed = true;
      window.clearTimeout(resizeTimer);
      observer?.disconnect();
      themeObserver.disconnect();
      colorScheme?.removeEventListener?.("change", applyAppearance);
      unsubscribe();
      inputDisposable.dispose();
      void window.actspace.detachTerminal?.({ terminalId });
      terminal.dispose();
    };
  }, [terminalId]);

  const restart = async () => {
    if (restarting || !window.actspace.createTerminal) return;
    setRestarting(true);
    try {
      const closed = await window.actspace.closeTerminal?.({ terminalId });
      if (closed && closed.ok === false) {
        setMessage(closed.error.message);
        return;
      }
      const created = await window.actspace.createTerminal({ sessionId, ...sizeRef.current });
      if (created.ok === false) {
        setMessage(created.error.message);
        return;
      }
      onRestart(created.terminal);
    } finally {
      setRestarting(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface" aria-label={`终端 ${shellName}`}>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden px-2 py-2 [&_.xterm]:h-full" />
      <div className="flex min-h-7 shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-subtle px-2.5 text-[11px] text-text-faint">
        <span className="min-w-0 truncate">{message}</span>
        <div className="flex shrink-0 items-center gap-2">
          {status === "exited" || status === "error" ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-act-sm border-0 bg-transparent px-1.5 py-0.5 text-text-muted hover:bg-hover-overlay hover:text-text-main disabled:opacity-45 [cursor:pointer]"
              disabled={restarting}
              onClick={() => void restart()}
            >
              <RotateCcw size={11} strokeWidth={2} />
              {restarting ? "重启中" : "重启"}
            </button>
          ) : null}
          <span data-terminal-status={status}>{status}</span>
        </div>
      </div>
    </section>
  );
}
