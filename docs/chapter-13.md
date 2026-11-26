---
title: 同一个 Agent 怎样服务不同界面
description: 对照 Pi 的 SDK、TUI、JSON 模式和双向 RPC，写一个能引导与取消运行的客户端。
---

<script setup>
import RpcReplay from './components/RpcReplay.vue'
</script>

<p class="chapter-label">第 13 章</p>

# 同一个 Agent 怎样服务不同界面

<p class="chapter-lede">第十二章从子进程的 stdout 读回了一串事件。如果你正在做自己的编辑器界面，还想在工具执行时补充要求、取消运行，或者查询会话状态，该往 Pi 的 stdin 写什么？</p>

## 运行中发送第二条命令

点「开始读日志」，在工具执行时点「只报告状态码」。展开 JSONL 记录，找到 `steer` 的应答，再看工具结束后才出现的补充消息。接着开始模拟测试，按下「取消运行」，找到停止这一轮的事件。

<RpcReplay />

这里的客户端和服务都在网页内模拟，终端实验会走真实的进程管道。两者共用命令、分帧和应答配对代码。<sup><a href="#注释">注 1</a></sup>

## 会话负责执行，入口负责交互

Pi 在 CLI 启动时创建会话运行时，再根据模式交给交互、打印或 RPC 入口。SDK 则把创建会话的能力直接交给 TypeScript 调用方。这几条路共用 `AgentSession`，所以工具执行等事件可以在终端渲染，也可以交给 SDK 订阅者，或序列化给另一个进程。 [CLI 模式分流](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/main.ts#L1010) · [SDK 创建会话](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/sdk.ts#L191)

| 入口 | 输入和输出 |
| --- | --- |
| TypeScript SDK | 在同一进程调用会话方法，通过 `session.subscribe()` 读事件。 |
| 交互 TUI | 将按键、输入框和命令接到会话，订阅事件后更新组件。 |
| `--mode json` | 从 CLI 参数发起任务，把会话事件逐行写到 stdout，适合一次性运行和子进程回收。 |
| `--mode rpc` | 常驻进程从 stdin 收命令，通过 stdout 回应并不断发送事件，可继续接收下一条命令。 |

第十二章的子代理在启动时就拿到了任务，只需读取 JSON 事件。编辑器要保持同一个会话、控制正在进行的运行时，RPC 给它额外的命令入口。 [TUI 订阅](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L3526) · [JSON 模式写出事件](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/modes/print-mode.ts#L116) · [RPC 事件转发](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L362)

## 一条输出可能是应答，也可能是事件

RPC 使用 JSONL，一行一个 JSON 对象。客户端发出的命令可以带字符串 `id`，应答的 `type` 为 `response` 并带回该 ID。若同一时间有多条命令待处理，客户端应按 ID 配对。会话事件通常不带命令 ID，用来驱动界面更新。扩展的 UI 请求是另一类记录，独立于普通命令应答。 [协议记录与 ID 配对](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/rpc.md#protocol-records)

```jsonl
{"id":"req-1","type":"get_state"}
{"id":"req-1","type":"response","command":"get_state","success":true,"data":{"isStreaming":false}}
```

上面第二行只摘了状态应答中的相关字段。读取 stdout 时，一块数据可能只到半个汉字，也可能含多条记录。先用流式 UTF-8 解码，再只按 LF 分帧，接受 CRLF 结尾。JSON 字符串中的 `U+2028` 和 `U+2029` 都是合法内容，所以这里不能用会把它们也当成换行的 Node.js `readline`。客户端要持续读取 stdout，并把 stderr 当成独立的诊断输出。 [JSONL 读取器](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/modes/rpc/jsonl.ts#L15) · [RPC 分帧约定](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/rpc.md#framing)

## prompt 成功只说明命令已接收

`prompt` 启动会话处理。Pi 在预处理成功时回一个 `disposition`，告诉客户端这条输入是开始运行、已经排队，还是由处理器直接处理。比如回执是 `handled` 时，这个命令没有启动新运行，客户端无需为它等 `agent_settled`。一条命令成功后，模型工作仍可能失败或被取消。 [prompt 命令实现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L409) · [运行状态约定](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/rpc.md#run-lifecycle)

客户端应先订阅事件，再发命令。`tool_execution_start` 和 `tool_execution_end` 负责显示工具状态，`message_end` 提供完整消息。`agent_end` 只结束一次低层循环，溢出恢复、重试或队列还可能让会话继续。需要判断用户这次运行能否收尾时，看 `agent_settled`。 [事件字段](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/json.md) · [RpcClient 的等待逻辑](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/modes/rpc/rpc-client.ts#L471)

## steer 和 abort 控制同一个运行

第 2 章的输入队列也能从 RPC 使用。`steer` 把补充要求交给引导队列，当前一批工具完成后才会在下一次模型请求生效。`follow_up` 等当前工作准备结束后再处理。两者的应答说明消息是已排队还是被处理器消费。 [引导与追加](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/rpc-commands.md#steer)

`abort` 请求结束当前运行。界面可以结合 `agent_settled.aborted` 判断结果。真实 Pi 的 `abort` 仍可能继续处理已有的排队输入。如果要实现 TUI 的 Esc 行为，协议文档给出的顺序是先发 `clear_queue`，再发 `abort`，把返回的队列文字恢复到输入框。 [取消与清理队列](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/rpc-commands.md#abort)

## 动手实现分帧与消息路由

在仓库根目录用 Node.js 22.19 或更新版本运行。脚本启动同一个本地 Node.js 子进程，等读日志开始后发引导，再启动模拟测试并在运行中取消。

```bash
node ./examples/chapter-13/demo.ts
node ./examples/chapter-13/demo.ts --verify
```

打开 `examples/chapter-13/exercise.ts` 补上两个函数。

1. `createReader(onLine)` 用流式 `TextDecoder` 接收字节。缓存不完整的部分，只在遇到 LF 时交出一条记录，去掉行尾可选的 CR。`end()` 刷新解码器并交出最后仍留在缓冲区的非空记录。
2. `routeRecord(record, pending, onEvent)` 将应答按 ID 交给对应的等待者，处理后移除该项。事件立即交给事件回调，找不到等待者的应答可以忽略。

```bash
node ./examples/chapter-13/demo.ts --exercise --verify
```

验收会把中文逐字节送入读取器，在字符串中夹入 Unicode 分隔符，并把两条应答倒序交给路由。随后测试真实进程管道上的引导、取消和再次查询状态。

::: details 参考实现
<<< ../examples/chapter-13/protocol.ts#client
:::

## Pi 当时怎么改

如果界面把 `agent_end` 当成最终结束，一次自动重试就可能让它过早启用“开始”按钮。提交 `e9fa5a6` 加入了 `agent_settled`，并把 RPC 客户端的等待逻辑接到这个事件。读改动时，可以对照它为什么需要一个会话级的结束信号，以及低层的 `agent_end` 仍在什么位置发出。 [增加会话结束事件](https://github.com/earendil-works/pi/commit/e9fa5a68a1967f42a90a1c07f512bc8af63517a9)

## 合上代码，复述一遍

1. 连续发两条 RPC 命令，第二条先回，客户端应该用什么找到等待者？
2. 收到 `prompt` 的成功回执后，哪条事件告诉你当前运行没有待续工作？
3. 模拟测试开始后发出 `abort`，工具和会话分别怎样报告结果？

::: details 核对你的解释
1. 用命令与应答共享的 `id`。
2. 如果命令启动了运行，应继续等 `agent_settled`。`handled` 表示命令已直接处理。
3. 实验会收到失败的工具结束事件，以及 `aborted: true` 的 `agent_settled`。
:::

下一章会把前面的工具、资源、扩展与会话控制放在一起，完成一次 CI 故障排查。

## 注释

**注 1 · 实验范围。** 终端走真实标准输入输出，网页用内存传输。服务端只运行固定任务，用定时器模拟工具，简化了消息载荷和生命周期，省略认证、扩展 UI、重试以及真实 Pi 取消后继续处理队列的行为。使用真实 Pi 时，以所用版本的 RPC 文档为准。 [固定版本 RPC 文档](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/rpc.md)
