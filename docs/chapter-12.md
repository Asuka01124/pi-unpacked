---
title: 子代理怎样成为一种扩展
description: 用两个独立进程查日志和代码，追踪 Pi 的子代理委派、JSON 事件、失败处理与取消传播。
---

<script setup>
import SubagentReplay from './components/SubagentReplay.vue'
</script>

<p class="chapter-label">第 12 章</p>

# 子代理怎样成为一种扩展

<p class="chapter-lede">登录测试报了 HTTP 401。主代理可以把读日志和查请求头分开交给两个子代理，再汇总证据。如果查代码的子进程没启动，或者你在中途取消了，主代理还能知道什么？</p>

前一章的 Code Mode 把多次工具调用组合进一段脚本。这里交出去的是一段任务。子代理自己决定怎样调用工具、怎样读结果，再把自己的结论带回主会话。

## 两条调查如何交回证据

先看「正常并发」，展开主代理收到的证据。再切到「启动失败」和「取消剩余任务」，比较代码调查的状态与 JSON 记录。两种情况下，日志调查都已经完成。确认哪条证据可以保留，哪条还要补查。

<SubagentReplay />

日志证明测试返回了 401。代码调查只说明示例请求头片段里没有设置 Authorization，凭据是否在其他层添加还需要验证。回放用固定数据展示进程结果，终端实验会真正启动子进程。<sup><a href="#注释">注 1</a></sup>

## 委派从一个普通工具调用开始

上游仓库的 `subagent` 是一个扩展示例。它用 `pi.registerTool()` 暴露 `subagent` 工具，参数可以是单个 `agent` 和 `task`、并发的任务数组 `tasks`，或顺序执行的 `chain`。从主会话看，提交两项并发调查仍是一次工具调用。扩展负责启动、监督和收集两项任务。 [工具定义](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L608)

执行时，扩展为每项任务创建单独的 Pi 进程，传入 `--mode json -p --no-session`。`--no-session` 让子进程不写持久会话文件。它仍有自己的提示词和运行中的消息。角色定义可以提供工具表和模型，追加的系统提示词通过临时文件传入，任务文本作为本次输入。父代理的整段会话历史不会自动进入子进程，因此委派时要把任务、证据来源和限制写清。 [子进程参数](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L389) · [角色提示词与任务输入](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L420)

扩展默认发现用户级角色。显式选择项目角色时，交互模式会根据项目授信和角色文件位置决定是否确认。工具列表约束 Pi 的调用入口，进程的文件和网络权限仍取决于第七章所讲的运行环境。 [角色发现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/agents.ts#L130) · [项目角色确认](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L682)

## 并行的是 Agent 循环

第二章中，并行工具来自同一条模型回复，结果都回到同一个循环。子代理则各自走「请求模型 → 执行工具 → 再请求模型」，完成后由父扩展归并。本基准里的并发实现最多接收 8 项任务，同时运行至多 4 项。它按输入位置存放结果，完成顺序可以不同，返回顺序仍按原任务排列。 [并发上限](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L38) · [按输入位置收集结果](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L262)

如果后一步需要前一步的输出，可以选 `chain`。比如先查日志，再根据查到的路由去看代码。扩展把前一步最终输出填进下一段任务的 `{previous}`，遇到失败或取消时停止这条链。 [串联与失败处理](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L706)

## stdout 是事件流，等 close 再收尾

Pi 的 JSON 模式会把事件逐行写到 stdout。父进程收到的流数据可能是半行，也可能是一批行，所以扩展先缓冲，再按换行取出 JSON。它关注 `message_end`，保存用户、助手和工具结果消息，还用助手消息统计用量、更新进度。stderr 则单独保留，用于诊断。 [JSON 输出](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/modes/print-mode.ts#L116) · [父级解析事件](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L438)

`exit` 表示进程退出，`close` 表示它的 stdio 流已经关闭。等到 `close` 才能把末尾缓冲里的事件也算进去。最后，扩展从子代理记录中提取文本，把每项任务的状态和摘要放进主代理的工具结果。完整记录、用量与错误仍可供界面和扩展查看。 [结束并处理缓冲](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L512) · [并发结果归并](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L833)

## 失败和取消分别记录

启动失败时，父级可能只收到 `spawn` 的错误，没有任何子代理消息。进程成功启动后，也可能以非零状态或外部信号退出。父级主动取消时，上游扩展通过 `AbortSignal` 结束还在运行的子进程，先发 `SIGTERM`，仍未退出时再尝试 `SIGKILL`。已经接收并完成的兄弟任务可以保留自己的结果。 [进程启动与取消](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L488) · [状态归类](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L538)

本章的取消场景会等日志子进程完成、代码子进程发出启动事件，再取消剩下的进程。这样主代理会得到一条有效日志证据，另有一条标记为取消的代码调查。强制停止进程不会回滚此前已经执行的外部操作。

## 动手解析证据并归并结果

在仓库根目录用 Node.js 22.19 或更新版本运行。终端实验只把固定日志与代码片段交给两个本地 Node.js 进程，不需要模型或 API Key。

```bash
node ./examples/chapter-12/demo.ts
node ./examples/chapter-12/demo.ts --verify
```

打开 `examples/chapter-12/exercise.ts`，补上两个函数。

1. `readEvidence(line)` 解析一行 JSON。只接受 `message_end` 中已正常停止的助手消息，按原顺序把文本块用换行连接。忽略无法解析的行、其他事件和没有文本的消息。
2. `summarize(results)` 保持任务顺序，把已完成且有证据的条目放入 `evidence`。把其余任务的 ID 放入 `incomplete`，留给主代理继续调查。

```bash
node ./examples/chapter-12/demo.ts --exercise --verify
```

验收会模拟找不到子进程可执行文件，以及父级取消仍在等待的子进程。两种失败下都应该收回另一条正常完成的证据。

::: details 参考实现
<<< ../examples/chapter-12/scenario.ts#collect
:::

## Pi 当时怎么改

早期的扩展很难区分「任务还在排队」「进程正在跑」和「进程根本没启动」。提交 `aba42ae` 给每项任务增加了明确状态，并完善进程错误与取消的处理。看改动时，可以对照并发开始时如何创建占位记录、子进程返回后如何更新，以及最终工具结果如何报告部分失败。 [改进进度与失败处理](https://github.com/earendil-works/pi/commit/aba42ae6b90fdb5e3f3e7aac0c4bd0577a761952)

## 合上代码，复述一遍

1. 两个子代理并发和两个工具并发，子任务分别由谁继续请求模型？
2. 为什么收尾时要读到 `close`，还要处理剩余缓冲？
3. 查代码的任务被取消后，日志证据还能用于下一步吗？

::: details 核对你的解释
1. 子代理各自请求模型。普通工具执行完后，由原来的 Agent 循环继续请求。
2. 子进程退出后，stdout 仍可能有尚未读完的事件。
3. 可以。日志调查已经完成，但代码调查仍需补齐。
:::

下一章会从外部客户端连接 Pi，对照 JSON 事件流、双向 RPC 和会话控制。

## 注释

**注 1 · 实验范围。** 网页回放使用确定性的事件记录。终端启动真实 Node.js 子进程，解析其 JSON 行并验证退出状态，但用固定证据代替子代理的模型循环。本章练习只提取最终助手证据，上游扩展还保存其他消息、进度、用量和 stderr。 [上游子代理示例](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/README.md)
