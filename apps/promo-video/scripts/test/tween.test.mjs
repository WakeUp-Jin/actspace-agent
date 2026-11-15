import assert from "node:assert/strict";
import { test } from "node:test";
import { formatNumber, linear, parseKeys, valueAt } from "../../src/tween.js";

test("关键帧之外保持首尾的值，中间先快后慢", () => {
  const keys = parseKeys("0@1 100@3 100@4 40@5");
  assert.equal(valueAt(keys, 0), 0);
  assert.equal(valueAt(keys, 3), 100);
  assert.equal(valueAt(keys, 3.5), 100);
  assert.equal(valueAt(keys, 9), 40);
  // 先快后慢：走到一半时间时已经过了一半路程。
  assert.ok(valueAt(keys, 2) > 50);
  assert.ok(valueAt(keys, 4.5) < 70);
});

test("指定匀速时，走到一半时间正好走了一半路程", () => {
  const keys = parseKeys("0@1 100@3");
  assert.equal(valueAt(keys, 2, linear), 50);
  assert.equal(valueAt(keys, 2.5, linear), 75);
});

test("关键帧写错时直接报错", () => {
  assert.throws(() => parseKeys("0@1 abc@2"), /关键帧/);
  assert.throws(() => parseKeys("12"), /关键帧/);
});

test("数字按小数位和千分位格式化", () => {
  assert.equal(formatNumber(65.94, { digits: 1 }), "65.9");
  assert.equal(formatNumber(1234567.2, { group: true }), "1,234,567");
  assert.equal(formatNumber(1234.5, { digits: 1, group: true }), "1,234.5");
});
