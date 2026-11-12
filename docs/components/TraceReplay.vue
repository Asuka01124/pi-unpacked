<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { runAgent, type Step } from "../../examples/agent-loop.ts";
import { createFakeModel, QUESTION, type Scenario } from "../../examples/fake-model.ts";
import fixture from "../../examples/test.log?raw";

const scenarios = [
	{ id: "direct", label: "直接回答" },
	{ id: "success", label: "读取成功" },
	{ id: "missing", label: "文件不存在" },
	{ id: "truncated", label: "参数截断" },
] as const;

const selected = ref<Scenario>("success");
const index = ref(0);
const traces = ref<Partial<Record<Scenario, Step[]>>>({});
const loadError = ref("");
const steps = computed(() => traces.value[selected.value] ?? []);
const detail = computed(() => {
	const step = steps.value[index.value];
	if (!step) return undefined;
	switch (step.kind) {
		case "request":
			return {
				title: `第 ${step.turn} 次请求模型`,
				label: "发给模型的消息",
				data: step.messages,
			};
		case "response":
			return {
				title: step.message.stopReason === "stop" ? "模型给出最终回答" : step.message.stopReason === "length" ? "模型输出达到长度上限" : "模型请求调用工具",
				label: "模型返回的消息",
				data: step.message,
			};
		case "tool":
			return { title: "程序执行读取", label: "交给工具的参数", data: step.call.arguments };
		case "result":
			return { title: "程序追加工具结果", label: "写入消息列表的结果", data: step.message };
	}
});

function stepLabel(step: Step): string {
	switch (step.kind) {
		case "request":
			return `请求模型 ${step.turn}`;
		case "response":
			return step.message.stopReason === "stop" ? "最终回答" : "工具请求";
		case "tool":
			return "执行读取";
		case "result":
			return "工具结果";
	}
}

onMounted(async () => {
	try {
		for (const { id } of scenarios) {
			const recorded: Step[] = [];
			await runAgent(
				QUESTION,
				createFakeModel(id),
				async (path) => {
					if (path === "test.log") return fixture;
					throw new Error(`找不到文件 ${path}。`);
				},
				(step) => recorded.push(step),
			);
			traces.value[id] = recorded;
		}
	} catch (error) {
		loadError.value = error instanceof Error ? error.message : String(error);
	}
});
</script>

<template>
	<section class="replay" aria-label="工具调用回放">
		<div class="scenario-picker" role="group" aria-label="选择实验场景">
			<button
				v-for="scenario in scenarios"
				:key="scenario.id"
				class="scenario"
				type="button"
				:aria-pressed="selected === scenario.id"
				:disabled="!traces[scenario.id]"
				@click="selected = scenario.id; index = 0"
			>
				{{ scenario.label }}
			</button>
		</div>
		<div v-if="detail" class="replay-body">
			<ol class="timeline" aria-label="执行步骤">
				<li v-for="(step, position) in steps" :key="position">
					<button
						type="button"
						:aria-current="index === position ? 'step' : undefined"
						:aria-label="`第 ${position + 1} 步，${stepLabel(step)}`"
						@click="index = position"
					>
						<span class="step-number" aria-hidden="true">{{ position + 1 }}</span>
						<span class="step-label">{{ stepLabel(step) }}</span>
					</button>
				</li>
			</ol>
			<div class="payload">
				<p class="payload-title" aria-live="polite">{{ detail.title }}</p>
				<p class="payload-label">{{ detail.label }}</p>
				<pre tabindex="0" :aria-label="detail.label"><code>{{ JSON.stringify(detail.data, null, 2) }}</code></pre>
			</div>
		</div>
		<p v-else class="replay-status" role="status">{{ loadError || "正在生成执行记录…" }}</p>
		<p v-if="detail" class="replay-summary" role="status">
			当前走到第 {{ index + 1 }} 步：模型请求 {{ steps.slice(0, index + 1).filter(step => step.kind === 'request').length }} 次，
			读取尝试 {{ steps.slice(0, index + 1).filter(step => step.kind === 'tool').length }} 次。
		</p>
		<div v-if="detail" class="replay-controls">
			<span class="position">{{ index + 1 }} / {{ steps.length }}</span>
			<button type="button" class="previous" :disabled="index === 0" @click="index--">上一步</button>
			<button type="button" class="next" @click="index = index < steps.length - 1 ? index + 1 : 0">
				{{ index < steps.length - 1 ? "下一步" : "重新播放" }}
			</button>
		</div>
	</section>
</template>

<style scoped>
.replay {
	margin: 20px 0 32px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 16px;
	background: var(--vp-c-bg);
}

.scenario-picker,
.replay-controls {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 12px 16px;
}

.scenario-picker { flex-wrap: wrap; border-bottom: 1px solid var(--vp-c-divider); }
.replay-controls { justify-content: flex-end; border-top: 1px solid var(--vp-c-divider); }

.replay button {
	min-height: 44px;
	padding: 0 12px;
	border: 1px solid transparent;
	border-radius: 8px;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
}

.replay button:disabled { opacity: 0.55; cursor: default; }
.replay button:not(.next):not(:disabled):hover { background: var(--vp-c-bg-soft); }
.replay button[aria-pressed="true"],
.replay button[aria-current="step"] {
	border-color: var(--vp-c-divider);
	background: var(--vp-c-brand-soft);
	color: var(--vp-c-brand-1);
}

.replay-body {
	display: grid;
	grid-template-columns: 162px minmax(0, 1fr);
	gap: 16px;
	padding: 16px;
}

.replay .timeline { display: grid; align-content: start; gap: 4px; margin: 0; padding: 0; list-style: none; }
.timeline li { min-width: 0; margin: 0; }
.timeline button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; }
.step-number { min-width: 1.25em; color: var(--vp-c-text-2); font-family: var(--vp-font-family-mono); }

.payload {
	min-width: 0;
	min-height: 292px;
	padding: 20px;
	border-radius: 10px;
	background: var(--vp-code-block-bg);
	color: var(--vp-c-text-1);
}

.payload .payload-title { margin: 0; font-size: 17px; font-weight: 700; }
.payload .payload-label { margin: 2px 0 12px; color: var(--vp-c-text-2); font-size: 13px; }
.payload pre {
	max-height: 215px;
	margin: 0;
	padding: 12px 0 0;
	border-top: 1px solid var(--vp-c-divider);
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.replay :focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
.payload pre code { padding: 0; background: transparent; color: inherit; font-size: 13px; line-height: 1.65; }
.replay .position { margin-right: auto; color: var(--vp-c-text-2); font-family: var(--vp-font-family-mono); font-size: 14px; }
.replay .previous { border-color: var(--vp-c-divider); }
.replay .next { min-width: 92px; background: var(--vp-button-brand-bg); color: var(--vp-button-brand-text); }
.replay .next:hover { background: var(--vp-button-brand-hover-bg); }
.replay .replay-status { margin: 0; min-height: 112px; padding: 20px; }
.replay .replay-summary { margin: 0; padding: 0 16px 16px; color: var(--vp-c-text-2); font-size: 14px; }

@media (max-width: 600px) {
	.replay-body { grid-template-columns: 1fr; gap: 12px; padding: 12px; }
	.replay .timeline { display: flex; flex-wrap: wrap; gap: 4px; }
	.timeline button { justify-content: center; min-width: 44px; }
	.step-number { min-width: auto; }
	.step-label { display: none; }
	.payload { min-height: 240px; padding: 14px; }
	.payload pre { max-height: 185px; }
	.scenario-picker, .replay-controls { padding: 10px 12px; }
}
</style>
