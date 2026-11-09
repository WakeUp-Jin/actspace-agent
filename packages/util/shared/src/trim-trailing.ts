/**
 * 去掉结尾连续出现在 `chars` 里的字符。
 * 不用 `/[chars]+$/` 这类正则：输入里出现一长串该字符时它会退化成平方级回溯（CodeQL js/polynomial-redos）。
 */
export function trimTrailing(value: string, chars: string): string {
  let end = value.length;
  while (end > 0 && chars.includes(value[end - 1]!)) end -= 1;
  return end === value.length ? value : value.slice(0, end);
}
