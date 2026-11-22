---
title: 上下文压缩怎样保住调查进度
description: 用长日志触发压缩，对照 Pi 的 token 阈值、保留切点和下一次模型请求。
---

<script setup>
import CompactionReplay from './components/CompactionReplay.vue'
</script>

<p class="chapter-label">第 9 章</p>

# 上下文压缩怎样保住调查进度

<p class="chapter-lede">你正在查一次登录失败，并交代了「只核对凭据，先别改代码」。读工具返回了一大段启动日志。上下文压缩之后，模型还记得这个限制吗？最后看到的 Authorization 证据又在哪里？</p>

第八章从当前叶节点沿父链恢复会话。有了这条路径，Pi 还要决定哪些历史以原文进入请求，哪些可以由摘要接替。

## 让同一份调查触发压缩

先切到「短日志」，看估算量是否超过触发线。再选「长日志 · 保留整段调查」，展开压缩条目和下一次模型请求，找到 `firstKeptEntryId` 对应的用户消息。最后调小保留预算，看看「先别改代码」现在从哪里传给模型。

<CompactionReplay />

实验的窗口是 640，预留量是 120，所以估算量超过 520 才会压缩。网页和终端使用同一份离线记录，固定规则生成摘要和接续回答。<sup><a href="#注释">注 1</a></sup>

## 先判断要不要压缩

Pi 优先用最近一次有效的助手回复用量，补估它之后新增的消息。刚返回的大段工具输出还没有出现在那条用量记录里，所以要另外计入。如果后来的压缩或上下文编辑让旧用量不再代表当前上下文，Pi 会重新估算投影中的消息。 [用量与尾部估算](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/compaction/compaction.ts#L196) · [投影变更后的估算](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/compaction/compaction.ts#L226)

开启自动压缩时，阈值条件是 `contextTokens > contextWindow - reserveTokens`。在一次多步运行里，工具结果追加后，Pi 会在准备下一次模型响应时检查上下文，因此长日志可以在交给模型之前触发压缩。发送新问题前也有检查，服务商报告上下文溢出时还有单独的恢复路径。手动 `/compact [instructions]` 可以指定摘要重点。 [阈值判断](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/compaction/compaction.ts#L267) · [下一次响应前的检查](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L961) · [触发时机](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/compaction.md#when-it-triggers)

## 再从最近的消息往前找切点

`keepRecentTokens` 决定大致保留多少近期原文。从当前投影末尾向前累加，达到预算后，再选合法的保留起点。用户消息和助手消息可以成为切点。工具结果要和发起它的调用一起保留，因此不能单独成为切点。保留量取决于消息边界，实际大小可能偏离预算。 [允许的切点](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/compaction/compaction.ts#L351) · [从末尾寻找切点](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/compaction/compaction.ts#L789)

保留预算较大时，切点落在 `check-auth`。这一整段调查的原文都会留下，包括很长的启动日志，因此压缩后仍可能高于触发线。预算较小时，切点落在助手发起的 `read-detail`。后面的 `auth-line` 仍有原文，但「先别改代码」出现在切点之前。Pi 会把**当前用户请求下被截掉的前半段**单独总结，再与较早历史的摘要合并。这样新请求还带得上问题本身、已经做过的工作和约束。 [分配旧历史与当前前缀](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/compaction/compaction.ts#L885) · [合并摘要](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/compaction/compaction.ts#L980)

一次用户请求可能经历多次「模型 → 工具 → 模型」循环。这里的「前半段」指从上一条用户消息到保留切点之间的内容，会跨过第二章所说的一次模型轮次。再次压缩时，Pi 会把上一份摘要也交给摘要器，并从上一轮保留的原文继续整理。 [用户请求中途切开](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/compaction.md#split-user-message-spans)

## 文件尾部追加条目，下次请求先读摘要

压缩成功后，Pi 在当前会话路径尾部追加 `compaction` 条目。其中 `summary` 是摘要，`firstKeptEntryId` 指向保留的第一条原文，`tokensBefore` 记录压缩前的估算量。旧条目还在 JSONL 里。第八章的投影逻辑找到路径上最新的压缩条目，再把摘要、保留原文和压缩后追加的消息按顺序交给 Agent。真实 Pi 还可在该条目里带上系统提示词检查点。 [追加压缩条目并刷新上下文](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L3345) · [恢复压缩后的路径](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/session-manager.ts#L476)

```text
会话路径尾部   …… → read-detail → auth-line → compact-1
下一次请求     摘要 → read-detail → auth-line
```

上面是较小保留预算的结果。换成「保留整段调查」时，原文从 `check-auth` 开始。两种请求都带有最近的 Authorization 证据，但模型只能从摘要中读到被移出原文的历史。摘要里的事实要对照必要的原始证据核实。

## 动手选切点并重建上下文

在仓库根目录用 Node.js 22.19 或更新版本执行示例，观察三种条件下的压缩条目、下一次请求和接续回答。

```bash
node ./examples/chapter-9/demo.ts
node ./examples/chapter-9/demo.ts --verify
```

打开 `examples/chapter-9/exercise.ts`，补上两个函数。`estimateTokens()` 与 `messagesFrom()` 已在 `compaction.ts` 提供。

1. `prepareCompaction(path, keepRecentTokens)` 从末尾累加消息的估算量。达到预算后，从当前位置向后找第一个用户或助手条目。没有时，取最后一个合法切点，确保最近的工具结果连同调用保留。预算覆盖整条路径时，保留起点设为第一个合法切点。起点是第一条时，没有更早的内容需要总结。返回保留 ID、较早历史与当前用户请求的前半段。
2. `rebuildContext(path)` 找到最新的压缩条目。先输出它的摘要，再提取从 `firstKeptEntryId` 到压缩条目之前的消息，最后加上压缩后追加的消息。没有压缩条目时，直接从路径提取消息。

```bash
node ./examples/chapter-9/demo.ts --exercise --verify
```

验收会检查切点、工具调用和结果的配对，以及压缩后的下一次请求能否同时读到调查目标、约束和凭据证据。

::: details 参考实现
<<< ../examples/chapter-9/compaction.ts#prepare

<<< ../examples/chapter-9/compaction.ts#rebuild
:::

## Pi 当时怎么改

手动执行 `/compact 着重保留凭据证据`，切点又在当前调查中途时，这条指示应当传给哪个摘要请求？提交 `adfc144` 之前，指示传给历史摘要，却没有传给当前调查的前缀摘要。这个提交把 `customInstructions` 也传入 `generateTurnPrefixSummary()`。于是两个摘要都能按你的重点取舍。 [把手动指示传给前缀摘要](https://github.com/earendil-works/pi/commit/adfc14461aa11adbf486efad9b0ede2dc0dab06a)

## 合上代码，复述一遍

1. `reserveTokens` 和 `keepRecentTokens` 各决定什么？
2. 为什么不能只保留 `auth-line` 作为下一次请求的第一条原文？
3. 压缩成功后，从旧叶节点恢复时，一定会看到这份摘要吗？

::: details 核对你的解释
1. 前者参与触发阈值计算，后者用于寻找近期原文的起点。
2. 工具结果需要和对应调用保持配对，所以切点选在 `read-detail`。
3. 要看新选定的路径是否经过那条压缩记录。旧叶节点如果在压缩条目之前，投影就不会使用这份摘要。
:::

下一章会跟着一次 MCP 调用，看看外部服务提供的工具怎样进入 Pi 的工具列表与执行流程。 [第十章：MCP 怎样变成 Pi 的工具](./chapter-10.md)

## 注释

**注 1 · 实验范围。** 估算量用消息 JSON 的字符长度除以 4 后向上取整，尤其不适合拿来预测中文的真实计费。两组保留预算由示例消息的估算量构造，方便切点稳定落在指定位置。实验只处理本次压缩和之后的消息拼接，使用固定的短、长日志和确定性的摘要器，省略 Pi 的重复压缩准备、服务商用量、溢出重试和扩展钩子。 [Pi 的压缩实现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/compaction/compaction.ts#L859)
