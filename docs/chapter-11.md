---
title: 工具太多时，模型怎样发现和组合它们
description: 对照 Pi 的 direct、deferred、codemode 和 hidden，比较模型请求、真实工具调用和筛选后的结果。
---

<script setup>
import ToolDiscoveryReplay from './components/ToolDiscoveryReplay.vue'
</script>

<p class="chapter-label">第 11 章</p>

# 工具太多时，模型怎样发现和组合它们

<p class="chapter-lede">第十章的 CI 服务只有一个查询工具。现在它还能列出所有失败任务。用户只想知道哪项任务报了 HTTP 401，模型需要在开始时就看到每个工具吗？三份查询结果又都要送回模型吗？</p>

## 用四种暴露方式查同一批任务

切换「直接声明」「搜索后调用」和「Code Mode」，比较首个请求看到的工具，再展开执行记录。三种路径都查了三项失败任务。打开「隐藏」后，看看这组工具还有没有被调用。

<ToolDiscoveryReplay />

在这次固定回放中，直接调用用了三次模型请求。按需搜索多了一次请求，Code Mode 则把列表、批量查询和筛选放进一次工具调用。三条路径都执行了四次 CI 工具，包括一次列举和三次查询。<sup><a href="#注释">注 1</a></sup>

## 工具注册之后，还要决定怎样暴露

Pi 先让 MCP 服务的工具进入注册表，再按暴露方式决定模型能从哪条路径到达它。服务配置里的 `exposure` 提供默认方式，`toolExposure` 可以覆盖个别工具。覆盖用服务端原始工具名，例如 `get-failed-test`。精确名称优先于通配模式。 [MCP 工具暴露设置](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/mcp.md#control-tool-exposure)

| 方式 | 模型和脚本怎样到达工具 |
| --- | --- |
| `direct` | 工具直接声明给模型，也能从 Code Mode 脚本调用。 |
| `deferred` | 首次请求没有工具声明。`tool_search` 命中后可直接调用，脚本也能按需使用。 |
| `codemode` | MCP 默认方式。工具可由脚本发现和调用，也能通过已启用的 `tool_search` 加载。 |
| `hidden` | 工具留在注册表中，模型和脚本都不可调用。 |

当启用的 MCP 服务连接后，Pi 可以按暴露方式启用 `tool_search` 或 `codemode`。表中比较的是常规 `codemode.mode: "on"` 下的路径。若设置为 `only`，Pi 会把原来直接声明的工具也改为通过脚本使用。 [暴露与自动启用](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/mcp.md#control-tool-exposure) · [Code Mode 的 on 与 only](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/codemode.md#call-tools)

## tool_search 改变下一次请求的工具表

假设当前请求只有 `tool_search`。模型提交一条查询，Pi 从尚未激活且可搜索的工具中挑候选，把名字、描述、命名空间和参数信息整理成可检索文档，再用 BM25 排序。命中的工具通过 `setActiveTools()` 并入活动集合。搜索结果会告诉模型加载了什么，工具的正式定义出现在**下一次**请求。 [搜索文档](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/tool-search/tool.ts#L131) · [排序并激活](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/tool-search/tool.ts#L297)

这些已加载的工具随会话记录保存，Pi 可以沿当前分支恢复。Code Mode 脚本里的 `searchTools()` 也能查找可调用工具，但它给脚本返回匹配项，不会把命中项加入模型下一次请求的工具表。 [会话里的工具发现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/mcp.md#control-tool-exposure) · [脚本发现接口](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/codemode.md#globals)

## Code Mode 把批量查询和筛选放进一次调用

模型交给 `codemode` 的是 JavaScript 源码。Pi 把源码放进 QuickJS 运行，提供 `tools`、`searchTools()`、`describeTool()` 等入口。脚本可以通过 `tools.mcp__ci__get_failed_test({ job })` 查询任务，也可以用 `Promise.all()` 并发查询。眼前的脚本读 MCP 结果的 `structuredContent`，从三份失败详情里挑出 HTTP 401，只返回任务名和状态。 [脚本运行规则](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/codemode.md#scripts) · [工具调用结果](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/codemode.md#call-tools)

<<< ../examples/chapter-11/ci-script.js#script

在 Pi 中，每次内部调用都会通过 `ctx.executeTool()` 回到工具管线，运行参数校验和扩展钩子。内部调用带上 `parentToolCallId`，可以追到外层的 `codemode` 调用。QuickJS 本身没有 Node 文件系统或网络 API，实际能碰到什么取决于宿主提供的工具及它们的权限。模型最终收到脚本输出，Pi 仍能在调用记录中告诉你脚本调用了哪些工具。 [注入并执行工具](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/codemode/execute.ts#L519) · [内部工具调用管线](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/nested-tool-calls.ts#L194)

这个方式省掉的是模型逐步决定如何处理列表与各项详情的往返。四次 CI 调用仍然发生。普通直接调用也能在同一轮里并发发出多个工具请求，就像第二章的批处理。

## 动手实现初始工具表和搜索加载

在仓库根目录用 Node.js 22.19 或更新版本运行实验。终端会打印每次请求声明的工具、实际调用和模型可见结果。

```bash
node ./examples/chapter-11/demo.ts
node ./examples/chapter-11/demo.ts --verify
```

打开 `examples/chapter-11/exercise.ts`，补上两个函数。

1. `initialTools(tools)` 收集直接暴露的工具。如果表里有 `deferred` 工具，加上 `tool_search`。如果有 `codemode` 工具，加上 `codemode`。隐藏项留在目录中。
2. `loadMatches(tools, active, query)` 对名字和描述做不区分大小写的子串匹配。只从尚未激活的 `deferred` 和 `codemode` 项里加载。空查询返回当前结果的副本。

```bash
node ./examples/chapter-11/demo.ts --exercise --verify
```

验收会检查搜索前后的声明、隐藏项是否被排除，以及脚本能否把三份详情筛成一条 HTTP 401 结果。

::: details 参考实现
<<< ../examples/chapter-11/exposure.ts#exposure
:::

## Pi 当时怎么改

工具的参数信息可以写在 JSON Schema 的本地 `$ref` 指向的定义里。如果只读引用这一层，搜索会漏掉里面的参数文字，Code Mode 也可能给脚本一份不完整的签名。提交 `6d3e342` 让这两处沿本地引用找到实际的定义。看这个改动时，可以拿同一个带引用的工具，对照它怎么进入搜索文档以及怎么生成脚本里看的类型。 [本地 schema 引用的修复](https://github.com/earendil-works/pi/commit/6d3e342b25db295bb266e28bdb1ebf09bdbae58d)

## 合上代码，复述一遍

1. `tool_search` 搜到某项工具后，本次工具结果和下一次模型请求分别增加了什么？
2. Code Mode 将三份日志筛成一条后，CI 一共被调用了几次？
3. 为什么第七章的执行前拦截仍然能阻止 Code Mode 发起的内部调用？

::: details 核对你的解释
1. 工具结果列出已加载的名字。下一次请求带上命中项的正式声明。
2. 四次。先列举，再查三项详情。
3. 内部调用仍用会话提供的工具执行管线，钩子会收到外层调用 ID。
:::

下一章会看另一个方向：给子代理一段任务，让它拥有自己的 Agent 循环，再把结果交回主会话。 [第十二章：子代理怎样成为一种扩展](./chapter-12.md)

## 注释

**注 1 · 实验范围。** 网页和终端共享固定 CI 样本，不启动 MCP 服务或模型。本章模拟暴露和消息往返，搜索改用子串匹配。回放只运行仓库内固定的脚本函数，真实 Pi 则在 QuickJS 中执行模型生成的源码。示例的请求次数只描述这条固定流程。 [Pi Code Mode 实现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/codemode.md)
