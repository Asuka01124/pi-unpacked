---
title: 权限到底在哪一层生效
description: 对照项目授信、工具暴露、参数校验、执行前审批与文件系统权限，追踪一次写入停在哪里。
---

<script setup>
import PermissionReplay from './components/PermissionReplay.vue'
</script>

<p class="chapter-label">第 7 章</p>

# 权限到底在哪一层生效

<p class="chapter-lede">第六章的调查模式收起了写入工具。现在你想把 HTTP 401 的发现存成一张便签。如果 Pi 没写成文件，怎么知道是工具不可用、审批没过，还是文件系统拒绝了写入？</p>

## 同一条写入会停在哪里

模型想用 `write` 创建 `triage-note.txt`。先看「未暴露」，再切到「审批拒绝」和「文件系统只读」。展开执行记录，找出哪种条件下工具真正走到了写入这一步。

<PermissionReplay />

「参数无效」把同一个调用的 `content` 换成数字，方便观察校验发生在审批前还是审批后。网页使用替身记录文件写入和只读失败。<sup><a href="#注释">注 1</a></sup>

## 项目授信先决定加载什么

你刚打开一个仓库，里面有项目扩展和 `AGENTS.md`。Pi 会先加载用户级与命令行指定的扩展，以便它们处理 `project_trust` 事件。得到授信决定后，资源加载器才按这个决定加载受保护的项目资源，包括项目扩展、Skills、提示词模板和 MCP 配置。上下文文件如 `AGENTS.md` 有独立的加载开关。拒绝授信后，Pi 仍可读到它。启动时的 `sessionDir` 查找也发生在授信之前。 [资源加载顺序](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/resource-loader.ts#L536) · [受授信控制的资源](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/security.md#understand-project-trust)

授信决策先看命令行覆盖，其次问用户级和命令行扩展，再查当前目录或父目录保存的决定。都没有时，读取全局的 `defaultProjectTrust`。默认值 `"ask"` 在交互模式会询问，在打印、JSON 或 RPC 模式则跳过受保护的资源。即使你拒绝加载项目扩展，启动时已有的内置 `write` 仍可以出现在工具列表里。 [授信决策](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/project-trust.ts#L47)

## 工具暴露影响模型能调用什么

第六章的 `setActiveTools()` 修改会话的活动工具集合，模型在请求里会看到这批工具的定义。CLI 也能用 `--tools read,grep,find,ls` 收窄工具集合。如果模型仍发出一个活动集合里没有的 `write` 调用，普通执行路径会在按名称查找时返回工具不存在。你在回放选「未暴露」时看到的就是这一步。 [会话如何应用工具集合](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L1618) · [查找工具](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L718)

这个开关作用于 Pi 的工具注册和调度。进程能访问哪些文件，仍取决于它所在的运行环境。MCP、工具发现和 Code Mode 还有间接调用路径，后面的章节会继续追它们怎样进入执行层。 [工具允许列表与 MCP](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L1624)

## 校验参数之后才轮到审批

找到 `write` 后，Pi 先准备并校验参数。类型不符时，错误会作为工具结果返回。通过校验后，Agent 循环调用 `beforeToolCall`，会话把工具名和校验后的参数交给扩展的 `tool_call` 处理器。扩展返回 `{ block: true, reason }` 时，循环把原因作为工具错误送回模型，此次写入就停在这里。 [参数到执行前钩子](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/agent/src/agent-loop.ts#L735) · [会话分发 tool_call](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L721)

**审批是扩展策略。** 上游的 `permission-gate.ts` 展示了在钩子里向用户确认的做法。Pi 默认不会为每次调用弹窗。本章对写便签采用明确批准才放行的规则，拒绝或没有答复时都返回原因。 [上游审批扩展示例](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/examples/extensions/permission-gate.ts#L13)

## 获批后，文件系统还要决定能不能写

Pi 的内置 `write` 默认用 Node.js 的文件操作写入，受进程身份、文件权限和挂载方式约束。比如把某个目录以只读方式挂载进容器，Pi 可以读它，写入请求即使经过扩展批准，到了文件系统仍会失败。需要把 Pi、扩展、工具和子进程一同约束时，应把整个进程放进相应的操作系统或虚拟化边界。挂载、凭据和网络分别决定你向这个环境开放了什么。 [默认写入实现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/write.ts#L33) · [Pi 的隔离方式](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/containerization.md)

已安装 Docker 时，可以在一次性容器中验证文件系统的拒绝。两条命令都向 `/tmp/triage-note.txt` 写入。第一条预期收到 `EROFS`，第二条给 `/tmp` 单独挂载可写的内存文件系统，预期输出 `OK`。容器退出后文件随之消失。

```bash
docker run --rm --network none --read-only node:24 node -e "require('node:fs').writeFileSync('/tmp/triage-note.txt', 'HTTP 401'); console.log('OK')"
docker run --rm --network none --read-only --tmpfs /tmp:rw node:24 node -e "require('node:fs').writeFileSync('/tmp/triage-note.txt', 'HTTP 401'); console.log('OK')"
```

## 动手实现校验和审批

在仓库根目录用 Node.js 22.19 或更新版本跑参考实现。可写分支会在临时目录里真正写入一份便签。其余分支会打印停止位置，实验结束后清理临时目录。

```bash
node ./examples/chapter-7/demo.ts
node ./examples/chapter-7/demo.ts --verify
```

在 `examples/chapter-7/exercise.ts` 补上两个函数。

1. `parseWriteInput(input)` 只接受对象，要求 `path` 等于 `NOTE_PATH` 且 `content` 是字符串。成功时返回写入参数，校验失败时返回 `undefined`。
2. `approveWrite(approved)` 只在 `approved === true` 时放行。其他情况返回 `{ block: true, reason }`。用不同的理由区分拒绝和没有收到批准。

```bash
node ./examples/chapter-7/demo.ts --exercise --verify
```

验收会检查每个场景经过了哪些步骤，以及哪些场景真的到达写入函数。比如参数无效时，记录应停在校验。模拟只读时，记录里应该有一次成功的审批和一次失败的写入。

::: details 参考实现
<<< ../examples/chapter-7/policy.ts#policy
:::

## Pi 当时怎么改

提交 `5a4e22e` 把 SDK 和 CLI 的工具选择统一为按名称筛选的允许列表，覆盖内置工具、扩展工具和 SDK 工具。它还移除了依赖进程当前目录的工具单例，改为显式传入工作目录。看这次改动时，可以分别追踪一项工具是怎样进入会话，以及它在哪里解析相对路径。这两个决定最终都要通过文件系统检查。 [工具允许列表与工作目录的改动](https://github.com/earendil-works/pi/commit/5a4e22ea44b9fd7b5410c7db3482614a753f6964)

## 合上代码，复述一遍

1. 拒绝项目授信后，Pi 还会加载 `AGENTS.md` 吗？
2. `write` 收到数字类型的 `content` 时，审批钩子会看到这次调用吗？
3. 审批已通过，目标目录仍是只读的，哪一层会拒绝写入？

::: details 核对你的解释
1. 会。上下文文件有独立的加载开关。
2. 不会。参数校验先于 `tool_call`。
3. 文件系统会拒绝，工具再把错误返回给模型。
:::

下一章会用同一条报错开出两条调查分支，看看 Pi 怎样从当前叶节点重建对话。

## 注释

**注 1 · 实验范围。** 回放只处理一个固定目标，省略 Pi 的加载器、模型请求和扩展分发，直接记录工具查找、校验、审批和写入。只读分支注入 `EROFS` 错误。容器实验则直接使用 Node.js 调用文件系统，用于观察真实的只读结果。
