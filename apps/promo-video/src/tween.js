/**
 * 数字滚动用的关键帧：写成 "值@时刻 值@时刻 …"，相邻两帧之间先快后慢地过渡。
 * 例如 "0@0.6 161@1.5 161@2.3 65.9@2.9"：0.6 秒起从 0 数到 161，停到 2.3 秒，再落到 65.9。
 */

const easeOut = (p) => 1 - (1 - p) ** 3;
/** 匀速过渡：数字要跟着一条匀速移动的线走时用（元素上写 data-linear）。 */
export const linear = (p) => p;

/** @returns {Array<{ value: number, at: number }>} */
export function parseKeys(text) {
  const keys = text
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [value, at] = pair.split("@").map(Number);
      return { value, at };
    });
  if (keys.some(({ value, at }) => !Number.isFinite(value) || !Number.isFinite(at))) {
    throw new Error(`关键帧写法不对：${text}`);
  }
  return keys;
}

export function valueAt(keys, time, ease = easeOut) {
  if (time <= keys[0].at) return keys[0].value;
  for (let index = 1; index < keys.length; index += 1) {
    const from = keys[index - 1];
    const to = keys[index];
    if (time < to.at) return from.value + (to.value - from.value) * ease((time - from.at) / (to.at - from.at));
  }
  return keys.at(-1).value;
}

/** 固定小数位，可选千分位。 */
export function formatNumber(value, { digits = 0, group = false } = {}) {
  const fixed = value.toFixed(digits);
  if (!group) return fixed;
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
