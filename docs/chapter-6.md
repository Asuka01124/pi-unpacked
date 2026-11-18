---
title: 用 Extensions 改造 Pi
description: 写一个登录故障调查扩展，沿源码追踪命令、工具钩子和会话状态。
---

<script setup>
import ExtensionReplay from './components/ExtensionReplay.vue'
</script>

<p class="chapter-label">第 6 章</p>

# 用 Extensions 改造 Pi

<p class="chapter-lede">输入 <code>/triage on</code>，收起写入和执行命令的工具。开始排查时，Pi 加入调查指令，由诊断工具返回第一条 HTTP 401。退出再回来，调查状态和证据还在。</p>

第五章的模板展开后是一段用户消息。现在给 `/triage` 注册一个命令处理器，让它直接改变会话的工具集合。接着发一条普通用户消息，观察扩展又在哪些位置参与运行。

## 从命令跟到会话恢复

点「下一步」，先留意 `activeTools` 怎么变。到「诊断工具返回」时，展开「查看步骤和 JSON」，对照结果里的 `content` 和 `details`。「测试拦截」是专门给 `tool_call` 钩子做的离线探针。<sup><a href="#注释">注 1</a></sup>

<ExtensionReplay />

## 扩展怎样进入 Pi

本章的 `triage.ts` 默认导出一个接收 `pi: ExtensionAPI` 的函数。Pi 加载模块并调用它。函数体内的 `registerCommand()`、`registerTool()` 和 `pi.on()` 分别登记命令、工具与事件处理器。等命令输入、运行开始或工具完成时，会话运行时再调用对应的处理器。一次注册可以覆盖后续多轮运行。 [创建扩展 API](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/extensions/loader.ts#L253) · [加载扩展函数](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/extensions/loader.ts#L630)

Pi 先看以 `/` 开头的输入能否交给某个扩展命令。找到 `/triage` 时，它把 `on` 作为参数传给 `handler`，等待命令执行后就结束这次输入处理。这个 handler 直接切换工具和写状态，本身无需调用模型。随后发送的普通问题才开始调查。 [命令派发顺序](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L2175) · [给 handler 传参数](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L2281)

::: details 查看 `/triage` 的注册代码
<<< ../examples/chapter-6/triage.ts#command
:::

## 一次调查经过哪些钩子

本章的 `inspect_login_log` 由 `registerTool()` 注册。名称、描述和参数 schema 用来声明工具，`execute()` 则在本地扫描第四章的示例日志，定位第一处 HTTP 401。下面三个钩子跨过了一次运行的不同边界。

| 钩子 | 在哪里生效 | `/triage` 用它做什么 |
| --- | --- | --- |
| `before_agent_start` | 输入已经处理，模型运行即将开始 | 开启调查时，把排查指令写进 `systemPromptOptions.sections.triage`。 |
| `tool_call` | 工具通过查找和参数校验后，马上要执行 | 对到达钩子的工具调用检查调查模式，返回 `{ block: true, reason }` 可以拒绝。 |
| `tool_result` | 工具执行结束，最终结果消息尚未发出 | 给诊断结果附一条说明，提醒模型继续验证凭据原因。 |

`setActiveTools()` 在组装请求时改变模型看到的工具集合，`tool_call` 在执行路径上检查到达的调用。这两处能观察到不同的失败。比如 `bash` 已经从活动列表移除，普通模型请求里的 `bash` 可能在查找工具时就被拒绝。回放把 `bash` 直接传给钩子，单独观察它的决策。若你在扩展里改写 `event.input`，该位置已过 Pi 的参数校验，改后的值由你的扩展负责。 [执行前校验和拦截](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L718) · [会话怎样接上两个工具钩子](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L716)

Pi 仓库里的 Plan Mode 示例也在开启时保存工具列表，在退出时恢复。它对 `bash` 命令另做 allowlist 检查，还会注入计划上下文并记录进度。本章的调查模式只保留已启用的 `read`、`grep`、`find`、`ls` 和示例诊断工具，便于分别看清工具集合和钩子怎样工作。 [Plan Mode 的工具集合](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/plan-mode/index.ts#L108) · [Plan Mode 的调用检查](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/plan-mode/index.ts#L168)

::: details 查看三个钩子
<<< ../examples/chapter-6/triage.ts#hooks
:::

## 让调查状态跟着会话分支走

扩展里的 `let mode` 跟着进程走。关闭再打开后，要从会话记录恢复这一值。`/triage on` 和 `/triage off` 都用 `pi.appendEntry()` 写一个带 `customType` 的条目，保存模式和开启前的工具列表。这类条目供扩展恢复使用，不参加模型上下文。

诊断证据则保存在工具结果的 `details`，用于 `/triage status` 取回行号。给模型看的证据和说明在 `content`。`tool_result` 只返回对 `content` 的补充，诊断工具原有的 `details` 会保留下来。扩展在 `session_start` 和 `session_tree` 读取当前 `getBranch()`。如果从做过诊断的节点退回到诊断之前，最近证据也应随着分支变化。 [Pi 的扩展状态管理](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/extensions.md#state-management) · [写入自定义条目](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L3574)

## 动手实现调查策略

先在项目根目录运行离线实验，查看切换、诊断和恢复的记录。Node.js 22.19 或更新版本即可。

```bash
node ./examples/chapter-6/demo.ts
```

打开 `examples/chapter-6/exercise.ts`，补上两个函数。可以从 `policy.ts` 导入 `DIAGNOSTIC_TOOL`。

1. `triageTools(active)` 从原集合挑出 `read`、`grep`、`find`、`ls` 和诊断工具，保留顺序，返回新数组。原列表要留给 `/triage off` 恢复。
2. `checkToolCall(triageEnabled, toolName)` 在开启调查且工具不在允许集合时返回 `{ block: true, reason }`。`reason` 带上工具名，让调用者知道哪次调用被拒绝。其他情况返回 `undefined`。

```bash
node ./examples/chapter-6/demo.ts --verify --exercise
```

不带 `--exercise` 时，脚本使用网页和实际扩展共用的参考策略。除了工具策略，验收也检查了分支状态和最新诊断证据的重建。验收通过后，可以让 `triage.ts` 从 `exercise.ts` 导入这两个函数，直接在 Pi 里试你写的策略。

::: details 查看参考策略
<<< ../examples/chapter-6/policy.ts#policy
:::

## 把扩展加载进真实 Pi

如果已经装好 Pi，可以从项目根目录显式加载扩展。这个示例按教程基准源码的扩展 API 编写，并用 Pi 1.5.2 检查。

```bash
pi -e ./examples/chapter-6/triage.ts
```

进入 Pi 后先输入 `/triage on`，再发送「请调用 `inspect_login_log`，告诉我日志显示了什么」。这条普通消息需要已配置的模型。诊断完成后，输入 `/triage status` 看最近证据。保持调查模式开启，使用 `/resume` 重新打开这条会话，再查一次状态。新会话至少要有一条实际的用户或助手消息才会创建会话文件。最后输入 `/triage off` 恢复工具。 [Pi 的扩展加载方式](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/extensions.md#quick-start) · [会话文件写入时机](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/session-manager.ts#L1169)

## Pi 当时怎么改

有些扩展会在后台任务完成时用 `pi.sendMessage(..., { triggerTurn: true })` 发起一轮。这样开始的运行，也该执行 `before_agent_start` 吗？

提交 `a447ba1` 之前，这条路径跳过了该钩子。工具执行完后的准备工作可能回到基础提示词配置，把扩展添加的段落撤下，影响提示词缓存。提交让自定义消息发起的运行也经过同一套启动准备，并用 `messageType` 告诉处理器触发来源。现在可以为两类运行都加调查约束，也可以像仓库的 Plan Mode 示例一样，只为用户发起的运行注入一次面向用户的计划提示。 [补齐自定义消息启动路径的提交](https://github.com/earendil-works/pi/commit/a447ba11f3e7760fcff91e924bda8c20033953ea)

## 合上代码，复述一遍

1. 为什么输入 `/triage on` 时，Pi 可以立即改变工具列表？
2. 工具执行前和执行后，扩展分别在哪两个事件改变行为？
3. 为什么 `/triage status` 查当前分支就够了？

::: details 核对你的解释
1. 扩展命令由会话直接派发给 `handler`，它通过 `setActiveTools()` 改变后续运行的工具集合。
2. `tool_call` 可以拒绝执行。`tool_result` 可以修改将要交回模型的结果。
3. 模式与证据都沿当前历史记录保存。切到诊断前的节点，后续诊断结果就不在这条分支里。
:::

下一章会把工具暴露、调用审批与进程权限放到同一次写入中对照。 [第七章：权限到底在哪一层生效](./chapter-7.md)

## 注释

**注 1 · 实验边界。** 网页和终端用固定数据展示扩展各步骤，独立运行 `triage.ts` 才会走 Pi 的加载器和事件分发。调查模式只影响 Pi 通过这些接口管理的工具调用。进程仍在原有的系统权限下运行。 [Pi 安全文档](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/security.md)
