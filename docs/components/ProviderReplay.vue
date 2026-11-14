<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Api } from "../../examples/chapter-3/adapters.ts";
import { replay } from "../../examples/chapter-3/scenario.ts";
import log from "../../examples/test.log?raw";

const api = ref<Api>("responses");
const view = ref<"first" | "stream" | "reply" | "second">("first");
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
	<section class="provider-replay" aria-label="API 请求和流事件对照">
		<div class="provider-options">
			<label>服务商接口
				<select v-model="api" @change="position = 0">
					<option value="responses">OpenAI Responses</option>
					<option value="messages">Anthropic Messages</option>
				</select>
			</label>
			<label>查看阶段
				<select v-model="view">
					<option value="first">第一次请求</option>
					<option value="stream">工具调用的流事件</option>
					<option value="reply">循环收到的回复</option>
					<option value="second">第二次请求</option>
				</select>
			</label>
		</div>
		<template v-if="trace">
			<div v-if="view === 'stream'" class="provider-events" role="group" aria-label="流事件浏览">
				<button type="button" :disabled="position === 0" @click="position--">上一个事件</button>
				<button type="button" :disabled="position >= events.length - 1" @click="position++">下一个事件</button>
				<span role="status">{{ position + 1 }} / {{ events.length }}</span>
			</div>
			<pre tabindex="0" :aria-label="payloadLabel"><code>{{ JSON.stringify(payload, null, 2) }}</code></pre>
			<p v-if="view === 'stream'" class="provider-arguments">已收到的参数文本 <code>{{ argumentText || '（空）' }}</code></p>
		</template>
		<p v-else role="status">{{ error || "正在生成实验记录…" }}</p>
	</section>
</template>

<style scoped>
.provider-replay { margin: 20px 0 32px; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 16px; }
.provider-options, .provider-events { display: flex; flex-wrap: wrap; align-items: end; gap: 8px 16px; }
.provider-options label { display: grid; gap: 4px; font-size: 14px; font-weight: 600; }
.provider-options select, .provider-events button {
	min-height: 44px;
	max-width: 100%;
	padding: 0 10px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	color: var(--vp-c-text-1);
	background: var(--vp-c-bg);
	cursor: pointer;
}
.provider-events { margin-top: 12px; align-items: center; font-size: 14px; }
.provider-events button:disabled { opacity: .55; cursor: default; }
.provider-events button:not(:disabled):hover { background: var(--vp-c-brand-soft); }
.provider-replay pre {
	max-height: 24rem;
	margin: 12px 0 0;
	padding: 14px;
	border-radius: 10px;
	background: var(--vp-code-block-bg);
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.provider-replay pre code { padding: 0; color: inherit; background: transparent; font-size: 13px; }
.provider-replay .provider-arguments { margin: 12px 0 0; overflow-wrap: anywhere; }
</style>
