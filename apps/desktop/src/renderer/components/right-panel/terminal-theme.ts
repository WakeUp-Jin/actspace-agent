import type { ITheme } from "@xterm/xterm";

function readToken(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

/**
 * Translate the app's restrained semantic palette into xterm's ANSI protocol
 * colors. Shells still control which ANSI role they emit; ActSpace only
 * controls how that role is rendered inside the app.
 */
export function readTerminalTheme(): ITheme {
  const style = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);
  const foreground = readToken(style, "--act-color-text", bodyStyle.color);
  const background = readToken(style, "--act-color-surface", bodyStyle.backgroundColor);
  const muted = readToken(style, "--act-color-text-muted", foreground);
  const faint = readToken(style, "--act-color-text-faint", muted);
  const operational = readToken(style, "--act-color-operational", foreground);
  const info = readToken(style, "--act-color-info", foreground);
  const warning = readToken(style, "--act-color-warning", foreground);
  const danger = readToken(style, "--act-color-danger", foreground);
  const cyan = readToken(style, "--act-chart-series-2", info);
  const magenta = readToken(style, "--act-chart-series-3", info);

  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: readToken(style, "--act-color-selected", muted),
    black: faint,
    red: readToken(style, "--act-color-on-danger", danger),
    green: operational,
    yellow: readToken(style, "--act-color-on-warning", warning),
    blue: readToken(style, "--act-color-on-info", info),
    magenta,
    cyan,
    white: muted,
    brightBlack: muted,
    brightRed: danger,
    brightGreen: operational,
    brightYellow: warning,
    brightBlue: info,
    brightMagenta: magenta,
    brightCyan: cyan,
    brightWhite: foreground,
  };
}
