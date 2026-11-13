# Pi Agent 实验室课程大纲

主线 14 章，进阶 2 章。读者从一次工具调用出发，逐步做出一个可扩展的编码 Agent，最后独立完成一次 CI 故障排查，交付诊断证据、补丁和测试结果。

课程以 Pi 的 `86a929acd` 为源码基准。每章从一个可以复现的问题切入，先观察行为，再写最小实现，最后回到 Pi 源码验证。选用 Git 历史时，先让读者预测旧版在同一个输入下会怎么做，再看提交改了什么、保留了哪些行为。实验优先使用项目自带的假模型、测试文件和固定输入。接入真实服务商的练习在对应章节说明所需环境。

## 架构主线

- `pi-coding-agent` 的 CLI 入口组装会话运行时，交给交互界面、打印模式或 RPC。`AgentSession` 把模型、工具、会话记录、项目资源和扩展接在一起。 [CLI 入口](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/main.ts#L810) · [会话组装](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/sdk.ts#L403)
- `pi-agent-core` 推进模型轮次、调度工具并产生事件。`pi-ai` 将内部消息转成服务商请求，再把流式响应转成统一事件。第二章用第一章的 `read` 调用走一遍这条路径。 [Agent 循环](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L391) · [模型运行时](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/model-runtime.ts#L744)
- CLI 在扩展层接入 MCP、Code Mode 和工具搜索。CLI 会话从 JSONL 重建上下文。进阶部分用 `pi-durable` 对照另一种运行方式，其中生成和工具执行本身是可恢复的任务。 [扩展层重构](https://github.com/earendil-works/pi/commit/2498ca492ec6ac9b266bf94a71dbaec61020ef83) · [Durable 工具任务](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/durable/src/harness/tool.ts#L204)

## 主线

### 1. 从聊天到行动（已完成）

- 内容：最小 Agent 循环、工具调用 ID、工具结果回填和第二次模型请求。
- 实验：用假模型跑通 `read`，再补出自己的循环，验收直接回答、读取成功、文件缺失和参数截断四种场景。 [第一章](docs/index.md)

### 2. Pi 怎样驱动一次运行（已完成）

- 内容：沿 CLI、`AgentSession`、`Agent.prompt()` 和 `agentLoop` 追踪一次 `read`。区分用户发起的一次运行和其中的多个模型轮次。看同一回复里的多个工具怎样调度，以及 `steer` 和 `followUp` 在何时进入对话。
- 实验：让假模型一次发出两个调用，其中一个慢、一个失败。执行期间追加用户输入，对照事件顺序和下一次请求实际收到的消息。 [第二章](docs/chapter-2.md) · [Agent](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent.ts#L194) · [工具调度](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L519)

### 3. 一个循环怎样接不同模型

- 内容：从 `AgentMessage` 转成 `Message`，再由适配器生成服务商请求。沿响应反向追踪文本、工具参数增量和停止原因，说明模型选择、认证与请求格式分别由哪里处理。
- 实验：对照录制的 OpenAI Responses 和 Anthropic Messages 请求与事件，最后选一家接入真实模型，跑通同一次 `read`。 [Responses 适配](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/ai/src/api/openai-responses-shared.ts#L192) · [Anthropic 适配](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/ai/src/api/anthropic-messages.ts#L808)

### 4. 设计编码工具

- 内容：从 `read`、`grep`、`edit` 和 `bash` 看参数校验、输出上限、错误和取消。细读 `edit` 的唯一匹配、重叠检查和同文件写入队列，以及 `read` 的按行续读和流式实现。
- 实验：给长日志加 `offset`、`limit` 和续读提示，再实现带唯一性校验的文本替换。用重复片段和重叠修改检查失败结果能否帮助模型继续处理。 [read](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/read.ts#L231) · [edit](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/edit.ts#L138)

### 5. `AGENTS.md`、Skills 与提示词模板

- 内容：项目指令怎样进入系统提示词，Skill 如何通过名称、描述和路径供模型发现，正文何时按需读取，`/skill:name` 和提示词模板又如何在用户输入阶段展开。
- 实验：把同一份排障流程分别写成项目指令、Skill 和提示词模板。抓取三种请求，比较哪些文字在什么时候交给了模型。 [项目上下文加载](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/resource-loader.ts#L260) · [Skill 提示词](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/skills.ts#L358) · [显式调用](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L2312)

### 6. 用 Extensions 改造 Pi

- 内容：跟踪 TypeScript 扩展的加载和注册，理解 `registerTool`、斜杠命令、`before_agent_start`、`tool_call`、`tool_result` 与扩展状态。用仓库里的 Plan Mode 示例串起工具集合切换和调用拦截。
- 实验：写一个 `/triage` 扩展，注册诊断工具、切换只读工具集合，再把调查状态写入会话。 [扩展加载](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/extensions/loader.ts#L253) · [Plan Mode 示例](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/plan-mode/index.ts#L168)

### 7. 权限到底在哪一层生效

- 内容：项目授信决定哪些项目配置和扩展可以加载，工具暴露决定模型怎么发现工具，参数校验与执行前钩子控制调用，操作系统或虚拟化环境限制进程实际能做什么。Pi 默认继承启动进程的权限。
- 实验：对同一项写入分别尝试隐藏工具、用 `tool_call` 拒绝和在容器中只读挂载，观察请求分别在哪一步被阻止。 [项目授信](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/security.md#understand-project-trust) · [执行前钩子](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L721)

### 8. 会话为什么是一棵树

- 内容：JSONL 条目里的 `id`、`parentId` 和当前叶节点如何形成分支。追踪 `/tree`、会话恢复和分叉，理解 Pi 如何从磁盘记录重建当前分支的上下文。
- 实验：从同一条报错开出两条调查分支，切换叶节点，打印各自重新构造出的模型上下文。 [会话路径和投影](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/session-manager.ts#L390)

### 9. 上下文压缩怎样保住调查进度

- 内容：token 估算、触发阈值、切点、摘要和 `firstKeptEntryId`。观察 Pi 怎样处理切点落在一轮中间的情况，以及压缩后如何重建模型上下文。
- 实验：用长工具输出触发压缩，对照摘要、保留的近期原文和下一次请求，验证 Agent 能否接着调查。 [压缩准备](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/compaction/compaction.ts#L859) · [压缩后的会话投影](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/session-manager.ts#L476)

### 10. MCP 怎样变成 Pi 的工具

- 内容：从 `mcp.json` 追到 stdio 或 Streamable HTTP，再走过 `initialize`、`tools/list` 和 `tools/call`。看远端工具如何注册为 `mcp__<server>__<tool>`、结果如何转换、资源如何按 URI 读取，以及调用怎样进入现有钩子。
- 实验：接一个本地假 CI 服务，提供查询失败任务的工具和按 URI 读取的日志资源。记录协议消息，再用同一个执行前钩子拦下一次 MCP 调用。 [MCP 客户端](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/mcp/src/client.ts#L204) · [CLI 工具桥接](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/mcp/tools.ts#L253)

### 11. 工具太多时，模型怎样发现和组合它们

- 内容：对照 `direct`、`deferred`、`codemode` 和 `hidden`。跟踪 `tool_search` 怎样把匹配的工具加入后续请求，以及 Code Mode 怎样用 QuickJS 执行模型生成的脚本、调用注入的工具并筛选输出。
- 实验：用同一组 MCP 工具分别做直接调用、先搜索再调用和脚本批量调用。比较模型请求里的工具声明、实际调用和最终结果。 [MCP 工具暴露](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/mcp.md#control-tool-exposure) · [Code Mode 执行](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/extensions/codemode/execute.ts#L525)

### 12. 子代理怎样成为一种扩展

- 内容：仓库里的 `subagent` 扩展怎样启动独立的 Pi 进程、解析 JSON 事件、回收结果并传播取消。对照第二章的工具并发，理解多个子代理各自拥有的循环和上下文。
- 实验：让两个只读子代理分别查日志和代码，由主 Agent 汇总证据。再注入一次启动失败和一次取消，观察父级得到的结果。 [子代理进程入口](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/subagent/index.ts#L389)

### 13. 同一个 Agent 怎样服务不同界面

- 内容：对照 TypeScript SDK、交互 TUI、JSON 模式和双向 RPC。跟踪会话事件如何驱动渲染，以及外部程序怎样发送 `prompt`、`steer` 和 `abort`。
- 实验：做一个小型 RPC 客户端，实时显示工具事件，并在执行测试时取消运行。 [RPC 实现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L404)

### 14. 综合实验：修复一次 CI 故障

- 内容：用 Skill 提供排查流程，用 MCP 取证，用本地工具修改代码，再依据执行策略运行测试。保留会话和工具记录，以确定性的断言验收关键行为。
- 实验：给出诊断证据、补丁和测试结果。用假模型复跑关键路径，检查调用顺序、越权拦截和失败处理。 [Pi 的会话测试环境](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/test/suite/harness.ts#L153)

## 进阶

### 15. `pi-durable`：崩溃后怎么继续做事

- 内容：对照 CLI 的会话恢复和 Durable 的任务恢复。读生成任务、工具执行意图和检查点，再理解 `ExecutionEnv`、子任务和取消传播。
- 实验：在同一个执行阶段模拟进程中断，分别观察可安全重放的读取和有副作用的操作在重启后的结果。比较 `replay: "safe"` 与默认行为。 [生成任务](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/durable/src/harness/generation.ts#L184) · [工具恢复逻辑](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/durable/src/harness/tool.ts#L204)

### 16. `p2` 与 Chord：把 Agent 做成长期运行的应用

- 内容：沿一条链路追踪 Web 或 TUI 输入如何进入 Durable，子任务状态如何被应用订阅并显示。结合 `p2` 的插件结构理解 Chord 承担的职责。
- 实验：做一个可断开并重连的界面，重连后能继续看到原任务和子任务的状态。 [p2 架构](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/apps/p2/README.md#L8) · [p2 子代理实现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/apps/p2/plugins/subagents/tools.ts#L175)

## 可用于对照实验的 Pi 提交

| 对应章节 | 先验证的问题 | 提交 |
| --- | --- | --- |
| 第 1 章 | 参数已经能解析成合法对象，为什么模型输出截断时仍要拦住调用？ | [截断时拒绝执行工具调用](https://github.com/earendil-works/pi/commit/351efc828b6fc5250fa50d6b32b20b0f0cb22cb4) |
| 第 2 章 | 用户插话时尚未开始的工具会怎样？先结束的工具什么时候能显示完成？ | [推迟处理 `steer`](https://github.com/earendil-works/pi/commit/208a2cc123b52098233400649ed64157cb10d6e6) · [提前发出完成事件](https://github.com/earendil-works/pi/commit/759d5515278389195e2d48122b1ca1bcfedab776) |
| 第 4 章 | 只返回一行时，旧版在内存里保留了多少内容？改成流式读取后，调用者还能看到同样的结果吗？ | [`read` 改用流式读取](https://github.com/earendil-works/pi/commit/3a7bb6f48cc64986608ffa1b0cb52c3ff938ef2a) |
| 第 10–11 章 | MCP 接入后，工具搜索和脚本调用为什么可以放在扩展层，同时继续走工具校验与钩子？ | [接入 MCP](https://github.com/earendil-works/pi/commit/27d2914457ccfc9fcb43e2fd08966cbb55538db4) · [重构到扩展层](https://github.com/earendil-works/pi/commit/2498ca492ec6ac9b266bf94a71dbaec61020ef83) |
