---
title: 设计编码工具
description: 给 read 加上续读提示，给 edit 加上唯一匹配和重叠检查，再对照 Pi 的 grep 与 bash。
---

<script setup>
import ToolDesignLab from './components/ToolDesignLab.vue'
</script>

<p class="chapter-label">第 4 章</p>

# 设计编码工具

<p class="chapter-lede">测试日志只返回了开头几行，报错还在后面。代码里又有两处完全相同的 <code>timeout</code>。工具应该给模型什么信息，它才能知道接下来该读哪一行、改哪一处？</p>

前三章让模型发起调用、让程序执行，再把结果送回循环。这一章把视角放进工具里。先给 `read` 定义怎样返回一段日志，再给 `edit` 定义什么样的替换可以执行。两个实验共用网页与终端的 TypeScript 实现。

## 让 `read` 告诉模型从哪续读

示例日志有十行。第一段全是启动信息。先猜报错在哪一段，再按工具结果里的 `offset` 继续。留意最后一段为什么没有续读提示。

<ToolDesignLab tool="read" />

`offset` 从 1 开始，`limit` 表示这次最多要几行。工具还有自己的输出预算，本实验最多返回 **4 行、160 个 UTF-8 字节的正文**。所以 `limit: 100` 也只会返回一小段。下一次的 `offset` 取**实际最后一行加 1**。如果字节上限只允许返回两行，从第 5 行开始的下一次调用应该从第 7 行读。

有三个分支需要表达清楚。

- **读到了文件末尾。** 返回剩余日志，结束续读。
- **只返回了前面几行。** 在结果正文附上这次的行号范围和下一次的 `offset`。终端里的假模型会从这条提示提取行号。
- **这次读不了。** 比如 `offset: 0`、行号越界，或者第一行就超过字节上限。返回可以据此调整的错误。遇到超长单行时需要换策略，例如先搜索定位，再用能取行内片段的工具。反复用同一个 `offset` 会遇到同一个错误。

Pi 的文本 `read` 默认最多返回 2,000 行或 50 KiB，先达到的上限生效。它同样把续读提示放在模型可见的文本里。实验压低了上限，并把 `offset`、`limit` 都限定为正整数。<sup><a href="#注释">注 1</a></sup> [Pi 的输出上限](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/truncate.ts#L11) · [Pi 生成续读提示的位置](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/read.ts#L299)

## 日志太多时，先用 `grep` 定位

如果你已经知道要找 `HTTP 401`，逐页读到第九行就绕远了。Pi 的 `grep` 调用 ripgrep，返回文件路径、行号和匹配文本，分别限制匹配数、单行长度和总字节数。返回的行号可以直接用于下一次 `read`，补足报错前后的上下文。没有匹配时，Pi 会返回 `No matches found`。进程执行出错或被取消时，工具会报错，让模型知道这次搜索没有正常完成。 [Pi 的搜索定义](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/grep.ts#L83) · [搜索结束时如何区分结果](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/grep.ts#L274)

## 让 `edit` 确认要改哪一处

下面的代码有两个 `timeout: 1000`。假定用户明确要求只改 `loginClient`，模型起初只传了那一行。切到带上下文的场景，再试一批重叠的修改。这里的超时调整只用来练习定位，登录失败的原因仍需用日志和测试确认。

<ToolDesignLab tool="edit" />

Pi 的 `edit` 接收 `path` 和 `edits`。每一项都包含 `oldText` 与 `newText`。`oldText` 同时提供位置和修改前提。之前读到的代码如果已经变了，工具可以要求模型重新读文件。两处相同时，补上 `const loginClient = {` 就能把目标缩到一处。

实现时可以分三步。

1. 在**同一份原文**里找出每项 `oldText`。找不到就请模型重新读取，找到多处就请它补上下文。
2. 按起始位置排序，检查相邻替换是否相交。一条替换包含另一条时也算重叠，整个请求应先报错。
3. 验证整批后再替换。练习从后往前改，前面尚未处理的位置就不会被后面的长度变化影响。例如把 `abc` 里的 `a` 改成 `bc`、原来的 `bc` 改成 `!`，结果应该是 `bc!`。

真实 Pi 还会处理换行和常见字符差异。对于同一文件，它在进入读、匹配、写入流程之前取得文件修改队列的位置，避免同一个 Pi 进程中的并发 `edit` 或 `write` 都拿到旧内容。可以想象两次修改都先读到了 `timeout: 1000`，如果后一次必须等前一次写完才读，它就有机会发现自己的旧文本已失效。队列的范围见章末。<sup><a href="#注释">注 2</a></sup> [匹配和重叠检查](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/edit-diff.ts#L350) · [进入队列与写入](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/edit.ts#L153)

## 用 `bash` 验证修改

改完以后，Agent 还要通过测试判断修复是否有效。Pi 的 `bash` 收集 stdout 和 stderr，输出超长时保留**末尾**，完整输出写到临时文件，并把路径交回模型。对测试命令来说，末尾往往有失败断言和汇总。命令以非零状态退出时，工具会保留已拿到的输出并附上退出状态。超时或用户取消时，本地执行路径会尝试结束进程树，并相应报告超时或取消。 [Pi 的 shell 执行与取消](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/bash.ts#L110) · [输出与退出状态](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/bash.ts#L367)

## 动手实现分页和精确替换

在项目根目录打开终端。Node.js 22.19 或更新版本即可运行。先跑参考实现，观察哪一次读取找到 401，以及三种替换各自返回什么。

```bash
node ./examples/chapter-4/demo.ts read
node ./examples/chapter-4/demo.ts edit
```

现在打开 `examples/chapter-4/exercise.ts`，补好 `readPage` 和 `applyEdits`。日志与代码样例都由项目提供，练习里的 `applyEdits` 返回修改后的字符串。可以从 `tools.ts` 导入 `MAX_LINES` 和 `MAX_BYTES`。

1. `readPage(text, offset = 1, limit = MAX_LINES)` 先校验参数，再按行选正文。用 `TextEncoder` 计算 UTF-8 字节，把行间换行也计入预算。还有内容时返回 `nextOffset`，并在 `content` 末尾加入 `用 offset=5 继续。` 这样的提示。空文件返回 `文件为空。`。
2. `applyEdits(source, edits)` 先定位全批范围，再检查重叠，最后生成新文本。空的 `oldText`、找不到目标、重复匹配和重叠都要报错。给模型看的错误文字要指出下一步，例如补上下文或合并修改。

```bash
node ./examples/chapter-4/demo.ts --verify --exercise
```

验收会检查读到 401 之前的续读行号、中文的字节预算、空行和非法参数，也会检查重复匹配、重叠和原文坐标。用 `node ./examples/chapter-4/demo.ts --verify` 可以验证参考实现。

::: details 看 `readPage` 参考实现
<<< ../examples/chapter-4/tools.ts#read
:::

::: details 看 `applyEdits` 参考实现
<<< ../examples/chapter-4/tools.ts#edit
:::

## Pi 当时怎么改

现在给工具一份 200 MB 的日志，让它只返回第一行。模型只收到一行，运行工具的进程需要保留多少内容？先看你写的 `readPage` 从哪里拿到 `text`，再找 Pi 改动前的 `readFile`、UTF-8 解码和 `split`。

Pi 的旧实现先加载整份文件，再选行。提交 `3a7bb6f` 为默认的本地文本读取增加了分块实现，只在内存里保留足以生成返回值的文本，继续计数以维持原有行数与提示。它仍然可能扫完整个文件来统计总行数。该提交记录的 200 MB 日志基准里，读取首行的进程峰值 RSS 从 638 MB 降到 131 MB。拿同一个 `offset: 1, limit: 1` 对照 diff，可以看到输出预算和工具进程的内存开销分别在哪一步被控制。 [Pi 的分块读取提交与基准](https://github.com/earendil-works/pi/commit/3a7bb6f48cc64986608ffa1b0cb52c3ff938ef2a)

::: details 进阶：取消为什么也要测打开文件的阶段？
改成流式读取后，Pi 又修复了一个取消时序问题。信号可能在打开文件期间就已取消，创建流后便可能在监听器清理之后发出错误。`ef9361a` 让默认读取器在块之间检查取消，并在退出时关闭文件句柄。试想测试只在读到一半时取消，会漏掉哪条路径。 [取消修复](https://github.com/earendil-works/pi/commit/ef9361ab70206e521a46fa7b3d1068442eec4908)
:::

## 合上代码，复述一遍

1. 从第 5 行开始，请求读四行，实际只返回两行。下一次该传什么 `offset`？
2. 模型要改 `loginClient`，为什么 `oldText: "timeout: 1000"` 可能被拒绝？
3. 第二项替换的范围包含在第一项里，工具应该什么时候发现它？

::: details 核对你的解释
1. `offset: 7`。上一页实际覆盖了第 5、6 行。
2. 原文的两个客户端都有这一行。补上登录客户端附近的独特上下文，才能定位。
3. 两项都在原文定位后、写入前。合并成一个目标明确的替换再执行。
:::

下一章会看 `AGENTS.md`、Skills 和提示词模板，跟踪 Pi 在什么时机把这些文字交给模型。

## 注释

**注 1 · 实验中的文件与范围。** 网页和终端使用一份内置示例日志。分页函数先接收完整字符串，用正文上限演示续读。Pi 同时支持图片，并对某些特殊范围或只提供 `readFile` 的自定义操作走整文件路径。 [Pi 的读取路径选择](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/read.ts#L119)

**注 2 · 文件修改队列的范围。** 队列按路径串行安排当前进程内的修改，尽量用 `realpath` 归并指向同一文件的路径。其他进程仍有自己的文件访问权限，写入失败也需要另外处理。 [Pi 的文件修改队列](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L15)
