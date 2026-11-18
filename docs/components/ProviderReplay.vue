<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Api } from "../../examples/chapter-3/adapters.ts";
import { replay } from "../../examples/chapter-3/scenario.ts";
import log from "../../examples/test.log?raw";

const api = ref<Api>("responses");
const stages = [
	{ id: "first", label: "第一次请求" },
	{ id: "stream", label: "工具调用的流事件" },
	{ id: "reply", label: "循环收到的回复" },
	{ id: "second", label: "第二次请求" },
] as const;
const view = ref<typeof stages[number]["id"]>("first");
const position = ref(0);
const traces = ref<Partial<Record<Api, Awaited<ReturnType<typeof replay>>>>>({});
const error = ref("");
const trace = computed(() => traces.value[api.value]);
const events = computed(() => trace.value?.firstEvents ?? []);
const payload = computed(() => {
	switch (view.value) {
		case "first": return trace.value?.requests[0];
		case "stream": return events.value[position.value];
		case "reply": return trace.value?.firstReply;
		case "second": return trace.value?.requests[1];
	}
});
const payloadLabel = computed(() => {
	if (view.value === "stream") return "当前流事件的 JSON";
	if (view.value === "reply") return "Agent 循环收到的回复";
	return "当前请求体的 JSON";
});
const argumentText = computed(() => events.value.slice(0, position.value + 1).map((event) => {
	if (event.type === "response.function_call_arguments.delta") return event.delta;
	if (event.type === "content_block_delta") {
		const delta = event.delta as { type: string; partial_json?: string };
		return delta.type === "input_json_delta" ? delta.partial_json : "";
	}
	return "";
}).join(""));

onMounted(async () => {
	try {
		for (const provider of ["responses", "messages"] as const) traces.value[provider] = await replay(provider, log);
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : String(cause);
	}
});
</script>

<template>
	<section class="chapter-lab" aria-label="API 请求和流事件对照">
		<fieldset class="lab-fieldset">
			<legend>服务商接口</legend>
			<div class="lab-options">
				<button class="lab-button" type="button" :aria-pressed="api === 'responses'" @click="api = 'responses'; position = 0">OpenAI Responses</button>
				<button class="lab-button" type="button" :aria-pressed="api === 'messages'" @click="api = 'messages'; position = 0">Anthropic Messages</button>
			</div>
		</fieldset>
		<fieldset class="lab-fieldset">
			<legend>查看阶段</legend>
			<div class="lab-options">
				<button v-for="stage in stages" :key="stage.id" class="lab-button" type="button" :aria-pressed="view === stage.id" @click="view = stage.id">
					{{ stage.label }}
				</button>
			</div>
		</fieldset>
		<template v-if="trace">
			<div class="lab-body" aria-live="polite">
				<p v-if="view === 'first'">
					请求在 <code>tools</code> 声明 <code>read</code>，参数定义放在
					<code>{{ api === 'responses' ? 'parameters' : 'input_schema' }}</code>。
				</p>
				<template v-else-if="view === 'stream'">
					<p><code>{{ events[position]?.type }}</code></p>
					<p>已接收的参数文本 <code>{{ argumentText || '（空）' }}</code></p>
				</template>
				<p v-else-if="view === 'reply' && trace.firstReply?.stopReason === 'toolUse'">
					循环收到 <code>{{ trace.firstReply.toolCall.name }}</code> 调用，参数
					<code>{{ JSON.stringify(trace.firstReply.toolCall.arguments) }}</code>。
				</p>
				<p v-else-if="view === 'second'">
					程序将读取结果作为 <code>{{ api === 'responses' ? 'function_call_output' : 'tool_result' }}</code>
					交回模型，靠调用 ID 关联。
				</p>
			</div>
			<div v-if="view === 'stream'" class="lab-options lab-body" role="group" aria-label="流事件浏览">
				<button class="lab-button" type="button" :disabled="position === 0" @click="position--">上一个事件</button>
				<button class="lab-button lab-button-primary" type="button" :disabled="position >= events.length - 1" @click="position++">下一个事件</button>
				<span class="lab-label" role="status">{{ position + 1 }} / {{ events.length }}</span>
			</div>
			<details>
				<summary>查看 JSON</summary>
				<pre tabindex="0" :aria-label="payloadLabel"><code>{{ JSON.stringify(payload, null, 2) }}</code></pre>
			</details>
		</template>
		<p v-else class="lab-body" role="status">{{ error || "正在生成实验记录…" }}</p>
	</section>
</template>
