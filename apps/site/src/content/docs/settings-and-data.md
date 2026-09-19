---
title: "设置与本地数据"
description: "找到常用配置，理解会话、凭据和工作区文件各自保存什么。"
group: "settings-development"
order: 1
updatedAt: 2026-09-19
draft: false
---

从左下角打开设置。设置按偏好、能力、活动和系统分组，修改前先确认它影响当前会话还是全局默认值。

## 设置入口

| 页面 | 主要内容 |
| --- | --- |
| 通用 | 通用偏好、任务模型默认值、多媒体和语音配置、快捷键 |
| 外观 | 桌面应用主题、字体和字号 |
| 模型 | 服务商连接、API Key 和模型目录 |
| 工具 | 文件、命令、联网和多媒体工具的开关及相关配置 |
| 子 Agent | 子任务路由与模型 |
| 使用统计 | 请求、Token、费用和工具活动 |
| 归档会话 | 查找并恢复归档任务 |
| 更新 | 检查版本和本机源码更新相关操作 |

官网目前采用固定浅色样式；桌面应用的外观设置是独立功能。

<figure class="product-shot screenshot-placeholder" data-screenshot="settings-navigation.png">
<figcaption><span class="screenshot-label">待补实拍 · 35</span><strong>设置分组与通用页面</strong><code>settings-navigation.png</code><p>设置页完整分组及通用设置顶部</p></figcaption>
</figure>

## 三类本地数据

工作区文件在你选择的目录里，Agent 对它们的修改会直接影响该目录。会话日志、设置和会话附件位于应用管理的数据目录中；终端进程和播放队列属于运行时资源，不随会话日志永久保存。

凭据由主进程保存到应用数据目录的 `secrets.json`，是权限受限的本机明文文件。备份项目目录不会自动备份应用会话；分享诊断信息也不应附带完整凭据文件。

## 整理与排障

减少侧栏任务可以使用[归档](../sessions/)，不会删除项目文件。更换服务商时可以保留历史会话和统计记录，只需重新建立可用连接。

遇到数据或启动问题，先记录复现步骤和错误，再按[常见问题](../troubleshooting/)排查。不要把清空应用数据作为默认修复方式。
