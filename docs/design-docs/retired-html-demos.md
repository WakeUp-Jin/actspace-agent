# 已迁出的 HTML 设计 Demo

2026-10-18，按用户批准将 31 个已实现、已替代或明确废弃的 HTML Demo 备份到本机桌面，校验 SHA-256 后移出当前文件树。HTML 原件合计 1,342,261 字节；共享 CSS、图标及图片只复制，不从源码删除。个人备份路径不作为仓库阅读依赖。

原始版本为 `a13f8a1ee10eed387da575d80ac000cc844f2bff`，可用 `git show <版本>:<下表路径>` 恢复。桌面备份含 manifest.json、原始 HTML、依赖及 README；旧 Logo 从 `2c8d989c^` 恢复，Web V2 的 12 张旧截图原本缺失，明确记录而未伪造。外部字体离线时回退系统字体。

当前产品入口：[前端规范](frontend/README.md)、[Web 规范](frontend/front-web-pwa客户端规范.md)、[官网设计](../../apps/site/DESIGN.md)。验收与迁移证据见[执行记录](../exec-runs/20261018-acceptance-fixes-docs-cleanup/execution-process.md)。

仍保留 Space mock Demo、PA2 批注 Demo、7 个学习 HTML 和 Session Viewer；本次不改写 Git 历史。

| 原路径 | SHA-256 |
| --- | --- |
| `docs/design-docs/frontend/anthropic-custom-connection-demo.html` | `149d517e11f676177e10c7189da62470d1d8cb333eb0f84de71fb5812f7be629` |
| `docs/design-docs/frontend/approval-card-redesign.html` | `4bf00e567ca49f79f8a4070eba93884d6bfc94c68f7d86c5eac6b3f9567902ef` |
| `docs/design-docs/frontend/composer-usage-dock-demo.html` | `9db3740bcf30f70a6f789ce9e4128f784e283dcbd061f9ea6c26061ae2353f88` |
| `docs/design-docs/frontend/context-compaction-demo.html` | `ef625b19eb84ae2692374f91615d489586af0cf7cb384af668d15a5151810492` |
| `docs/design-docs/frontend/context-panel-demo.html` | `d95eb8f852fc172f21bda64e4713792b7e55128656184fc3eaa1030e2fbd8f28` |
| `docs/design-docs/frontend/design-token-convergence-demo.html` | `8a1df6aff9ef1d91563f4a514612e5f6c16c6718f2c38fec79c61fba2c552bf1` |
| `docs/design-docs/frontend/ink-emerald-color-preview.html` | `e79233bf8820b03dfd8cdbbe3167113e34222f4ff88ad909d7c875c23ddf258d` |
| `docs/design-docs/frontend/message-queue-demo.html` | `9c09c8af1d71eb324baf1f8fc8c0b88116f0c920869b7e9107e259380c87ecb4` |
| `docs/design-docs/frontend/mobile-web-demo.html` | `e4be371a7e5c24a049af3520d0ad3b2ed65ac7d273010e93d22d5e37215cf00a` |
| `docs/design-docs/frontend/mobile-web-v2-demo.html` | `aa2b0f862a06a01aaf81fe32aa721c90e1cc2bab26a90dfb4ec86158f141659c` |
| `docs/design-docs/frontend/model-connection-3-directions.html` | `c81f69c18f9ee2b5d403f53d95b79117f3ae42bced162942580819060f5d3f68` |
| `docs/design-docs/frontend/model-connection-redesign-demo.html` | `5cdced49f16be344efe7d67fecca4c5e87c0c2cdf92160177c9204b5a5af56a2` |
| `docs/design-docs/frontend/settings-redesign-demo.html` | `23ccc1652dd9e93d1413379b37a9ce16831f5f4ca3ba47debd7cce0c15972fc4` |
| `docs/design-docs/frontend/sidebar-redesign-demo.html` | `dca221cd3880ece75b142abf881ed460285d717a2854216112e64798f8e45c16` |
| `docs/design-docs/frontend/tool-stream-typography-demo.html` | `1ff34527608dd138c25b35a4477e7b06e3054c2a741bf9ee93bfbe3472b05d71` |
| `docs/design-docs/frontend/turn-deliverables-demo.html` | `32bc7322c8f9f64bb878e443ef7a5cde437776d73d9342e181adcc25ba22602f` |
| `docs/design-docs/site-v4/demos/A-paper-ink.html` | `747ec645513bdf0d458a725423b7159ed81f2d5f93084d59eba689e9a225b9ca` |
| `docs/design-docs/site-v4/demos/B-orbit.html` | `06cde721d30434b045f53869c1e42c2eeeb6a5a8f41bc0635b9786f173b80ae3` |
| `docs/design-docs/site-v4/demos/C-deep-space.html` | `9df5cac44819bd2d84009eacd2b103f2aa0847dc9d6ab468ba59f91d4d52dc1e` |
| `docs/design-docs/site-v4/demos/D-stage.html` | `82126418dcfcb40919f2a08f62a3e5a0cce22c483456d98995b1238dbd3ea2ad` |
| `docs/design-docs/site-v4/demos/D1-paper-stage.html` | `37248ee7c0898ed8df69d412d13bcb8ab338d6482a905b23c5a7291b31f4ba69` |
| `docs/design-docs/site-v4/demos/D2-mono-stage.html` | `78a56598873b7d228621c3327b3785bc18cb570d2f5a326f9eb9770897a4917f` |
| `docs/design-docs/site-v4/demos/D3-starchart-stage.html` | `766317f1eca59006cb113df2f447ffc176158213d4cd8b7479e7866f30f89f41` |
| `docs/design-docs/site-v4/demos/D4-structure-stage.html` | `7f59dfa2cb925d0e38b80757292db2f491c164f3be70207d77120fa6adf49ef4` |
| `docs/design-docs/site-v4/demos/D5-night-stage.html` | `12037755ea37eb10d110ee4cbdbbab980154acfe808bb43767e88fd2e04448d3` |
| `docs/design-docs/site-v4/demos/D6-paper-plugin-stage.html` | `2349d189dfb0b7351eea4caf8315b8a50f03a413bab04d7e7b012c2c4d79cee5` |
| `docs/design-docs/site-v4/demos/E-sprites.html` | `d3548a901c9cfb8905a89704cd5100d30cdeef3bfe33091d9a1bee92c53e2924` |
| `docs/design-docs/site-v4/demos/H1-hero-desktop-stage.html` | `4362c5e9e2641f20efdc2c6550858911a598f3aa845cb20cf1187a585edf3224` |
| `docs/design-docs/site-v4/demos/index.html` | `7c78b94a088d842c0054bbd4e48bf8112c52b10daed21a0baece518f31133e30` |
| `docs/design-docs/website-redesign-demo.html` | `3ec9cf319c51d6e2115ba4531240962c4fe16aa2dded1de6ba151b33fda98ebe` |
| `docs/desktop-frontend-refactor/demo/composer-run-target-demo.html` | `2a078850177780f4fe593b32b6006c7206488ab71c714b8f517b8db42c000caf` |
