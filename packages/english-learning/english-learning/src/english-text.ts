/** Conservatively speak English prose. Mixed-language lines are intentionally skipped. */
export function extractEnglish(text: string): string[] {
  const lines = text.replace(/<!--[\s\S]*?(?:-->|$)/g, "").split(/\r?\n/);
  const result: string[] = [];
  let fence: { char: string; length: number } | undefined;
  for (const line of lines) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) continue;
    const clean = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`+[^`]*`+/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, "")
      .replace(/[*_~|]/g, "").replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{2}/.test(clean) || /\p{Script=Han}/u.test(clean) || /^(?:[./~]|[A-Za-z]:[\\/])\S*$/.test(clean)) continue;
    result.push(...splitEnglish(clean));
  }
  return result;
}

export function splitEnglish(text: string, limit = 1_000): string[] {
  const result: string[] = [];
  let current = "";
  for (const sentence of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    for (const word of sentence.trim().split(/\s+/)) {
      if (!word) continue;
      if ([...current, ...word].length + (current ? 1 : 0) > limit) {
        if (current) result.push(current);
        current = "";
      }
      const points = [...word];
      while (points.length > limit) result.push(points.splice(0, limit).join(""));
      if (points.length) current += `${current ? " " : ""}${points.join("")}`;
    }
    // Preserve sentence boundaries for large paragraphs without fragmenting short speech.
    if ([...current].length > limit * 0.8) { result.push(current); current = ""; }
  }
  if (current) result.push(current);
  return result;
}
