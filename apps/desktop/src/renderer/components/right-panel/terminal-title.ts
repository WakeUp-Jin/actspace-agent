/** Only the host's generated default title is localized; shell and custom titles stay intact. */
export function terminalDisplayTitle(title: string): string {
  const defaultTitle = /^Terminal (\d+)$/.exec(title);
  return defaultTitle ? `终端 ${defaultTitle[1]}` : title;
}
