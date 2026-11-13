<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { describeEvent, type ExecutionMode, type InputMode, type RunEvent } from "../../examples/chapter-2/runtime.ts";
import { EXTRA_INPUT, replayRun } from "../../examples/chapter-2/scenario.ts";
import log from "../../examples/test.log?raw";

const mode = ref<ExecutionMode>("parallel");
const input = ref<InputMode>("steer");
const events = ref<RunEvent[]>([]);
const selectedTurn = ref(2);
const error = ref("");
const request = computed(() => events.value.find(
	(event) => event.kind === "request" && event.turn === selectedTurn.value,
));

watch([mode, input], async ([execution, delivery], _previous, onCleanup) => {
	let stale = false;
	onCleanup(() => { stale = true; });
	selectedTurn.value = 2;
	events.value = [];
	error.value = "";
	try {
		const recorded = await replayRun(execution, delivery, log);
		if (!stale) events.value = recorded;
	} catch (cause) {
		if (!stale) error.value = cause instanceof Error ? cause.message : String(cause);
	}
}, { immediate: true });
</script>

<template>
	<section class="run-replay" aria-label="工具调度与消息队列实验">
		<div class="run-options">
			<label>工具调度
				<select v-model="mode">
					<option value="parallel">并发</option>
					<option value="sequential">顺序</option>
				</select>
			</label>
			<label>插话方式
				<select v-model="input">
					<option value="steer">引导当前运行（steer）</option>
					<option value="followUp">排队追问（followUp）</option>
				</select>
			</label>
		</div>
		<p class="run-input">读取期间插入的消息为「{{ EXTRA_INPUT }}」</p>
		<div v-if="events.length" class="run-grid">
			<ol class="run-events" aria-label="执行记录">
				<li v-for="(event, index) in events" :key="index">
					<button
						v-if="event.kind === 'request'"
						type="button"
						:aria-pressed="selectedTurn === event.turn"
						@click="selectedTurn = event.turn"
					>{{ describeEvent(event) }}</button>
					<span v-else>{{ describeEvent(event) }}</span>
				</li>
			</ol>
			<div v-if="request?.kind === 'request'" class="run-payload">
				<p aria-live="polite">请求 {{ request.turn }} 传给假模型的消息</p>
				<pre tabindex="0" :aria-label="`请求 ${request.turn} 的消息数组`"><code>{{ JSON.stringify(request.messages, null, 2) }}</code></pre>
			</div>
		</div>
		<p v-else class="run-status" role="status">{{ error || "正在生成运行记录…" }}</p>
	</section>
</template>

<style scoped>
.run-replay {
	margin: 20px 0 32px;
	padding: 16px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 16px;
}

.run-options { display: flex; flex-wrap: wrap; gap: 12px 20px; }
.run-options label { display: grid; gap: 4px; font-size: 14px; font-weight: 600; }
.run-options select, .run-events button {
	min-height: 44px;
	padding: 0 10px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	background: var(--vp-c-bg);
	color: var(--vp-c-text-1);
	cursor: pointer;
}
.run-options select { max-width: 100%; }
.run-replay .run-input { margin: 12px 0 16px; color: var(--vp-c-text-2); font-size: 14px; }
.run-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 16px; }
.run-replay .run-events { margin: 0; padding-left: 1.5em; font-size: 14px; }
.run-events li { overflow-wrap: anywhere; }
.run-events button { font-weight: 600; }
.run-events button:hover, .run-events button[aria-pressed="true"] {
	background: var(--vp-c-brand-soft);
	color: var(--vp-c-brand-1);
}
.run-payload { min-width: 0; padding: 14px; border-radius: 10px; background: var(--vp-code-block-bg); }
.run-payload p { margin: 0 0 10px; font-size: 14px; font-weight: 700; }
.run-payload pre { max-height: 26rem; margin: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.run-payload pre code { padding: 0; background: transparent; color: inherit; font-size: 13px; }
.run-replay .run-status { min-height: 8rem; margin: 0; }

@media (max-width: 640px) {
	.run-grid { grid-template-columns: minmax(0, 1fr); }
	.run-payload pre { max-height: 16rem; }
}
</style>
