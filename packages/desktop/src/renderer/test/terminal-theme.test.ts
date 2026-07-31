import { afterEach, describe, expect, it } from "vitest";
import { readTerminalTheme } from "../components/right-panel/terminal-theme";

const terminalTokens = {
  "--act-color-text": "rgb(32, 32, 30)",
  "--act-color-surface": "rgb(255, 255, 255)",
  "--act-color-selected": "rgb(228, 228, 225)",
  "--act-color-text-muted": "rgb(103, 103, 98)",
  "--act-color-text-faint": "rgb(114, 114, 107)",
  "--act-color-operational": "rgb(8, 122, 75)",
  "--act-color-info": "rgb(57, 120, 184)",
  "--act-color-on-info": "rgb(49, 95, 142)",
  "--act-color-warning": "rgb(145, 96, 14)",
  "--act-color-on-warning": "rgb(122, 80, 10)",
  "--act-color-danger": "rgb(199, 71, 71)",
  "--act-color-on-danger": "rgb(169, 58, 58)",
  "--act-chart-series-2": "rgb(75, 145, 157)",
  "--act-chart-series-3": "rgb(122, 104, 173)",
} as const;

afterEach(() => {
  for (const name of Object.keys(terminalTokens)) {
    document.documentElement.style.removeProperty(name);
  }
});

describe("readTerminalTheme", () => {
  it("maps all ANSI roles to the ActSpace semantic and restrained chart palette", () => {
    for (const [name, value] of Object.entries(terminalTokens)) {
      document.documentElement.style.setProperty(name, value);
    }

    expect(readTerminalTheme()).toMatchObject({
      foreground: terminalTokens["--act-color-text"],
      background: terminalTokens["--act-color-surface"],
      black: terminalTokens["--act-color-text-faint"],
      red: terminalTokens["--act-color-on-danger"],
      green: terminalTokens["--act-color-operational"],
      yellow: terminalTokens["--act-color-on-warning"],
      blue: terminalTokens["--act-color-on-info"],
      magenta: terminalTokens["--act-chart-series-3"],
      cyan: terminalTokens["--act-chart-series-2"],
      white: terminalTokens["--act-color-text-muted"],
      brightBlack: terminalTokens["--act-color-text-muted"],
      brightRed: terminalTokens["--act-color-danger"],
      brightGreen: terminalTokens["--act-color-operational"],
      brightYellow: terminalTokens["--act-color-warning"],
      brightBlue: terminalTokens["--act-color-info"],
      brightMagenta: terminalTokens["--act-chart-series-3"],
      brightCyan: terminalTokens["--act-chart-series-2"],
      brightWhite: terminalTokens["--act-color-text"],
    });
  });

  it("falls back to readable foreground colors when optional tokens are unavailable", () => {
    document.documentElement.style.setProperty("--act-color-text", "rgb(20, 20, 20)");
    document.documentElement.style.setProperty("--act-color-surface", "rgb(250, 250, 250)");

    const theme = readTerminalTheme();

    expect(theme.brightCyan).toBe("rgb(20, 20, 20)");
    expect(theme.brightRed).toBe("rgb(20, 20, 20)");
    expect(theme.brightWhite).toBe("rgb(20, 20, 20)");
  });
});
