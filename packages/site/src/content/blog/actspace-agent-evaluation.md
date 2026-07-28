---
title: "ActSpace评估模块的设计思路"
description: "在构建Agent的时候，我们首先会更多从感觉出发，或者说从经验出发"
publishedAt: 2026-07-19
updatedAt: 2026-07-19
authors:
  - WakeUp-Jin
tags:
  - Agent Evaluation
  - Reliability
draft: false
cover: /images/blog/actspace-agent-evaluation.svg
---

在构建Agent的时候，我们首先会更多从感觉出发，或者说从经验出发

感觉添加这个工具会有效，这样处理上下文会有效，这样编排提示词应该没有问题



这种方式对于一位经验丰富的大模型应用工程师来说，构建出来的Agent至少会是合格的。

但是下一步呢？如果我想要让这个Agent变得更好呢，我们会陷入一种迷茫的状态，可能会再去看看其他的构建思路和经验，但是远水解不了近渴，别人需求环境下构建的经验不一定适用你目前的情况



主要的问题在于：我们不知道当前的Agent到底差在哪里，没法去量化Agent执行的细节

**依靠感觉和经验可以让你走起来，但是要走的更远，我们需要一个构建优化的“理由”**



我们可以把思绪拉到Agent评估上面，从现有的数据中构建出来自己的评估数据集，使用公开的数据集进行测试，然后观察执行链路的问题，根据实际执行环境去评估上下文的质量。

Agent评估可以帮助我们确定Agent开发方向，同时也可以提供有力的数据给我们，让每一次构建可以更果决



一个好用的Agent背后，一定是存在一个合格的Agent评估模块的。

我目前正在构建ActSpace这个桌面端Agent，它的Agent评估模块的设计思路我整理出来，希望可以给大家提供一些参考



调研分析资料：

- 《Agent评估体系的构建》：https://mp\.weixin\.qq\.com/s/3VqbQzT9ruRVP9B4jlFAEg

- 《SWE\-bench Lite》：https://www\.swebench\.com/lite\.html

- 《ActSpace代码库》：https://github\.com/WakeUp\-Jin/actspace\-agent

- 《Excalidraw文件》：[ActSpace评估模块的设计\.excalidraw](https://my.feishu.cn/file/NrFXbbwMHooZwExmlQmccgRKnM5)



## 一、ActSpace的Agent评估模块设计

我们先从这个模块的输入开始理解吧，这样可能会更容易一些，我设计的这个评估模块总共有三种输入核心：行为评估数据集、内部数据集、外部公开数据集

![Image](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=ZWZmZGZkYzk2ZGM0ZTRjYTA5MTk3NmY0MGU2ZThiNjRfMDQ0ZTljOWI3Yzk4NTI4NmIyODdmOWI4MDZlZWQ4YWRfSUQ6NzY2MzgyMTA2MDk2NTY2NTcyOF8xNzg0NDI4ODY3OjE3ODQ1MTUyNjdfVjM)



对于行为评估数据集，主要是用于评估Agent的执行链路和上下文质量、

- 执行链路：是否调用必须的工具，调用的顺序是否正确，失败之后的处理等

- 上下文质量：工具结果是否正确进入下一轮、压缩之后是否丢失了任务目标，工具错误是否导致上下文被污染等





对于内部评估数据集，主要是用于与公开数据集区分开来，防止优化过拟合，这个主要是评估Agent的执行结果，值得详细聊的是，**数据集的建立方式：失败案例中总结和同场景Agent的优秀数据集内化。**

评估的流程是，Agent会根据用户输入，对于代码库进行功能的开发或者Bug的修复，代码编写完成之后，会执行测试文件，如果所有的测试用例都通过，就表示Agent本次任务执行成功

所以评估器的核心是：代码库拥有完整的测试文件和执行测试命令



对于公开的评估数据集，我们这边只负责执行Agent cli，同时收集一些信息放入到prediction文件里面去，之后评估器使用的是官方库自带的Harness框架

评估的核心思路：会在相同的代码库中，相应的commit分支执行git apply将产生的diff代码应用到代码库中，然后执行相应的测试命令，测试用例都通过就表示Agent修改成功

> 和我们的内部数据集评估的方法是差不多的，只不过公开评估数据集的方法更完整，会保证环境的统一性，公开评估数据集使用的是SWE\-bench Lite
>
>

```JSON
//prediction.json文件
{
  "instance_id": "django__django-11099",
  "model_name_or_path": "your-model-or-agent-name",
  "model_patch": "diff --git a/... b/...\n..."
}
```



图中的Agent cli是我将ActSpace中的核心Agent模块封装成为了cli命令，这样方便调用，同时测试集的执行环境统一是在Docker容器里面的，这样会保证本地环境的安全性

在cli执行完成之后，会有一个运行后处理器，这个是用来做数据整理的，将Agent cli输出的结果整理成为评估模块需要的各种格式
