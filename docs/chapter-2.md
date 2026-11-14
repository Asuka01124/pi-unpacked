---
title: Pi 怎样驱动一次运行
description: 沿 Pi 源码追踪一次运行，理解工具并发、结果顺序和用户输入队列。
---

<script setup>
import RunReplay from './components/RunReplay.vue'
</script>

<p class="chapter-label">第 2 章</p>

# Pi 怎样驱动一次运行

<p class="chapter-lede">同一条模型回复要求读两份日志。一个文件读得慢，另一个马上报错。这时用户又发来一条消息。下一次请求模型时，应该带上哪些结果和输入？</p>

第一章的循环每次只处理一个调用，收到最终文本就返回。现在还是排查登录测试，只是模型在同一条回复里要读 `test.log` 和 `missing.log`。读文件期间，用户补了一句「只总结 `test.log`，并给出一个排查建议」。我们用这句话找到 Pi 的三个边界：工具什么时候结束、一轮什么时候结束、整次运行什么时候结束。

## 先看第二次请求收到了什么

先保持「并发」和「引导当前运行」，看哪个读取先完成，再点「请求模型 2」检查结果和用户消息的顺序。切到「排队追问」后，同一句话在哪次请求里第一次出现？最后把工具调度切成「顺序」，再看一次工具完成顺序。

<RunReplay />

::: details 核对你的预测
- 并发时 `missing.log` 先失败，慢读 `test.log` 后完成。第二次请求里的工具结果仍按原调用顺序排列，先 `call_1`，再 `call_2`。
- `steer` 在本轮工具结果之后进入上下文，第二次请求就能看到用户的新要求。原来那批工具已经跑完，两次模型请求属于同一次运行。
- `followUp` 会等原任务完成。第二次请求先回答原问题，第三次请求才收到排队的追问。这三次请求仍可发生在同一次运行里。
:::

回放使用与终端实验相同的假模型和调度代码。实验与 Pi 的细节差异见章末。<sup><a href="#注释">注 1</a></sup>

## 从 CLI 追到 Agent 循环

第一章的 `runAgent()` 在 Pi 里对应几层代码。用同一次 `read` 找它们各自接手的位置。

| 到哪里看 | 这一步发生什么 |
| --- | --- |
| [`main.ts` 和 `sdk.ts`](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/main.ts#L900) | CLI 创建会话运行时，SDK 组装 `Agent` 和 `AgentSession`，再由 CLI 选择交互、打印或 RPC 入口。 |
| [`AgentSession.prompt()`](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L2175) | 会话处理输入和当前运行状态。启动一轮新任务时，它把准备好的消息交给 `agent.prompt()`。 |
| [`Agent.prompt()` 和 `runPromptMessages()`](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent.ts#L380) | `Agent` 管理运行状态、输入队列和取消信号，调用 `runAgentLoop()`。已有运行时，直接再调 `Agent.prompt()` 会报错，补充输入走队列。 |
| [`runLoop()`](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L172) | 请求模型，执行回复中的 `toolCall`，写入 `toolResult`，再决定是否继续请求。`streamAssistantResponse()` 会把内部消息转换后交给模型适配层。 |

工具结果回到循环时，界面和会话也能收到事件。比如 `AgentSession` 订阅 Agent 的消息事件，在 `message_end` 时把 `toolResult` 等消息追加到会话记录。这样，**工具运行中展示的状态、会话保存的消息和下一次模型请求**都有明确的来源。先找到事件的发出者和接收者，会话文件如何重建上下文留到第八章。 [SDK 组装](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/sdk.ts#L403) · [会话写入](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L1214)

## 一条回复可以带一批工具

Pi 从 `assistant.content` 提取全部 `toolCall`。在并发路径上，它先逐个做准备，包括查找工具、校验参数和调用执行前钩子，再并发执行获准的调用。选择顺序模式，或这批调用里有工具声明 `executionMode: "sequential"`，就会逐个准备和执行。 [调度分支](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L518) · [执行前准备](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L718)

并发时要区分**完成事件**和**工具结果消息**。`call_2` 一失败，Pi 就可以发出 `tool_execution_end`，界面立刻知道第二个工具失败了。循环等整批结束后，才按原调用顺序生成 `toolResult` 消息并交给下一次请求。`Promise.all` 按输入顺序返回结果，所以第二个调用先结束也仍然排在第二位。工具内部抛出的文件错误已经被包装为工具结果，慢读成功拿到的日志也会一同交回。 [并发执行和结果收集](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L596)

## 用户插话在哪一轮生效

在这一章里，**一轮（turn）**从一次模型请求开始，包含它返回的回复和这条回复产生的一批工具结果。一次 **运行（run）**可以包含多轮，开始和结束分别有 `agent_start` 与 `agent_end`，每轮有自己的 `turn_start` 和 `turn_end`。

正常情况下，当前轮收好工具结果并发出 `turn_end` 后，循环会检查 `steer`。如果有消息，就在下一次请求前追加。`followUp` 则等到内层循环本来要退出时再检查。第二次请求仍要根据两条工具结果回答原问题，排队的追问可以接着开启第三轮。 [轮次与队列](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L283)

这里的 `steer` 表示**改变下一轮的输入**。如果用户想停止已经在跑的命令，那属于 `abort()` 的职责。 [Agent 的队列入口](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent.ts#L308)

## 动手实现两处调度

在项目根目录（里面有 `package.json` 和 `examples`）打开终端。项目已经提供假模型、日志、循环和验收脚本，用 Node.js 22.19 或更新版本即可运行。先看并发加 `steer` 的参考运行记录，再把插话改成排队追问。

```bash
node ./examples/chapter-2/demo.ts
node ./examples/chapter-2/demo.ts --follow-up
```

打开 `examples/chapter-2/exercise.ts`，补上两个函数。`--sequential` 可以单独切换工具调度，`--exercise` 会执行你填的版本。

1. `runToolBatch(calls, execute, mode)` 接收同一条回复里的调用。顺序模式等一个执行完再开始下一个。并发模式一起启动，返回的结果保持 `calls` 顺序。实验已经把读文件异常转成 `ToolResult`，`execute` 会返回这条失败结果。
2. `takeNextInput(queues, hasToolResults)` 在一轮结束后调用。有 `steer` 就取出并移除它。如果这轮还有工具结果需要交回模型，先保留 `followUp`。等没有后续工具轮次时，再取出并移除排队的追问。

```bash
node ./examples/chapter-2/demo.ts --exercise --sequential
node ./examples/chapter-2/demo.ts --exercise --verify
```

验收会跑四种组合，检查两个工具的完成顺序、结果与调用 ID 的对应关系，以及新消息第一次出现在哪次请求。可以先用 `node ./examples/chapter-2/demo.ts --verify` 看参考实现的验收结果。

::: details 看参考实现
<<< ../examples/chapter-2/runtime.ts#scheduling
:::

## Pi 当时怎么改

把回放切到「顺序」和 `steer`。当新输入进入队列时，`test.log` 正在读取，`missing.log` 还没开始。先猜一猜：如果每个工具结束后都检查 `steer`，第二个读取会实际发生吗？

提交 `208a2cc` 的前一版，顺序执行路径会在每个工具之后检查 `steer`。收到新消息时，剩余调用会被标记为跳过。这个提交把检查移到整轮工具处理结束之后。在回放对应的新版语义里，`missing.log` 会真的尝试读取，模型在下一轮同时收到读取失败和用户的新要求。读 diff 时，先找被删掉的 `skipToolCall()`，再找轮次结尾的 `getSteeringMessages()`。 [把 `steer` 推迟到工具批次之后](https://github.com/earendil-works/pi/commit/208a2cc123b52098233400649ed64157cb10d6e6)

::: details 再看一个变化：先结束的工具什么时候能显示完成？
提交 `759d551` 把并发工具的 `tool_execution_end` 移到单个调用结束时发出，同时保留结果消息按调用顺序汇总的做法。可以用回放里的 `missing.log` 自查：它失败后，界面已经有一条完成记录，下一次模型请求仍要等 `test.log`。 [提前发出完成事件的提交](https://github.com/earendil-works/pi/commit/759d5515278389195e2d48122b1ca1bcfedab776)
:::

## 合上代码，复述一遍

1. 为什么 `missing.log` 可以先显示失败，模型却先看到 `call_1` 的结果？
2. 同一句「只总结 `test.log`」通过 `steer` 和 `followUp` 发送时，分别在哪次请求里出现？
3. 如果同一批调用中有一个工具要求顺序执行，Pi 怎么选执行路径？

::: details 核对你的解释
1. 完成事件随各个工具结束发出，结果消息在整批结束后按调用顺序汇总。
2. 在本章场景中，`steer` 进入第二次请求，`followUp` 进入第三次请求。两者都保留已经产生的工具结果。
3. 整批改走顺序执行路径。
:::

下一章会打开 `streamAssistantResponse()` 的另一端，看同一套内部消息怎样被转换成不同服务商的请求，以及流式参数怎样拼回工具调用。 [第三章：一个循环怎样接不同模型](./chapter-3.md)

## 注释

**注 1 · 实验中的简化。** 两个读取都使用固定输入，假模型一次返回完整的助手消息。为复现同一个时机，程序在慢读开始后自动入队新消息。实验里的「开始读取」指实际调用读函数，Pi 的 `tool_execution_start` 还会出现在校验和执行前钩子之前。真实循环还支持配置每次取一条还是取全部队列消息，以及取消、结束钩子和上下文准备。 [Pi 的 Agent 循环](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L172) · [队列配置](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent.ts#L506)
