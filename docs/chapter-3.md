---
title: 一个循环怎样接不同模型
description: 对照 OpenAI Responses 和 Anthropic Messages，把同一次工具调用从流事件追到下一次请求。
---

<script setup>
import ProviderReplay from './components/ProviderReplay.vue'
</script>

<p class="chapter-label">第 3 章</p>

# 一个循环怎样接不同模型

<p class="chapter-lede">同一次 <code>read("test.log")</code>，两家 API 会发出不同的事件，也要求不同的结果格式。Agent 循环怎样用同一套逻辑处理它们？</p>

第二章追到了 `streamAssistantResponse()`。这次我们打开函数的另一端，跟着一次调用往返。第一次请求声明 `read`，服务商逐段发回工具参数，程序读出日志，第二次请求把日志交回模型。

## 找到同一次调用的 ID

先选 OpenAI Responses，在「第一次请求」里找 `tools`。切到「工具调用的流事件」，点几次「下一个事件」，看 `{"pa` 怎样拼成 `{"path":"test.log"}`。再打开「循环收到的回复」，看看适配器交给循环的对象。最后在「第二次请求」里找到调用和结果共用的 ID，换成 Anthropic Messages 再对照一次。

<ProviderReplay />

这里使用按公开协议构造的固定事件，字段做了删减。网页和终端离线实验共用同一份事件与适配代码。<sup><a href="#注释">注 1</a></sup>

::: details 核对你的观察
- Responses 用 `call_id` 连接 `function_call` 和 `function_call_output`。流事件还有一个 `id: "fc_1"`，它标识输出项。回填结果时用的是 `call_id`。
- Messages 用 `tool_use.id` 和 `tool_result.tool_use_id` 配对。结果块由程序放进一条 `role: "user"` 消息的 `content`，`type: "tool_result"` 表明它是客户端工具执行的结果。
:::

## 请求怎样从循环到服务商

在 Pi 的 `streamAssistantResponse()` 中，`transformContext` 可以先调整内部上下文，`convertToLlm` 再把 `AgentMessage[]` 转成 `pi-ai` 使用的 `Message[]`。随后 `streamFunction` 接过模型和上下文。在 CLI 中，这个函数接到 `ModelRuntime.streamSimple()`，它选择 provider、准备认证和请求选项，再交给对应的接口实现。工具的执行和结果回填仍由 Agent 循环负责。 [Agent 循环](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L390) · [CLI 模型运行时](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/model-runtime.ts#L744)

同一条内部工具调用进入适配器后，有两种写法。

| 请求里的内容 | OpenAI Responses | Anthropic Messages |
| --- | --- | --- |
| 声明 `read` 的参数 | `tools[].parameters` | `tools[].input_schema` |
| 回放模型提出的调用 | `input` 中的 `function_call`，`arguments` 是 JSON 字符串 | `assistant.content` 中的 `tool_use`，`input` 是对象 |
| 回填本地结果 | `input` 中的 `function_call_output`，用 `call_id` 配对 | `user.content` 中的 `tool_result`，用 `tool_use_id` 配对 |

调用 ID 跟着工具结果走。实验用 `call_1` 和 `toolu_1` 对照两套格式，实际接入时 ID 取自服务商发回的调用。 [OpenAI 工具调用文档](https://developers.openai.com/api/docs/guides/function-calling) · [Anthropic 工具调用文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)

## 工具参数为什么要等到流结束

服务商发来的是连续的事件。Responses 的 `response.function_call_arguments.delta` 用 `output_index` 标识对应的输出项。Messages 的 `content_block_delta` 里有 `input_json_delta`，外层的 `index` 标识内容块。Pi 把两者转成内部的 `toolcall_delta`，普通文本的增量则转成 `text_delta`。 [Responses 流处理](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/ai/src/api/openai-responses-shared.ts#L727) · [Anthropic 流处理](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/ai/src/api/anthropic-messages.ts#L1042)

沿着事件找两个结束点。

1. **工具块结束。** Responses 的 `response.function_call_arguments.done` 可以带回最终参数，`response.output_item.done` 收完工具项。Messages 用 `content_block_stop` 标出工具块结束。Pi 在对应位置生成内部 `toolcall_end`。
2. **整条回复结束。** Responses 的回复可能以 `response.completed` 结束，也可能以 `response.incomplete` 结束。Messages 的 `message_delta` 给出 `stop_reason`，`message_stop` 收尾。Agent 循环拿到整条回复后，再结合停止原因和参数校验决定是否执行工具。

回想第一章的截断场景。即使前面已经拼出了合法 JSON，整条回复仍可能因为输出达到上限而结束。实验会把它转成 `length`，沿用第一章的循环给模型返回错误，读取次数为 **0**。 [Pi 截断分支](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L269)

## 动手改一个适配器

在项目根目录打开终端。Node.js 22.19 或更新版本即可运行离线实验。

```bash
node ./examples/chapter-3/demo.ts responses
node ./examples/chapter-3/demo.ts messages
```

输出里的 `requests` 记录两次请求，`firstEvents` 记录第一轮的服务商事件，`firstReply` 是循环拿到的内部回复。找出两边第一条工具声明、第一次参数增量，以及第二次请求里的配对 ID。

打开 `examples/chapter-3/adapters.ts`，先在 `messagesRequest()` 里临时把 `tool_use_id` 改成固定值，执行下面的验收，看哪个断言会失败。再根据收到的 `ToolResult` 修复它。接着试着改坏流解析中的一处索引检查，或者在收到第一个参数片段时尝试解析 JSON，观察失败发生在哪一步。恢复代码后，两套接口都应通过验收。

```bash
node ./examples/chapter-3/demo.ts --verify
```

::: details 查看请求转换代码
<<< ../examples/chapter-3/adapters.ts#request
:::

## 用自己的 API Key 跑一次

这一步可选。脚本会调用 Anthropic Messages API，使用你的 API 额度。第一轮指定 `read`，第二轮将 `examples/test.log` 的示例内容交给模型，要求它解释日志里的现象。请使用你的账户可用的 Claude 模型 ID。 [Anthropic 流式接口文档](https://platform.claude.com/docs/en/build-with-claude/streaming)

在本地终端设置 `ANTHROPIC_API_KEY` 和 `ANTHROPIC_MODEL`。例如在 PowerShell 用 `Read-Host -MaskInput` 输入密钥：

```powershell
$env:ANTHROPIC_API_KEY = Read-Host '输入 Anthropic API Key' -MaskInput
$env:ANTHROPIC_MODEL = Read-Host '输入 Claude 模型 ID'
node ./examples/chapter-3/demo.ts --live
```

顺利时你会看到两次模型请求、中间的参数增量和一次实际的 `read(test.log)`，最后是模型对 HTTP 401 的解释。API Key 只由本地脚本读取，网页回放使用固定事件。

## Pi 当时怎么改

假设流式解析器已经从 `{"path":"test.log",]` 提取出 `path`。整条回复按正常状态结束时，你会允许这次读取吗？

Pi 的旧实现有机会保留错误前解析出的字段。提交 `87f9a364` 改为在工具调用收尾时严格解析最终参数（保留既有的字符串修复）。解析失败时留下 `argumentsError`，由参数校验把错误报告给模型。这样即使前缀包含可用的 `path`，工具也不会拿这份残缺结果去读文件。 [修复提交](https://github.com/earendil-works/pi/commit/87f9a36419e8164bba77397d15c54ff39fac5e8a)

本章的离线验收同时包含「合法参数但回复被截断」「畸形的最终 JSON」和「缺少结束事件」。三者分别出现在回复状态、参数解析和事件流边界。可以删掉一处相关检查，再用验收观察哪种情况会漏过。

## 合上代码，复述一遍

1. 为什么 Responses 回填工具结果时要用 `call_id`？
2. Anthropic 为什么能在一条 `user` 消息里指明这段内容来自工具？
3. 收到 `toolcall_end` 后，还有哪一步决定是否执行？

::: details 核对你的解释
1. `call_id` 连接调用和结果。输出项的 `id` 用于标识那一项。
2. `user.content` 里的 `tool_result` 块明确标记了工具结果，`tool_use_id` 进一步指出是哪次调用。
3. 循环需要拿到完整回复、判断停止原因，再通过参数校验与执行前逻辑。
:::

下一章会从实验中的 `read` 继续，设计长日志的续读方式，并跟着 Pi 的 `edit` 看工具怎样定位修改。

## 注释

**注 1 · 实验的范围。** 实验沿用第一章的单次 `read` 和简化消息类型，用严格 `JSON.parse` 校验最终参数。实验在收到回复的结束事件后才产出 `toolcall_end`，并让畸形 JSON 直接报错。Pi 在工具块收尾时就能发出 `toolcall_end` 供订阅方观察，实际执行仍等整条回复结束。真实 Pi 也支持一轮里的多个内容块和调用、会话重放时的 ID 转换，以及把参数错误作为工具结果返回给模型。 [Pi 的消息类型与工具调用](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/ai/src/types.ts#L452)
