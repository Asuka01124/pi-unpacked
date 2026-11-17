---
title: AGENTS.md、Skills 与提示词模板
description: 把同一份排障流程放进三种资源，观察 Pi 什么时候把它交给模型。
---

<script setup>
import PromptResourceReplay from './components/PromptResourceReplay.vue'
</script>

<p class="chapter-label">第 5 章</p>

# AGENTS.md、Skills 与提示词模板

<p class="chapter-lede">同一句「先定位第一个 HTTP 401」，可以写进项目指令、Skill 或提示词模板。换一个文件，模型会在什么时候看到这句话？</p>

上一章给 Agent 加了读日志、定位和修改代码的能力。现在我们要教它一套团队流程。先找第一个 401，再核对前一条请求是否携带凭据，最后分开写已知现象和待验证原因。这里的目标是看清**这段文字怎么进入模型的上下文**。

## 同一段正文，四次观察

先在下方切换来源，找出「先定位第一个 HTTP 401」第一次出现的位置。选「模型发现 Skill」时，比较第一次请求与读取 Skill 后的请求。再试手动调用，看看正文在哪个角色下面。展开示例文件可以核对输入的原始内容。

<PromptResourceReplay />

::: details 核对你的观察
| 来源 | 正文第一次进入请求的位置 |
| --- | --- |
| `AGENTS.md` | 第一次请求的系统提示词 |
| 模型发现 Skill | 第一次请求只有目录项。模型调用 `read` 后，正文在下一次请求的工具结果里 |
| 手动调用 `/skill:login-triage` | 第一次请求的用户消息，参数跟在正文后面 |
| 提示词模板 `/triage` | 第一次请求的用户消息，`$1`、`$2` 已替换 |
:::

回放和终端共用一套离线实验。面板展示的是传给假模型的内部数据。<sup><a href="#注释">注 1</a></sup>

## `AGENTS.md` 提供项目工作约定

Pi 组装项目上下文时，先检查用户的 Agent 配置目录（默认是 `~/.pi/agent`），再从当前工作目录沿祖先目录向上找。多个目录的结果按**外层目录到当前目录**排列，同一目录选第一个可读的候选文件，例如 `AGENTS.override.md` 优先于 `AGENTS.md`。`AgentSession` 将这批文件交给系统提示词构建器，正文放进带路径的 `<project_instructions>`。 [文件选择和查找顺序](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/resource-loader.ts#L212) · [系统提示词渲染](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/system-prompt.ts#L79)

例如，从 `repo/src` 启动，`repo/AGENTS.md` 和 `repo/src/AGENTS.md` 都可能进入上下文。从 `repo` 启动后再读取 `src/login.ts`，按这段源码，单次 `read` 不会触发对子目录 `AGENTS.md` 的自动查找。适合放在项目指令里的，是在这个工作目录下反复适用的约定，比如「改完登录模块跑哪一组测试」。

## Skill 先让模型发现，再按需交正文

Pi 可以从 `.pi/skills/`、用户 Skills 目录及其他配置来源发现资源。常见的可移植写法是让一个目录包含 `SKILL.md`，用文件开头的 YAML 元数据提供 `name` 和 `description`。Pi 读取文件以获得这些信息，但 `formatSkillsForPrompt()` 在 `<available_skills>` 里只放名称、描述和路径。描述要能让模型判断何时值得打开文件。 [Pi Skills 文档](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/skills.md) · [目录项的生成](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/skills.ts#L358)

自然语言触发时，由模型根据目录项决定要不要读。实验的假模型固定选择了 `login-triage`，因此你会在第二次请求里看到 `read` 的结果。真实模型也可能没有选中合适的 Skill，这时可以明确输入：

```text
/skill:login-triage 请帮我排查 test.log 里的登录测试失败。
```

收到这条命令时，`AgentSession` 自己读取 `SKILL.md`，去掉开头的元数据，将正文包进 `<skill>`，再把后面的用户输入附上。整段文字在发请求之前已经组装完成。`disable-model-invocation: true` 可以把 Skill 从自动目录中隐藏，显式命令仍然可用。 [显式调用实现](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/agent-session.ts#L2312)

## 提示词模板把短命令展开成用户消息

项目里的 `.pi/prompts/triage.md` 可以成为 `/triage`。比如文件里写着 `排查 $1 里的$2。`，输入 `/triage test.log 登录测试失败` 后，Pi 把文件名对应到模板，解析参数，再把替换后的句子作为用户输入。`$@` 可以表示全部参数。想把带空格的文字当作一个参数时，可以用引号括起来。 [命令展开](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/prompt-templates.ts#L325) · [模板参数文档](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/prompt-templates.md)

模板适合一条需要反复发送、每次换参数的提示词。Skill 可以带脚本、参考文档和附件，适合把流程和资料放在一起，让模型按需打开。两者的项目资源加载都涉及项目授信，执行权限会在后面的章节展开。<sup><a href="#注释">注 2</a></sup>

## 动手组装两种资源

从项目根目录运行下面几条命令，逐次查看 `requests` 中的 `system` 和 `messages`。Node.js 22.19 或更新版本即可运行。

```bash
node ./examples/chapter-5/demo.ts agents
node ./examples/chapter-5/demo.ts skill
node ./examples/chapter-5/demo.ts skill-command
node ./examples/chapter-5/demo.ts template
```

打开 `examples/chapter-5/exercise.ts`，补好两个函数。

1. `formatSkillCatalog(skills, reader)` 只在有读文件工具时生成目录。过滤掉 `disableModelInvocation` 为真的条目，用 `<available_skills>` 包住其余条目的 `<name>`、`<description>` 和 `<location>`。提示文字里写明使用哪种工具，XML 文本中的 `&`、`<`、`>` 要转义。
2. `substituteArgs(template, args)` 用数组替换 `$1`、`$2` 等位置参数，缺失位置填空字符串，`$@` 返回用空格连接的所有参数。替换只做一遍。如果第一个参数本身是字面量 `$2`，它应当按原样输出。

```bash
node ./examples/chapter-5/demo.ts --verify --exercise
```

验收会检查什么内容先进入系统提示词，Skill 正文何时随工具结果出现，以及模板怎样展开。去掉 `--exercise` 可以验收参考实现。

::: details 看参考实现
<<< ../examples/chapter-5/resources.ts#resources
:::

## Pi 当时怎么改

如果把可用工具缩到只剩 `bash`，模型还能在系统提示词里看到 Skill 目录吗？

提交 `1d6dbf9` 之前，Pi 只检查 `read`，所以能用 `bash` 读取文件的模型也会失去 Skill 目录。改动后，Pi 会找到可用的读文件工具，并用对应工具名生成提示。现在的基准版本优先找直接声明的 `read`，其次是 `bash`，在读工具只能间接调用时仍保留目录，但省略具体工具名。普通排障场景下，目录的作用是指向文件，工具的可达性决定目录项能不能被模型用起来。 [支持仅有 `bash` 的提交](https://github.com/earendil-works/pi/commit/1d6dbf9e3d60f129bf8ee513c82a98f222c57788) · [当前选择逻辑](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/system-prompt.ts#L172)

可以把练习中的目录生成暂时改成只接受 `read`，再跑验收。`bash` 场景会失败，`/skill:login-triage` 显式调用读取正文的路径仍由会话层负责。

## 合上代码，复述一遍

1. 为什么 `AGENTS.md` 里的排障流程可以在第一次请求就看到？
2. 同一个 Skill，自动发现和手动调用时，正文分别以什么角色进入上下文？
3. 模板里的 `$1` 是由谁替换的，模型最终看到什么？

::: details 核对你的解释
1. Pi 组装系统提示词时就把项目约定的正文放了进去。
2. 自动发现先给目录项，读取后正文进入工具结果。手动调用由 Pi 在发送前展开，正文直接进入用户消息。
3. Pi 的输入处理层先展开模板，模型看到完整的用户消息。
:::

下一章会用 Extensions 注册一条真正参与运行的命令和工具。 [第六章：用 Extensions 改造 Pi](./chapter-6.md)

## 注释

**注 1 · 实验范围。** 文件都来自内置示例，实验传入已经发现的资源和已经拆好的参数。Pi 的真实加载器还负责配置来源、文件发现与冲突诊断，模板也支持默认值、参数切片和更完整的引号规则。Pi 会话还有工作树的上下文文件排重。 [Skill 加载](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/skills.ts#L414) · [模板参数解析](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/src/core/prompt-templates.ts#L25)

**注 2 · 项目授信。** 在本章固定版本中，即使拒绝授信，Pi 也会加载 `AGENTS.md` 等项目上下文文件，除非单独关闭上下文文件加载。项目 Skills 和提示词模板属于受授信控制的资源。 [Pi 的项目授信说明](https://github.com/earendil-works/pi/blob/86a929acdd7021fbfbe5b434a4a6038218f52bd6/packages/coding-agent/docs/security.md#understand-project-trust)
