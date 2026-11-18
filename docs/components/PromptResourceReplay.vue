<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { captureRequests, scenarios, type Scenario } from "../../examples/chapter-5/scenario.ts";

const scenario = ref<Scenario>("agents");
const phase = ref(0);
const traces = ref<Partial<Record<Scenario, Awaited<ReturnType<typeof captureRequests>>>>>({});
const error = ref("");
const trace = computed(() => traces.value[scenario.value]);
const request = computed(() => trace.value?.requests[phase.value]);
const observation = computed(() => {
	switch (scenario.value) {
		case "agents": return "排障流程出现在系统提示词的项目指令里。";
		case "skill": return request.value?.messages.some((message) => message.role === "toolResult")
			? "读取 Skill 后，排障流程随工具结果发给模型。"
			: "系统提示词里有 Skill 目录。第一条请求只提供 Skill 的名称、描述和路径。";
		case "skill-command": return "Pi 展开 Skill 后，把完整的排障流程放进用户消息。";
		case "template": return "Pi 替换模板参数后，把展开的正文作为用户消息。";
	}
});

onMounted(async () => {
	try {
		for (const { id } of scenarios) traces.value[id] = await captureRequests(id);
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : String(cause);
	}
});
</script>

<template>
	<section class="chapter-lab" aria-label="提示词资源对照实验">
		<fieldset class="lab-fieldset">
			<legend>排障流程的来源</legend>
			<div class="lab-options">
				<button
					v-for="item in scenarios"
					:key="item.id"
					class="lab-button"
					type="button"
					:aria-pressed="scenario === item.id"
					@click="scenario = item.id; phase = 0"
				>{{ item.label }}</button>
			</div>
		</fieldset>
		<fieldset v-if="trace && trace.requests.length > 1" class="lab-fieldset">
			<legend>请求阶段</legend>
			<div class="lab-options">
				<button class="lab-button" type="button" :aria-pressed="phase === 0" @click="phase = 0">第一次请求</button>
				<button class="lab-button" type="button" :aria-pressed="phase === 1" @click="phase = 1">读取 Skill 后的请求</button>
			</div>
		</fieldset>
		<template v-if="trace && request">
			<div class="lab-body" role="status">
				<p class="lab-label">原始输入 <code>{{ trace.input }}</code></p>
				<p>{{ observation }}</p>
			</div>
			<details>
				<summary>查看系统提示词</summary>
				<pre tabindex="0" aria-label="系统提示词"><code>{{ request.system }}</code></pre>
			</details>
			<details>
				<summary>查看会话消息</summary>
				<pre tabindex="0" aria-label="会话消息"><code>{{ JSON.stringify(request.messages, null, 2) }}</code></pre>
			</details>
			<details>
				<summary><span>查看示例文件 <code>{{ trace.file }}</code></span></summary>
				<pre tabindex="0" aria-label="示例文件内容"><code>{{ trace.source }}</code></pre>
			</details>
		</template>
		<p v-else class="lab-body" role="status">{{ error || "正在生成请求记录…" }}</p>
	</section>
</template>
