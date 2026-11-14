# 拆开 Pi

**动手复现一个编码 Agent。**

《拆开 Pi》是一门中文动手教程。从一次 `read` 工具调用开始，先用 TypeScript 写出可以运行的小实验，再回到 [Pi 源码](https://github.com/earendil-works/pi/tree/86a929acdd7021fbfbe5b434a4a6038218f52bd6) 看它怎样实现同一个机制。

**项目处于早期阶段，正在完善。** 目前已有前三章。后续会逐步补上编码工具、Skills、扩展、权限、会话和上下文管理，以及 MCP、Code Mode 和子代理。

## 开始阅读

- [第一章：从聊天到行动](https://asuka01124.github.io/pi-unpacked/) · 用假模型跑通工具调用，亲手写一个最小 Agent 循环。
- [第二章：Pi 怎样驱动一次运行](https://asuka01124.github.io/pi-unpacked/chapter-2.html) · 对照 Pi 源码，观察并发工具的完成顺序、结果回填，以及用户输入何时进入下一次请求。
- [第三章：一个循环怎样接不同模型](https://asuka01124.github.io/pi-unpacked/chapter-3.html) · 对照 OpenAI Responses 与 Anthropic Messages 的请求、流事件和工具结果。
- [课程大纲](COURSE-OUTLINE.md) · 查看后续章节和计划中的实验。

网页上的回放可以直接操作。离线实验自带固定响应和示例日志，无需 API Key。

## 本地运行

使用 Node.js 22.19 或更新版本。在仓库根目录执行以下命令启动教程网站，访问终端显示的本地地址。

```sh
npm ci
npm run dev
```

想直接观察前三章的参考实现，可以运行下面的命令。

```sh
node ./examples/demo.ts success
node ./examples/chapter-2/demo.ts --follow-up
node ./examples/chapter-3/demo.ts messages
```
