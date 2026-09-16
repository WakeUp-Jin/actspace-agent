/** Counts decoded Unicode code points in one top-level JSON string, without retaining its content.
 * This is a presentation-only scanner; the tool runtime still validates complete arguments.
 */
export class FileGenerationCounter {
  count = 0;
  private depth = 0;
  private inString = false;
  private role: "key" | "content" | "other" = "other";
  private expectsKey = false;
  private key = "";
  private escape = false;
  private unicode: string | undefined;
  private highSurrogate = false;

  constructor(private readonly field: "content" | "new_string") {}

  accept(delta: string): void {
    for (let i = 0; i < delta.length; i++) {
      const char = delta[i]!;
      if (this.inString) {
        if (this.unicode !== undefined) {
          this.unicode += char;
          if (this.unicode.length === 4) {
            if (/^[\da-f]{4}$/i.test(this.unicode)) this.decoded(String.fromCharCode(parseInt(this.unicode, 16)));
            this.unicode = undefined;
          }
        } else if (this.escape) {
          this.escape = false;
          if (char === "u") this.unicode = "";
          else this.decoded(char);
        } else if (char === "\\") this.escape = true;
        else if (char === '"') {
          this.inString = false;
          if (this.role === "key") this.expectsKey = false;
          this.highSurrogate = false;
        } else this.decoded(char);
        continue;
      }
      if (char === '"') {
        this.inString = true;
        this.role = this.depth === 1 && this.expectsKey ? "key" : this.depth === 1 && this.key === this.field ? "content" : "other";
        if (this.role === "key") this.key = "";
      } else if (char === "{" || char === "[") {
        this.depth++;
        if (this.depth === 1) this.expectsKey = true;
      } else if (char === "}" || char === "]") this.depth--;
      else if (char === "," && this.depth === 1) this.expectsKey = true;
    }
  }

  private decoded(char: string): void {
    if (this.role === "key") {
      if (this.key.length < 32) this.key += char;
    } else if (this.role === "content") {
      const code = char.charCodeAt(0);
      if (!(this.highSurrogate && code >= 0xdc00 && code <= 0xdfff)) this.count++;
      this.highSurrogate = code >= 0xd800 && code <= 0xdbff;
    }
  }
}
