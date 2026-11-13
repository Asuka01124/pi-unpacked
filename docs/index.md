---
title: 从聊天到行动
description: 看清一次工具调用，写出最小的 Agent 循环，再用 Pi 的提交验证你的设计。
---

<script setup>
import TraceReplay from './components/TraceReplay.vue'
</script>

<p class="chapter-label">第 1 章</p>

# 从聊天到行动

<p class="chapter-lede">亲手跑通一次工具调用。你会看到模型怎么提出请求，程序怎么读文件，以及日志内容在哪一步进入模型的上下文。</p>

<blockquote class="chapter-task"><p>帮我看看 <code>test.log</code> 里的测试为什么失败。</p></blockquote>

第一次问模型时，日志还在磁盘上。程序可以在模型请求中声明一个 `read` 工具，告诉模型它接受 `path` 参数。模型据此提出调用，由程序执行。程序拿到结果后，再连同之前的消息一起发给模型。

## 这一章要学会什么

预计用时 30–45 分钟。你需要能读懂 TypeScript 的数组、函数和 `async/await`；不需要 API Key，也不用启动 Pi。

完成后，你应该能独立完成三件事：

- 画出一次工具调用从请求到结果的路径，分清模型和程序的职责。
- 写出可以处理直接回答、读取成功和读取失败的最小循环。
- 用停止原因解释：为什么参数看起来合法，程序仍可能拒绝执行。

本章只处理一个 `read` 工具、每条回复最多一个调用。真实模型可能发出多个调用，后面的章节再逐步扩展。

## 走一遍工具调用

先猜第二次请求会比第一次多出几条消息。然后点「下一步」，停在「请求模型 2」，看实验传给假模型的消息数组。

<TraceReplay />

第二次请求新增了两条消息。第一条是模型发出的 `assistant` 消息，里面有 `read` 调用。第二条是程序追加的 `toolResult` 消息，里面有日志原文。`toolCallId` 把结果和原来的 `call_1` 对起来。即使读取失败，模型也能根据这条结果知道调用发生了什么。

::: details 先切到「文件不存在」，再展开核对
工具结果的 `isError` 是 `true`，内容是找不到文件的原因，调用 ID 仍然是 `call_1`。模型据此解释自己为什么没读到日志。文件缺失也走完了两次模型请求。
:::

这里用的是简化后的 Pi 消息格式。<sup><a href="#注释">注 1</a></sup>

## 模型提出请求，程序完成行动

这里的 Agent 是一个由程序驱动的循环：程序把上下文交给模型，模型选择回答或请求工具，程序执行工具后把结果加入上下文，再请求模型。决定是否执行、怎么执行和什么时候停止，都是运行程序的职责。

| 消息 | 谁产生 | 这一章里装着什么 |
| --- | --- | --- |
| `user` | 用户输入，由程序保存 | 要调查的测试问题 |
| `assistant` | 模型 | 最终文本，或带有调用 ID 的工具请求 |
| `toolResult` | 程序 | 同一调用 ID、文件内容或错误，以及 `isError` |

`toolCallId` 是关联请求和结果的标识。即使现在只有一个调用，也应该保留它；后面同时执行多个调用时，不能靠消息里的文字猜结果属于谁。

`stopReason` 则决定下一步：`stop` 表示返回最终回答，`toolUse` 表示有工具请求，`length` 表示输出碰到了长度上限。**工具执行完不代表任务已经结束**，模型还需要再收到结果，才能基于这份日志作答。

::: tip 为什么每次还要带上旧消息？
本实验把对话上下文保存在程序的 `messages` 数组中，每次调用都传入它。假模型按脚本运行，只看最后一条消息来决定返回什么。
:::

网页回放可以直接点着看。下面的动手练习在本地终端运行，会用 Node.js 读取项目里的示例日志。

## 自己写一个最小循环

项目里已经备好了假模型、示例日志和参考实现。运行练习只需要本地的 Node.js 22.19 或更新版本。可以在终端用 `node --version` 查看版本。

在终端进入 `pi-agent-lab` 文件夹（里面有 `examples` 目录），先运行现成的参考示例：

```bash
node ./examples/demo.ts success
```

终端会打印每次发给假模型的消息，最后应显示「模型请求 2 次，read 执行 1 次」。

先打开 `examples/fake-model.ts` 看一眼：第一次请求返回工具调用，收到工具结果后返回固定文本。它不会推理；日志里的 HTTP 401 也只提供了排查方向，不能据此断言缺少凭据就是唯一原因。

跑通示例后，打开 `examples/exercise.ts`，填好 `runExercise` 函数。假模型和读文件函数会作为参数传进来，你只需要写调用它们的循环。后面的命令加上 `--exercise` 就会运行你写的版本。`onStep` 是网页回放用的可选回调，可以先跳过。

1. 把用户问题放进消息列表，调用 `askModel(messages)`，再把模型的回复也存进去。
2. 当 `stopReason` 是 `stop`，返回模型的最终文本。当它是 `toolUse`，把 `toolCall.arguments.path` 传给 `read`。
3. 把读取结果追加为 `toolResult`。用 `toolCall.id` 填写 `toolCallId`。读取抛出错误时，把错误内容写进结果，并设 `isError: true`。
4. 继续请求模型，直到它给出最终回答。可以给实验设一个小的轮次上限，方便发现写错的循环条件。

用这三条命令检查你的实现。脚本最后会打印请求次数和读取次数。

```bash
node ./examples/demo.ts direct --exercise
node ./examples/demo.ts success --exercise
node ./examples/demo.ts missing --exercise
```

| 场景 | 模型请求 | `read` 执行 | 最后检查什么 |
| --- | ---: | ---: | --- |
| `direct` | 1 | 0 | 返回最终回答后退出循环 |
| `success` | 2 | 1 | 第二次请求带上调用 ID 和日志内容 |
| `missing` | 2 | 1 | 第二次请求带上调用 ID 和错误内容 |

需要自动检查时，在项目根目录执行：

```bash
node ./examples/verify.ts --exercise
```

它会验证三种基础场景的消息顺序、调用 ID、错误标志和执行次数。完成后面的截断实验，再执行 `node ./examples/verify.ts --exercise --all` 验收四种场景。直接执行 `node ./examples/verify.ts --all` 可以检查参考实现。

::: details 卡住时，按现象检查
- 第二次请求还只有用户问题：检查是否保存了模型回复和工具结果。
- 文件不存在时程序直接退出：把读取的异常转换为 `isError: true` 的结果，再交回模型。
- 模型反复要求读取：检查是否把 `toolResult` 追加到同一份消息列表。
- 直接回答还在继续循环：收到 `stop` 后应立即返回最终文本。
:::

::: details 完成练习后查看参考实现
<<< ../examples/agent-loop.ts#loop
:::

## 去 Pi 源码里找这三步

打开 `packages/agent/src/agent-loop.ts` 的 `runLoop`。按顺序找 `streamAssistantResponse`、`executeToolCalls` 和 `currentContext.messages.push(result)`。这三处对应你刚才写的「请求模型」「执行工具」「把结果交回模型」。Pi 的一条回复可以包含多个工具调用，所以这里会先收集一批工具结果，再逐条加入上下文。 [阅读固定版本的 `runLoop`](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L172)

## Pi 当时怎么改

如果模型正生成工具参数时碰到了输出长度上限，程序应该怎么做？切到上面的「参数截断」，先看工具请求。`path` 已经是一个合法字符串，但模型返回的 `stopReason` 是 `length`。你刚写的循环会执行这次读取吗？

```bash
node ./examples/demo.ts truncated --exercise
node ./examples/demo.ts truncated
```

Pi 以前会把这类工具请求交给常规执行流程。流式 JSON 解析可能把残缺的参数整理成一个能通过校验的对象。参数合法只能说明它符合格式，程序仍然需要判断模型有没有说完。

提交 `351efc828` 在执行工具前增加了对 `stopReason` 的检查。回复因长度上限结束时，Pi 会给其中的调用各返回一条错误，告诉模型可以用完整参数重新发起请求。

这条提交说明还记录了一个被撤回的方案：最初尝试严格解析最终参数，并用 `malformedArguments` 保存异常 JSON；最终撤回这层追踪，改在 Agent 循环中统一处理 `length`，没有给 `ToolCall` 增加字段，也没有修改各服务商实现。你可以在提交说明中核对这次取舍：判断被放在了有足够信息决定是否执行的循环层。

```diff
- const executedToolBatch = await executeToolCalls(currentContext, message, config, signal, emit);
+ const executedToolBatch =
+     message.stopReason === "length"
+         ? await failToolCallsFromTruncatedMessage(toolCalls, emit)
+         : await executeToolCalls(currentContext, message, config, signal, emit);
```

这个实验构造的是解析之后的消息：它没有模拟流式 JSON 解析器，而是直接提供合法的 `path` 与 `length`，让你单独检验执行前的判断。如果你的第一版只区分「最终文本」和「工具调用」，这里可能已经读取了一次文件；给 `length` 分支追加错误结果并跳过 `read`，再比较执行次数。

| 同一个截断请求 | 简单地执行所有调用 | 增加停止原因检查后 |
| --- | --- | --- |
| `path: "test.log"`，`stopReason: "length"` | `read` 执行 1 次 | `read` 执行 0 次 |
| 交回模型的内容 | 日志 | 提醒重新发起完整调用的错误 |

放弃的是「只要解析出了调用就执行」的做法；增加的是执行前的完整性判断；正常 `toolUse` 请求仍应读取一次。这里的假模型收到错误后就结束，真实模型是否重试，需要由它的后续回复决定。

参考实现的终端结果是 **请求模型 2 次，执行 `read` 0 次**。加上这个判断后，再跑一次 `success`，确认正常读取仍然执行 1 次。 [改动前的循环](https://github.com/earendil-works/pi/blob/8a2ce5a54024be2eb2b879288212141741afa65e/packages/agent/src/agent-loop.ts) · [提交 #6285](https://github.com/earendil-works/pi/commit/351efc828b6fc5250fa50d6b32b20b0f0cb22cb4)

## 合上代码，复述一遍

先不看上面的说明，回答这四个问题：

1. 第二次请求为什么是三条消息，而不是只传日志？
2. 文件不存在时，模型请求几次，读取尝试几次？
3. `path` 是合法字符串，为什么 `length` 仍然会阻止读取？
4. 如果 `path` 指向工作区外，应该由谁决定能不能读？

::: details 核对你的解释
1. 用户问题说明任务，模型调用说明它请求了什么，工具结果说明实际发生了什么；调用与结果通过 ID 关联。
2. 两次模型请求、一次读取尝试。失败也生成工具结果，模型能据此回答。
3. 参数符合格式并不能证明整条回复完整。停止原因提供了另一条执行依据。
4. 由程序的授权策略和运行环境约束。模型提出路径不等于取得访问权限；本章示例只允许两个固定文件名，还没有实现通用权限系统。
:::

当三种基础场景和截断验收都通过，并且你能不看源码画出「两次模型请求、一次读取」的过程，这一章就完成了。

下一章从同一个 `read` 继续。模型一次请求读两份日志时，Pi 怎样安排工具和用户的新输入？ [第二章：Pi 怎样驱动一次运行](./chapter-2.md)

## 注释

**注 1 · Pi 内部消息和 API 格式**

`role: "toolResult"` 和 `toolCallId` 都是 Pi 内部的真实字段。实验把一次工具调用直接放在 `assistant.toolCall`，把结果内容写成字符串。Pi 把调用放在 `assistant.content` 数组里，工具结果的 `content` 也是内容块数组，结果消息还带有 `toolName` 和 `timestamp`。 [Pi 的消息类型](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/ai/src/types.ts#L593)

发请求时，Pi 的适配器会把内部消息转成服务商要求的格式。

| API | 工具结果的位置 | 对应原调用的字段 |
| --- | --- | --- |
| OpenAI Responses | `input` 中的 `type: "function_call_output"` 项，结果放在 `output` | `call_id` |
| OpenAI Chat Completions | `messages` 中的 `role: "tool"` 消息，结果放在 `content` | `tool_call_id` |
| Anthropic Messages | `role: "user"` 消息的 `content` 中的 `type: "tool_result"` 块 | `tool_use_id` |

[OpenAI Responses](https://developers.openai.com/api/docs/guides/function-calling) · [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) · [Anthropic Messages](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)
