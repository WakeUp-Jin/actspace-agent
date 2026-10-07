# Space 头像素材

- 来源：`docs/design-docs/多智能体协作/assets/demo/` 的 256px PNG，用 `sips -Z 128` 缩到 128px，文件名不变。
- `space-*.png`（6 张）：Space 头像，按创建顺序轮换。
- `ball-*.png`（5 张）：Space 里新起的 Actor 的小球头像，按 id 固定映射。
- 映射在 `components/space/avatar/avatar-assets.ts`：数组顺序决定映射，不要重排。
