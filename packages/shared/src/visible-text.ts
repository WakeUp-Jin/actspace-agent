// Zero-width characters survive String.prototype.trim(); relays sometimes send them as placeholder content.
const INVISIBLE_CHARACTERS = /[\s​-‍⁠﻿]/g;

/** True when the text has at least one character a reader can see. */
export function hasVisibleText(text: string): boolean {
  return text.replace(INVISIBLE_CHARACTERS, "").length > 0;
}
