<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { captureRequests, scenarios, type Scenario } from "../../examples/chapter-5/scenario.ts";

const scenario = ref<Scenario>("agents");
const phase = ref(0);
const traces = ref<Partial<Record<Scenario, Awaited<ReturnType<typeof captureRequests>>>>>({});
const error = ref("");
const trace = computed(() => traces.value[scenario.value]);
const request = computed(() => trace.value?.requests[phase.value]);

onMounted(async () => {
	try {
		for (const { id } of scenarios) traces.value[id] = await captureRequests(id);
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : String(cause);
	}
});
</script>

<template>
	<section class="resource-replay" aria-label="提示词资源对照实验">
		<div class="controls">
			<label>排障流程的来源
				<select v-model="scenario" @change="phase = 0">
					<option v-for="item in scenarios" :key="item.id" :value="item.id">{{ item.label }}</option>
				</select>
			</label>
			<label v-if="trace && trace.requests.length > 1">请求阶段
				<select v-model.number="phase">
					<option :value="0">第一次请求</option>
					<option :value="1">读取 Skill 后的请求</option>
				</select>
			</label>
		</div>
		<template v-if="trace && request">
			<p class="input">原始输入 <code>{{ trace.input }}</code></p>
			<div class="request">
				<div>
					<p class="panel-label">系统提示词</p>
					<pre tabindex="0" aria-label="系统提示词"><code>{{ request.system }}</code></pre>
				</div>
				<div>
					<p class="panel-label">会话消息</p>
					<pre tabindex="0" aria-label="会话消息"><code>{{ JSON.stringify(request.messages, null, 2) }}</code></pre>
				</div>
			</div>
			<details class="source">
				<summary>查看示例文件 <code>{{ trace.file }}</code></summary>
				<pre tabindex="0" aria-label="示例文件内容"><code>{{ trace.source }}</code></pre>
			</details>
		</template>
		<p v-else role="status">{{ error || "正在生成请求记录…" }}</p>
	</section>
</template>

<style scoped>
.resource-replay { margin: 20px 0 32px; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 16px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.controls label { display: grid; gap: 4px; max-width: 100%; font-size: 14px; font-weight: 600; }
.controls select {
	min-height: 44px;
	max-width: 100%;
	padding: 0 10px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	background: var(--vp-c-bg);
	color: var(--vp-c-text-1);
	cursor: pointer;
}
.resource-replay .input { margin: 12px 0; overflow-wrap: anywhere; }
.request { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.resource-replay .panel-label { margin: 0; font-size: 14px; font-weight: 600; }
.resource-replay pre {
	max-height: 20rem;
	margin: 8px 0 0;
	padding: 12px;
	border-radius: 10px;
	background: var(--vp-code-block-bg);
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.resource-replay pre code { padding: 0; background: transparent; color: inherit; font-size: 13px; }
.source { margin-top: 12px; overflow-wrap: anywhere; }
.source summary { min-height: 44px; align-content: center; cursor: pointer; }
@media (max-width: 640px) { .request { grid-template-columns: minmax(0, 1fr); } }
</style>
