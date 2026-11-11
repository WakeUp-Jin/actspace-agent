import assert from "node:assert/strict";
import test from "node:test";
import { createCamera } from "../../src/camera.js";

const view = { width: 1000, height: 500 };

test("整张图刚好铺满取景框时不缩放也不偏移", () => {
  const camera = createCamera({ size: [2000, 1000], keys: [{ at: 0, rect: [0, 0, 1, 1], pad: 0 }] }, view);
  assert.deepEqual(camera(0), { scale: 0.5, x: 0, y: 0 });
});

test("推近到某个区域后，这个区域落在取景框正中", () => {
  const rect = [0.4, 0.4, 0.2, 0.2];
  const camera = createCamera(
    {
      size: [2000, 1000],
      keys: [
        { at: 0, rect: [0, 0, 1, 1], pad: 0 },
        { at: 1, move: 1, rect, pad: 0 },
      ],
    },
    view,
  );
  const { scale, x, y } = camera(2);
  assert.equal(scale, 2.5);
  assert.equal(x + (rect[0] + rect[2] / 2) * 2000 * scale, view.width / 2);
  assert.equal(y + (rect[1] + rect[3] / 2) * 1000 * scale, view.height / 2);
});

test("关注区域贴着图片边缘时，镜头停在边上，不把图外的空白拉进来", () => {
  const camera = createCamera({ size: [2000, 1000], keys: [{ at: 0, rect: [0, 0, 0.2, 0.2], pad: 0 }] }, view);
  const { x, y } = camera(0);
  assert.equal(x, 0);
  assert.equal(y, 0);
});

test("移动只发生在 at 到 at + move 之间，两端分别停在前后两个取景上", () => {
  const camera = createCamera(
    {
      size: [2000, 1000],
      keys: [
        { at: 0, rect: [0, 0, 1, 1], pad: 0 },
        { at: 2, move: 1, rect: [0.25, 0.25, 0.5, 0.5], pad: 0 },
      ],
    },
    view,
  );
  assert.equal(camera(2).scale, 0.5);
  assert.equal(camera(3).scale, 1);
  assert.equal(camera(10).scale, 1);
  const middle = camera(2.5).scale;
  assert.ok(middle > 0.5 && middle < 1);
});
