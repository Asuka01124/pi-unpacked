# 拆开 Pi

**动手复现一个编码 Agent。**

《拆开 Pi》是一门中文动手教程。从一次 `read` 工具调用开始，先用 TypeScript 写出可以运行的小实验，再回到 [Pi 源码](https://github.com/earendil-works/pi/tree/86a929acdd7021fbfbe5b434a4a6038218f52bd6) 看它怎样实现同一个机制。

**项目处于早期阶段，正在完善。** 目前已有前十三章。后续会逐步补上综合实验和进阶内容。

## 开始阅读

- [第一章：从聊天到行动](https://asuka01124.github.io/pi-unpacked/) · 用假模型跑通工具调用，亲手写一个最小 Agent 循环。
- [第二章：Pi 怎样驱动一次运行](https://asuka01124.github.io/pi-unpacked/chapter-2.html) · 对照 Pi 源码，观察并发工具的完成顺序、结果回填，以及用户输入何时进入下一次请求。
- [第三章：一个循环怎样接不同模型](https://asuka01124.github.io/pi-unpacked/chapter-3.html) · 对照 OpenAI Responses 与 Anthropic Messages 的请求、流事件和工具结果。
- [第四章：设计编码工具](https://asuka01124.github.io/pi-unpacked/chapter-4.html) · 实现日志续读和精确替换，对照 Pi 的工具实现。
- [第五章：AGENTS.md、Skills 与提示词模板](https://asuka01124.github.io/pi-unpacked/chapter-5.html) · 观察同一份排障流程怎样进入模型上下文。
- [第六章：用 Extensions 改造 Pi](https://asuka01124.github.io/pi-unpacked/chapter-6.html) · 实现 `/triage`，切换工具、诊断日志并恢复会话状态。
- [第七章：权限到底在哪一层生效](https://asuka01124.github.io/pi-unpacked/chapter-7.html) · 追踪同一次写入在哪一步被拒绝。
- [第八章：会话为什么是一棵树](https://asuka01124.github.io/pi-unpacked/chapter-8.html) · 从同一份 JSONL 恢复两条调查分支。
- [第九章：上下文压缩怎样保住调查进度](https://asuka01124.github.io/pi-unpacked/chapter-9.html) · 用长日志触发压缩，对照切点、摘要与下一次请求。
- [第十章：MCP 怎样变成 Pi 的工具](https://asuka01124.github.io/pi-unpacked/chapter-10.html) · 接入本地 CI 服务，观察握手、工具调用和资源读取。
- [第十一章：工具太多时，模型怎样发现和组合它们](https://asuka01124.github.io/pi-unpacked/chapter-11.html) · 对照直接声明、按需搜索与 Code Mode。
- [第十二章：子代理怎样成为一种扩展](https://asuka01124.github.io/pi-unpacked/chapter-12.html) · 启动两个独立子进程，汇总完成、失败和取消时的证据。
- [第十三章：同一个 Agent 怎样服务不同界面](https://asuka01124.github.io/pi-unpacked/chapter-13.html) · 用 RPC 接收工具事件，在运行中引导和取消。
- [课程大纲](COURSE-OUTLINE.md) · 查看后续章节和计划中的实验。

网页上的回放可以直接操作。离线实验自带固定响应和示例日志，无需 API Key。

## 本地运行

使用 Node.js 22.19 或更新版本。在仓库根目录执行以下命令启动教程网站，访问终端显示的本地地址。

```sh
npm ci
npm run dev
```

想直接观察各章的参考实现，可以运行下面的命令。

```sh
node ./examples/demo.ts success
node ./examples/chapter-2/demo.ts --follow-up
node ./examples/chapter-3/demo.ts messages
node ./examples/chapter-4/demo.ts read
node ./examples/chapter-5/demo.ts skill
node ./examples/chapter-6/demo.ts
node ./examples/chapter-7/demo.ts
node ./examples/chapter-8/demo.ts
node ./examples/chapter-9/demo.ts
node ./examples/chapter-10/demo.ts
node ./examples/chapter-11/demo.ts
node ./examples/chapter-12/demo.ts
node ./examples/chapter-13/demo.ts
```
