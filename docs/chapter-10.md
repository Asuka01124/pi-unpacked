---
title: MCP 怎样变成 Pi 的工具
description: 接入本地只读 CI 服务，追踪 MCP 握手、工具桥接、调用拦截和按 URI 读取资源。
---

<script setup>
import McpReplay from './components/McpReplay.vue'
</script>

<p class="chapter-label">第 10 章</p>

# MCP 怎样变成 Pi 的工具

<p class="chapter-lede">前几章从本地日志里找到了 HTTP 401。现在这份日志在 CI 服务里。Pi 怎样发现远端工具、把模型的调用送过去，再把结果带回原来的 Agent 循环？</p>

## 跟踪一次 CI 查询

先选「允许调用工具」，展开两组记录，比较模型看到的 `mcp__ci__get_failed_test` 和 `tools/call` 发给服务端的 `get-failed-test`。再选「执行前拦截」，观察哪条协议消息消失了。最后用「按 URI 读取资源」查看同一份日志。

<McpReplay />

网页用内存传输回放，终端会启动独立的本地 stdio 服务。两者使用同一份固定 CI 记录。<sup><a href="#注释">注 1</a></sup>

## 配置告诉 Pi 去哪里连接

Pi 读取用户级 `mcp.json`，默认在 `~/.pi/agent/` 下。项目授信通过时，也会读项目的 `.pi/mcp.json`，合并同名服务的项目配置。服务的名字来自配置键，这里的名字是 `ci`。配置的 `command` 让 Pi 启动子进程走 stdio，`url` 则让它使用 Streamable HTTP。stdio 用换行分隔标准输入、输出中的 UTF-8 JSON-RPC 消息，日志可写到 stderr。Streamable HTTP 把消息发给一个 MCP 端点，服务端可用 SSE 流式响应。 [配置加载](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/mcp/config.ts#L137) · [Pi 创建传输](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/mcp/runtime.ts#L104) · [MCP 传输规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

## 握手之后，工具才进入 Pi

客户端先发 `initialize`，协商协议版本、双方能力和实现信息。收到服务端应答后，它发 `notifications/initialized`，这是一条通知，没有请求 ID，也不等应答。我们的 CI 服务声明了 `tools` 和 `resources` 两项能力。连接成功后，Pi 发现工具需要用 `tools/list`。列表可能分页，客户端沿 `nextCursor` 取全。 [握手实现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/mcp/src/client.ts#L204) · [发现工具](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/mcp/runtime.ts#L380) · [MCP 生命周期](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)

Pi 为每个发现的工具创建 ToolDefinition。对于 `ci` 的 `get-failed-test`，模型看到的是 `mcp__ci__get_failed_test`，参数定义来自服务端的 `inputSchema`。Pi 会规范化名字，也会处理名字规范化后的冲突。当工具的暴露设置为 `direct`，会像内置工具一样声明给模型。第十一章再看延迟发现和 Code Mode。 [注册工具](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/mcp/index.ts#L388) · [命名规则](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/mcp/src/naming.ts#L18) · [转换工具定义](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/mcp/tools.ts#L253)

## 调用回到原来的工具管线

模型选择 `mcp__ci__get_failed_test` 并给出 `job`，Pi 先校验参数并交给第七章的 `tool_call`。此时看到的还是 Pi 注册的名字。只有进入工具的 `execute()`，桥接代码才会把原名 `get-failed-test` 和参数交给 MCP 客户端，发出 `tools/call`。所以在「执行前拦截」的回放中，握手和工具发现仍然成功，服务端却收不到查询。 [执行前钩子](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L735) · [发出实际调用](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/mcp/tools.ts#L275)

服务端可以返回 `content` 内容块和 `structuredContent`。Pi 将内容块转成能交回模型的工具输出，并保存供其他调用路径使用的结构化结果。工具执行失败可以在正常 JSON-RPC `result` 内标 `isError: true`。比如提供了一个不存在的任务名。JSON-RPC 顶层 `error` 则报告协议请求本身的错误，比如方法名不认识。回放里的 `details` 是本实验保留原始结果的位置。 [Pi 的结果转换](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/mcp/tools.ts#L214) · [MCP 工具规范](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)

## 资源通过 URI 取回内容

CI 工具返回的 `resource_link` 指向 `ci://runs/login-tests/log`，里面只有引用和元数据。要取得正文，客户端再发 `resources/read`，其中包含这个 URI。可以先用 `resources/list` 发现资源，也可以直接读取已有链接。Pi 提供 `list_mcp_resources` 和 `read_mcp_resource`，后者用服务名和 URI 选中对应的连接。 [资源工具实现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/mcp/resources.ts#L305) · [MCP 资源规范](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)

## 动手接好桥接层

在仓库根目录用 Node.js 22.19 或更新版本运行实验。命令会启动一个本地子进程，逐行打印 JSON-RPC 消息和 Pi 侧工具视图。

```bash
node ./examples/chapter-10/demo.ts
node ./examples/chapter-10/demo.ts --verify
```

打开 `examples/chapter-10/exercise.ts`，实现两个函数。

1. `registerTool(server, tool)` 把服务名和工具名中除字母、数字、下划线之外的字符换成下划线，拼出 `mcp__<server>__<tool>`。同时保留 `remoteName`，把服务端的描述和 `inputSchema` 带进注册结果。
2. `toToolResult(result)` 保留文本块，把资源链接转成带名称和 URI 的文本，供模型决定是否再读取。把原始应答保存在 `details`，并传递 `isError`。

```bash
node ./examples/chapter-10/demo.ts --exercise --verify
```

验收会核对握手、方法名、结果转换，以及拦截时服务端没有收到 `tools/call`。

::: details 参考实现
<<< ../examples/chapter-10/bridge.ts#bridge
:::

::: details 用本机 Pi 连接示例服务
如果已安装支持内置 MCP 的 Pi，可以把下列 `ci` 条目合并到项目的 `.pi/mcp.json`。在 Pi 中通过 `/trust` 保存对教程仓库的授信后，从仓库根目录运行 `pi mcp list` 检查连接。

```json
{
  "mcpServers": {
    "ci": {
      "command": "node",
      "args": ["./examples/chapter-10/server.ts"],
      "exposure": "direct"
    }
  }
}
```

如果已在 Pi 中配置模型，可以先询问「用 CI 工具查 login-tests」，再启动 `pi -e ./examples/chapter-10/gate.ts` 发出同样的请求。只要模型选择该工具，扩展就会在发送 `tools/call` 前阻止它。

<<< ../examples/chapter-10/gate.ts
:::

## Pi 当时怎么改

如果一个 MCP 服务有几万份资源，发现一个工具需要等整个目录列完吗？提交 `f4cca2d` 之前，Pi 会在连接时同时发现工具并枚举资源。这个提交让连接阶段只记录资源能力，由资源工具按需列出目录或读取内容。于是握手成功、工具已注册和资源目录尚未加载，可以同时成立。 [资源改为按需加载](https://github.com/earendil-works/pi/commit/f4cca2dc22ee4ce05ad75e185a025f6c664829c8)

## 合上代码，复述一遍

1. `initialize` 应答有 `tools` 能力后，Pi 还要发哪条消息才能知道工具和参数？
2. 为什么在 `tool_call` 拦截时，协议记录仍有 `tools/list`？
3. 已知 `resource_link` 的 URI，要读正文还需要发什么？

::: details 核对你的解释
1. 发 `notifications/initialized` 完成握手，再用 `tools/list` 获取具体定义。
2. 发现工具发生在连接阶段，钩子拦截的是随后由模型发起的工具调用。
3. 把 URI 交给对应服务的 `resources/read`。
:::

下一章会把同一批工具放到不同的暴露模式下，看模型怎样搜索工具并组合调用。

## 注释

**注 1 · 实验范围。** 终端用两个 Node.js 进程通过 stdio 交换 JSON-RPC，网页直接调用相同的示例服务处理函数。客户端只处理固定版本、按顺序往返的这几种消息，省略重连、分页、并行请求、认证和服务端通知；回放的拦截器模拟 Pi 钩子所在的位置。示例服务只返回内置的 CI 数据，URI 对应一条固定记录。
