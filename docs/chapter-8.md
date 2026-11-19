---
title: 会话为什么是一棵树
description: 从同一份 JSONL 恢复两条调查分支，追踪 Pi 的当前节点、路径投影、会话恢复和分叉。
---

<script setup>
import SessionTreeReplay from './components/SessionTreeReplay.vue'
</script>

<p class="chapter-label">第 8 章</p>

# 会话为什么是一棵树

<p class="chapter-lede">同一条日志显示 HTTP 401。你先查凭据，随后想回到刚看到报错的地方，从路由再查一次。两次调查都保存在会话里。模型怎么知道该接着哪一条查？</p>

第六章把调查状态写进了会话。现在我们用两个问题共享同一段历史，看看磁盘上存下的记录怎样变成下一次请求的上下文。

## 从同一条报错开出两条路

先选「凭据调查」，展开路径和模型上下文。切到「路由调查」后，找出哪一条用户消息换了。最后选「共同起点」，看两条分支后面的内容是否还在完整的 JSONL 里。

<SessionTreeReplay />

两条路径都保留发现 HTTP 401 的过程。它们分开后，各自只有自己的调查问题和回复。凭据分支的路径多了一条 `cred-state`，它是扩展保存的状态，因此两条路径最后都只投影出六条模型消息。<sup><a href="#注释">注 1</a></sup>

## 每次追加，都从当前节点接一条边

Pi 的会话文件用 JSONL 保存。第一行是会话头，记录版本、会话 ID、工作目录等信息。后续每行是一条树节点，有自己的 `id`，以及指向上一节点的 `parentId`。根条目的 `parentId` 是 `null`。 [会话文件格式](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/session-format.md)

实验先写完凭据分支，再把 `leafId` 移回共享回复 `base`，然后提交路由问题。两个问题之间隔着先前的回复和扩展状态，父节点却仍然相同。

```text
base  已定位 HTTP 401
├─ cred-question  查凭据
│  └─ cred-state
│     └─ cred-reply
└─ route-question  查路由
   └─ route-reply
```

实际的 `appendMessage()` 会把当前 `leafId` 写进新条目的 `parentId`，再把指针移动到新条目。所谓当前叶节点是**本次从哪里继续**，所以你可以把它选到已经有子节点的 `base`。下一条消息会成为它的另一个子节点，旧分支仍在文件里。 [追加消息](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/session-manager.ts#L1199) · [移动分支指针](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/session-manager.ts#L1591)

## 从当前节点反向找父节点

给定 `cred-reply`，先按 ID 找到它，再跟着 `parentId` 经过 `cred-state`、`cred-question` 和 `base`，直到根节点。最后把收集到的数组反转，得到从旧到新的路径。这个过程只需要沿一串父节点查找，所以即使 `route-reply` 是文件最后一行，它也不会进入凭据分支的上下文。 [路径解析](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/session-manager.ts#L390)

路径确定后，Pi 再把条目投影成上下文。`message` 通常贡献一条历史消息，普通 `custom` 仅供扩展恢复状态，`custom_message` 和 `branch_summary` 可以贡献模型可见内容。压缩条目与上下文编辑也参与投影，模型和思考级别则沿路径恢复。会话层把投影出来的消息交给 Agent，服务商适配仍由第三章的那一层处理。 [条目如何贡献消息](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/session-manager.ts#L435) · [投影如何进入 Agent](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L1001)

## 在 Pi 里切换、恢复与分叉

| 操作 | 会话如何变化 |
| --- | --- |
| `/tree` 选一条助手回复 | 在原会话中把当前节点移到该回复，从那里继续。 |
| `/tree` 选一条用户消息 | 把它的原文放回编辑框，当前节点移到它的父节点。改写后发出，会在同一份文件中创建一条新路径。 |
| `/resume` 打开已有文件 | Pi 从磁盘加载条目，重建 ID 索引。初始当前节点取文件里最后一条会话条目，再沿其父节点恢复上下文。 |
| `/fork` 从较早的用户消息分叉 | Pi 为前面的路径创建新的会话，把选中的问题带回编辑框。新会话头记录原会话路径。 |

切换时还可以选择为离开的分支生成摘要。Pi 把摘要追加到目标路径上，目标分支便能收到那段摘要。想验证两条路径的原始差异，可以在 `/tree` 切换时跳过摘要。 [会话操作指南](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/sessions.md#choose-how-to-branch) · [恢复 ID 索引](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/session-manager.ts#L1111) · [切换和追加摘要](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L4265)

## 动手恢复两条分支

在仓库根目录用 Node.js 22.19 或更新版本运行实验。脚本在临时目录写入一份 JSONL，从磁盘读回，再分别打印两条路径和各自的消息列表。加 `--jsonl` 会同时打印完整的文件内容。

```bash
node ./examples/chapter-8/demo.ts --jsonl
node ./examples/chapter-8/demo.ts --verify
```

打开 `examples/chapter-8/exercise.ts` 补上两个函数。

1. `getBranch(entries, leafId)` 用 `id` 建索引，从指定节点沿 `parentId` 向上走，再把结果反转。`leafId` 是 `null` 时返回空数组。找不到 ID 或走到重复节点时抛出错误。
2. `projectMessages(branch)` 保持路径的顺序，只提取 `message` 条目里的消息。工具调用和工具结果都是消息，扩展状态要留在会话记录中。

```bash
node ./examples/chapter-8/demo.ts --exercise --verify
```

验收会从同一份文件恢复两条路径，比对共同前缀，并检查 `cred-state` 留在路径上且没有进入模型消息列表。

::: details 参考实现
<<< ../examples/chapter-8/session.ts#projection
:::

## Pi 当时怎么改

如果新条目先进了内存，追加到磁盘时却失败，会有什么后果？提交 `807a5c0` 之前，Pi 可能留下指向这条新记录的内存指针。假如下次写入成功，新记录的 `parentId` 就会指向一个从未出现在磁盘上的 ID。这个提交在写入失败时撤回内存数组、ID 索引和当前节点的更新。这样下一条记录仍会接到已有的父节点。 [写入失败时还原内存状态](https://github.com/earendil-works/pi/commit/807a5c051f86bcbe707c59d6b954e4529058bcef)

## 合上代码，复述一遍

1. 从 `cred-reply` 恢复路径时，为什么不会串进后写入的路由问题？
2. 为什么 `cred-state` 在路径上，却没有出现在模型上下文里？
3. 如果只在 `/tree` 中跳到旧分支，随后直接退出，重新打开时会从哪里恢复？

::: details 核对你的解释
1. 恢复看每个节点的 `parentId`。文件中的写入顺序只用来找默认的起始节点。
2. 它是普通 `custom` 条目，由扩展读取。投影时只让相应类型的条目贡献模型消息。
3. 单独移动指针不会追加记录，重开时仍从文件里最后一条条目恢复。若你在旧分支上继续发了消息，新的末尾条目就会把恢复带回那条路径。
:::

下一章会继续看压缩条目怎样替换模型所见的旧历史，以及 Pi 如何沿同一条会话路径恢复压缩后的上下文。

## 注释

**注 1 · 实验格式。** JSONL 使用与 Pi 相似的会话头和父子链接，消息复用第一章的简化类型。终端只读回自己生成的示例文件，省略真实会话的格式迁移、摘要和上下文编辑。遇到丢失父节点或环时，实验会直接报错，方便定位坏数据。 [Pi 的会话格式与迁移](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/session-format.md)
